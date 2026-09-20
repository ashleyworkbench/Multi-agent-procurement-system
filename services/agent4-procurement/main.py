"""
Agent 4 — Procurement Agent
=============================
Listens on: vendor-recommendation-topic
Publishes to: purchase-order-topic

Workflow:
  1. Consume vendor recommendation event from Kafka
  2. Generate a Purchase Order (PO) for each recommended vendor
  3. Store POs in procurement_db via Procurement Service API (never DB directly)
  4. Write audit trail entry for each PO
  5. Log Kafka event to procurement_events table
  6. Publish approval request to purchase-order-topic

Rules:
  - NEVER access databases directly
  - ONLY calls Procurement Service API for all DB writes
  - All inter-agent communication via Kafka events
"""

import os
import json
import asyncio
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

import httpx
import redis.asyncio as aioredis
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] Agent4 | %(message)s",
)
log = logging.getLogger("agent4-procurement")

app = FastAPI(
    title="Agent 4 — Procurement Agent",
    description="Generates Purchase Orders from vendor recommendations. "
                "Writes only via Procurement Service API, never directly to DB.",
    version="1.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ------------------------------------------------------------------ #
# Config                                                               #
# ------------------------------------------------------------------ #
KAFKA_SERVERS        = os.getenv("KAFKA_BOOTSTRAP_SERVERS",    "localhost:9092")
TOPIC_IN             = os.getenv("KAFKA_TOPIC_VENDOR_RECOMMEND","vendor-recommendation-topic")
TOPIC_OUT            = os.getenv("KAFKA_TOPIC_PURCHASE_ORDERS", "purchase-order-topic")
PROCUREMENT_SVC_URL  = os.getenv("PROCUREMENT_SERVICE_URL",    "http://localhost:8004")
PROCUREMENT_KEY      = os.getenv("PROCUREMENT_KEY",            "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012")
REDIS_HOST           = os.getenv("REDIS_HOST",                 "localhost")
REDIS_PORT           = int(os.getenv("REDIS_PORT",             "6379"))
REDIS_PASSWORD       = os.getenv("REDIS_PASSWORD",             "RedisPass@2024")
CACHE_TTL            = int(os.getenv("CACHE_TTL_SECONDS",      "600"))

# ------------------------------------------------------------------ #
# Global state                                                         #
# ------------------------------------------------------------------ #
producer:     Optional[AIOKafkaProducer] = None
consumer:     Optional[AIOKafkaConsumer] = None
redis_client: Optional[aioredis.Redis]   = None
agent_status = {
    "status":           "running",
    "events_processed": 0,
    "pos_created":      0,
    "last_event_at":    None,
    "current_task":     "Ready",
}


# ------------------------------------------------------------------ #
# PO number generator                                                  #
# ------------------------------------------------------------------ #
def generate_po_number() -> str:
    year  = datetime.utcnow().year
    token = uuid.uuid4().hex[:6].upper()
    return f"PO-{year}-{token}"


# ------------------------------------------------------------------ #
# Procurement Service API calls                                        #
# ------------------------------------------------------------------ #
async def create_purchase_order(po_data: dict) -> dict:
    """POST to Procurement Service to persist a PO. Never writes to DB directly."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{PROCUREMENT_SVC_URL}/purchase-orders",
            json=po_data,
            headers={"X-API-KEY": PROCUREMENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()


async def log_procurement_event(event_data: dict) -> dict:
    """POST to Procurement Service to log a Kafka event."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{PROCUREMENT_SVC_URL}/events",
            json=event_data,
            headers={"X-API-KEY": PROCUREMENT_KEY},
        )
        resp.raise_for_status()
        return resp.json()


