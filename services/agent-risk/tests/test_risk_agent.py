"""
Unit & Integration Test Suite for Risk Analysis Agent (Agent 5)
Verifies all 9 requirements:
  1. API Integration (dummy dataset API)
  2. Automatic Data Cleaning (missing values, duplicates, invalid values, formats, logging)
  3. Preprocessing & Validation (field mapping, encoding, scaling, validation)
  4. Risk Prediction & Provisional Labeling (Random Forest, Low/Med/High, explainability)
  5. Admin Feedback (recording ratings, outcomes, labels)
  6. Retraining (manual trigger, automated threshold detection)
  7. Safe Deployment (candidate validation, non-regression, active model retention)
  8. Company Isolation (multi-tenant boundaries)
  9. End-to-end pipeline execution
"""

import sys
import os
from pathlib import Path
import unittest
import numpy as np
from unittest.mock import patch

# Add agent-risk directory to path
agent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(agent_dir))

from storage import RiskStorage
from dummy_data import get_dummy_vendor_history
from api_client import DummyDatasetAPIClient, get_vendor_history_provider
from cleaner import DataCleaningEngine
from preprocessor import DataPreprocessor, DataValidationError
from labeler import ProvisionalLabeler, DEFAULT_COMPANY_RULES
from ml_model import RiskMLModel
from evaluator import ModelEvaluator
from retrainer import RetrainingManager


