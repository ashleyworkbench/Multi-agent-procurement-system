"""
Retraining Manager for Risk Analysis Agent
Orchestrates:
- Data fetching via API integration
- Merging operational history with Admin Feedback ground truth
- Automatic cleaning and preprocessing
- Train/Validation splitting without target leakage
- Random Forest candidate training
- Safe deployment validation and active model preservation
- Automatic retraining threshold triggers and manual triggers
"""

import time
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
from sklearn.model_selection import train_test_split

from storage import RiskStorage
from api_client import get_vendor_history_provider
from cleaner import DataCleaningEngine
from preprocessor import DataPreprocessor
from labeler import ProvisionalLabeler, DEFAULT_COMPANY_RULES
from ml_model import RiskMLModel
from evaluator import ModelEvaluator

log = logging.getLogger("agent-risk.retrainer")


class RetrainingManager:
    def __init__(self, storage: RiskStorage):
        self.storage = storage

    def retrain(
        self, company_id: str, trigger_source: str = "manual",
        raw_records: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Executes end-to-end retraining pipeline for a company:
        1. Fetch data via API client
        2. Merge ground-truth feedback
        3. Clean data & log issues
        4. Preprocess & validate
        5. Stratified train/validation split
        6. Fit candidate Random Forest
        7. Evaluate against active model & quality gates
        8. Deploy if valid, else retain active model
        9. Re-score vendor risk records
        """
        start_time = time.time()
        log.info(f"Initiating model retraining for company '{company_id}' (trigger={trigger_source})...")

        # 1. Load Company Configuration
        config = self.storage.get_company_config(company_id) or {}
        rules = config.get("rules", DEFAULT_COMPANY_RULES)
        field_mapping = config.get("field_mapping", {})
        min_acc = config.get("min_accuracy", 0.70)
        min_f1 = config.get("min_f1_score", 0.65)
        max_deg = config.get("max_degradation", 0.05)

        # 2. Use the latest explicitly synced snapshot, otherwise retain legacy bootstrap/auto-fetch behavior.
        if raw_records is None:
            snapshot = self.storage.get_vendor_history_snapshot(company_id)
            if snapshot:
                raw_records = snapshot["records"]
            else:
                api_config = self.storage.get_vendor_api_config(company_id)
                if api_config and api_config["mode"] == "external":
                    integration = {
                        "mode": "real_api",
                        "endpoint_url": api_config["endpoint_url"],
                        "auth_type": api_config["auth_type"],
                    }
                    if api_config["auth_type"] == "api_key":
                        integration["api_key"] = api_config["credential"]
                    elif api_config["auth_type"] == "bearer":
                        integration["bearer_token"] = api_config["credential"]
                    config["api_integration"] = integration
                provider = get_vendor_history_provider(company_id, config)
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        import concurrent.futures
                        with concurrent.futures.ThreadPoolExecutor() as pool:
                            raw_records = pool.submit(
                                asyncio.run, provider.fetch_vendor_history(company_id)
                            ).result()
                    else:
                        raw_records = loop.run_until_complete(provider.fetch_vendor_history(company_id))
                except Exception:
                    raw_records = asyncio.run(provider.fetch_vendor_history(company_id))

        if not raw_records:
            raise ValueError(f"No vendor records found for company '{company_id}'. Cannot retrain.")

        # 3. Fetch Admin Feedback (Ground Truth Supervision)
        feedback_list = self.storage.get_feedback_records(company_id)
        # Map feedback to enhance vendor records with verified actual outcomes
        feedback_by_vendor = {}
        for fb in feedback_list:
            v_id = fb["vendor_id"]
            if v_id not in feedback_by_vendor:
                feedback_by_vendor[v_id] = []
            feedback_by_vendor[v_id].append(fb)

        # Inject verified labels where available
        enriched_records = []
        for r in raw_records:
            rec = dict(r)
            v_id = str(rec.get("vendor_id"))
            if v_id in feedback_by_vendor and feedback_by_vendor[v_id]:
                latest_fb = feedback_by_vendor[v_id][0]
                rec["ground_truth_risk"] = latest_fb["actual_risk_label"]
                rec["feedback_rating"] = latest_fb["rating"]
                rec["feedback_outcome"] = latest_fb["actual_outcome"]
            enriched_records.append(rec)

        # 4. Automatic Data Cleaning
        cleaner = DataCleaningEngine(company_id=company_id)
        cleaned_records, cleaning_logs, cleaning_summary = cleaner.clean(enriched_records)
        
        # Persist cleaning logs in database
        self.storage.add_cleaning_logs(cleaning_logs)

        # 5. Train only on actual outcomes / admin feedback, never provisional labels.
        training_rules = {
            **DEFAULT_COMPANY_RULES.get("training", {}),
            **rules.get("training", {}),
        }
        min_labeled_samples = int(training_rules.get("min_labeled_samples", 30))
        min_per_class = int(training_rules.get("min_samples_per_class", 3))
        labeled_records = []
        for record in cleaned_records:
            target = record.get("ground_truth_risk") or record.get("actual_risk_label")
            if str(target or "").strip().title() in {"Low", "Medium", "High"}:
                labeled_records.append(record)

        class_counts = {}
        for record in labeled_records:
            label = str(record.get("ground_truth_risk") or record.get("actual_risk_label")).strip().title()
            class_counts[label] = class_counts.get(label, 0) + 1
        if len(labeled_records) < min_labeled_samples or any(
            class_counts.get(label, 0) < min_per_class for label in ("Low", "Medium", "High")
        ):
            raise ValueError(
                f"Insufficient labeled history for {company_id}: found {len(labeled_records)} labeled orders "
                f"with class counts {class_counts}; require {min_labeled_samples} total and "
                f"{min_per_class} per risk class. The rule engine remains available for analysis."
            )

        # 6. Resolve already-verified labels for candidate training.
        labeler = ProvisionalLabeler(rules=rules)
        training_records = []
        for r in labeled_records:
            rec = dict(r)
            label, source, reasons = labeler.resolve_label_and_source(rec)
            rec["risk_level"] = label
            rec["label_source"] = source
            rec["rule_reasons"] = reasons
            
            # Also calculate pillar scores for persistence
            scores = labeler.compute_pillar_scores(rec)
            rec.update(scores)
            training_records.append(rec)

        # 7. Preprocessing & Validation
        preprocessor = DataPreprocessor(company_id=company_id, field_mapping=field_mapping)
        X, y, feature_names = preprocessor.prepare_training_data(training_records, target_field="risk_level")

        # 8. Unseen Holdout Validation Split (ensure no target leakage)
        # If dataset is small, handle stratification safely
        unique_classes, counts = np.unique(y, return_counts=True)
        can_stratify = all(c >= 2 for c in counts) and len(X) >= 10
        stratify_val = y if can_stratify else None

        test_size = 0.25 if len(X) >= 12 else 0.20
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=test_size, random_state=42, stratify=stratify_val
        )

        # 9. Train Candidate Random Forest Model
        new_version = f"v{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
        candidate_model = RiskMLModel(company_id=company_id, version=new_version)
        candidate_model.fit(X_train, y_train, feature_names)

        # 10. Safe Deployment Evaluation
        active_model = RiskMLModel(company_id=company_id)
        has_active = active_model.load()
        active_to_compare = active_model if has_active else None

        evaluator = ModelEvaluator(
            company_id=company_id,
            min_accuracy=min_acc,
            min_f1_score=min_f1,
            max_degradation=max_deg,
        )

        validation_result = evaluator.evaluate_and_deploy(
            candidate_model=candidate_model,
            active_model=active_to_compare,
            X_val=X_val,
            y_val=y_val,
        )

        # 11. Record Model Deployment Audit Log
        status_label = "active" if validation_result.passed else "rejected"
        c_met = validation_result.candidate_metrics
        self.storage.record_model_deployment(
            company_id=company_id,
            model_version=new_version,
            status=status_label,
            accuracy=c_met["accuracy"],
            f1_score=c_met["f1_score"],
            precision=c_met["precision"],
            recall=c_met["recall"],
            metrics=validation_result.to_dict(),
            validation_passed=validation_result.passed,
            rejection_reason=validation_result.rejection_reason,
        )

        # 12. Mark Admin Feedback Consumed if Candidate Passed
        if validation_result.passed:
            self.storage.mark_feedback_consumed(company_id)

        # 13. Re-score All Vendors using the Live Active Model
        live_model = candidate_model if validation_result.passed else (active_model if has_active else candidate_model)
        self._rescore_vendors(company_id, cleaned_records, preprocessor, live_model, labeler)

        elapsed = round(time.time() - start_time, 2)
        log.info(
            f"Retraining finished for '{company_id}' in {elapsed}s. "
            f"Status={status_label}, Accuracy={c_met['accuracy']:.1%}, "
            f"Precision={c_met['precision']:.3f}, Recall={c_met['recall']:.3f}, F1={c_met['f1_score']:.3f}"
        )

        return {
            "company_id": company_id,
            "trigger_source": trigger_source,
            "model_version": new_version,
            "deployment_status": status_label,
            "validation_passed": validation_result.passed,
            "rejection_reason": validation_result.rejection_reason,
            "candidate_metrics": c_met,
            "active_metrics": validation_result.active_metrics,
            "records_used": len(training_records),
            "cleaning_summary": cleaning_summary,
            "feature_importances": live_model.feature_importances,
            "duration_seconds": elapsed,
        }

    def analyze(self, company_id: str) -> Dict[str, Any]:
        """Scores the latest synced history with the deployed model without fitting or deploying a model."""
        snapshot = self.storage.get_vendor_history_snapshot(company_id)
        if not snapshot:
            raise ValueError(f"No fetched vendor history for '{company_id}'. Sync history before analyzing.")

        model = RiskMLModel(company_id=company_id)
        if not model.load():
            raise ValueError(f"No active risk model is deployed for '{company_id}'. Retrain a model first.")

        config = self.storage.get_company_config(company_id) or {}
        preprocessor = DataPreprocessor(
            company_id=company_id,
            field_mapping=config.get("field_mapping", {}),
        )
        labeler = ProvisionalLabeler(rules=config.get("rules", DEFAULT_COMPANY_RULES))
        records = snapshot["records"]
        self._rescore_vendors(company_id, records, preprocessor, model, labeler)
        return {
            "company_id": company_id,
            "model_version": model.version,
            "records_used": len(records),
            "vendors_scored": len({str(record["vendor_id"]) for record in records}),
            "fetched_at": snapshot["fetched_at"],
            "training_performed": False,
        }

    def _rescore_vendors(
        self,
        company_id: str,
        cleaned_records: List[Dict[str, Any]],
        preprocessor: DataPreprocessor,
        model: RiskMLModel,
        labeler: ProvisionalLabeler,
    ):
        """Recomputes predictions, pillar scores, and risk drivers for all vendors."""
        # Group by vendor to compute aggregated vendor profile
        vendors_agg = {}
        for r in cleaned_records:
            v_id = str(r["vendor_id"])
            if v_id not in vendors_agg:
                vendors_agg[v_id] = {
                    "vendor_id": v_id,
                    "vendor_name": r.get("vendor_name", v_id),
                    "records": [],
                }
            vendors_agg[v_id]["records"].append(r)

        # Process each vendor
        for v_id, data in vendors_agg.items():
            records = data["records"]
            latest_record = records[-1]
            
            # Compute average operational metrics for vendor
            avg_metrics = {
                "vendor_id": v_id,
                "vendor_name": data["vendor_name"],
                "on_time_rate": float(np.mean([r["on_time_rate"] for r in records])),
                "delay_days": float(np.mean([r["delay_days"] for r in records])),
                "lead_time": float(np.mean([r["lead_time"] for r in records])),
                "defect_rate": float(np.mean([r["defect_rate"] for r in records])),
                "return_rate": float(np.mean([r["return_rate"] for r in records])),
                "price_variance": float(np.mean([r["price_variance"] for r in records])),
                "compliance_score": float(np.mean([r["compliance_score"] for r in records])),
                "violations": float(np.max([r["violations"] for r in records])),
                "iso_certified": any(r.get("iso_certified") for r in records),
                "spend_tier": latest_record.get("spend_tier", "Medium"),
                "ground_truth_risk": latest_record.get("ground_truth_risk"),
            }

            # Preprocess for model inference
            X_inf, _ = preprocessor.transform_inference_data([avg_metrics])
            
            # ML Model Prediction & Probabilities
            predicted_class = model.predict(X_inf)[0]
            probabilities = model.predict_proba(X_inf)[0]
            risk_drivers = model.explain_prediction(avg_metrics, probabilities)

            # Pillar Scores
            scores = labeler.compute_pillar_scores(avg_metrics)

            # Determine Label Source
            _, source, _ = labeler.resolve_label_and_source(avg_metrics)

            # Persist vendor risk record
            self.storage.save_vendor_risk_record(
                company_id=company_id,
                vendor_id=v_id,
                vendor_name=data["vendor_name"],
                risk_level=predicted_class,
                risk_score=scores["risk_score"],
                delivery_score=scores["delivery_score"],
                quality_score=scores["quality_score"],
                pricing_score=scores["pricing_score"],
                compliance_score=scores["compliance_score"],
                probabilities=probabilities,
                risk_drivers=risk_drivers,
                model_version=model.version,
                label_source=source,
                raw_metrics=avg_metrics,
            )

    def check_and_trigger_auto_retrain(self, company_id: str) -> Optional[Dict[str, Any]]:
        """
        Checks unconsumed admin feedback count against company auto_retrain_threshold.
        Triggers retrain automatically if threshold reached.
        """
        config = self.storage.get_company_config(company_id) or {}
        threshold = config.get("auto_retrain_threshold", 5)
        unconsumed_count = self.storage.get_unconsumed_feedback_count(company_id)

        log.info(f"Checking auto-retrain for '{company_id}': unconsumed={unconsumed_count}, threshold={threshold}")
        if unconsumed_count >= threshold:
            log.info(f"Auto-retrain threshold met ({unconsumed_count} >= {threshold}). Triggering automatic retrain...")
            return self.retrain(company_id=company_id, trigger_source="auto_threshold")

        return None
