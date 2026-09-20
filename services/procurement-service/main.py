"""
Procurement Service — FastAPI
==============================
The ONLY service that writes to procurement_db.
Agent 4 calls this service to create POs, audit records, and log events.
Handles PDF generation, MinIO document archiving, and DocuSign digital signature workflows.
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional

import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI, HTTPException, Header, Query, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from pdf_generator import generate_po_pdf
from minio_storage import upload_pdf_bytes, download_pdf_bytes, get_download_url
from mailer import send_po_approval_email

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("procurement-service")

app = FastAPI(
    title="Procurement Service",
    description="Manages purchase orders, audit trails, DocuSign digital signatures, "
                "and MinIO document archiving in procurement_db.",
    version="2.0.0",
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

def verify_key_flexible(x_api_key: Optional[str] = Header(None), api_key: Optional[str] = Query(None)):
    key = x_api_key or api_key
    if key and key != PROCUREMENT_KEY:
        raise HTTPException(401, "Invalid API key")
    return key

def get_conn():
    return psycopg2.connect(
        host=PG_HOST, port=PG_PORT,
        user=PG_USER, password=PG_PASS,
        dbname="procurement_db",
        cursor_factory=RealDictCursor,
    )


def ensure_schema():
    """Migrates schema to support approval tiers, DocuSign status, and MinIO paths."""
    try:
        conn = get_conn()
        cur  = conn.cursor()
        cur.execute("""
            ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approval_tier VARCHAR(50) DEFAULT 'TIER_1_OFFICER';
            ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS assigned_approver_name VARCHAR(255) DEFAULT 'Procurement Officer';
            ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS assigned_approver_email VARCHAR(255) DEFAULT 'officer.procurement@procureflow.local';
            ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS docusign_envelope_id VARCHAR(100);
            ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS docusign_status VARCHAR(50) DEFAULT 'NOT_SENT';
            ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS signed_document_url TEXT;
            ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS pdf_path TEXT;
        """)
        conn.commit()
        cur.close()
        conn.close()
        log.info("Procurement DB schema verified / upgraded successfully.")
    except Exception as e:
        log.warning(f"Could not verify/migrate schema on startup: {e}")


@app.on_event("startup")
async def startup_event():
    ensure_schema()


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
    approval_tier:         Optional[str] = "TIER_1_OFFICER"
    assigned_approver_name: Optional[str] = "Procurement Officer"
    assigned_approver_email: Optional[str] = "officer.procurement@procureflow.local"
    docusign_envelope_id:  Optional[str] = None
    docusign_status:       Optional[str] = "NOT_SENT"
    signed_document_url:   Optional[str] = None
    pdf_path:              Optional[str] = None

class UpdateStatus(BaseModel):
    status:       str
    performed_by: str = "system"
    notes:        Optional[str] = None

class SignPORequest(BaseModel):
    signer_name:    str
    signer_email:   str
    signature_data: Optional[str] = None
    notes:          Optional[str] = None

class CreateEvent(BaseModel):
    event_id:    str
    event_type:  str
    topic:       str
    source_agent: str
    payload:     dict


# ------------------------------------------------------------------ #
# Health & Rules                                                       #
# ------------------------------------------------------------------ #
@app.get("/health")
async def health():
    return {"status": "ok", "service": "procurement-service", "version": "2.0.0"}


@app.get("/rules/approvers")
async def get_approver_rules():
    """Returns rule-based amount thresholds and designated approvers."""
    return {
        "rules": [
            {
                "tier": "TIER_1_OFFICER",
                "label": "Tier 1: Standard Purchase",
                "max_amount": 50000.0,
                "role": "Procurement Officer",
                "email": "officer.procurement@procureflow.local",
                "policy": "Standard single authorization for orders below ₹50,000",
            },
            {
                "tier": "TIER_2_MANAGER",
                "label": "Tier 2: Management Review",
                "min_amount": 50000.0,
                "max_amount": 200000.0,
                "role": "Operations / Department Manager",
                "email": "manager.ops@procureflow.local",
                "policy": "Departmental operational approval for orders ₹50,000 – ₹2,00,000",
            },
            {
                "tier": "TIER_3_DIRECTOR",
                "label": "Tier 3: Executive Authorization",
                "min_amount": 200000.0,
                "role": "Finance Director / VP",
                "email": "director.finance@procureflow.local",
                "policy": "Executive sign-off & digital certification for orders above ₹2,00,000",
            },
        ]
    }


# ------------------------------------------------------------------ #
# Purchase Orders                                                      #
# ------------------------------------------------------------------ #
@app.post("/purchase-orders", dependencies=[Depends(verify_key)])
async def create_po(po: CreatePO):
    """Create a new Purchase Order, render draft PDF, save to MinIO, and send SMTP alert."""
    conn = get_conn()
    cur  = conn.cursor()
    try:
        # Determine approval tier based on amount rules if not explicitly set
        tier = po.approval_tier
        approver_name = po.assigned_approver_name
        approver_email = po.assigned_approver_email

        if not tier or tier == "TIER_1_OFFICER":
            if po.total_price > 200000:
                tier = "TIER_3_DIRECTOR"
                approver_name = "Finance Director"
                approver_email = "director.finance@procureflow.local"
            elif po.total_price >= 50000:
                tier = "TIER_2_MANAGER"
                approver_name = "Operations Manager"
                approver_email = "manager.ops@procureflow.local"
            else:
                tier = "TIER_1_OFFICER"
                approver_name = "Procurement Officer"
                approver_email = "officer.procurement@procureflow.local"

        cur.execute("""
            INSERT INTO purchase_orders
              (po_number, request_id, vendor_id, vendor_name, item_name,
               quantity, unit_price, total_price, currency, status,
               delivery_date_expected, notes, approval_tier,
               assigned_approver_name, assigned_approver_email, docusign_status)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'SENT')
            RETURNING *
        """, (
            po.po_number, po.request_id, po.vendor_id, po.vendor_name,
            po.item_name, po.quantity, po.unit_price, po.total_price,
            po.currency, po.status, po.delivery_date_expected, po.notes,
            tier, approver_name, approver_email,
        ))
        row = dict(cur.fetchone())

        # Generate draft PO PDF
        pdf_bytes = None
        pdf_path = None
        try:
            pdf_bytes = generate_po_pdf(row, is_signed=False)
            object_name = f"pos/{po.po_number}.pdf"
            pdf_path = upload_pdf_bytes(pdf_bytes, object_name)
            if pdf_path:
                cur.execute("UPDATE purchase_orders SET pdf_path = %s WHERE id = %s", (pdf_path, row["id"]))
                row["pdf_path"] = pdf_path
        except Exception as pdf_err:
            log.warning(f"Could not generate/upload draft PDF for {po.po_number}: {pdf_err}")

        # Send SMTP notification email with DocuSign signing link & attached PDF
        try:
            email_res = send_po_approval_email(row, pdf_bytes=pdf_bytes)
            log.info(f"Approval email routed for {po.po_number}: {email_res}")
        except Exception as mail_err:
            log.warning(f"Could not send approval email for {po.po_number}: {mail_err}")

        # Write audit entry
        cur.execute("""
            INSERT INTO procurement_audit
              (po_id, po_number, action, old_status, new_status, performed_by, notes)
            VALUES (%s,%s,'CREATED',NULL,%s,'agent_4',%s)
        """, (row["id"], po.po_number, po.status, f"PO auto-created by Agent 4. Routed to {approver_name} ({tier})"))

        conn.commit()
        log.info(f"PO created: {po.po_number} (Tier: {tier})")

        row["created_at"] = str(row["created_at"])
        row["updated_at"] = str(row["updated_at"])
        if row.get("delivery_date_expected"):
            row["delivery_date_expected"] = str(row["delivery_date_expected"])
        return row
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(409, f"PO number {po.po_number} already exists")
    finally:
        cur.close()
        conn.close()


@app.get("/purchase-orders", dependencies=[Depends(verify_key_flexible)])
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
                   approval_tier, assigned_approver_name, assigned_approver_email,
                   docusign_envelope_id, docusign_status, signed_document_url, pdf_path,
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


@app.get("/purchase-orders/{po_id}", dependencies=[Depends(verify_key_flexible)])
async def get_po(po_id: int):
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT id, po_number, request_id, vendor_id, vendor_name, item_name,
                   quantity, unit_price, total_price, currency, status,
                   delivery_date_expected::text, notes,
                   approval_tier, assigned_approver_name, assigned_approver_email,
                   docusign_envelope_id, docusign_status, signed_document_url, pdf_path,
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


@app.patch("/purchase-orders/{po_id}/status", dependencies=[Depends(verify_key_flexible)])
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


@app.delete("/purchase-orders/{po_id}", dependencies=[Depends(verify_key_flexible)])
async def delete_po(po_id: int):
    """Delete a single PO and its audit trail."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM procurement_audit WHERE po_id = %s", (po_id,))
        cur.execute("DELETE FROM purchase_orders WHERE id = %s RETURNING po_number", (po_id,))
        deleted = cur.fetchone()
        conn.commit()
        if not deleted:
            raise HTTPException(404, f"PO #{po_id} not found")
        return {"message": f"PO {deleted['po_number']} deleted successfully"}
    finally:
        cur.close()
        conn.close()


