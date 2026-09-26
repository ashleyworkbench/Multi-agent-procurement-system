"""
Integration API Gateway
=======================
Single entry point for all agent queries.
Routes requests to the correct industry database service.
Handles Redis caching transparently.

Architecture:
    Agent
      â†“
    Integration Gateway  (this service)
      â†“
    Industry Service API (inventory-service / vendor-service)
      â†“
    Database (PostgreSQL / MySQL)

Agents NEVER know which DB is behind the API.
"""

import os
import json
import hashlib
import logging
from typing import Optional

import httpx
import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, Header, Depends, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("integration-gateway")

app = FastAPI(
    title="Integration API Gateway",
    description="Single interface for all agent data queries. "
                "Routes to correct industry service. Handles caching.",
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
REDIS_HOST     = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT     = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "RedisPass@2024")
CACHE_TTL      = int(os.getenv("CACHE_TTL_SECONDS", "600"))

INVENTORY_SERVICE_URL = os.getenv("INVENTORY_SERVICE_URL", "http://localhost:8002")
VENDOR_SERVICE_URL    = os.getenv("VENDOR_SERVICE_URL",    "http://localhost:8003")

# API keys per industry â€” gateway holds them, agents never do
INDUSTRY_KEYS = {
    "construction":  os.getenv("CONSTRUCTION_KEY",  "CONST-a8f3d2e1-4b9c-4d7f-89ab-cdef01234567"),
    "pharma":        os.getenv("PHARMA_KEY",         "PHARM-b7e2c1d0-3a8b-4c6e-78ab-bcde90123456"),
    "manufacturing": os.getenv("MANUFACTURING_KEY",  "MANUF-c6d1b0e9-2978-4b5d-67ab-abcd89012345"),
    "electronics":   os.getenv("ELECTRONICS_KEY",    "ELEC-d5c0a9f8-1867-4a4c-56ab-9abc78901234"),
}

# Gateway's own auth key (agents authenticate to gateway with this)
GATEWAY_KEY = os.getenv("GATEWAY_KEY", "GATEWAY-master-key-2024")


# ------------------------------------------------------------------ #
# Redis client                                                         #
# ------------------------------------------------------------------ #
redis_client: Optional[redis.Redis] = None

@app.on_event("startup")
async def startup():
    global redis_client
    try:
        redis_client = redis.Redis(
            host=REDIS_HOST, port=REDIS_PORT,
            password=REDIS_PASSWORD, decode_responses=True,
        )
        await redis_client.ping()
        log.info("Redis connected")
    except Exception as e:
        log.warning(f"Redis not available: {e}. Caching disabled.")
        redis_client = None

@app.on_event("shutdown")
async def shutdown():
    if redis_client:
        await redis_client.aclose()


# ------------------------------------------------------------------ #
# Cache helpers                                                        #
# ------------------------------------------------------------------ #
def cache_key(prefix: str, *parts: str) -> str:
    raw = f"{prefix}:" + ":".join(parts)
    return hashlib.md5(raw.encode()).hexdigest()

async def get_cached(key: str) -> Optional[dict]:
    if not redis_client:
        return None
    try:
        val = await redis_client.get(key)
        if val:
            log.info(f"Cache HIT: {key}")
            return json.loads(val)
    except Exception as e:
        log.warning(f"Cache get error: {e}")
    return None

async def set_cached(key: str, data: dict, ttl: int = CACHE_TTL):
    if not redis_client:
        return
    try:
        await redis_client.setex(key, ttl, json.dumps(data))
        log.info(f"Cache SET: {key} (TTL={ttl}s)")
    except Exception as e:
        log.warning(f"Cache set error: {e}")


# ------------------------------------------------------------------ #
# Auth                                                                 #
# ------------------------------------------------------------------ #
def verify_gateway_key(x_api_key: str = Header(...)):
    if x_api_key != GATEWAY_KEY:
        raise HTTPException(401, "Invalid gateway API key")
    return x_api_key


# ------------------------------------------------------------------ #
# HTTP client helper                                                   #
# ------------------------------------------------------------------ #
async def fetch(url: str, industry: str) -> dict:
    """Make authenticated request to an industry service."""
    key = INDUSTRY_KEYS.get(industry)
    if not key:
        raise HTTPException(400, f"Unknown industry: {industry}")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers={"X-API-KEY": key})
        if resp.status_code == 404:
            raise HTTPException(404, f"Item not found at {url}")
        if resp.status_code != 200:
            raise HTTPException(resp.status_code, f"Upstream error from {url}: {resp.text}")
        return resp.json()


# ------------------------------------------------------------------ #
# Endpoints                                                            #
# ------------------------------------------------------------------ #
@app.get("/health")
async def health():
    cache_ok = False
    if redis_client:
        try:
            await redis_client.ping()
            cache_ok = True
        except Exception:
            pass
    return {
        "status": "ok",
        "service": "integration-gateway",
        "cache": "connected" if cache_ok else "unavailable",
    }