# ------------------------------------------------------------------ #
# Core logic                                                           #
# ------------------------------------------------------------------ #
async def process_vendor_recommendation(vendor_rec: dict) -> dict:
    """
    Generate purchase orders from vendor recommendations.
    One PO per recommended item.
    """
    request_id       = vendor_rec["request_id"]
    recommendations  = vendor_rec.get("recommendations", [])
    created_pos      = []
    failed_items     = []

    log.info(f"Processing vendor recommendation for request {request_id}, "
             f"{len(recommendations)} items")

    for rec in recommendations:
        item_desc  = rec.get("item_description") or rec.get("item_name") or "Unknown Item"
        best       = rec.get("best_vendor")
        qty        = rec.get("requested_quantity") or rec.get("quantity", 1)

        vendor_name = (best.get("vendor_name") if best else None) or rec.get("vendor_name")
        vendor_id   = (best.get("vendor_id") if best else None) or rec.get("vendor_id", 0)
        unit_price  = float((best.get("unit_price") if best else None) or rec.get("unit_price", 0.0))
        lead_days   = int((best.get("lead_time_days") if best else None) or rec.get("lead_time_days", 7))
        score       = (best.get("score") if best else None) or rec.get("score", "N/A")

        agent_status["current_task"] = f"Creating PO: {item_desc}"

        if not vendor_name:
            log.warning(f"  {item_desc}: No vendor — skipping PO")
            failed_items.append({
                "item": item_desc,
                "reason": rec.get("notes", "No vendor found"),
            })
            continue

        # Rule: Calculate delivery SLA with processing buffer
        delivery_date = (datetime.utcnow() + timedelta(days=lead_days + 2)).date().isoformat()

        po_number  = generate_po_number()
        total      = round(unit_price * qty, 2)

        # Rule: Classify PO by amount thresholds and route for approval
        if total > 200000:
            approval_tier = "TIER_3_DIRECTOR"
            approver_name = "Finance Director"
            approver_email = "director.finance@procureflow.local"
        elif total >= 50000:
            approval_tier = "TIER_2_MANAGER"
            approver_name = "Operations Manager"
            approver_email = "manager.ops@procureflow.local"
        else:
            approval_tier = "TIER_1_OFFICER"
            approver_name = "Procurement Officer"
            approver_email = "officer.procurement@procureflow.local"

        po_payload = {
            "po_number":              po_number,
            "request_id":             request_id,
            "vendor_id":              vendor_id,
            "vendor_name":            vendor_name,
            "item_name":              item_desc,
            "quantity":               qty,
            "unit_price":             unit_price,
            "total_price":            total,
            "currency":               "INR",
            "status":                 "PENDING_APPROVAL",
            "delivery_date_expected": delivery_date,
            "approval_tier":          approval_tier,
            "assigned_approver_name": approver_name,
            "assigned_approver_email": approver_email,
            "notes": (
                f"Auto-generated by Agent 4 (Rule-based routing: {approval_tier}). "
                f"Vendor score: {score}. "
                f"Assigned to {approver_name}."
            ),
        }

        try:
            created = await create_purchase_order(po_payload)
            log.info(
                f"  ✓ PO created: {po_number} | {item_desc} | "
                f"{vendor_name} | ₹{total:,.2f} | [{approval_tier}] -> {approver_name}"
            )
            created_pos.append({
                **created,
                "vendor_score": score,
                "vendor_rating": best.get("rating") if best else None,
                "approval_tier": approval_tier,
                "assigned_approver_name": approver_name,
            })
            agent_status["pos_created"] += 1
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 409:
                log.warning(f"  ⚠ PO already exists for {item_desc} (request {request_id}) — skipping duplicate")
            else:
                log.error(f"  ✗ Failed to create PO for {item_desc}: {e}")
                failed_items.append({"item": item_desc, "reason": str(e)})

    # Log the event to procurement_db
    try:
        await log_procurement_event({
            "event_id":    f"evt_po_{uuid.uuid4().hex[:12]}",
            "event_type":  "PURCHASE_ORDER_CREATED",
            "topic":       TOPIC_OUT,
            "source_agent": "agent_4",
            "payload": {
                "request_id":   request_id,
                "pos_created":  len(created_pos),
                "failed_items": len(failed_items),
            },
        })
    except Exception as e:
        log.warning(f"Failed to log procurement event: {e}")

    result = {
        "request_id":    request_id,
        "processed_at":  datetime.utcnow().isoformat(),
        "pos_created":   len(created_pos),
        "failed_items":  len(failed_items),
        "total_po_value": round(sum(p.get("total_price", 0) for p in created_pos), 2),
        "purchase_orders": created_pos,
        "failed":         failed_items,
        "status": "COMPLETED" if not failed_items else "PARTIAL",
    }

    # If Kafka producer is available, publish to Kafka
    if producer:
        try:
            out_event = {
                "event_type":   "PURCHASE_ORDER_CREATED",
                "source_agent": "agent_4",
                "request_id":   request_id,
                "processed_at": result["processed_at"],
                "payload":      result,
            }
            await producer.send_and_wait(
                TOPIC_OUT,
                json.dumps(out_event).encode(),
                key=str(request_id).encode(),
            )
            log.info(f"Published PO event for request {request_id} → {TOPIC_OUT}")
        except Exception as e:
            log.warning(f"Failed to publish PO event to Kafka: {e}")

    agent_status["status"] = "running"
    agent_status["events_processed"] += 1
    agent_status["last_event_at"]    = datetime.utcnow().isoformat()
    agent_status["current_task"]     = f"Created {len(created_pos)} POs for request #{request_id}"

    log.info(
        f"Request {request_id} done: {len(created_pos)} POs created, "
        f"{len(failed_items)} failed, total ₹{result['total_po_value']:,.2f}"
    )
    return result


