"""
Data Preprocessing and Pre-Training Validation Engine
- Maps company-specific field names to canonical risk features
- Encodes categorical features (spend_tier, iso_certified)
- Scales numerical features with persistent StandardScaler
- Validates data integrity and sample sufficiency prior to ML training
"""

import os
import joblib
import logging
from typing import List, Dict, Any, Tuple, Optional
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

from config import ARTIFACTS_DIR

log = logging.getLogger("agent-risk.preprocessor")


CANONICAL_NUMERICAL_FEATURES = [
    "on_time_rate",
    "delay_days",
    "lead_time",
    "defect_rate",
    "return_rate",
    "price_variance",
    "compliance_score",
    "violations",
]

CANONICAL_CATEGORICAL_FEATURES = [
    "iso_certified",
    "spend_tier",
]

FEATURE_COLUMNS = CANONICAL_NUMERICAL_FEATURES + ["iso_certified_encoded", "spend_tier_encoded"]


class DataValidationError(Exception):
    """Raised when data fails pre-training validation."""
    pass


class DataPreprocessor:
    def __init__(self, company_id: str, field_mapping: Optional[Dict[str, str]] = None):
        self.company_id = company_id
        self.field_mapping = field_mapping or {}
        self.scaler: Optional[StandardScaler] = None
        self.model_dir = ARTIFACTS_DIR / company_id
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.scaler_path = self.model_dir / "scaler.joblib"
        self._load_scaler()

    def _load_scaler(self):
        if self.scaler_path.exists():
            try:
                self.scaler = joblib.load(self.scaler_path)
                log.info(f"Loaded existing StandardScaler for company '{self.company_id}'")
            except Exception as e:
                log.warning(f"Could not load scaler for company '{self.company_id}': {e}")
                self.scaler = None

    def _save_scaler(self):
        if self.scaler:
            try:
                joblib.dump(self.scaler, self.scaler_path)
                log.info(f"Saved StandardScaler for company '{self.company_id}' to {self.scaler_path}")
            except Exception as e:
                log.error(f"Error saving scaler: {e}")

    # ----------------- Field Mapping ----------------- #
    def apply_field_mapping(self, records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Remaps non-standard company field names to canonical names."""
        if not self.field_mapping:
            return records

        mapped_records = []
        for r in records:
            item = dict(r)
            for custom_field, canonical_field in self.field_mapping.items():
                if custom_field in item and canonical_field not in item:
                    item[canonical_field] = item.pop(custom_field)
            mapped_records.append(item)
        return mapped_records

    # ----------------- Categorical Encoding ----------------- #
    def _encode_categories(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()

        # iso_certified -> binary 0 or 1
        if "iso_certified" in df.columns:
            df["iso_certified_encoded"] = df["iso_certified"].apply(lambda v: 1.0 if v is True or str(v).lower() in ["true", "1", "yes"] else 0.0)
        else:
            df["iso_certified_encoded"] = 0.0

        # spend_tier -> ordinal: Low: 0, Medium: 1, High: 2
        spend_map = {"Low": 0.0, "Medium": 1.0, "High": 2.0}
        if "spend_tier" in df.columns:
            df["spend_tier_encoded"] = df["spend_tier"].map(spend_map).fillna(1.0)
        else:
            df["spend_tier_encoded"] = 1.0

        return df

    # ----------------- Validation ----------------- #
    def validate_for_training(self, X: np.ndarray, y: np.ndarray, min_samples: int = 8):
        """
        Validates feature matrix and labels before training:
        - Checks sample count >= min_samples
        - Ensures no NaN, Inf, or Null values
        - Ensures at least 2 distinct target classes exist for multi-class classification
        """
        if len(X) < min_samples:
            raise DataValidationError(
                f"Insufficient training samples: found {len(X)}, minimum required is {min_samples}."
            )

        if np.isnan(X).any() or np.isinf(X).any():
            nan_count = int(np.isnan(X).sum())
            inf_count = int(np.isinf(X).sum())
            raise DataValidationError(
                f"Data contains invalid values: {nan_count} NaNs, {inf_count} Infs after preprocessing."
            )

        unique_classes = np.unique(y)
        if len(unique_classes) < 2:
            raise DataValidationError(
                f"Training data contains only 1 risk class ({unique_classes}). "
                f"At least 2 distinct classes (Low, Medium, or High) are required for classifier training."
            )

        log.info(f"Data validation PASSED: {len(X)} samples, {X.shape[1]} features, classes={list(unique_classes)}")

    # ----------------- Fit & Transform ----------------- #
    def prepare_training_data(
        self, records: List[Dict[str, Any]], target_field: str = "risk_level"
    ) -> Tuple[np.ndarray, np.ndarray, List[str]]:
        """
        Processes records for ML training:
        1. Applies company field mapping
        2. Encodes categoricals
        3. Fits and transforms numerical features with StandardScaler
        4. Validates data integrity
        """
        mapped = self.apply_field_mapping(records)
        df = pd.DataFrame(mapped)

        if target_field not in df.columns:
            raise DataValidationError(f"Target column '{target_field}' missing from training records.")

        df = self._encode_categories(df)

        for col in CANONICAL_NUMERICAL_FEATURES:
            if col not in df.columns:
                raise DataValidationError(f"Required numerical feature '{col}' missing from records.")

        # Extract features
        num_features = df[CANONICAL_NUMERICAL_FEATURES].astype(float).values
        cat_features = df[["iso_certified_encoded", "spend_tier_encoded"]].astype(float).values

        # Fit Scaler on numerical features
        self.scaler = StandardScaler()
        scaled_num = self.scaler.fit_transform(num_features)
        self._save_scaler()

        # Combine scaled numerical + encoded categorical
        X = np.hstack([scaled_num, cat_features])
        y = df[target_field].astype(str).values

        # Validate
        self.validate_for_training(X, y)

        return X, y, FEATURE_COLUMNS

    def transform_inference_data(self, records: List[Dict[str, Any]]) -> Tuple[np.ndarray, pd.DataFrame]:
        """
        Transforms records for risk prediction using existing fitted scaler.
        """
        mapped = self.apply_field_mapping(records)
        df = pd.DataFrame(mapped)
        df = self._encode_categories(df)

        for col in CANONICAL_NUMERICAL_FEATURES:
            if col not in df.columns:
                df[col] = 0.0

        num_features = df[CANONICAL_NUMERICAL_FEATURES].astype(float).values
        cat_features = df[["iso_certified_encoded", "spend_tier_encoded"]].astype(float).values

        if self.scaler is not None:
            scaled_num = self.scaler.transform(num_features)
        else:
            scaled_num = num_features

        X = np.hstack([scaled_num, cat_features])
        return X, df