# ---- INVENTORY endpoints ----------------------------------------- #

@app.get(
    "/inventory/items",
    summary="Get all inventory items for an industry",
    dependencies=[Depends(verify_gateway_key)],
)
async def get_inventory_items(industry: str = Query(..., description="construction|pharma|manufacturing|electronics")):
    """Returns full inventory list for the given industry."""
    ck = cache_key("inventory_all", industry)
    cached = await get_cached(ck)
    if cached:
        return {**cached, "source": "cache"}

    data = await fetch(f"{INVENTORY_SERVICE_URL}/inventory/{industry}/items", industry)
    await set_cached(ck, data)
    return {**data, "source": "live"}


@app.get(
    "/inventory/item/{item_name}",
    summary="Get stock info for a specific item",
    dependencies=[Depends(verify_gateway_key)],
)
async def get_inventory_item(
    item_name: str,
    industry: str = Query(..., description="construction|pharma|manufacturing|electronics"),
):
    """
    Returns stock info for a named item in the given industry.
    This is what Agent 2 calls for each procurement request item.
    """
    ck = cache_key("inventory_item", industry, item_name.lower())
    cached = await get_cached(ck)
    if cached:
        return {**cached, "source": "cache"}

    data = await fetch(
        f"{INVENTORY_SERVICE_URL}/inventory/{industry}/item/{item_name}",
        industry,
    )
    await set_cached(ck, data)
    return {**data, "source": "live"}


# ---- VENDOR endpoints -------------------------------------------- #

@app.get(
    "/vendors/item/{item_name}",
    summary="Get all vendors who supply a specific item",
    dependencies=[Depends(verify_gateway_key)],
)
async def get_vendors_for_item(
    item_name: str,
    industry: str = Query(..., description="construction|pharma|manufacturing|electronics"),
):
    """
    Returns all vendors supplying this item with pricing and lead times.
    This is what Agent 3 calls for each shortage item.
    """
    ck = cache_key("vendors_item", industry, item_name.lower())
    cached = await get_cached(ck)
    if cached:
        return {**cached, "source": "cache"}

    data = await fetch(
        f"{VENDOR_SERVICE_URL}/vendors/{industry}/item/{item_name}",
        industry,
    )
    await set_cached(ck, data)
    return {**data, "source": "live"}


@app.get(
    "/vendors",
    summary="Get all vendors for an industry",
    dependencies=[Depends(verify_gateway_key)],
)
async def get_vendors(industry: str = Query(...)):
    ck = cache_key("vendors_all", industry)
    cached = await get_cached(ck)
    if cached:
        return {**cached, "source": "cache"}

    data = await fetch(f"{VENDOR_SERVICE_URL}/vendors/{industry}", industry)
    await set_cached(ck, data)
    return {**data, "source": "live"}


@app.get(
    "/vendors/{vendor_id}",
    summary="Get a specific vendor",
    dependencies=[Depends(verify_gateway_key)],
)
async def get_vendor(
    vendor_id: int,
    industry: str = Query(...),
):
    ck = cache_key("vendor_detail", industry, str(vendor_id))
    cached = await get_cached(ck)
    if cached:
        return {**cached, "source": "cache"}

    data = await fetch(f"{VENDOR_SERVICE_URL}/vendors/{industry}/{vendor_id}", industry)
    await set_cached(ck, data)
    return {**data, "source": "live"}


# ---- Cache management -------------------------------------------- #

@app.delete(
    "/cache/flush",
    summary="Flush all cached data",
    dependencies=[Depends(verify_gateway_key)],
)
async def flush_cache():
    if not redis_client:
        raise HTTPException(503, "Cache not available")
    await redis_client.flushdb()
    return {"message": "Cache flushed"}

# ---- AGENT 1 proxy endpoints (browser can't reach 8009 directly) -- #

AGENT1_URL = os.getenv("AGENT1_OCR_URL", "http://agent1-ocr:8009")

@app.post("/agent1/upload", summary="Proxy invoice upload to Agent 1")
async def proxy_upload(request: Request):
    """Proxy multipart upload to Agent 1 so browser only needs port 8000."""
    body = await request.body()
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{AGENT1_URL}/upload",
            content=body,
            headers={k: v for k, v in request.headers.items() if k.lower() != "host"},
        )
        return resp.json()

@app.get("/agent1/documents", summary="Proxy document list from Agent 1")
async def proxy_documents():
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{AGENT1_URL}/documents")
        return resp.json()

@app.get("/agent1/processing/{processing_id}", summary="Proxy processing status from Agent 1")
async def proxy_processing_status(processing_id: int):
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{AGENT1_URL}/processing/{processing_id}")
        return resp.json()

