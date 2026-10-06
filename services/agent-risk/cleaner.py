"""
Automatic Data Cleaning Engine for Risk Analysis Agent
Safely handles:
- Missing values (statistical imputation)
- Duplicate records (safe deduplication and merging)
- Invalid values (domain clamping and bounding)
- Inconsistent formats (dates, booleans, currencies, strings)
- Complete audit logging of all actions (zero silent data drops)
"""

import re
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple
import numpy as np

log = logging.getLogger("agent-risk.cleaner")


class DataCleaningEngine:
    def __init__(self, company_id: str):
        self.company_id = company_id
        self.cleaning_logs: List[Dict[str, Any]] = []
        self._current_order_id = None
        self.summary: Dict[str, int] = {
            "missing_imputed": 0,
            "missing_unavailable": 0,
            "duplicate_merged": 0,
            "invalid_clamped": 0,
            "format_normalized": 0,
        }

    def _log_action(
        self,
        vendor_id: str,
        field_name: str,
        issue_type: str,
        raw_val: Any,
        clean_val: Any,
        action: str,
        explanation: str,
    ):
        entry = {
            "company_id": self.company_id,
            "vendor_id": str(vendor_id),
            "order_id": self._current_order_id,
            "field_name": field_name,
            "issue_type": issue_type,
            "raw_value": str(raw_val),
            "cleaned_value": str(clean_val),
            "action_taken": action,
            "explanation": explanation,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self.cleaning_logs.append(entry)
        if issue_type in self.summary:
            self.summary[issue_type] += 1

    # ----------------- Format Normalizers ----------------- #
    def _normalize_date(self, date_val: Any, vendor_id: str, order_id: str) -> str:
        if not date_val:
            self._log_action(
                vendor_id, "order_date", "missing_unavailable", date_val, "",
                "Left missing date unavailable", f"Missing date on order {order_id}; no historical date was fabricated."
            )
            return ""

        s = str(date_val).strip()
        # Already YYYY-MM-DD
        if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
            return s

        # Try various formats
        for fmt in ["%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"]:
            try:
                dt = datetime.strptime(s.split("T")[0] if "T" in s else s, fmt.split("T")[0])
                clean_date = dt.strftime("%Y-%m-%d")
                self._log_action(
                    vendor_id, "order_date", "format_normalized", s, clean_date,
                    "Normalized date format", f"Converted non-standard date '{s}' to ISO '{clean_date}'."
                )
                return clean_date
            except ValueError:
                continue

        # Fallback if unparseable
        clean_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        self._log_action(
            vendor_id, "order_date", "format_normalized", s, clean_date,
            "Fallback date assigned", f"Could not parse date string '{s}', safely defaulted to '{clean_date}'."
        )
        return clean_date

    def _normalize_boolean(self, val: Any, field_name: str, vendor_id: str) -> bool:
        if isinstance(val, bool):
            return val
        s = str(val).strip().lower()
        if s in ["true", "yes", "1", "y", "t"]:
            clean_val = True
        elif s in ["false", "no", "0", "n", "f"]:
            clean_val = False
        else:
            clean_val = False
            self._log_action(
                vendor_id, field_name, "format_normalized", val, clean_val,
                "Standardized boolean", f"Ambiguous boolean value '{val}' normalized to False."
            )
            return clean_val

        if not isinstance(val, bool):
            self._log_action(
                vendor_id, field_name, "format_normalized", val, clean_val,
                "Parsed boolean string", f"Converted string '{val}' to boolean {clean_val}."
            )
        return clean_val

    def _clean_numeric(
        self,
        val: Any,
        field_name: str,
        vendor_id: str,
        min_val: float = None,
        max_val: float = None,
        percentage_100_scale: bool = False,
    ) -> Tuple[float, bool]:
        """Parses numeric, clamps to min/max bounds, handles percentage scales."""
        if val is None or val == "" or str(val).lower() == "none" or str(val).lower() == "nan":
            return None, True

        try:
            # Strip currency signs or percentage characters
            s = str(val).replace("$", "").replace("₹", "").replace(",", "").replace("%", "").strip()
            num = float(s)
        except Exception:
            return None, True

        # Handle 0-100 scale represented as 0-1 or vice-versa (e.g. 50% to 100%)
        # Rates between 1.0 and 2.0 (e.g. 1.35, 1.40) represent invalid rates to be clamped to 1.0
        if percentage_100_scale and num > 2.0 and num <= 100.0:
            converted = num / 100.0
            self._log_action(
                vendor_id, field_name, "format_normalized", num, converted,
                "Converted percentage scale", f"Scaled percentage value {num}% to fractional {converted}."
            )
            num = converted

        # Clamp min
        if min_val is not None and num < min_val:
            self._log_action(
                vendor_id, field_name, "invalid_clamped", num, min_val,
                "Clamped lower bound", f"Value {num} below valid minimum {min_val}; clamped to {min_val}."
            )
            num = min_val

        # Clamp max
        if max_val is not None and num > max_val:
            self._log_action(
                vendor_id, field_name, "invalid_clamped", num, max_val,
                "Clamped upper bound", f"Value {num} above valid maximum {max_val}; clamped to {max_val}."
            )
            num = max_val

        return num, False

    # ----------------- Pipeline Execution ----------------- #
    def clean(self, raw_records: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, int]]:
        """
        Runs the full data cleaning pipeline over records:
        1. Deduplication
        2. Format normalization & Bounds clamping
        3. Statistical missing value imputation
        """
        if not raw_records:
            return [], [], self.summary

        # Step 1: Deduplication
        deduped = []
        seen_keys = set()
        for r in raw_records:
            vendor_id = str(r.get("vendor_id", "UNKNOWN"))
            order_id = str(r.get("order_id", ""))
            self._current_order_id = order_id or None
            
            # If order_id exists, use (vendor_id, order_id) as key; else hash key features
            if order_id:
                key = f"{vendor_id}::{order_id}"
            else:
                key = f"{vendor_id}::{r.get('order_date')}::{r.get('on_time_rate')}::{r.get('lead_time')}"

            if key in seen_keys:
                self._log_action(
                    vendor_id, "record", "duplicate_merged", f"Order {order_id}", "Deduplicated",
                    "Merged duplicate record", f"Removed redundant duplicate record for order {order_id}."
                )
                continue

            seen_keys.add(key)
            deduped.append(dict(r))

        # Step 2: Individual Field Normalization and Clamping
        cleaned_pass1 = []
        for r in deduped:
            v_id = str(r.get("vendor_id", "UNKNOWN"))
            o_id = str(r.get("order_id", "N/A"))
            self._current_order_id = o_id if o_id != "N/A" else None
            
            # String trims
            r["vendor_name"] = str(r.get("vendor_name", v_id)).strip()
            r["order_date"] = self._normalize_date(r.get("order_date"), v_id, o_id)

            # Booleans
            if "iso_certified" in r:
                r["iso_certified"] = self._normalize_boolean(r.get("iso_certified"), "iso_certified", v_id)

            # Categorical string
            if "spend_tier" in r and r["spend_tier"]:
                raw_spend_tier = r["spend_tier"]
                r["spend_tier"] = str(raw_spend_tier).strip().title()
                if r["spend_tier"] not in ["High", "Medium", "Low"]:
                    r["spend_tier"] = "Medium"
                    self._log_action(
                        v_id, "spend_tier", "format_normalized", raw_spend_tier, "Medium",
                        "Normalized unexpected category", "Unknown spend_tier value normalized to Medium."
                    )

            # Numerics with bounds
            # on_time_rate: 0.0 to 1.0 (with percentage conversion if given e.g. 95)
            r["on_time_rate"], _ = self._clean_numeric(
                r.get("on_time_rate"), "on_time_rate", v_id, min_val=0.0, max_val=1.0, percentage_100_scale=True
            )
            # delay_days: >= 0.0
            r["delay_days"], _ = self._clean_numeric(
                r.get("delay_days"), "delay_days", v_id, min_val=0.0, max_val=90.0
            )
            # lead_time: >= 0
            r["lead_time"], _ = self._clean_numeric(
                r.get("lead_time"), "lead_time", v_id, min_val=0.0, max_val=180.0
            )
            # defect_rate: 0.0 to 1.0
            r["defect_rate"], _ = self._clean_numeric(
                r.get("defect_rate"), "defect_rate", v_id, min_val=0.0, max_val=1.0, percentage_100_scale=True
            )
            # return_rate: 0.0 to 1.0
            r["return_rate"], _ = self._clean_numeric(
                r.get("return_rate"), "return_rate", v_id, min_val=0.0, max_val=1.0, percentage_100_scale=True
            )
            # price_variance: -1.0 to 2.0
            r["price_variance"], _ = self._clean_numeric(
                r.get("price_variance"), "price_variance", v_id, min_val=-0.50, max_val=2.0
            )
            # compliance_score: 0.0 to 100.0
            r["compliance_score"], _ = self._clean_numeric(
                r.get("compliance_score"), "compliance_score", v_id, min_val=0.0, max_val=100.0
            )
            # violations: >= 0
            r["violations"], _ = self._clean_numeric(
                r.get("violations"), "violations", v_id, min_val=0.0, max_val=50.0
            )

            cleaned_pass1.append(r)

        # Step 3: Statistical Missing Value Imputation
        # Calculate batch medians for numerical fields across valid records
        field_medians = {}
        numeric_fields = ["on_time_rate", "delay_days", "lead_time", "defect_rate", "return_rate", "price_variance", "compliance_score", "violations"]
        defaults = {
            "on_time_rate": 0.85, "delay_days": 1.5, "lead_time": 7.0,
            "defect_rate": 0.015, "return_rate": 0.005, "price_variance": 0.02,
            "compliance_score": 85.0, "violations": 0.0, "iso_certified": False, "spend_tier": "Medium"
        }

        for f in numeric_fields:
            vals = [r[f] for r in cleaned_pass1 if r.get(f) is not None]
            if vals:
                field_medians[f] = float(np.median(vals))
            else:
                field_medians[f] = defaults[f]

        # Impute missing values with batch median
        for r in cleaned_pass1:
            v_id = str(r.get("vendor_id", "UNKNOWN"))
            self._current_order_id = r.get("order_id")
            for f in numeric_fields:
                if r.get(f) is None:
                    med = field_medians[f]
                    r[f] = med
                    self._log_action(
                        v_id, f, "missing_imputed", None, med,
                        "Imputed missing numerical value", f"Filled missing '{f}' with company batch median {med:.4f}."
                    )
            
            if r.get("iso_certified") is None:
                r["iso_certified"] = False
                self._log_action(
                    v_id, "iso_certified", "missing_imputed", None, False,
                    "Imputed missing boolean", "Defaulted missing 'iso_certified' to False."
                )

            if r.get("spend_tier") is None:
                r["spend_tier"] = "Medium"
                self._log_action(
                    v_id, "spend_tier", "missing_imputed", None, "Medium",
                    "Imputed missing category", "Defaulted missing 'spend_tier' to 'Medium'."
                )

        log.info(
            f"Data Cleaning Complete for company '{self.company_id}': "
            f"{len(raw_records)} raw -> {len(cleaned_pass1)} clean records. "
            f"Logs: {len(self.cleaning_logs)} issues resolved ({self.summary})"
        )
        return cleaned_pass1, self.cleaning_logs, self.summary
