"""
Procurement Service — FastAPI
==============================
The ONLY service that writes to procurement_db.
Agent 4 calls this service to create POs, audit records, and log events.
No agent touches the DB directly.

Endpoints:
  POST /purchase-orders          — create a PO
  GET  /purchase-orders          — list all POs
  GET  /purchase-orders/{id}     — get single PO
  PATCH /purchase-orders/{id}/status — update PO status
  POST /events                   — log a procurement event
  GET  /events                   — list all events
  GET  /audit/{po_id}            — get audit trail for a PO
  GET  /dashboard/summary        — summary stats for frontend
"""

import os
import logging
from datetime import datetime
from typing import Optional

import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("procurement-service")

app = FastAPI(
    title="Procurement Service",
    description="Manages purchase orders, audit trails, and events in procurement_db. "
                "Called only by Agent 4 and the frontend.",
    version="1.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ------------------------------------------------------------------ #
# Config                                                               #
# ------------------------------------------------------------------ #
PG_HOST         = os.getenv("POSTGRES_HOST",  "localhost")
PG_PORT         = os.getenv("POSTGRES_PORT",  "5432")
PG_USER         = os.getenv("POSTGRES_USER",  "procurement_admin")
PG_PASS         = os.getenv("POSTGRES_PASSWORD", "SecurePass@2024")
PROCUREMENT_KEY = os.getenv("PROCUREMENT_KEY", "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012")


# ------------------------------------------------------------------ #
# Auth + DB                                                            #
# ------------------------------------------------------------------ #
def verify_key(x_api_key: str = Header(...)):
    if x_api_key != PROCUREMENT_KEY:
        raise HTTPException(401, "Invalid API key")
    return x_api_key

def get_conn():
    return psycopg2.connect(
        host=PG_HOST, port=PG_PORT,
        user=PG_USER, password=PG_PASS,
        dbname="procurement_db",
        cursor_factory=RealDictCursor,
    )


# ------------------------------------------------------------------ #
# Pydantic models                                                      #
# ------------------------------------------------------------------ #
class CreatePO(BaseModel):
    po_number:             str
    request_id:            int
    vendor_id:             int
    vendor_name:           str
    item_name:             str
    quantity:              int
    unit_price:            float
    total_price:           float
    currency:              str = "INR"
    status:                str = "PENDING_APPROVAL"
    delivery_date_expected: Optional[str] = None
    notes:                 Optional[str] = None

class UpdateStatus(BaseModel):
    status:       str
    performed_by: str = "system"
    notes:        Optional[str] = None

class CreateEvent(BaseModel):
    event_id:    str
    event_type:  str
    topic:       str
    source_agent: str
    payload:     dict


# ------------------------------------------------------------------ #
# Purchase Orders                                                      #
# ------------------------------------------------------------------ #
@app.get("/health")
async def health():
    return {"status": "ok", "service": "procurement-service"}


@app.post("/purchase-orders", dependencies=[Depends(verify_key)])
async def create_po(po: CreatePO):
    """Create a new Purchase Order. Called by Agent 4."""
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO purchase_orders
              (po_number, request_id, vendor_id, vendor_name, item_name,
               quantity, unit_price, total_price, currency, status,
               delivery_date_expected, notes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING *
        """, (
            po.po_number, po.request_id, po.vendor_id, po.vendor_name,
            po.item_name, po.quantity, po.unit_price, po.total_price,
            po.currency, po.status, po.delivery_date_expected, po.notes,
        ))
        row = cur.fetchone()

        # Write audit entry
        cur.execute("""
            INSERT INTO procurement_audit
              (po_id, po_number, action, old_status, new_status, performed_by, notes)
            VALUES (%s,%s,'CREATED',NULL,%s,'agent_4',%s)
        """, (row["id"], po.po_number, po.status, f"PO auto-created by Agent 4"))

        conn.commit()
        log.info(f"PO created: {po.po_number}")
        result = dict(row)
        result["created_at"] = str(result["created_at"])
        result["updated_at"] = str(result["updated_at"])
        if result.get("delivery_date_expected"):
            result["delivery_date_expected"] = str(result["delivery_date_expected"])
        return result
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(409, f"PO number {po.po_number} already exists")
    finally:
        cur.close()
        conn.close()


@app.get("/purchase-orders", dependencies=[Depends(verify_key)])
async def list_pos(
    status: Optional[str] = None,
    request_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
):
    conn = get_conn()
    cur  = conn.cursor()
    try:
        filters       = []
        filter_params = []
        if status:
            filters.append("status = %s"); filter_params.append(status)
        if request_id is not None:
            filters.append("request_id = %s"); filter_params.append(int(request_id))
        where = ("WHERE " + " AND ".join(filters)) if filters else ""

        cur.execute(f"""
            SELECT id, po_number, request_id, vendor_id, vendor_name, item_name,
                   quantity, unit_price, total_price, currency, status,
                   delivery_date_expected::text, notes,
                   created_at::text AS created_at, updated_at::text AS updated_at
            FROM purchase_orders
            {where}
            ORDER BY id DESC
            LIMIT %s OFFSET %s
        """, filter_params + [limit, offset])
        rows = [dict(r) for r in cur.fetchall()]

        cur.execute(f"SELECT COUNT(*) AS total FROM purchase_orders {where}", filter_params)
        total = cur.fetchone()["total"]
        return {"purchase_orders": rows, "total": total}
    finally:
        cur.close()
        conn.close()


@app.get("/purchase-orders/{po_id}", dependencies=[Depends(verify_key)])
async def get_po(po_id: int):
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT id, po_number, request_id, vendor_id, vendor_name, item_name,
                   quantity, unit_price, total_price, currency, status,
                   delivery_date_expected::text, notes,
                   created_at::text AS created_at, updated_at::text AS updated_at
            FROM purchase_orders WHERE id = %s
        """, (po_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, f"PO {po_id} not found")
        return dict(row)
    finally:
        cur.close()
        conn.close()


@app.patch("/purchase-orders/{po_id}/status", dependencies=[Depends(verify_key)])
async def update_po_status(po_id: int, body: UpdateStatus):
    """Update PO status and write immutable audit record."""
    valid_statuses = {"PENDING_APPROVAL", "APPROVED", "REJECTED", "ORDERED", "DELIVERED"}
    if body.status not in valid_statuses:
        raise HTTPException(400, f"Invalid status. Must be one of: {valid_statuses}")

    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT id, po_number, status FROM purchase_orders WHERE id = %s", (po_id,))
        po = cur.fetchone()
        if not po:
            raise HTTPException(404, f"PO {po_id} not found")

        old_status = po["status"]
        cur.execute(
            "UPDATE purchase_orders SET status = %s WHERE id = %s",
            (body.status, po_id),
        )
        cur.execute("""
            INSERT INTO procurement_audit
              (po_id, po_number, action, old_status, new_status, performed_by, notes)
            VALUES (%s,%s,'STATUS_CHANGE',%s,%s,%s,%s)
        """, (po_id, po["po_number"], old_status, body.status,
              body.performed_by, body.notes))
        conn.commit()
        log.info(f"PO {po['po_number']}: {old_status} → {body.status}")
        return {"po_id": po_id, "po_number": po["po_number"],
                "old_status": old_status, "new_status": body.status}
    finally:
        cur.close()
        conn.close()


# ------------------------------------------------------------------ #
# Events                                                               #
# ------------------------------------------------------------------ #
@app.post("/events", dependencies=[Depends(verify_key)])
async def log_event(event: CreateEvent):
    conn = get_conn()
    cur  = conn.cursor()
    try:
        import json as _json
        cur.execute("""
            INSERT INTO procurement_events
              (event_id, event_type, topic, payload, source_agent)
            VALUES (%s,%s,%s,%s::jsonb,%s)
            ON CONFLICT (event_id) DO NOTHING
            RETURNING id
        """, (
            event.event_id, event.event_type, event.topic,
            _json.dumps(event.payload), event.source_agent,
        ))
        conn.commit()
        return {"message": "Event logged"}
    finally:
        cur.close()
        conn.close()


@app.get("/events", dependencies=[Depends(verify_key)])
async def list_events(limit: int = 50):
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT id, event_id, event_type, topic, source_agent,
                   created_at::text
            FROM procurement_events
            ORDER BY created_at DESC LIMIT %s
        """, (limit,))
        return {"events": [dict(r) for r in cur.fetchall()]}
    finally:
        cur.close()
        conn.close()


# ------------------------------------------------------------------ #
# Audit                                                                #
# ------------------------------------------------------------------ #
@app.get("/audit/{po_id}", dependencies=[Depends(verify_key)])
async def get_audit(po_id: int):
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT *, created_at::text FROM procurement_audit
            WHERE po_id = %s ORDER BY created_at ASC
        """, (po_id,))
        return {"po_id": po_id, "audit_trail": [dict(r) for r in cur.fetchall()]}
    finally:
        cur.close()
        conn.close()


# ------------------------------------------------------------------ #
# Dashboard summary — used by frontend                                #
# ------------------------------------------------------------------ #
@app.get("/dashboard/summary", dependencies=[Depends(verify_key)])
async def dashboard_summary():
    """Aggregated stats for the frontend dashboard."""
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT
                COUNT(*)                                          AS total_pos,
                COUNT(*) FILTER (WHERE status='PENDING_APPROVAL') AS pending,
                COUNT(*) FILTER (WHERE status='APPROVED')         AS approved,
                COUNT(*) FILTER (WHERE status='ORDERED')          AS ordered,
                COUNT(*) FILTER (WHERE status='DELIVERED')        AS delivered,
                COUNT(*) FILTER (WHERE status='REJECTED')         AS rejected,
                COALESCE(SUM(total_price),0)                      AS total_value,
                COALESCE(SUM(total_price) FILTER (WHERE status='PENDING_APPROVAL'),0) AS pending_value
            FROM purchase_orders
        """)
        stats = dict(cur.fetchone())

        cur.execute("""
            SELECT vendor_name, COUNT(*) AS orders,
                   SUM(total_price) AS total_value
            FROM purchase_orders
            GROUP BY vendor_name
            ORDER BY orders DESC LIMIT 5
        """)
        top_vendors = [dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT po_number, vendor_name, item_name,
                   total_price, status, created_at::text
            FROM purchase_orders
            ORDER BY created_at DESC LIMIT 10
        """)
        recent = [dict(r) for r in cur.fetchall()]

        return {
            "stats":        stats,
            "top_vendors":  top_vendors,
            "recent_pos":   recent,
        }
    finally:
        cur.close()
        conn.close()


# ------------------------------------------------------------------ #
# Agent logs — Kafka event history from procurement_events            #
# ------------------------------------------------------------------ #
@app.get("/agent-logs", dependencies=[Depends(verify_key)])
async def get_agent_logs(limit: int = 100, source_agent: Optional[str] = None):
    """Returns Kafka event history logged by agents."""
    conn = get_conn()
    cur  = conn.cursor()
    try:
        if source_agent:
            cur.execute("""
                SELECT id, event_id, event_type, topic, source_agent,
                       payload::text AS payload, created_at::text
                FROM procurement_events
                WHERE source_agent = %s
                ORDER BY created_at DESC LIMIT %s
            """, (source_agent, limit))
        else:
            cur.execute("""
                SELECT id, event_id, event_type, topic, source_agent,
                       payload::text AS payload, created_at::text
                FROM procurement_events
                ORDER BY created_at DESC LIMIT %s
            """, (limit,))
        rows = [dict(r) for r in cur.fetchall()]
        return {"logs": rows, "total": len(rows)}
    finally:
        cur.close()
        conn.close()