@app.post("/agent1/documents/{processing_id}/cancel", summary="Proxy document cancel to Agent 1")
async def proxy_cancel_document(processing_id: int):
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(f"{AGENT1_URL}/documents/{processing_id}/cancel")
        return resp.json()

@app.delete("/agent1/documents/{processing_id}", summary="Proxy delete document to Agent 1")
async def proxy_delete_document(processing_id: int):
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.delete(f"{AGENT1_URL}/documents/{processing_id}")
        return resp.json()

@app.delete("/agent1/documents", summary="Proxy clear all documents to Agent 1")
async def proxy_clear_documents():
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.delete(f"{AGENT1_URL}/documents")
        return resp.json()

# ---- OCR & Procurement Clean-up & Demo Reset Proxies ------------- #
OCR_SVC_URL = os.getenv("OCR_SERVICE_URL", "http://ocr-service:8001")
PROC_SVC_URL = os.getenv("PROCUREMENT_SERVICE_URL", "http://procurement-service:8004")
AGENT2_URL = os.getenv("AGENT2_URL", "http://agent2-inventory:8005")
AGENT3_URL = os.getenv("AGENT3_URL", "http://agent3-vendor:8006")
AGENT4_URL = os.getenv("AGENT4_URL", "http://agent4-procurement:8008")
ONBOARDING_URL = os.getenv("ONBOARDING_SERVICE_URL", "http://onboarding-service:8000")
OCR_KEY = os.getenv("OCR_SERVICE_KEY", "OCR-e4b9f8e7-0756-4938-45ab-8abc67890123")
PROC_KEY = os.getenv("PROCUREMENT_KEY", "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012")

@app.get("/ocr/requests")
async def proxy_get_requests():
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{OCR_SVC_URL}/requests",
            headers={"X-API-KEY": OCR_KEY},
        )
        return resp.json()

@app.delete("/ocr/requests/{request_id}")
async def proxy_delete_request(request_id: int):
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.delete(
            f"{OCR_SVC_URL}/requests/{request_id}",
            headers={"X-API-KEY": "OCR-e4b9f8e7-0756-4938-45ab-8abc67890123"}
        )
        return resp.json()

@app.delete("/ocr/requests")
async def proxy_clear_requests():
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.delete(
            f"{OCR_SVC_URL}/requests",
            headers={"X-API-KEY": "OCR-e4b9f8e7-0756-4938-45ab-8abc67890123"}
        )
        return resp.json()

@app.get("/agent1/requests/{request_id}/items")
async def proxy_request_items(request_id: int):
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{OCR_SVC_URL}/requests/{request_id}/items",
            headers={"X-API-KEY": OCR_KEY},
        )
        return resp.json()

@app.post("/agent2/trigger")
async def proxy_agent2_trigger(request: Request):
    return await proxy_json_request(AGENT2_URL, "/trigger", request)

@app.post("/agent2/evaluate/{request_id}")
async def proxy_agent2_evaluate(request_id: int):
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(f"{AGENT2_URL}/evaluate/{request_id}")
        return resp.json()

@app.get("/agent2/{path:path}")
async def proxy_agent2(path: str):
    return await proxy_get(AGENT2_URL, f"/{path}")

@app.get("/agent3/{path:path}")
async def proxy_agent3(path: str):
    return await proxy_get(AGENT3_URL, f"/{path}")

@app.post("/agent3/recommend")
async def proxy_agent3_recommend(request: Request):
    return await proxy_json_request(AGENT3_URL, "/recommend", request)

@app.get("/agent4/{path:path}")
async def proxy_agent4(path: str):
    return await proxy_get(AGENT4_URL, f"/{path}")

@app.post("/agent4/process")
async def proxy_agent4_process(request: Request):
    return await proxy_json_request(AGENT4_URL, "/process", request)

async def proxy_get(base_url: str, path: str):
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{base_url}{path}")
        return resp.json()

async def proxy_json_request(base_url: str, path: str, request: Request):
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{base_url}{path}", json=await request.json())
        return resp.json()

@app.get("/connections/industries")
async def proxy_connected_industries():
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{ONBOARDING_URL}/connections/industries")
        return resp.json()

@app.get("/connections")
async def proxy_connections():
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{ONBOARDING_URL}/connections")
        return resp.json()

@app.post("/connections/connect")
async def proxy_connect(request: Request):
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(f"{ONBOARDING_URL}/connections/connect", json=await request.json())
        return resp.json()

@app.delete("/connections/disconnect")
async def proxy_disconnect(industry: str, data_type: str):
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.delete(f"{ONBOARDING_URL}/connections/disconnect", params={"industry": industry, "data_type": data_type})
        return resp.json()

