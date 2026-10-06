"""
Agent 5 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Risk Analysis Agent (ProcureFlow)
===========================================
Port: 8010 (proxied via Integration Gateway on 8000 at /agent-risk/*)

Core Responsibilities:
  1. API Integration: Ingests vendor historical performance (dummy dataset API initially, company ERP APIs later)
  2. Automatic Data Cleaning: Handles missing values, duplicates, invalid bounds, inconsistent formats with full logging
  3. Preprocessing & Validation: Field mapping, categorical encoding, scaling, and pre-training data integrity validation
  4. Risk Classification: Random Forest multi-class model (Low, Medium, High) + 4 pillar scores (Delivery, Quality, Pricing, Compliance)
  5. Provisional Rules: Company-approved rule engine for provisional labeling when verified outcomes are missing
  6. Admin Feedback: Records ratings and actual order outcomes for supervised retraining
  7. Retraining & Safe Deployment: Automatic (threshold-triggered) and manual retraining with candidate validation and fallback
  8. Company Isolation: Multi-tenant partitioning of data, configs, cleaning logs, models, and feedback
"""

import os
import logging
import base64
import hashlib
import hmac
import json
import math
import re
import time
from urllib.parse import urlparse
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Header, Query, Request, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from config import SERVICE_PORT, LOG_LEVEL, DEFAULT_COMPANY_ID, GATEWAY_KEY
from storage import RiskStorage
from retrainer import RetrainingManager
from api_client import DummyDatasetAPIClient, get_vendor_history_provider
from cleaner import DataCleaningEngine
from labeler import DEFAULT_COMPANY_RULES
from preprocessor import DataPreprocessor
from ml_model import RiskMLModel
from suitability import evaluate_po_suitability

load_dotenv()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s [%(levelname)s] AgentRisk | %(message)s",
)
log = logging.getLogger("agent-risk")

