"""
Safe Deployment & Model Evaluation Engine
Evaluates candidate ML models on unseen holdout splits before deployment.
Strictly preserves the existing active model if the candidate fails quality gates.
"""

import shutil
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Tuple, Optional
from pathlib import Path
import numpy as np
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, confusion_matrix

from ml_model import RiskMLModel
from config import ARTIFACTS_DIR

log = logging.getLogger("agent-risk.evaluator")


class ValidationResult:
    def __init__(
        self,
        passed: bool,
        candidate_metrics: Dict[str, Any],
        active_metrics: Optional[Dict[str, Any]] = None,
        rejection_reason: Optional[str] = None,
    ):
        self.passed = passed
        self.candidate_metrics = candidate_metrics
        self.active_metrics = active_metrics
        self.rejection_reason = rejection_reason

    def to_dict(self) -> Dict[str, Any]:
        res = {
            "validation_passed": self.passed,
            "candidate_metrics": self.candidate_metrics,
            "active_metrics": self.active_metrics,
            "rejection_reason": self.rejection_reason,
        }
        if self.candidate_metrics:
            res["accuracy"] = self.candidate_metrics.get("accuracy")
            res["precision"] = self.candidate_metrics.get("precision")
            res["recall"] = self.candidate_metrics.get("recall")
            res["f1_score"] = self.candidate_metrics.get("f1_score")
            res["f1_macro"] = self.candidate_metrics.get("f1_macro")
            res["per_class"] = self.candidate_metrics.get("per_class")
        return res


class ModelEvaluator:
    def __init__(
        self,
        company_id: str,
        min_accuracy: float = 0.70,
        min_f1_score: float = 0.65,
        max_degradation: float = 0.05,
    ):
        self.company_id = company_id
        self.min_accuracy = min_accuracy
        self.min_f1_score = min_f1_score
        self.max_degradation = max_degradation
        self.model_dir = ARTIFACTS_DIR / company_id
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.active_model_path = self.model_dir / "active_model.joblib"

    def compute_metrics(self, model: RiskMLModel, X_val: np.ndarray, y_val: np.ndarray) -> Dict[str, Any]:
        """Calculates comprehensive evaluation metrics on unseen holdout validation data."""
        y_pred = model.predict(X_val)
        acc = float(accuracy_score(y_val, y_pred))

        # Macro averages across Low, Medium, High
        f1_macro = float(f1_score(y_val, y_pred, average="macro", zero_division=0))
        prec_macro = float(precision_score(y_val, y_pred, average="macro", zero_division=0))
        rec_macro = float(recall_score(y_val, y_pred, average="macro", zero_division=0))

        # Weighted averages
        f1_weighted = float(f1_score(y_val, y_pred, average="weighted", zero_division=0))
        prec_weighted = float(precision_score(y_val, y_pred, average="weighted", zero_division=0))
        rec_weighted = float(recall_score(y_val, y_pred, average="weighted", zero_division=0))

        # Per-class breakdown
        labels = ["Low", "Medium", "High"]
        per_class_f1 = f1_score(y_val, y_pred, average=None, labels=labels, zero_division=0)
        per_class_prec = precision_score(y_val, y_pred, average=None, labels=labels, zero_division=0)
        per_class_rec = recall_score(y_val, y_pred, average=None, labels=labels, zero_division=0)

        per_class = {
            cls_name: {
                "precision": round(float(p), 4),
                "recall": round(float(r), 4),
                "f1_score": round(float(f), 4),
            }
            for cls_name, p, r, f in zip(labels, per_class_prec, per_class_rec, per_class_f1)
        }

        cm = confusion_matrix(y_val, y_pred, labels=labels).tolist()

        return {
            "accuracy": round(acc, 4),
            "precision": round(prec_macro, 4),
            "recall": round(rec_macro, 4),
            "f1_score": round(f1_macro, 4),
            "f1_macro": round(f1_macro, 4),
            "precision_macro": round(prec_macro, 4),
            "recall_macro": round(rec_macro, 4),
            "precision_weighted": round(prec_weighted, 4),
            "recall_weighted": round(rec_weighted, 4),
            "f1_weighted": round(f1_weighted, 4),
            "per_class": per_class,
            "confusion_matrix": cm,
            "sample_count": len(y_val),
        }

    def evaluate_and_deploy(
        self,
        candidate_model: RiskMLModel,
        active_model: Optional[RiskMLModel],
        X_val: np.ndarray,
        y_val: np.ndarray,
    ) -> ValidationResult:
        """
        Evaluates candidate against quality gates and existing active model:
        1. Checks minimum accuracy threshold
        2. Checks minimum F1-score threshold
        3. Checks non-regression against current active model
        4. Deploys if passed; retains active model if failed
        """
        candidate_metrics = self.compute_metrics(candidate_model, X_val, y_val)
        active_metrics = None
        reasons = []

        # Gate 1: Minimum Accuracy
        if candidate_metrics["accuracy"] < self.min_accuracy:
            reasons.append(
                f"Candidate accuracy ({candidate_metrics['accuracy']:.1%}) below required threshold ({self.min_accuracy:.1%})"
            )

        # Gate 2: Minimum F1-Score
        if candidate_metrics["f1_score"] < self.min_f1_score:
            reasons.append(
                f"Candidate macro F1-score ({candidate_metrics['f1_score']:.3f}) below required threshold ({self.min_f1_score:.3f})"
            )

        # Gate 3: Non-regression check against active model
        if active_model is not None and active_model.model is not None:
            try:
                active_metrics = self.compute_metrics(active_model, X_val, y_val)
                f1_diff = active_metrics["f1_score"] - candidate_metrics["f1_score"]
                if f1_diff > self.max_degradation:
                    reasons.append(
                        f"Regression detected: Candidate F1 ({candidate_metrics['f1_score']:.3f}) is worse than active model F1 "
                        f"({active_metrics['f1_score']:.3f}) by {f1_diff:.3f} (max allowed degradation is {self.max_degradation:.3f})"
                    )
            except Exception as e:
                log.warning(f"Could not compute active model metrics for comparison: {e}")

        # Final Decision
        if reasons:
            rejection_msg = " | ".join(reasons)
            log.warning(
                f"Candidate model '{candidate_model.version}' REJECTED for company '{self.company_id}': {rejection_msg}. "
                f"Active model retained safely."
            )
            return ValidationResult(
                passed=False,
                candidate_metrics=candidate_metrics,
                active_metrics=active_metrics,
                rejection_reason=rejection_msg,
            )

        # PASS: Safe Deployment
        try:
            # Archive previous active model if it exists
            if self.active_model_path.exists():
                timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
                archive_path = self.model_dir / f"archived_{timestamp}.joblib"
                shutil.copy2(self.active_model_path, archive_path)
                log.info(f"Archived previous active model to {archive_path}")

            # Save candidate as active
            candidate_model.save(self.active_model_path)
            log.info(
                f"Candidate model '{candidate_model.version}' PASSED validation and successfully DEPLOYED as active "
                f"for company '{self.company_id}'! (Acc: {candidate_metrics['accuracy']:.1%}, F1: {candidate_metrics['f1_score']:.3f})"
            )

            return ValidationResult(
                passed=True,
                candidate_metrics=candidate_metrics,
                active_metrics=active_metrics,
                rejection_reason=None,
            )
        except Exception as e:
            err_msg = f"Deployment filesystem error: {e}"
            log.error(err_msg)
            return ValidationResult(
                passed=False,
                candidate_metrics=candidate_metrics,
                active_metrics=active_metrics,
                rejection_reason=err_msg,
            )