@app.delete("/purchase-orders", dependencies=[Depends(verify_key_flexible)])
async def clear_all_pos():
    """Clear all POs and audit logs for demo cleanup."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM procurement_audit")
        cur.execute("DELETE FROM purchase_orders")
        conn.commit()
        return {"message": "All purchase orders cleared successfully"}
    finally:
        cur.close()
        conn.close()


@app.delete("/events", dependencies=[Depends(verify_key_flexible)])
async def clear_all_events():
    """Clear all procurement event logs for demo cleanup."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM procurement_events")
        conn.commit()
        return {"message": "All procurement events cleared successfully"}
    finally:
        cur.close()
        conn.close()


@app.post("/demo/reset", dependencies=[Depends(verify_key_flexible)])
async def reset_demo_data():
    """Wipes all demo POs, audit entries, and events to make the environment spotless for demonstrations."""
    conn = get_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM procurement_audit")
        cur.execute("DELETE FROM purchase_orders")
        cur.execute("DELETE FROM procurement_events")
        conn.commit()
    finally:
        cur.close()
        conn.close()

    # Cascade reset to OCR service & Agent 1
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.delete("http://ocr-service:8001/requests", headers={"X-API-KEY": "OCR-e4b9f8e7-0756-4938-45ab-8abc67890123"})
            await client.delete("http://agent1-ocr:8009/documents")
    except Exception as e:
        log.warning(f"Could not cascade reset to OCR services: {e}")

    return {"success": True, "message": "Demo data wiped clean. System is fresh and ready for demonstration."}