app = FastAPI(
    title="Agent 5 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Risk Analysis Agent",
    description="Evaluates vendor operational risk across Delivery, Quality, Pricing, and Compliance. "
                "Provides automatic data cleaning, Random Forest ML prediction, admin feedback loops, and safe deployment.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Storage & Retraining Manager
storage = RiskStorage()
retrainer = RetrainingManager(storage=storage)

# Agent Global Monitor State
agent_status = {
    "status": "running",
    "service": "agent-risk",
    "role": "Risk Analysis Agent",
    "events_processed": 0,
    "last_event_at": None,
    "current_task": "Ready",
}


# ------------------------------------------------------------------ #
# Pydantic Schemas                                                    #
# ------------------------------------------------------------------ #
class FeedbackRequest(BaseModel):
    company_id: str = "construction"
    vendor_id: str
    vendor_name: str
    rating: float = Field(..., ge=1.0, le=5.0)
    actual_outcome: str  # on_time_delivery, delayed_delivery, defective_shipment, price_dispute, contract_violation, perfect_execution
    actual_risk_label: str  # Low, Medium, High
    order_id: Optional[str] = None
    notes: Optional[str] = None
    submitted_by: Optional[str] = "Admin"


class RetrainRequest(BaseModel):
    company_id: Optional[str] = "construction"


class ConfigUpdateRequest(BaseModel):
    company_id: str
    rules: Optional[Dict[str, Any]] = None
    field_mapping: Optional[Dict[str, str]] = None
    auto_retrain_threshold: Optional[int] = 5
    min_accuracy: Optional[float] = 0.70
    min_f1_score: Optional[float] = 0.65
    max_degradation: Optional[float] = 0.05


class VendorAPIConfigRequest(BaseModel):
    company_id: str
    connection_name: str = "Vendor History"
    mode: str = "dummy"
    endpoint_url: str = ""
    master_endpoint_url: str = ""
    auth_type: str = "none"
    credential: Optional[str] = None


class VendorHistoryRequest(BaseModel):
    company_id: str = "construction"


class VendorSuitabilityRequest(BaseModel):
    company_id: str
    item: str
    required_quantity: int = Field(..., ge=1)
    available_inventory: int = Field(0, ge=0)
    shortage_quantity: int = Field(..., ge=1)
    category: Optional[str] = None
    delivery_deadline: Optional[str] = None
    max_delivery_days: Optional[int] = Field(None, ge=0)
    max_unit_price: Optional[float] = Field(None, ge=0)
    budget: Optional[float] = Field(None, ge=0)
    minimum_quality_score: Optional[float] = Field(None, ge=0, le=100)
    minimum_compliance_score: Optional[float] = Field(None, ge=0, le=100)
    required_certifications: List[str] = Field(default_factory=list)
    request_id: Optional[int] = None


def require_admin(authorization: Optional[str] = Header(None)):
    """Validates the same HS256 JWT issued by Procurement Service."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Admin authentication required.")
    token = authorization[7:].strip()
    try:
        header_part, payload_part, signature_part = token.split(".")
        decode_segment = lambda segment: base64.urlsafe_b64decode(
            segment + "=" * (-len(segment) % 4)
        )
        header = json.loads(decode_segment(header_part))
        payload = json.loads(decode_segment(payload_part))
        if header.get("alg") != "HS256":
            raise ValueError("Unsupported token algorithm")
        secret = os.getenv("JWT_SECRET", "change-this-secret-in-production").encode()
        signed = f"{header_part}.{payload_part}".encode()
        expected = hmac.new(secret, signed, hashlib.sha256).digest()
        actual = decode_segment(signature_part)
        if not hmac.compare_digest(expected, actual) or int(payload.get("exp", 0)) <= int(time.time()):
            raise ValueError("Invalid or expired token")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token.")
    if payload.get("role") != "Admin":
        raise HTTPException(status_code=403, detail="Administrator role required.")
    return payload


def _stored_provider_config(company_id: str) -> Dict[str, Any]:
    config = storage.get_company_config(company_id) or {}
    api_config = storage.get_vendor_api_config(company_id)
    if api_config and api_config["mode"] == "dummy":
        config["api_integration"] = {
            "mode": "dummy",
            "api_key": api_config["credential"] or GATEWAY_KEY,
        }
    elif api_config and api_config["mode"] == "external":
        integration = {
            "mode": "real_api",
            "endpoint_url": api_config["endpoint_url"],
            "master_endpoint_url": api_config.get("master_endpoint_url", ""),
            "auth_type": api_config["auth_type"],
        }
        if api_config["auth_type"] == "api_key":
            integration["api_key"] = api_config["credential"]
        elif api_config["auth_type"] == "bearer":
            integration["bearer_token"] = api_config["credential"]
        config["api_integration"] = integration
    return config


def _provider_for_settings(
    mode: str,
    endpoint_url: str,
    auth_type: str,
    credential: str,
    master_endpoint_url: str = "",
):
    if mode == "dummy":
        from api_client import DummyDatasetAPIClient
        return DummyDatasetAPIClient(api_key=credential or GATEWAY_KEY)
    if mode != "external":
        raise HTTPException(status_code=422, detail="Unsupported vendor history source.")
    parsed = urlparse(endpoint_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
        raise HTTPException(status_code=422, detail="Enter a valid HTTP or HTTPS API URL.")
    if auth_type not in {"none", "api_key", "bearer"}:
        raise HTTPException(status_code=422, detail="Unsupported API authentication type.")
    if auth_type != "none" and not credential:
        raise HTTPException(status_code=422, detail="Provide credentials for the selected authentication type.")
    api_integration = {
        "mode": "real_api",
        "endpoint_url": endpoint_url,
        "master_endpoint_url": master_endpoint_url,
        "auth_type": auth_type,
    }
    if auth_type == "api_key":
        api_integration["api_key"] = credential
    elif auth_type == "bearer":
        api_integration["bearer_token"] = credential
    return get_vendor_history_provider("construction", {"api_integration": api_integration})


def _validate_company_id(company_id: str):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", company_id or ""):
        raise HTTPException(status_code=422, detail="Company ID may contain only letters, numbers, hyphens, and underscores.")


def _quality_log(company_id: str, record: Dict[str, Any], field: str, issue: str, raw: Any, action: str, explanation: str):
    return {
        "company_id": company_id,
        "vendor_id": str(record.get("vendor_id") or "UNKNOWN"),
        "order_id": record.get("order_id") or record.get("record_id"),
        "field_name": field,
        "issue_type": issue,
        "raw_value": str(raw),
        "cleaned_value": "",
        "action_taken": action,
        "explanation": explanation,
        "created_at": datetime.utcnow().isoformat(),
    }


def _canonicalize_vendor_master(company_id: str, vendors: List[Dict[str, Any]]):
    normalized = {}
    logs = []
    for index, raw in enumerate(vendors):
        vendor = dict(raw)
        source_company = vendor.get("company_id") or vendor.get("industry")
        if source_company is not None and str(source_company).strip().lower() != company_id:
            raise ValueError("Vendor master response contains records for another company.")
        vendor_id = str(vendor.get("vendor_id") or "").strip()
        if not vendor_id:
            logs.append(_quality_log(
                company_id, vendor, "vendor_id", "invalid_dropped", index,
                "Quarantined vendor master record",
                "Vendor master record has no stable vendor_id.",
            ))
            continue
        if vendor_id in normalized:
            logs.append(_quality_log(
                company_id, vendor, "vendor_id", "duplicate_merged", vendor_id,
                "Kept first vendor master record",
                "Duplicate vendor_id in vendor master response.",
            ))
            continue
        try:
            purchase_vendor_id = int(vendor.get("purchase_vendor_id", vendor.get("id")))
        except (TypeError, ValueError):
            logs.append(_quality_log(
                company_id, vendor, "purchase_vendor_id", "invalid_dropped",
                vendor.get("purchase_vendor_id"), "Quarantined vendor master record",
                "Vendor master record has no valid existing PO vendor ID.",
            ))
            continue
        vendor["vendor_id"] = vendor_id
        vendor["company_id"] = company_id
        vendor["purchase_vendor_id"] = purchase_vendor_id
        vendor["vendor_name"] = str(vendor.get("vendor_name") or vendor_id).strip()
        categories = vendor.get("supported_categories") or []
        if isinstance(categories, str):
            try:
                categories = json.loads(categories)
            except ValueError:
                categories = [categories]
        products = vendor.get("supported_products") or vendor.get("vendor_products") or []
        if isinstance(products, str):
            try:
                products = json.loads(products)
            except ValueError:
                products = []
        capacity = vendor.get("capacity") or {}
        if isinstance(capacity, str):
            try:
                capacity = json.loads(capacity)
            except ValueError:
                capacity = {}
        certifications = vendor.get("certifications") or []
        if isinstance(certifications, str):
            try:
                certifications = json.loads(certifications)
            except ValueError:
                certifications = [certifications]
        active = vendor.get("active_status", vendor.get("is_active", True))
        if isinstance(active, str):
            active = active.strip().lower() in {"true", "yes", "1", "active"}
        vendor["supported_categories"] = categories
        vendor["supported_products"] = products
        vendor["capacity"] = capacity
        vendor["certifications"] = certifications
        vendor["active_status"] = bool(active)
        normalized[vendor_id] = vendor
    return list(normalized.values()), logs


def _valid_order_date(value: Any) -> bool:
    if value is None or not str(value).strip():
        return True
    text = str(value).strip()
    for date_format in (
        "%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y",
        "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S",
    ):
        try:
            datetime.strptime(text, date_format)
            return True
        except ValueError:
            continue
    return False


def _canonicalize_records(
    company_id: str,
    records: List[Dict[str, Any]],
    field_mapping: Dict[str, str],
    vendor_master: Optional[List[Dict[str, Any]]] = None,
):
    valid_records = []
    dropped_logs = []
    vendors_by_id = {str(v["vendor_id"]): v for v in (vendor_master or [])}
    numeric_bounds = {
        "on_time_rate": (0.0, 1.0),
        "delay_days": (0.0, 90.0),
        "lead_time": (0.0, 180.0),
        "defect_rate": (0.0, 1.0),
        "return_rate": (0.0, 1.0),
        "price_variance": (-0.5, 2.0),
        "compliance_score": (0.0, 100.0),
        "violations": (0.0, 50.0),
        "rating": (1.0, 5.0),
    }
    for index, raw_record in enumerate(records):
        record = dict(raw_record)
        source_company = record.get("company_id") or record.get("industry")
        if source_company is not None and str(source_company).strip().lower() != company_id:
            raise ValueError("Vendor history response contains records for another company.")
        for source_field, canonical_field in field_mapping.items():
            if source_field in record and canonical_field not in record:
                record[canonical_field] = record[source_field]
        vendor_id = record.get("vendor_id")
        if vendor_id is None or not str(vendor_id).strip():
            dropped_logs.append(_quality_log(
                company_id, record, "vendor_id", "invalid_dropped", index,
                "Quarantined performance record",
                "Performance record has no stable vendor_id and cannot be assigned safely.",
            ))
            continue
        vendor_id = str(vendor_id).strip()
        master = vendors_by_id.get(vendor_id)
        if vendor_master is not None and master is None:
            dropped_logs.append(_quality_log(
                company_id, record, "vendor_id", "unknown_vendor", vendor_id,
                "Quarantined performance record",
                "vendor_id is not present in this company's vendor master.",
            ))
            continue
        if not _valid_order_date(record.get("order_date")):
            dropped_logs.append(_quality_log(
                company_id, record, "order_date", "invalid_dropped", record.get("order_date"),
                "Quarantined performance record",
                "Order date could not be parsed as a supported date format.",
            ))
            continue
        bad_numeric = None
        for field, (minimum, maximum) in numeric_bounds.items():
            value = record.get(field)
            if value is None or not str(value).strip() or str(value).strip().lower() in {"nan", "none", "null"}:
                continue
            try:
                number = float(str(value).replace(",", "").replace("%", "").strip())
                if not math.isfinite(number):
                    raise ValueError
                if company_id == "manufacturing" and field in {"on_time_rate", "defect_rate", "return_rate", "price_variance"} and 1.0 < abs(number) <= 100.0:
                    number /= 100.0
                if number < minimum or number > maximum:
                    bad_numeric = (field, value)
                    break
                record[field] = number
            except (TypeError, ValueError):
                bad_numeric = (field, value)
                break
        if bad_numeric:
            field, value = bad_numeric
            dropped_logs.append(_quality_log(
                company_id, record, field, "invalid_dropped", value,
                "Quarantined performance record",
                "Numeric metric is not finite or is outside its valid domain range.",
            ))
            continue
        record["company_id"] = company_id
        record["vendor_id"] = vendor_id
        if master:
            source_name = str(record.get("vendor_name") or "").strip()
            canonical_name = master["vendor_name"]
            if source_name and source_name.casefold() != canonical_name.casefold():
                dropped_logs.append(_quality_log(
                    company_id, record, "vendor_name", "format_normalized", source_name,
                    "Canonicalized vendor name by vendor_id",
                    "Vendor identity was validated by vendor_id; vendor_name is display-only.",
                ))
            record["vendor_name"] = canonical_name
        valid_records.append(record)
    return valid_records, dropped_logs


# ------------------------------------------------------------------ #
# Startup Initialization                                              #
# ------------------------------------------------------------------ #
@app.on_event("startup")
async def startup_init():
    log.info("Starting Risk Analysis Agent service...")
    companies = ["construction", "pharma", "manufacturing", "electronics"]
    for c_id in companies:
        existing_cfg = storage.get_company_config(c_id)
        if not existing_cfg:
            storage.save_company_config(
                company_id=c_id,
                rules=DEFAULT_COMPANY_RULES,
                field_mapping={},
                auto_retrain_threshold=5,
                min_accuracy=0.70,
                min_f1_score=0.65,
                max_degradation=0.05,
            )

# ------------------------------------------------------------------ #
# Health & Status (for Agent Monitor & Docker)                        #
# ------------------------------------------------------------------ #
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "agent-risk",
        "storage": "postgres" if storage.use_postgres else "sqlite",
    }


@app.get("/status")
async def get_agent_status():
    return {
        "status": agent_status["status"],
        "service": agent_status["service"],
        "role": agent_status["role"],
        "events_processed": agent_status["events_processed"],
        "last_event_at": agent_status["last_event_at"],
        "current_task": agent_status["current_task"],
    }


# ------------------------------------------------------------------ #
# Dummy Dataset API Endpoint                                          #
# ------------------------------------------------------------------ #
@app.get("/api/v1/dummy/vendor-history")
async def dummy_vendor_history(
    company_id: str = Query("construction"),
    vendor_id: Optional[str] = Query(None),
    x_api_key: Optional[str] = Header(None),
):
    """
    Exposes raw historical transactions from the dummy dataset API.
    Used by the Risk Analysis Agent following the Inventory Agent pattern.
    """
    if x_api_key != GATEWAY_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    provider = DummyDatasetAPIClient(api_key=GATEWAY_KEY)
    records = await provider.fetch_vendor_history(company_id=company_id, vendor_id=vendor_id)
    return {"company_id": company_id, "records": records, "total": len(records)}


@app.get("/api/v1/dummy/vendor-history/connection")
async def test_dummy_vendor_history_connection(
    company_id: str = Query("construction"),
    x_api_key: Optional[str] = Header(None),
):
    """Validates API credentials without returning or processing history records."""
    _validate_company_id(company_id)
    if x_api_key != GATEWAY_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return {"status": "connected", "company_id": company_id}


@app.post("/api/v1/vendor-history/test")
async def test_vendor_history_connection(
    req: VendorAPIConfigRequest,
    _: dict = Depends(require_admin),
):
    """Tests a submitted provider configuration without saving credentials or records."""
    _validate_company_id(req.company_id)
    if not req.connection_name.strip():
        raise HTTPException(status_code=422, detail="Connection name is required.")
    credential = req.credential or ""
    saved = storage.get_vendor_api_config(req.company_id)
    if req.mode == "external" and not credential and saved and saved["auth_type"] == req.auth_type:
        credential = saved["credential"]
    master_endpoint_url = req.master_endpoint_url or (
        saved.get("master_endpoint_url", "") if saved and req.mode == "external" else ""
    )
    provider = _provider_for_settings(
        req.mode, req.endpoint_url, req.auth_type, credential, master_endpoint_url
    )
    try:
        await provider.test_connection(req.company_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        log.warning("Vendor API connection test failed for company '%s'.", req.company_id)
        raise HTTPException(status_code=502, detail="Vendor API request failed. Check the URL and authentication settings.")
    return {"status": "success", "company_id": req.company_id, "connection_name": req.connection_name}


@app.post("/api/v1/vendor-history/sync")
async def sync_vendor_history(
    req: VendorHistoryRequest,
    _: dict = Depends(require_admin),
):
    """Fetches, cleans, audits, and stores vendor history; it never trains a model."""
    _validate_company_id(req.company_id)
    provider = get_vendor_history_provider(
        req.company_id,
        _stored_provider_config(req.company_id),
    )

    company_config = storage.get_company_config(req.company_id) or {}
    try:
        raw_master = await provider.fetch_vendor_master(req.company_id)
        canonical_master, master_logs = _canonicalize_vendor_master(req.company_id, raw_master)
        if not canonical_master:
            raise ValueError("The API returned no valid vendor master records.")
        raw_records = await provider.fetch_vendor_history(req.company_id)
        canonical, invalid_logs = _canonicalize_records(
            req.company_id,
            raw_records,
            company_config.get("field_mapping", {}),
            canonical_master,
        )
        if raw_records and not canonical:
            raise ValueError("No valid performance records matched the company vendor master.")
        cleaner = DataCleaningEngine(company_id=req.company_id)
        cleaned, cleaning_logs, summary = cleaner.clean(canonical)

        summary["records_fetched"] = len(raw_records)
        summary["records_ready"] = len(cleaned)
        summary["records_quarantined"] = max(0, len(raw_records) - len(cleaned))
        if canonical and not cleaned:
            raise ValueError("No valid vendor history records remained after cleaning.")
        summary["invalid_dropped"] = len(invalid_logs)
        summary["master_invalid"] = len(master_logs)
        storage.add_cleaning_logs(cleaning_logs + invalid_logs + master_logs)
        storage.save_vendor_history_snapshot(
            req.company_id,
            cleaned,
            summary,
            vendor_master=canonical_master,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        log.warning("Vendor history sync failed for company '%s'.", req.company_id)
        raise HTTPException(status_code=502, detail="Vendor history sync failed. Check the configured API and try again.")

    agent_status["events_processed"] += 1
    agent_status["last_event_at"] = datetime.utcnow().isoformat()
    return {
        "status": "success",
        "company_id": req.company_id,
        "vendors_fetched": len(raw_master),
        "vendors_ready": len(canonical_master),
        "records_fetched": len(raw_records),
        "records_ready": len(cleaned),
        "cleaning_summary": summary,
        "fetched_at": storage.get_vendor_history_snapshot(req.company_id)["fetched_at"],
    }


# ------------------------------------------------------------------ #
# Vendor Risk Analysis Endpoints                                      #
# ------------------------------------------------------------------ #
@app.get("/api/v1/vendors/risk")
async def get_vendors_risk(
    company_id: str = Query("construction"),
):
    """
    Returns the latest persisted risk predictions without initiating ingestion or training.
    """
    records = storage.get_vendor_risk_records(company_id)

    active_deployment = storage.get_active_model_deployment(company_id)
    unconsumed_fb = storage.get_unconsumed_feedback_count(company_id)

    # Compute high-level KPI aggregations
    high_count = sum(1 for r in records if r["risk_level"] == "High")
    med_count = sum(1 for r in records if r["risk_level"] == "Medium")
    low_count = sum(1 for r in records if r["risk_level"] == "Low")

    return {
        "company_id": company_id,
        "total_vendors": len(records),
        "risk_breakdown": {
            "high": high_count,
            "medium": med_count,
            "low": low_count,
        },
        "active_model": active_deployment,
        "unconsumed_feedback_count": unconsumed_fb,
        "vendors": records,
    }


@app.get("/api/v1/vendors/{vendor_id}/risk")
async def get_vendor_risk_detail(
    vendor_id: str,
    company_id: str = Query("construction"),
):
    """Returns detailed risk profile and explainability for a single vendor."""
    record = storage.get_vendor_risk_record(company_id, vendor_id)
    if not record:
        raise HTTPException(404, f"Vendor '{vendor_id}' not found for company '{company_id}'.")
    return record


@app.post("/api/v1/vendor-suitability")
async def evaluate_vendor_suitability_endpoint(
    request: VendorSuitabilityRequest,
    x_api_key: Optional[str] = Header(None),
):
    """Evaluate a shortage against this company's master, history, and current model."""
    if x_api_key != GATEWAY_KEY:
        raise HTTPException(status_code=401, detail="Invalid gateway API key")
    _validate_company_id(request.company_id)
    snapshot = storage.get_vendor_history_snapshot(request.company_id)
    if not snapshot or not snapshot.get("vendor_master"):
        raise HTTPException(status_code=409, detail="Sync the company vendor master and performance history first.")

    config = storage.get_company_config(request.company_id) or {}
    active_model = RiskMLModel(company_id=request.company_id)
    model = active_model if active_model.load() else None
    preprocessor = None
    if model is not None:
        preprocessor = DataPreprocessor(
            company_id=request.company_id,
            field_mapping=config.get("field_mapping", {}),
        )

    try:
        result = evaluate_po_suitability(
            request.model_dump(),
            snapshot["vendor_master"],
            snapshot["records"],
            company_rules=config.get("rules", DEFAULT_COMPANY_RULES),
            model=model,
            preprocessor=preprocessor,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    result["request_id"] = request.request_id
    result["model_version"] = model.version if model is not None else None
    result["training_performed"] = False
    return result


@app.post("/api/v1/vendors/analyze")
async def trigger_vendor_analysis(
    request: RetrainRequest,
    background_tasks: BackgroundTasks,
):
    """Scores the latest synced company history using the currently active model."""
    company_id = request.company_id or "construction"
    _validate_company_id(company_id)
    agent_status["current_task"] = f"Analyzing vendor risk for {company_id}"
    agent_status["events_processed"] += 1
    agent_status["last_event_at"] = datetime.utcnow().isoformat()

    try:
        result = retrainer.analyze(company_id)
        agent_status["current_task"] = "Ready"
        return {"status": "success", "result": result}
    except ValueError as e:
        agent_status["current_task"] = "Ready"
        raise HTTPException(409, f"Analysis unavailable: {str(e)}")
    except Exception:
        agent_status["current_task"] = "Ready"
        log.exception("Vendor risk analysis failed for company '%s'.", company_id)
        raise HTTPException(500, "Analysis failed.")


# ------------------------------------------------------------------ #
# Admin Feedback Endpoints                                            #
# ------------------------------------------------------------------ #
@app.post("/api/v1/feedback")
async def submit_admin_feedback(
    fb: FeedbackRequest,
    background_tasks: BackgroundTasks,
):
    """
    Records vendor rating, actual order outcomes, and ground truth risk label.
    Checks auto-retrain threshold and triggers retraining if reached.
    """
    feedback_id = storage.add_feedback(
        company_id=fb.company_id,
        vendor_id=fb.vendor_id,
        vendor_name=fb.vendor_name,
        rating=fb.rating,
        actual_outcome=fb.actual_outcome,
        actual_risk_label=fb.actual_risk_label,
        order_id=fb.order_id,
        notes=fb.notes,
        submitted_by=fb.submitted_by or "Admin",
    )

    agent_status["events_processed"] += 1
    agent_status["last_event_at"] = datetime.utcnow().isoformat()

    # Check automatic retraining trigger
    unconsumed = storage.get_unconsumed_feedback_count(fb.company_id)
    config = storage.get_company_config(fb.company_id) or {}
    threshold = config.get("auto_retrain_threshold", 5)

    auto_retrain_triggered = False
    if unconsumed >= threshold:
        auto_retrain_triggered = True
        log.info(f"Auto-retrain threshold reached ({unconsumed}/{threshold}). Triggering background retraining...")
        background_tasks.add_task(retrainer.retrain, fb.company_id, "auto_threshold")

    return {
        "status": "success",
        "feedback_id": feedback_id,
        "unconsumed_feedback_count": unconsumed,
        "auto_retrain_threshold": threshold,
        "auto_retrain_triggered": auto_retrain_triggered,
        "message": "Feedback recorded successfully for supervised training.",
    }


@app.get("/api/v1/feedback")
async def get_admin_feedback(
    company_id: str = Query("construction"),
):
    """Lists recorded admin feedback for a company."""
    feedback = storage.get_feedback_records(company_id)
    return {
        "company_id": company_id,
        "count": len(feedback),
        "feedback": feedback,
    }


# ------------------------------------------------------------------ #
# Model Management & Safe Deployment Endpoints                        #
# ------------------------------------------------------------------ #
@app.get("/api/v1/models/status")
async def get_model_status(
    company_id: str = Query("construction"),
):
    """Returns active model details, candidate evaluations, and deployment history."""
    active = storage.get_active_model_deployment(company_id)
    history = storage.get_model_history(company_id)
    unconsumed_fb = storage.get_unconsumed_feedback_count(company_id)
    config = storage.get_company_config(company_id) or {}

    return {
        "company_id": company_id,
        "active_model": active,
        "deployment_history": history,
        "unconsumed_feedback_count": unconsumed_fb,
        "auto_retrain_threshold": config.get("auto_retrain_threshold", 5),
    }


@app.post("/api/v1/models/retrain")
async def retrain_model_manual(
    req: RetrainRequest,
    _: dict = Depends(require_admin),
):
    """
    Manual 'Retrain Model' endpoint triggered by admin button.
    Runs full pipeline with candidate validation and safe deployment.
    """
    company_id = req.company_id or "construction"
    _validate_company_id(company_id)
    snapshot = storage.get_vendor_history_snapshot(company_id)
    if not snapshot:
        raise HTTPException(409, "Fetch and sync vendor history before retraining.")
    agent_status["current_task"] = f"Retraining Random Forest model for {company_id}"
    agent_status["events_processed"] += 1
    agent_status["last_event_at"] = datetime.utcnow().isoformat()

    try:
        result = retrainer.retrain(
            company_id,
            trigger_source="manual_button",
            raw_records=snapshot["records"],
        )
        agent_status["current_task"] = "Ready"
        return {"status": "success", "result": result}
    except ValueError as exc:
        agent_status["current_task"] = "Ready"
        raise HTTPException(409, str(exc))
    except Exception:
        agent_status["current_task"] = "Ready"
        log.exception("Model retraining failed for company '%s'.", company_id)
        raise HTTPException(500, "Retraining failed. Check data quality and model logs.")


# ------------------------------------------------------------------ #
# Data Cleaning & Quality Logs Endpoint                               #
# ------------------------------------------------------------------ #
@app.get("/api/v1/cleaning-logs")
async def get_cleaning_logs(
    company_id: str = Query("construction"),
    limit: int = Query(100),
):
    """Returns audit log of all data cleaning transformations."""
    logs = storage.get_cleaning_logs(company_id, limit=limit)
    return {
        "company_id": company_id,
        "total_logged_issues": len(logs),
        "logs": logs,
    }


# ------------------------------------------------------------------ #
# Company Configuration Endpoints                                     #
# ------------------------------------------------------------------ #
@app.get("/api/v1/vendor-history/config")
async def get_vendor_history_config(
    company_id: str = Query("construction"),
    _: dict = Depends(require_admin),
):
    """Returns connection metadata only; credential material is never serialized."""
    _validate_company_id(company_id)
    api_config = storage.get_vendor_api_config(company_id)
    snapshot = storage.get_vendor_history_snapshot(company_id)
    return {
        "company_id": company_id,
        "connection_name": api_config["connection_name"] if api_config else "Dummy Construction Vendor History",
        "mode": api_config["mode"] if api_config else "dummy",
        "endpoint_url": api_config["endpoint_url"] if api_config else "",
        "master_endpoint_url": api_config.get("master_endpoint_url", "") if api_config else "",
        "auth_type": api_config["auth_type"] if api_config else "none",
        "credential_configured": api_config["credential_configured"] if api_config else False,
        "record_count": snapshot["record_count"] if snapshot else 0,
        "raw_record_count": (
            snapshot.get("cleaning_summary", {}).get("records_fetched", 0)
            if snapshot else 0
        ),
        "ready_record_count": (
            snapshot.get("cleaning_summary", {}).get("records_ready", 0)
            if snapshot else 0
        ),
        "quarantined_record_count": (
            snapshot.get("cleaning_summary", {}).get("records_quarantined", 0)
            if snapshot else 0
        ),
        "fetched_at": snapshot["fetched_at"] if snapshot else None,
    }


@app.put("/api/v1/vendor-history/config")
async def update_vendor_history_config(
    req: VendorAPIConfigRequest,
    _: dict = Depends(require_admin),
):
    _validate_company_id(req.company_id)
    if not req.connection_name.strip():
        raise HTTPException(status_code=422, detail="Connection name is required.")
    existing = storage.get_vendor_api_config(req.company_id)
    credential = req.credential or ""
    if req.mode == "dummy":
        credential = credential or GATEWAY_KEY
        req.endpoint_url = ""
        req.auth_type = "api_key"
    elif not credential and existing and existing["auth_type"] == req.auth_type:
        credential = existing["credential"]
    if req.mode == "external":
        _provider_for_settings(
            req.mode,
            req.endpoint_url,
            req.auth_type,
            credential,
            req.master_endpoint_url,
        )
    elif req.mode != "dummy":
        raise HTTPException(status_code=422, detail="Unsupported vendor history source.")
    storage.save_vendor_api_config(
        req.company_id,
        req.mode,
        req.endpoint_url,
        req.auth_type,
        credential,
        req.connection_name.strip(),
        req.master_endpoint_url.strip() if req.mode == "external" else "",
    )
    return {
        "status": "success",
        "company_id": req.company_id,
        "connection_name": req.connection_name.strip(),
        "credential_configured": bool(credential),
    }


@app.get("/api/v1/config")
async def get_company_config(
    company_id: str = Query("construction"),
    _: dict = Depends(require_admin),
):
    """Returns company-specific rules, thresholds, and field mappings."""
    cfg = storage.get_company_config(company_id)
    if not cfg:
        cfg = {
            "company_id": company_id,
            "rules": DEFAULT_COMPANY_RULES,
            "field_mapping": {},
            "auto_retrain_threshold": 5,
            "min_accuracy": 0.70,
            "min_f1_score": 0.65,
            "max_degradation": 0.05,
        }
    return cfg


@app.put("/api/v1/config")
async def update_company_config(
    req: ConfigUpdateRequest,
    _: dict = Depends(require_admin),
):
    """Updates company-specific rules, thresholds, or field mappings."""
    existing = storage.get_company_config(req.company_id) or {}
    rules = req.rules if req.rules is not None else existing.get("rules", DEFAULT_COMPANY_RULES)
    field_mapping = req.field_mapping if req.field_mapping is not None else existing.get("field_mapping", {})
    auto_thresh = req.auto_retrain_threshold or existing.get("auto_retrain_threshold", 5)
    min_acc = req.min_accuracy or existing.get("min_accuracy", 0.70)
    min_f1 = req.min_f1_score or existing.get("min_f1_score", 0.65)
    max_deg = req.max_degradation or existing.get("max_degradation", 0.05)

    storage.save_company_config(
        company_id=req.company_id,
        rules=rules,
        field_mapping=field_mapping,
        auto_retrain_threshold=auto_thresh,
        min_accuracy=min_acc,
        min_f1_score=min_f1,
        max_degradation=max_deg,
    )

    return {"status": "success", "message": f"Configuration updated for company '{req.company_id}'."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=SERVICE_PORT, reload=False)
