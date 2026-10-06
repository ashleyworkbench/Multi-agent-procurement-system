"""
Dummy Dataset Generator for Vendor History API
Provides realistic historical procurement data with controlled anomalies
for testing automatic data cleaning, preprocessing, and ML risk modeling.
"""

from typing import List, Dict, Any, Optional
import copy
import logging
from pathlib import Path
import pandas as pd

log = logging.getLogger("agent-risk.dummy_data")

CONSTRUCTION_CSV_PATH = Path(__file__).parent / "data" / "construction_vendor_history_1000_orders.csv"


def _load_construction_orders_from_csv() -> List[Dict[str, Any]]:
    """
    Loads historical construction orders from the 1000-order CSV dataset.
    Replaces the previous 31-record dummy dataset with full 1000-order history.
    """
    if not CONSTRUCTION_CSV_PATH.exists():
        log.warning(f"Construction CSV dataset not found at {CONSTRUCTION_CSV_PATH}")
        return []

    try:
        df = pd.read_csv(CONSTRUCTION_CSV_PATH)
        df = df.astype(object).where(pd.notnull(df), None)

        vendors_dict: Dict[str, Dict[str, Any]] = {}
        for r in df.to_dict(orient="records"):
            v_id = str(r["vendor_id"])
            v_name = str(r["vendor_name"])
            if v_id not in vendors_dict:
                vendors_dict[v_id] = {
                    "vendor_id": v_id,
                    "vendor_name": v_name,
                    "orders": []
                }
            order_fields = {
                k: v for k, v in r.items()
                if k not in ["vendor_id", "vendor_name", "company_id"]
            }
            vendors_dict[v_id]["orders"].append(order_fields)

        loaded_vendors = list(vendors_dict.values())
        total_orders = sum(len(v["orders"]) for v in loaded_vendors)
        log.info(f"Loaded {total_orders} construction orders across {len(loaded_vendors)} vendors from {CONSTRUCTION_CSV_PATH.name}")
        return loaded_vendors
    except Exception as e:
        log.error(f"Failed to load construction orders from CSV {CONSTRUCTION_CSV_PATH}: {e}")
        return []


RAW_DUMMY_VENDORS_BY_COMPANY: Dict[str, List[Dict[str, Any]]] = {
    "construction": _load_construction_orders_from_csv(),
}


def get_dummy_vendor_history(company_id: str = "construction", vendor_id: str = None) -> List[Dict[str, Any]]:
    """
    Returns the construction-only vendor history dataset exposed via the existing API contract.
    Preserves company_id and vendor_id filtering while keeping the dataset restricted to the
    current 10 construction vendors and their historical orders.
    """
    normalized_company = str(company_id or "construction").strip().lower()
    if normalized_company != "construction":
        return []

    company_vendors = RAW_DUMMY_VENDORS_BY_COMPANY.get(normalized_company, [])
    if not company_vendors:
        return []

    results = []
    for v in company_vendors:
        if vendor_id and str(v["vendor_id"]) != str(vendor_id):
            continue
        for o in v["orders"]:
            record = copy.deepcopy(o)
            record["company_id"] = normalized_company
            record["vendor_id"] = v["vendor_id"]
            record["vendor_name"] = v["vendor_name"]
            results.append(record)

    return results
