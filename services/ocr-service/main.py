"""
OCR Service — FastAPI
Exposes Agent 1's output (ocr_procurement_db) as a REST API.
Agents NEVER touch the DB — they call this service.
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="OCR Service API",
    description="Exposes procurement requests extracted by Agent 1 (OCR). "
                "All agents consume data through this API only.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------ #
# Config                                                               #
# ------------------------------------------------------------------ #
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_USER = os.getenv("POSTGRES_USER", "procurement_admin")
DB_PASS = os.getenv("POSTGRES_PASSWORD", "SecurePass@2024")
OCR_SERVICE_KEY = os.getenv("OCR_SERVICE_KEY", "OCR-e4b9f8e7-0756-4938-45ab-8abc67890123")


# ------------------------------------------------------------------ #
# Auth                                                                 #
# ------------------------------------------------------------------ #
def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != OCR_SERVICE_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key


# ------------------------------------------------------------------ #
# DB helper                                                            #
# ------------------------------------------------------------------ #
def get_conn():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASS,
        dbname="ocr_procurement_db",
        cursor_factory=RealDictCursor,
    )


# ------------------------------------------------------------------ #
# Endpoints                                                            #
# ------------------------------------------------------------------ #
@app.get("/health")
async def health():
    return {"status": "ok", "service": "ocr-service"}


@app.get(
    "/requests",
    summary="Get all procurement requests",
    dependencies=[Depends(verify_api_key)],
)
async def get_requests():
    """Returns all procurement requests created by Agent 1."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, requester_name, total_estimated_cost,
               created_at::text AS created_at
        FROM procurement_requests
        ORDER BY created_at DESC
    """)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"requests": [dict(r) for r in rows], "total": len(rows)}


@app.get(
    "/requests/{request_id}",
    summary="Get a single procurement request",
    dependencies=[Depends(verify_api_key)],
)
async def get_request(request_id: int):
    """Returns a single procurement request by ID."""
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, requester_name, total_estimated_cost,
               created_at::text AS created_at
        FROM procurement_requests
        WHERE id = %s
    """, (request_id,))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail=f"Request {request_id} not found")
    return dict(row)


@app.get(
    "/requests/{request_id}/items",
    summary="Get line items for a procurement request",
    dependencies=[Depends(verify_api_key)],
)
async def get_request_items(request_id: int):
    """Returns all line items for a given procurement request."""
    conn = get_conn()
    cur = conn.cursor()

    # Verify request exists
    cur.execute("SELECT id FROM procurement_requests WHERE id = %s", (request_id,))
    if not cur.fetchone():
        cur.close()
        conn.close()
        raise HTTPException(status_code=404, detail=f"Request {request_id} not found")

    cur.execute("""
        SELECT id, request_id, description, quantity, estimated_cost
        FROM procurement_request_items
        WHERE request_id = %s
        ORDER BY id
    """, (request_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {"request_id": request_id, "items": [dict(r) for r in rows], "total": len(rows)}