@app.post("/onboarding/upload")
async def proxy_onboarding_upload(request: Request):
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{ONBOARDING_URL}/onboarding/upload",
            content=await request.body(),
            headers={k: v for k, v in request.headers.items() if k.lower() != "host"},
        )
        return resp.json()

@app.get("/onboarding/uploads")
async def proxy_onboarding_uploads():
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{ONBOARDING_URL}/onboarding/uploads")
        return resp.json()

@app.get("/onboarding/data/{upload_id}")
async def proxy_onboarding_data(upload_id: str):
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{ONBOARDING_URL}/onboarding/data/{upload_id}")
        return resp.json()

@app.delete("/onboarding/uploads/{upload_id}")
async def proxy_delete_onboarding_upload(upload_id: str):
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.delete(f"{ONBOARDING_URL}/onboarding/uploads/{upload_id}")
        return resp.json()

@app.delete("/procurement/purchase-orders/{po_id}")
async def proxy_delete_po(po_id: int):
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.delete(
            f"{PROC_SVC_URL}/purchase-orders/{po_id}",
            headers={"X-API-KEY": "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012"}
        )
        return resp.json()

@app.delete("/procurement/purchase-orders")
async def proxy_clear_pos():
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.delete(
            f"{PROC_SVC_URL}/purchase-orders",
            headers={"X-API-KEY": "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012"}
        )
        return resp.json()

@app.get("/procurement/summary")
async def proxy_summary():
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{PROC_SVC_URL}/dashboard/summary",
            headers={"X-API-KEY": "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012"}
        )
        return resp.json()

@app.get("/procurement/po")
async def proxy_purchase_orders_list(status: Optional[str] = None, request_id: Optional[int] = None, limit: int = 100, offset: int = 0):
    params = {}
    if status:
        params["status"] = status
    if request_id is not None:
        params["request_id"] = request_id
    if limit != 100:
        params["limit"] = limit
    if offset != 0:
        params["offset"] = offset

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{PROC_SVC_URL}/purchase-orders",
            params=params,
            headers={"X-API-KEY": "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012"}
        )
        return resp.json()

@app.get("/procurement/contracts")
async def proxy_contracts():
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{PROC_SVC_URL}/contracts",
            headers={"X-API-KEY": "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012"}
        )
        return resp.json()
@app.get("/procurement/purchase-orders/{po_id}/pdf")
async def proxy_po_pdf(po_id: int):
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{PROC_SVC_URL}/purchase-orders/{po_id}/pdf",
            headers={"X-API-KEY": "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012"}
        )
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            media_type=resp.headers.get("content-type", "application/pdf"),
            headers={
                "Content-Disposition": resp.headers.get(
                    "content-disposition",
                    f'inline; filename="PO_{po_id}.pdf"'
                )
            }
        )


@app.get("/procurement/purchase-orders/{po_id}/download")
async def proxy_po_download(po_id: int):
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{PROC_SVC_URL}/purchase-orders/{po_id}/download",
            headers={"X-API-KEY": "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012"}
        )
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            media_type=resp.headers.get("content-type", "application/pdf"),
            headers={
                "Content-Disposition": resp.headers.get(
                    "content-disposition",
                    f'attachment; filename="PO_{po_id}.pdf"'
                )
            }
        )

@app.post("/procurement/purchase-orders/{po_id}/sign")
async def proxy_sign_po(po_id: int, request: Request):
    body = await request.json()
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            f"{PROC_SVC_URL}/purchase-orders/{po_id}/sign",
            json=body,
            headers={"X-API-KEY": "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012"}
        )
        return resp.json()

@app.patch("/procurement/purchase-orders/{po_id}/status")
async def proxy_update_po_status(po_id: int, request: Request):
    body = await request.json()
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.patch(
            f"{PROC_SVC_URL}/purchase-orders/{po_id}/status",
            json=body,
            headers={"X-API-KEY": "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012"}
        )
        return resp.json()

@app.get("/agent-logs")
async def proxy_agent_logs(limit: int = 100, source_agent: Optional[str] = None):
    params = {"limit": limit}
    if source_agent:
        params["source_agent"] = source_agent
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{PROC_SVC_URL}/agent-logs",
            params=params,
            headers={"X-API-KEY": "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012"}
        )
        return resp.json()

@app.get("/events")
async def proxy_events(limit: int = 100):
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{PROC_SVC_URL}/events",
            params={"limit": limit},
            headers={"X-API-KEY": "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012"}
        )
        return resp.json()

@app.post("/demo/reset")
async def proxy_demo_reset_via_frontend():
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{PROC_SVC_URL}/demo/reset",
            headers={"X-API-KEY": "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012"}
        )
        return resp.json()

@app.post("/demo/reset")
async def proxy_demo_reset():
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{PROC_SVC_URL}/demo/reset",
            headers={"X-API-KEY": "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012"}
        )
        return resp.json()


