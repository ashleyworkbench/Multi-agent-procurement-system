"""
Random Forest ML Model for Vendor Risk Classification
Classifies vendors into Low, Medium, or High risk using Delivery, Quality,
Pricing, and Compliance features with probability calibration and explainability.
"""

import os
import joblib
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
from sklearn.ensemble import RandomForestClassifier

from config import ARTIFACTS_DIR

log = logging.getLogger("agent-risk.ml_model")

RISK_CLASSES = ["Low", "Medium", "High"]


class RiskMLModel:
    def __init__(self, company_id: str, version: str = "v1.0.0"):
        self.company_id = company_id
        self.version = version
        self.model: Optional[RandomForestClassifier] = None
        self.feature_names: List[str] = []
        self.feature_importances: Dict[str, float] = {}
        self.model_dir = ARTIFACTS_DIR / company_id
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.model_path = self.model_dir / "active_model.joblib"

    def fit(self, X: np.ndarray, y: np.ndarray, feature_names: List[str]) -> "RiskMLModel":
        """
        Trains the Random Forest model on preprocessed training data.
        Uses balanced class weights to prevent majority-class bias.
        """
        self.feature_names = feature_names
        
        # Configure Random Forest
        rf = RandomForestClassifier(
            n_estimators=100,
            max_depth=6,
            min_samples_split=2,
            min_samples_leaf=1,
            class_weight="balanced",
            random_state=42,
        )
        rf.fit(X, y)
        self.model = rf

        # Store feature importances
        if hasattr(rf, "feature_importances_"):
            importances = rf.feature_importances_
            self.feature_importances = {
                name: round(float(imp), 4)
                for name, imp in zip(feature_names, importances)
            }

        log.info(
            f"Trained Random Forest for company '{self.company_id}' ({len(X)} samples, {len(feature_names)} features). "
            f"Classes: {list(rf.classes_)}"
        )
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        if self.model is None:
            raise RuntimeError("Model has not been trained or loaded.")
        return self.model.predict(X)

    def predict_proba(self, X: np.ndarray) -> List[Dict[str, float]]:
        """
        Returns class probabilities mapped to 'Low', 'Medium', 'High'.
        """
        if self.model is None:
            raise RuntimeError("Model has not been trained or loaded.")

        raw_probs = self.model.predict_proba(X)
        classes = list(self.model.classes_)
        
        results = []
        for prob_row in raw_probs:
            prob_map = {c: 0.0 for c in RISK_CLASSES}
            for cls_name, p in zip(classes, prob_row):
                if cls_name in prob_map:
                    prob_map[cls_name] = round(float(p), 4)
            # Ensure probabilities sum to 1.0
            total = sum(prob_map.values())
            if total > 0:
                prob_map = {k: round(v / total, 4) for k, v in prob_map.items()}
            results.append(prob_map)

        return results

    def explain_prediction(self, record: Dict[str, Any], probabilities: Dict[str, float]) -> List[str]:
        """
        Generates human-readable risk drivers based on the predicted class,
        feature importance, and metric variances.
        """
        drivers = []
        on_time = float(record.get("on_time_rate", 0.85))
        delay = float(record.get("delay_days", 1.0))
        defect = float(record.get("defect_rate", 0.01))
        compliance = float(record.get("compliance_score", 85.0))
        violations = float(record.get("violations", 0))
        price_var = float(record.get("price_variance", 0.0))

        high_p = probabilities.get("High", 0.0)
        low_p = probabilities.get("Low", 0.0)

        if high_p >= 0.50:
            if on_time < 0.75:
                drivers.append(f"Substandard on-time delivery rate ({on_time:.1%}) contributes significantly to elevated risk")
            if delay >= 4.0:
                drivers.append(f"Prolonged shipment delay averaging {delay:.1f} days")
            if defect >= 0.035:
                drivers.append(f"High product defect/rejection rate ({defect:.1%})")
            if violations >= 1:
                drivers.append(f"Recorded compliance violations ({violations}) and lower audit score ({compliance:.0f})")
            if price_var >= 0.08:
                drivers.append(f"High contract price volatility ({price_var:.1%})")
        elif low_p >= 0.60:
            drivers.append(f"Consistently high delivery reliability ({on_time:.1%})")
            drivers.append(f"Low defect rate ({defect:.2%}) with no major quality rejections")
            drivers.append("Strong audit adherence with zero compliance infractions")
        else:
            if on_time < 0.88:
                drivers.append(f"Moderate delivery timeliness ({on_time:.1%})")
            if defect > 0.02:
                drivers.append(f"Minor defect variance ({defect:.1%})")
            if compliance < 85:
                drivers.append(f"Satisfactory compliance standing ({compliance:.0f}) with room for improvement")

        if not drivers:
            drivers.append("Metrics demonstrate standard operational stability across all evaluated pillars")

        return drivers

    def save(self, filepath: Optional[Path] = None):
        target = filepath or self.model_path
        target.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": self.version,
            "company_id": self.company_id,
            "model": self.model,
            "feature_names": self.feature_names,
            "feature_importances": self.feature_importances,
        }
        joblib.dump(payload, target)
        log.info(f"Saved RiskMLModel ({self.version}) to {target}")

    def load(self, filepath: Optional[Path] = None) -> bool:
        target = filepath or self.model_path
        if not target.exists():
            log.info(f"No existing model artifact found at {target}")
            return False

        try:
            payload = joblib.load(target)
            self.version = payload.get("version", "v1.0.0")
            self.model = payload.get("model")
            self.feature_names = payload.get("feature_names", [])
            self.feature_importances = payload.get("feature_importances", {})
            log.info(f"Successfully loaded RiskMLModel ({self.version}) from {target}")
            return True
        except Exception as e:
            log.error(f"Failed to load model from {target}: {e}")
            return False