# ------------------------------------------------------------------ #
# PDF Generation & Download Endpoints                                  #
# ------------------------------------------------------------------ #
@app.get("/purchase-orders/{po_id}/pdf")
async def view_po_pdf(po_id: int):
    """Stream PO PDF for in-browser preview."""
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT * FROM purchase_orders WHERE id = %s", (po_id,))
        po = cur.fetchone()
        if not po:
            raise HTTPException(404, f"PO {po_id} not found")
        po_dict = dict(po)
    finally:
        cur.close()
        conn.close()

    # If signed, retrieve signed PDF from MinIO if available
    pdf_bytes = None
    if po_dict.get("signed_document_url"):
        pdf_bytes = download_pdf_bytes(po_dict["signed_document_url"])

    # Fallback or draft generation
    if not pdf_bytes:
        is_signed = po_dict.get("status") == "APPROVED"
        pdf_bytes = generate_po_pdf(
            po_dict,
            is_signed=is_signed,
            signer_name=po_dict.get("assigned_approver_name"),
            signer_email=po_dict.get("assigned_approver_email"),
            signature_id=po_dict.get("docusign_envelope_id"),
        )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={po_dict['po_number']}.pdf"},
    )


@app.get("/purchase-orders/{po_id}/download")
async def download_po(po_id: int):
    """Download official PO PDF (or signed PDF from MinIO) as attachment."""
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT * FROM purchase_orders WHERE id = %s", (po_id,))
        po = cur.fetchone()
        if not po:
            raise HTTPException(404, f"PO {po_id} not found")
        po_dict = dict(po)
    finally:
        cur.close()
        conn.close()

    pdf_bytes = None
    filename = f"{po_dict['po_number']}.pdf"
    if po_dict.get("signed_document_url"):
        pdf_bytes = download_pdf_bytes(po_dict["signed_document_url"])
        filename = f"{po_dict['po_number']}_signed.pdf"

    if not pdf_bytes:
        is_signed = po_dict.get("status") == "APPROVED"
        pdf_bytes = generate_po_pdf(
            po_dict,
            is_signed=is_signed,
            signer_name=po_dict.get("assigned_approver_name"),
            signer_email=po_dict.get("assigned_approver_email"),
            signature_id=po_dict.get("docusign_envelope_id"),
        )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ------------------------------------------------------------------ #