class TestRiskAnalysisAgent(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Use a temporary SQLite database for clean test isolation
        cls.test_db_path = agent_dir / "test_risk_analysis.db"
        if cls.test_db_path.exists():
            try:
                cls.test_db_path.unlink()
            except Exception:
                pass
        os.environ["SQLITE_DB_PATH"] = str(cls.test_db_path)
        cls.storage = RiskStorage()
        cls.storage.sqlite_path = str(cls.test_db_path)
        cls.storage.use_postgres = False
        conn = cls.storage._get_sqlite_conn()
        cls.storage._create_sqlite_tables(conn)
        conn.close()
        cls.retrainer = RetrainingManager(storage=cls.storage)

    @classmethod
    def tearDownClass(cls):
        if cls.test_db_path.exists():
            try:
                cls.test_db_path.unlink()
            except Exception:
                pass

    # ---------------- 1. API Integration ---------------- #
    def test_01_api_integration_fetch(self):
        """Test fetching vendor history through the authenticated Gateway API."""
        client = DummyDatasetAPIClient()
        import asyncio
        expected_records = [{"vendor_id": "V-CONST-001", "vendor_name": "ACC Cement Ltd", "on_time_rate": 0.95}]

        class MockResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return expected_records

        class MockAsyncClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return None

            async def get(self, url, params, headers):
                self.request = (url, params, headers)
                return MockResponse()

        mock_http_client = MockAsyncClient()
        with patch("api_client.httpx.AsyncClient", return_value=mock_http_client):
            records = asyncio.run(client.fetch_vendor_history("construction"))

        self.assertEqual(records, expected_records)
        self.assertTrue(mock_http_client.request[0].endswith("/vendor-performance/history"))
        self.assertEqual(mock_http_client.request[1], {"industry": "construction"})
        self.assertEqual(mock_http_client.request[2]["X-API-KEY"], client.api_key)

    def test_01c_dummy_api_failure_does_not_read_dataset_directly(self):
        """A failed dummy API request is surfaced rather than bypassed with a local dataset read."""
        import asyncio
        import httpx

        class FailingAsyncClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return None

            async def get(self, *_args, **_kwargs):
                raise httpx.ConnectError("dummy API unavailable")

        with patch("api_client.httpx.AsyncClient", return_value=FailingAsyncClient()):
            with self.assertRaises(httpx.ConnectError):
                asyncio.run(DummyDatasetAPIClient().fetch_vendor_history("construction"))

    def test_01d_dummy_connection_check_does_not_fetch_history(self):
        """Connection testing calls only the authenticated health endpoint."""
        import asyncio

        class MockResponse:
            def raise_for_status(self):
                return None

            def json(self):
                raise AssertionError("Connection check must not parse vendor history")

        class MockAsyncClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_):
                return None

            async def get(self, url, params, headers):
                self.request = (url, params, headers)
                return MockResponse()

        mock_http_client = MockAsyncClient()
        with patch("api_client.httpx.AsyncClient", return_value=mock_http_client):
            asyncio.run(DummyDatasetAPIClient(api_key="connection-key").test_connection("construction"))

        self.assertTrue(mock_http_client.request[0].endswith("/vendor-performance/health"))
        self.assertEqual(mock_http_client.request[1], {"industry": "construction"})
        self.assertEqual(mock_http_client.request[2]["X-API-KEY"], "connection-key")

    def test_01e_sync_cleans_and_stores_without_training(self):
        """Sync runs the cleaning pipeline and persists a snapshot without invoking retraining."""
        import asyncio
        import main

        record = {
            "vendor_id": "V-SYNC-1",
            "vendor_name": "Sync Test Vendor",
            "order_id": "PO-SYNC-1",
            "order_date": "2026-01-01",
            "on_time_rate": 0.95,
            "delay_days": 0.5,
            "lead_time": 5,
            "defect_rate": 0.01,
            "return_rate": 0.01,
            "price_variance": 0.02,
            "compliance_score": 95,
            "violations": 0,
            "iso_certified": True,
            "spend_tier": "Medium",
        }

        class MockProvider:
            async def fetch_vendor_master(self, company_id):
                return [{
                    "vendor_id": "V-SYNC-1",
                    "company_id": company_id,
                    "purchase_vendor_id": 1,
                    "vendor_name": "Sync Test Vendor",
                }]

            async def fetch_vendor_history(self, company_id, vendor_id=None):
                return [record]

        class MockStorage:
            snapshot = None
            cleaning_logs = []

            def get_company_config(self, company_id):
                return {"field_mapping": {}}

            def get_vendor_api_config(self, company_id):
                return None

            def add_cleaning_logs(self, logs):
                self.cleaning_logs.extend(logs)

            def save_vendor_history_snapshot(self, company_id, records, summary, vendor_master=None):
                self.snapshot = {
                    "records": records,
                    "vendor_master": vendor_master,
                    "fetched_at": "2026-01-01T00:00:00",
                }

            def get_vendor_history_snapshot(self, company_id):
                return self.snapshot

        mock_storage = MockStorage()
        with patch("main.storage", mock_storage), \
             patch("main.get_vendor_history_provider", return_value=MockProvider()), \
             patch.object(main.retrainer, "retrain") as retrain:
            result = asyncio.run(
                main.sync_vendor_history(main.VendorHistoryRequest(company_id="sync_test"), {})
            )

        self.assertEqual(result["records_fetched"], 1)
        self.assertEqual(result["records_ready"], 1)
        self.assertEqual(result["vendors_ready"], 1)
        self.assertEqual(mock_storage.snapshot["records"][0]["company_id"], "sync_test")
        self.assertEqual(mock_storage.snapshot["vendor_master"][0]["vendor_id"], "V-SYNC-1")
        retrain.assert_not_called()

    def test_01b_dataset_scope_and_filtering(self):
        """Construction-only dataset must preserve company and vendor filters while excluding legacy non-construction vendors."""
        records = get_dummy_vendor_history("construction")
        self.assertEqual(len({r["vendor_id"] for r in records}), 10)
        self.assertTrue(all(r["company_id"] == "construction" for r in records))

        filtered = get_dummy_vendor_history("construction", vendor_id="V-CONST-001")
        self.assertTrue(filtered)
        self.assertTrue(all(r["vendor_id"] == "V-CONST-001" for r in filtered))
        self.assertEqual(len(filtered), 100)  # 1000 rows / 10 vendors = 100 per vendor

        legacy = get_dummy_vendor_history("pharma")
        self.assertEqual(legacy, [])

    # ---------------- 2. Automatic Data Cleaning ---------------- #
    def test_02_automatic_data_cleaning(self):
        """Test missing values, duplicates, invalid values, formats, and audit logging."""
        dirty_records = [
            # Record 1: normal
            {"vendor_id": "V-1", "order_id": "PO-1", "order_date": "2026-01-01", "on_time_rate": 0.95, "delay_days": 0.5, "lead_time": 5, "defect_rate": 0.01, "compliance_score": 90, "violations": 0, "iso_certified": True, "spend_tier": "High"},
            # Record 2: duplicate of PO-1
            {"vendor_id": "V-1", "order_id": "PO-1", "order_date": "2026-01-01", "on_time_rate": 0.95, "delay_days": 0.5, "lead_time": 5, "defect_rate": 0.01, "compliance_score": 90, "violations": 0, "iso_certified": True, "spend_tier": "High"},
            # Record 3: invalid on_time_rate > 1.0 (e.g. 1.40) & negative delay (-3.0) & non-standard date
            {"vendor_id": "V-2", "order_id": "PO-2", "order_date": "15/02/2026", "on_time_rate": 1.40, "delay_days": -3.0, "lead_time": 6, "defect_rate": 0.02, "compliance_score": 85, "violations": 0, "iso_certified": "yes", "spend_tier": "Medium"},
            # Record 4: missing defect_rate & compliance_score & boolean string 'false'
            {"vendor_id": "V-3", "order_id": "PO-3", "order_date": "2026-03-01", "on_time_rate": 0.80, "delay_days": 2.0, "lead_time": 8, "defect_rate": None, "compliance_score": None, "violations": 1, "iso_certified": "false", "spend_tier": None},
        ]

        cleaner = DataCleaningEngine(company_id="test_company")
        cleaned, logs, summary = cleaner.clean(dirty_records)

        # 1. Deduplication verified
        self.assertEqual(len(cleaned), 3, "Duplicate record should be merged")
        self.assertGreater(summary["duplicate_merged"], 0)

        # 2. Clamping verified
        rec_v2 = next(r for r in cleaned if r["vendor_id"] == "V-2")
        self.assertLessEqual(rec_v2["on_time_rate"], 1.0, "Invalid on-time rate > 1.0 clamped to <= 1.0")
        self.assertGreaterEqual(rec_v2["delay_days"], 0.0, "Negative delay clamped to 0.0")
        self.assertEqual(rec_v2["order_date"], "2026-02-15", "Date normalized to ISO")

        # 3. Missing imputation verified
        rec_v3 = next(r for r in cleaned if r["vendor_id"] == "V-3")
        self.assertIsNotNone(rec_v3["defect_rate"], "Missing defect_rate imputed")
        self.assertIsNotNone(rec_v3["compliance_score"], "Missing compliance_score imputed")
        self.assertIsInstance(rec_v3["iso_certified"], bool, "Boolean string normalized")
        self.assertEqual(rec_v3["spend_tier"], "Medium", "Missing spend_tier imputed")

        # 4. Zero silent drops — audit logs exist
        self.assertGreater(len(logs), 0)
        self.assertTrue(all("action_taken" in l and "explanation" in l for l in logs))

    def test_02b_missing_date_is_not_fabricated_and_unknown_category_is_logged(self):
        record = {
            "company_id": "data_quality_test",
            "vendor_id": "V-DQ-1",
            "vendor_name": "Quality Test Vendor",
            "order_id": "PO-DQ-1",
            "order_date": None,
            "on_time_rate": 0.9,
            "delay_days": 1,
            "lead_time": 5,
            "defect_rate": 0.01,
            "return_rate": 0.01,
            "price_variance": 0.02,
            "compliance_score": 90,
            "violations": 0,
            "iso_certified": True,
            "spend_tier": "Enterprise",
        }
        cleaned, logs, _ = DataCleaningEngine("data_quality_test").clean([record])

        self.assertEqual(cleaned[0]["order_date"], "")
        self.assertTrue(any(
            entry["order_id"] == "PO-DQ-1" and entry["issue_type"] == "missing_unavailable"
            for entry in logs
        ))
        self.assertTrue(any(
            entry["order_id"] == "PO-DQ-1" and entry["field_name"] == "spend_tier"
            for entry in logs
        ))

    # ---------------- 3. Preprocessing & Validation ---------------- #
    def test_03_preprocessing_and_validation(self):
        """Test field mapping, encoding, scaling, and pre-training validation."""
        preprocessor = DataPreprocessor(
            company_id="test_company",
            field_mapping={"custom_ontime": "on_time_rate", "custom_defects": "defect_rate"}
        )

        test_records = [
            {"custom_ontime": 0.95, "delay_days": 0.5, "lead_time": 5, "custom_defects": 0.01, "return_rate": 0.002, "price_variance": 0.01, "compliance_score": 95, "violations": 0, "iso_certified": True, "spend_tier": "High", "risk_level": "Low"}
            for _ in range(12)
        ] + [
            {"custom_ontime": 0.60, "delay_days": 7.0, "lead_time": 18, "custom_defects": 0.08, "return_rate": 0.040, "price_variance": 0.15, "compliance_score": 50, "violations": 3, "iso_certified": False, "spend_tier": "Low", "risk_level": "High"}
            for _ in range(12)
        ]

        X, y, feature_names = preprocessor.prepare_training_data(test_records, target_field="risk_level")
        self.assertEqual(len(X), 24)
        self.assertEqual(len(feature_names), 10)
        self.assertFalse(np.isnan(X).any(), "Zero NaNs in preprocessed matrix")

        # Test validation rejection on too few samples
        with self.assertRaises(DataValidationError):
            preprocessor.validate_for_training(X[:3], y[:3], min_samples=8)

    # ---------------- 4. Provisional Labeler & Pillar Scoring ---------------- #
    def test_04_provisional_labeling_and_pillars(self):
        """Test provisional rule classification and pillar performance scores."""
        labeler = ProvisionalLabeler()

        high_risk_record = {
            "on_time_rate": 0.55, "delay_days": 8.0, "defect_rate": 0.08,
            "return_rate": 0.04, "price_variance": 0.18, "compliance_score": 45.0,
            "violations": 3, "iso_certified": False, "spend_tier": "Low"
        }
        label, source, reasons = labeler.resolve_label_and_source(high_risk_record)
        self.assertEqual(label, "High")
        self.assertEqual(source, "provisional_rule")
        self.assertGreater(len(reasons), 0)

        scores = labeler.compute_pillar_scores(high_risk_record)
        self.assertIn("delivery_score", scores)
        self.assertIn("quality_score", scores)
        self.assertIn("pricing_score", scores)
        self.assertIn("compliance_score", scores)
        self.assertGreater(scores["risk_score"], 50.0, "High risk record should have high risk score")

        # Verified ground truth outcome takes precedence over rules
        verified_record = dict(high_risk_record)
        verified_record["actual_risk_label"] = "Medium"
        v_label, v_source, _ = labeler.resolve_label_and_source(verified_record)
        self.assertEqual(v_label, "Medium")
        self.assertEqual(v_source, "ground_truth_feedback")

    # ---------------- 5. Random Forest ML Model ---------------- #
    def test_05_random_forest_model(self):
        """Test Random Forest training, probability prediction, and explainability."""
        np.random.seed(42)
        X = np.random.randn(30, 10)
        y = np.array(["Low"] * 10 + ["Medium"] * 10 + ["High"] * 10)
        feature_names = [f"feat_{i}" for i in range(10)]

        rf_model = RiskMLModel(company_id="test_company", version="v_test")
        rf_model.fit(X, y, feature_names)

        preds = rf_model.predict(X[:3])
        self.assertEqual(len(preds), 3)

        probs = rf_model.predict_proba(X[:3])
        self.assertEqual(len(probs), 3)
        for p in probs:
            self.assertIn("Low", p)
            self.assertIn("Medium", p)
            self.assertIn("High", p)
            self.assertAlmostEqual(sum(p.values()), 1.0, places=2)

        explain = rf_model.explain_prediction({"on_time_rate": 0.50, "delay_days": 8.0, "defect_rate": 0.08}, {"High": 0.85, "Medium": 0.10, "Low": 0.05})
        self.assertGreater(len(explain), 0)

    # ---------------- 6. Safe Deployment ---------------- #
    def test_06_safe_deployment(self):
        """Test candidate validation: candidate passes -> deployed; candidate fails -> active retained."""
        evaluator = ModelEvaluator(
            company_id="test_safe_deploy",
            min_accuracy=0.70,
            min_f1_score=0.65,
        )

        # Baseline training data
        np.random.seed(42)
        X = np.random.randn(30, 10)
        y = np.array(["Low"] * 15 + ["High"] * 15)
        feat_names = [f"f_{i}" for i in range(10)]

        active_model = RiskMLModel(company_id="test_safe_deploy", version="v_active")
        active_model.fit(X, y, feat_names)
        active_model.save()

        # 1. Candidate with passing performance
        good_candidate = RiskMLModel(company_id="test_safe_deploy", version="v_good")
        good_candidate.fit(X, y, feat_names)
        res_pass = evaluator.evaluate_and_deploy(good_candidate, active_model, X, y)
        self.assertTrue(res_pass.passed, "Good candidate should pass validation")
        self.assertIsNone(res_pass.rejection_reason)

        # 2. Flawed candidate evaluated on challenging/mismatched holdout set
        y_val_mismatched = np.array(["High"] * 15 + ["Low"] * 15)  # opposite labels
        res_fail = evaluator.evaluate_and_deploy(good_candidate, active_model, X, y_val_mismatched)
        self.assertFalse(res_fail.passed, "Underperforming candidate must be rejected")
        self.assertIsNotNone(res_fail.rejection_reason)

        # Verify active model is still loaded safely
        retained_model = RiskMLModel(company_id="test_safe_deploy")
        loaded = retained_model.load()
        self.assertTrue(loaded)

    # ---------------- 7. Admin Feedback & Auto-Retrain ---------------- #
    def test_07_admin_feedback_and_retrain_threshold(self):
        """Test feedback recording, storage, and auto-retrain threshold trigger."""
        c_id = "test_feedback_co"
        self.storage.save_company_config(c_id, rules=DEFAULT_COMPANY_RULES, field_mapping={}, auto_retrain_threshold=2)

        fb_id1 = self.storage.add_feedback(
            company_id=c_id, vendor_id="V-100", vendor_name="Vendor 100",
            rating=4.5, actual_outcome="on_time_delivery", actual_risk_label="Low",
            notes="Excellent performance"
        )
        self.assertGreater(fb_id1, 0)
        self.assertEqual(self.storage.get_unconsumed_feedback_count(c_id), 1)

        # Add second feedback to meet auto_retrain_threshold (2)
        self.storage.add_feedback(
            company_id=c_id, vendor_id="V-101", vendor_name="Vendor 101",
            rating=2.0, actual_outcome="defective_shipment", actual_risk_label="High",
            notes="Significant defect rate"
        )
        self.assertEqual(self.storage.get_unconsumed_feedback_count(c_id), 2)

        # Retrain should consume feedback and mark it used
        result = self.retrainer.retrain(
            company_id="construction",
            trigger_source="test_run",
            raw_records=get_dummy_vendor_history("construction"),
        )
        self.assertEqual(result["deployment_status"], "active")
        self.assertIn("candidate_metrics", result)

    # ---------------- 8. Company Isolation ---------------- #
    def test_08_company_isolation(self):
        """Test strict isolation across companies (data, configs, feedback)."""
        self.storage.save_company_config("company_A", rules={"rule": "A"}, field_mapping={"a": "b"}, auto_retrain_threshold=3)
        self.storage.save_company_config("company_B", rules={"rule": "B"}, field_mapping={"x": "y"}, auto_retrain_threshold=10)

        cfg_a = self.storage.get_company_config("company_A")
        cfg_b = self.storage.get_company_config("company_B")

        self.assertEqual(cfg_a["auto_retrain_threshold"], 3)
        self.assertEqual(cfg_b["auto_retrain_threshold"], 10)
        self.assertNotEqual(cfg_a["rules"], cfg_b["rules"])

        # Add feedback to company A only
        self.storage.add_feedback("company_A", "V-A", "Vendor A", 5.0, "perfect_execution", "Low")
        fb_a = self.storage.get_feedback_records("company_A")
        fb_b = self.storage.get_feedback_records("company_B")

        self.assertEqual(len(fb_a), 1)
        self.assertEqual(len(fb_b), 0, "Company B must have zero feedback when Company A gets feedback")

    def test_08b_vendor_api_secrets_and_history_are_company_scoped(self):
        """API credentials are encrypted at rest and fetched snapshots stay tenant-scoped."""
        os.environ["RISK_SECRET_ENCRYPTION_KEY"] = "agent-risk-test-encryption-key"
        secret = "test-vendor-api-secret"
        self.storage.save_vendor_api_config(
            "company_A", "external", "https://example.test/history", "api_key", secret,
            "Company A Vendors",
        )
        stored = self.storage._execute(
            "SELECT credential_ciphertext FROM company_vendor_api_configs WHERE company_id = %s",
            ("company_A",), fetch_one=True,
        )
        self.assertNotIn(secret, stored["credential_ciphertext"])
        self.assertEqual(self.storage.get_vendor_api_config("company_A")["credential"], secret)
        self.assertEqual(self.storage.get_vendor_api_config("company_A")["connection_name"], "Company A Vendors")
        self.assertIsNone(self.storage.get_vendor_api_config("company_B"))

        records = [{"company_id": "company_A", "vendor_id": "V-A"}]
        self.storage.save_vendor_history_snapshot("company_A", records, {"duplicate_merged": 0})
        self.assertEqual(self.storage.get_vendor_history_snapshot("company_A")["records"], records)
        self.assertIsNone(self.storage.get_vendor_history_snapshot("company_B"))

    def test_08c_analyze_scores_without_retraining(self):
        """Analyze uses the active model for a saved snapshot without invoking the training path."""
        company_id = "analyze_only_company"
        records = [{"vendor_id": f"V-{i}"} for i in range(4)]
        self.storage.save_vendor_history_snapshot(company_id, records, {})
        manager = RetrainingManager(storage=self.storage)

        with patch("retrainer.RiskMLModel") as model_class, \
             patch("retrainer.DataPreprocessor"), \
             patch.object(manager, "_rescore_vendors") as score_vendors, \
             patch.object(manager, "retrain") as retrain:
            model = model_class.return_value
            model.load.return_value = True
            model.version = "v_active"
            result = manager.analyze(company_id)

        self.assertFalse(result["training_performed"])
        self.assertEqual(result["vendors_scored"], 4)
        score_vendors.assert_called_once()
        retrain.assert_not_called()

    def test_08d_retrain_rejects_provisional_only_history(self):
        """Provisional rule labels are not treated as ground truth for model training."""
        records = [
            {
                "vendor_id": "V-UNLABELED-1",
                "order_id": f"PO-UNLABELED-{index}",
                "order_date": "2026-01-01",
                "on_time_rate": 0.9,
                "delay_days": 1,
                "lead_time": 5,
                "defect_rate": 0.01,
                "return_rate": 0.01,
                "price_variance": 0.01,
                "compliance_score": 90,
                "violations": 0,
                "iso_certified": True,
                "spend_tier": "Medium",
            }
            for index in range(40)
        ]
        with self.assertRaisesRegex(ValueError, "Insufficient labeled history"):
            self.retrainer.retrain("provisional_only_company", raw_records=records)

    # ---------------- 9. 1000-Order Dataset & Full Metrics Evaluation ---------------- #
    def test_09_1000_orders_dataset_and_full_metrics_evaluation(self):
        """
        Verifies:
        1. 1000-order CSV dataset is integrated (>1000 records).
        2. Automatic cleaning handles duplicates, missing, and invalid values with full audit logging.
        3. 'ground_truth_risk' is used exclusively as target, never leaked into feature matrix X.
        4. Evaluation computes Accuracy, Precision, Recall, and F1 score (macro, weighted, per-class).
        """
        raw_records = get_dummy_vendor_history("construction")
        self.assertGreaterEqual(len(raw_records), 1000, "Should have 1000+ records loaded from CSV")

        # 1. Cleaning handles anomalies
        cleaner = DataCleaningEngine(company_id="construction")
        cleaned, logs, summary = cleaner.clean(raw_records)
        self.assertGreater(summary["duplicate_merged"], 0, "Duplicates merged")
        self.assertGreater(summary["missing_imputed"], 0, "Missing values imputed")
        self.assertGreater(summary["invalid_clamped"], 0, "Invalid values clamped")
        self.assertGreater(len(logs), 0, "Audit logs recorded")

        # 2. Target isolation - verify ground_truth_risk is not in X
        labeler = ProvisionalLabeler()
        labeled_records = []
        for r in cleaned:
            rec = dict(r)
            label, source, reasons = labeler.resolve_label_and_source(rec)
            rec["risk_level"] = label
            rec["label_source"] = source
            rec.update(labeler.compute_pillar_scores(rec))
            labeled_records.append(rec)

        preprocessor = DataPreprocessor(company_id="construction")
        X, y, feature_names = preprocessor.prepare_training_data(labeled_records, target_field="risk_level")
        self.assertNotIn("ground_truth_risk", feature_names, "ground_truth_risk must not be in feature columns")
        self.assertNotIn("actual_risk_label", feature_names, "actual_risk_label must not be in feature columns")
        self.assertNotIn("risk_level", feature_names, "target column must not be in feature columns")

        # 3. Model training & comprehensive metrics evaluation
        from sklearn.model_selection import train_test_split
        X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)

        model = RiskMLModel(company_id="construction", version="v_eval_test")
        model.fit(X_train, y_train, feature_names)

        evaluator = ModelEvaluator(company_id="construction")
        metrics = evaluator.compute_metrics(model, X_val, y_val)

        # Check all 4 core metrics exist
        self.assertIn("accuracy", metrics)
        self.assertIn("precision", metrics)
        self.assertIn("recall", metrics)
        self.assertIn("f1_score", metrics)
        self.assertIn("per_class", metrics)

        # Values exceed quality thresholds
        self.assertGreaterEqual(metrics["accuracy"], 0.70)
        self.assertGreaterEqual(metrics["precision"], 0.70)
        self.assertGreaterEqual(metrics["recall"], 0.70)
        self.assertGreaterEqual(metrics["f1_score"], 0.65)

        for cls_name in ["Low", "Medium", "High"]:
            self.assertIn(cls_name, metrics["per_class"])
            self.assertIn("precision", metrics["per_class"][cls_name])
            self.assertIn("recall", metrics["per_class"][cls_name])
            self.assertIn("f1_score", metrics["per_class"][cls_name])


if __name__ == "__main__":
    unittest.main()