# ------------------------------------------------------------------ #
# Kafka supervisor and consumer loop                                   #
# ------------------------------------------------------------------ #
async def kafka_supervisor():
    global consumer, producer
    log.info(f"Starting Kafka supervisor for {TOPIC_IN}")

    while True:
        try:
            if not producer:
                p = AIOKafkaProducer(bootstrap_servers=KAFKA_SERVERS)
                await p.start()
                producer = p
                log.info("Kafka producer connected successfully")

            if not consumer:
                c = AIOKafkaConsumer(
                    TOPIC_IN,
                    bootstrap_servers=KAFKA_SERVERS,
                    group_id="agent4-procurement-group",
                    auto_offset_reset="earliest",
                )
                await c.start()
                consumer = c
                log.info(f"Kafka consumer started on {TOPIC_IN}")
                agent_status["status"] = "running"
                agent_status["current_task"] = "Waiting for vendor recommendations..."

            if consumer:
                async for msg in consumer:
                    try:
                        event      = json.loads(msg.value.decode())
                        event_type = event.get("event_type")

                        if event_type != "VENDOR_RECOMMENDED":
                            continue

                        request_id = event.get("request_id")
                        vendor_rec = event.get("payload", {})
                        log.info(f"Received VENDOR_RECOMMENDED for request_id={request_id}")

                        await process_vendor_recommendation(vendor_rec)

                    except Exception as e:
                        log.error(f"Error processing Kafka event: {e}", exc_info=True)

        except Exception as e:
            log.warning(f"Kafka connection attempt failed: {e}. Retrying in 5 seconds...")
            producer = None
            consumer = None
            agent_status["status"] = "running"
            await asyncio.sleep(5)


# ------------------------------------------------------------------ #
# FastAPI startup / shutdown                                          #
# ------------------------------------------------------------------ #
@app.on_event("startup")
async def startup():
    global redis_client

    try:
        redis_client = aioredis.Redis(
            host=REDIS_HOST, port=REDIS_PORT,
            password=REDIS_PASSWORD, decode_responses=True,
        )
        await redis_client.ping()
        log.info("Redis connected")
    except Exception as e:
        log.warning(f"Redis not available: {e}")
        redis_client = None

    asyncio.create_task(kafka_supervisor())


@app.on_event("shutdown")
async def shutdown():
    if producer:     await producer.stop()
    if consumer:     await consumer.stop()
    if redis_client: await redis_client.aclose()


# ------------------------------------------------------------------ #
# REST API                                                             #
# ------------------------------------------------------------------ #
@app.get("/health")
async def health():
    return {"status": "ok", "service": "agent4-procurement", **agent_status}


@app.get("/status")
async def status():
    return agent_status


@app.post("/process", summary="Manually process a vendor recommendation payload")
async def manual_process(vendor_rec: dict):
    """Manually trigger PO generation. Useful for testing without Kafka."""
    try:
        result = await process_vendor_recommendation(vendor_rec)
        return result
    except Exception as e:
        raise HTTPException(500, str(e))