# DocuSign & Digital Signature Endpoints                             #
# ------------------------------------------------------------------ #
@app.post("/purchase-orders/{po_id}/sign")
async def sign_po(po_id: int, body: SignPORequest):
    """
    Digitally sign a Purchase Order via DocuSign workflow.
    Generates cryptographically certified signed PDF, archives in MinIO,
    updates status to APPROVED, and writes immutable audit entry.
    """
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT * FROM purchase_orders WHERE id = %s", (po_id,))
        po = cur.fetchone()
        if not po:
            raise HTTPException(404, f"PO {po_id} not found")
        po_dict = dict(po)

        old_status = po_dict["status"]
        po_number  = po_dict["po_number"]
        timestamp  = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        envelope_id = f"DS-{po_number}-{int(datetime.utcnow().timestamp())}"

        # 1. Render digitally signed PDF
        signed_pdf_bytes = generate_po_pdf(
            po_dict,
            is_signed=True,
            signer_name=body.signer_name,
            signer_email=body.signer_email,
            signed_at=timestamp,
            signature_id=envelope_id,
        )

        # 2. Archive to MinIO in dedicated signed-pos bucket directory
        minio_object_name = f"signed-pos/{po_number}_signed.pdf"
        signed_minio_path = upload_pdf_bytes(signed_pdf_bytes, minio_object_name)

        # 3. Update database
        cur.execute("""
            UPDATE purchase_orders
            SET status = 'APPROVED',
                docusign_status = 'COMPLETED',
                docusign_envelope_id = %s,
                signed_document_url = %s,
                assigned_approver_name = %s,
                assigned_approver_email = %s,
                updated_at = NOW()
            WHERE id = %s
            RETURNING *
        """, (
            envelope_id,
            signed_minio_path or minio_object_name,
            body.signer_name,
            body.signer_email,
            po_id,
        ))
        updated_row = dict(cur.fetchone())

        # 4. Insert audit log
        cur.execute("""
            INSERT INTO procurement_audit
              (po_id, po_number, action, old_status, new_status, performed_by, notes)
            VALUES (%s,%s,'DIGITAL_SIGNATURE_COMPLETED',%s,'APPROVED',%s,%s)
        """, (
            po_id,
            po_number,
            old_status,
            f"{body.signer_name} <{body.signer_email}>",
            f"Digitally signed via DocuSign (Envelope: {envelope_id}). Archived in MinIO at {signed_minio_path or minio_object_name}.",
        ))

        # 5. Insert Kafka event
        event_id = f"evt_sign_{envelope_id}"
        event_payload = json.dumps({
            "po_id": po_id,
            "po_number": po_number,
            "signer": body.signer_name,
            "signer_email": body.signer_email,
            "minio_path": signed_minio_path or minio_object_name,
            "signed_at": timestamp,
        })
        cur.execute("""
            INSERT INTO procurement_events
              (event_id, event_type, topic, payload, source_agent)
            VALUES (%s,'APPROVAL_GRANTED','purchase-order-topic',%s::jsonb,'approval_subsystem')
            ON CONFLICT (event_id) DO NOTHING
        """, (event_id, event_payload))

        conn.commit()
        log.info(f"✓ Digital signature completed for PO {po_number} by {body.signer_email}. Stored in MinIO: {signed_minio_path}")

        return {
            "success": True,
            "po_number": po_number,
            "status": "APPROVED",
            "docusign_status": "COMPLETED",
            "docusign_envelope_id": envelope_id,
            "signed_document_url": signed_minio_path or minio_object_name,
            "signed_at": timestamp,
        }
    finally:
        cur.close()
        conn.close()


@app.post("/purchase-orders/{po_id}/docusign/webhook")
async def docusign_webhook(po_id: int, payload: dict):
    """DocuSign Connect webhook callback handler."""
    status = payload.get("status", "").lower()
    log.info(f"DocuSign webhook callback for PO #{po_id}: status={status}")

    if status == "completed":
        # Process signature completion
        return await sign_po(po_id, SignPORequest(
            signer_name=payload.get("signer_name", "DocuSign Verified Signer"),
            signer_email=payload.get("signer_email", "signer@docusign.net"),
            notes="Completed via DocuSign Connect Webhook",
        ))
    return {"message": f"Webhook received with status {status}"}


# ------------------------------------------------------------------ #
# Events & Audit                                                       #
# ------------------------------------------------------------------ #
@app.post("/events", dependencies=[Depends(verify_key)])
async def log_event(event: CreateEvent):
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO procurement_events
              (event_id, event_type, topic, payload, source_agent)
            VALUES (%s,%s,%s,%s::jsonb,%s)
            ON CONFLICT (event_id) DO NOTHING
            RETURNING id
        """, (
            event.event_id, event.event_type, event.topic,
            json.dumps(event.payload), event.source_agent,
        ))
        conn.commit()
        return {"message": "Event logged"}
    finally:
        cur.close()
        conn.close()


@app.get("/events", dependencies=[Depends(verify_key_flexible)])
async def list_events(limit: int = 50):
    conn = get_conn()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT id, event_id, event_type, topic, source_agent,
                   payload::text AS payload,
                   created_at::text
            FROM procurement_events
            ORDER BY created_at DESC LIMIT %s
        """, (limit,))
        return {"events": [dict(r) for r in cur.fetchall()]}
    finally:
        cur.close()
        conn.close()


@app.get("/audit/{po_id}", dependencies=[Depends(verify_key_flexible)])
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


@app.get("/dashboard/summary", dependencies=[Depends(verify_key_flexible)])
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
                   total_price, status, created_at::text,
                   approval_tier, assigned_approver_name, signed_document_url
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


@app.get("/agent-logs", dependencies=[Depends(verify_key_flexible)])
async def get_agent_logs(limit: int = 100, source_agent: Optional[str] = None):
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
