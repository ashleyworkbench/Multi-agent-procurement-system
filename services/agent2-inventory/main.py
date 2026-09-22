"""
Agent 2 Ã¢â‚¬â€ Inventory Intelligence Agent
=======================================
Listens on: ocr-request-topic
Publishes to: inventory-evaluation-topic

Workflow:
  1. Consume OCR request event from Kafka
  2. Call OCR Service API Ã¢â€ â€™ get request items
  3. Detect industry from item descriptions
  4. For each item Ã¢â€ â€™ call Integration Gateway Ã¢â€ â€™ GET /inventory/item/{name}
  5. Calculate shortage (requested_qty - stock_qty)
  6. Cache results in Redis
  7. Publish inventory evaluation to Kafka

Rules:
  - NEVER access databases directly
  - ONLY calls APIs (OCR Service + Integration Gateway)
  - All inter-agent communication via Kafka events
"""

import os
import json
import asyncio
import logging
import hashlib
from datetime import datetime
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
    format="%(asctime)s [%(levelname)s] Agent2 | %(message)s",
)
log = logging.getLogger("agent2-inventory")

app = FastAPI(
    title="Agent 2 Ã¢â‚¬â€ Inventory Intelligence Agent",
    description="Evaluates procurement requests against live inventory. "
                "Communicates only via APIs and Kafka.",
    version="1.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ------------------------------------------------------------------ #
# Config                                                               #
# ------------------------------------------------------------------ #
KAFKA_SERVERS       = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TOPIC_IN            = os.getenv("KAFKA_TOPIC_OCR_REQUESTS",    "ocr-request-topic")
TOPIC_OUT           = os.getenv("KAFKA_TOPIC_INVENTORY_EVAL",  "inventory-evaluation-topic")
OCR_SERVICE_URL     = os.getenv("OCR_SERVICE_URL",             "http://localhost:8001")
GATEWAY_URL         = os.getenv("INTEGRATION_GATEWAY_URL",     "http://localhost:8000")
OCR_API_KEY         = os.getenv("OCR_SERVICE_KEY",             "OCR-e4b9f8e7-0756-4938-45ab-8abc67890123")
GATEWAY_KEY         = os.getenv("GATEWAY_KEY",                 "GATEWAY-master-key-2024")
PROCUREMENT_SVC_URL = os.getenv("PROCUREMENT_SERVICE_URL",     "http://localhost:8004")
PROCUREMENT_KEY     = os.getenv("PROCUREMENT_KEY",             "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012")
REDIS_HOST          = os.getenv("REDIS_HOST",                  "localhost")
REDIS_PORT          = int(os.getenv("REDIS_PORT",              "6379"))
REDIS_PASSWORD      = os.getenv("REDIS_PASSWORD",              "RedisPass@2024")
CACHE_TTL           = int(os.getenv("CACHE_TTL_SECONDS",       "600"))
ONBOARDING_URL      = os.getenv("ONBOARDING_SERVICE_URL",      "http://onboarding-service:8000")

# ------------------------------------------------------------------ #
# Industry detection Ã¢â‚¬â€ maps keywords to industry names               #
# ------------------------------------------------------------------ #
INDUSTRY_KEYWORDS = {
    "construction": [
        "cement", "steel", "sand", "concrete", "brick", "tmt", "rebar",
        "aggregate", "plywood", "roofing", "tile", "pvc pipe", "aac",
    ],
    "pharma": [
        "paracetamol", "ibuprofen", "amoxicillin", "ciprofloxacin",
        "metformin", "insulin", "tablet", "capsule", "syrup", "mg",
        "pharmaceutical", "medicine", "drug", "antibiotic",
    ],
    "manufacturing": [
        "bearing", "motor", "copper wire", "aluminium", "aluminum",
        "hydraulic", "gear", "v-belt", "solenoid", "pneumatic",
        "drill bit", "lathe", "cnc", "machining",
    ],
    "electronics": [
        "resistor", "capacitor", "microcontroller", "sensor", "led",
        "arduino", "raspberry", "esp32", "transistor", "mosfet",
        "pcb", "inductor", "voltage regulator", "ic", "relay",
    ],
}

def detect_industry(item_description: str) -> str:
    """Detect industry from item description using keyword matching."""
    desc_lower = item_description.lower()
    scores = {industry: 0 for industry in INDUSTRY_KEYWORDS}
    for industry, keywords in INDUSTRY_KEYWORDS.items():
        for kw in keywords:
            if kw in desc_lower:
                scores[industry] += 1
    best = max(scores, key=lambda k: scores[k])
    if scores[best] == 0:
        log.warning(f"Could not detect industry for '{item_description}', defaulting to construction")
        return "construction"
    log.info(f"Detected industry '{best}' for item '{item_description}' (score={scores[best]})")
    return best


# ------------------------------------------------------------------ #
# Global state                                                         #
# ------------------------------------------------------------------ #
producer: Optional[AIOKafkaProducer] = None
consumer: Optional[AIOKafkaConsumer] = None
redis_client: Optional[aioredis.Redis] = None
agent_status = {
    "status": "running",
    "events_processed": 0,
    "last_event_at": None,
    "current_task": "Ready",
}


# ------------------------------------------------------------------ #
# API helpers                                                          #
# ------------------------------------------------------------------ #
async def log_procurement_event(event_data: dict):
    """Log an event to the procurement service."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{PROCUREMENT_SVC_URL}/events",
                json=event_data,
                headers={"X-API-KEY": PROCUREMENT_KEY},
            )
    except Exception as e:
        log.warning(f"Could not log procurement event: {e}")


async def call_ocr_service(request_id: int) -> dict:
    """Get procurement request items from OCR Service API."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{OCR_SERVICE_URL}/requests/{request_id}/items",
            headers={"X-API-KEY": OCR_API_KEY},
        )
        resp.raise_for_status()
        return resp.json()


async def get_connected_industries() -> set:
    """Fetch connected industries from onboarding service."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{ONBOARDING_URL}/connections/industries")
            resp.raise_for_status()
            return set(resp.json().get("connected_industries", []))
    except Exception as e:
        log.warning(f"Could not fetch connected industries: {e} Ã¢â‚¬â€ blocking all requests for safety")
        return set()  # empty set = block all if we can't reach the registry


async def call_gateway_inventory(item_name: str, industry: str) -> dict:
    """Check stock for an item via Integration Gateway."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{GATEWAY_URL}/inventory/item/{item_name}",
            headers={"X-API-KEY": GATEWAY_KEY},
            params={"industry": industry},
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()


# ------------------------------------------------------------------ #
# Core logic                                                           #
# ------------------------------------------------------------------ #
async def evaluate_request(request_id: int) -> dict:
    """
    Full inventory evaluation for a procurement request.
    Returns shortage analysis per item.
    """
    # Check connected industries FIRST Ã¢â‚¬â€ before cache
    connected = await get_connected_industries()

    # Check cache (only valid if same industries are connected)
    ck = hashlib.md5(f"inv_eval:{request_id}".encode()).hexdigest()
    if redis_client:
        try:
            cached = await redis_client.get(ck)
            if cached:
                log.info(f"Cache HIT for request {request_id}")
                return json.loads(cached)
        except Exception as e:
            log.warning(f"Cache read error: {e}")

    log.info(f"Evaluating inventory for request_id={request_id}")
    agent_status["current_task"] = f"Fetching items for request #{request_id}"

    # Step 1: Get items from OCR Service API
    ocr_data = await call_ocr_service(request_id)
    items = ocr_data.get("items", [])
    log.info(f"Request {request_id} has {len(items)} items")

    evaluation_items = []
    total_shortage_cost = 0.0

    for item in items:
        desc        = item["description"]
        req_qty     = item["quantity"]
        est_cost    = float(item["estimated_cost"])
        industry    = detect_industry(desc)

        # Block items whose industry is not connected
        if industry not in connected:
            log.warning(f"  {desc}: industry '{industry}' not connected Ã¢â‚¬â€ skipping item")
            evaluation_items.append({
                "item_description":   desc,
                "requested_quantity": req_qty,
                "estimated_cost":     est_cost,
                "industry":           industry,
                "stock_found":        False,
                "stock_quantity":     0,
                "unit_price":         0,
                "shortage_quantity":  0,
                "shortage_cost":      0,
                "has_shortage":       False,
                "reorder_level":      0,
                "warehouse":          "N/A",
                "source":             "industry_not_connected",
                "skipped":            True,
                "skip_reason":        f"Industry '{industry}' is not connected in Data Sources",
            })
            continue

        agent_status["current_task"] = f"Checking stock: {desc}"

        # Step 2: Query Integration Gateway for stock
        stock_data = await call_gateway_inventory(desc, industry)

        if stock_data and "item" in stock_data:
            stock_info      = stock_data["item"]
            stock_qty       = stock_info.get("quantity_in_stock", 0)
            unit_price      = float(stock_info.get("unit_price", 0))
            shortage_qty    = max(0, req_qty - stock_qty)
            has_shortage    = shortage_qty > 0
            shortage_cost   = shortage_qty * unit_price
            total_shortage_cost += shortage_cost

            evaluation_items.append({
                "item_description":  desc,
                "requested_quantity": req_qty,
                "estimated_cost":    est_cost,
                "industry":          industry,
                "stock_found":       True,
                "stock_quantity":    stock_qty,
                "unit_price":        unit_price,
                "shortage_quantity": shortage_qty,
                "shortage_cost":     shortage_cost,
                "has_shortage":      has_shortage,
                "reorder_level":     stock_info.get("reorder_level", 0),
                "warehouse":         stock_info.get("warehouse_location", "Unknown"),
                "source":            stock_data.get("source", "live"),
            })
            log.info(
                f"  {desc}: requested={req_qty}, stock={stock_qty}, "
                f"shortage={shortage_qty} ({'Ã¢Å¡Â  SHORTAGE' if has_shortage else 'Ã¢Å“â€œ OK'})"
            )
        else:
            # Item not found in any inventory
            evaluation_items.append({
                "item_description":   desc,
                "requested_quantity": req_qty,
                "estimated_cost":     est_cost,
                "industry":           industry,
                "stock_found":        False,
                "stock_quantity":     0,
                "unit_price":         0,
                "shortage_quantity":  req_qty,
                "shortage_cost":      est_cost,
                "has_shortage":       True,
                "reorder_level":      0,
                "warehouse":          "N/A",
                "source":             "not_found",
            })
            total_shortage_cost += est_cost
            log.warning(f"  {desc}: NOT FOUND in {industry} inventory")

    shortage_items  = [i for i in evaluation_items if i["has_shortage"]]
    result = {
        "request_id":          request_id,
        "evaluated_at":        datetime.utcnow().isoformat(),
        "total_items":         len(items),
        "shortage_items":      len(shortage_items),
        "all_items_available": len(shortage_items) == 0,
        "total_shortage_cost": round(total_shortage_cost, 2),
        "items":               evaluation_items,
        "shortages":           shortage_items,
    }

    # Cache result in Redis
    if redis_client:
        try:
            await redis_client.setex(ck, CACHE_TTL, json.dumps(result))
        except Exception as e:
            log.warning(f"Cache write error: {e}")

    # Log event to procurement_db
    await log_procurement_event({
        "event_id":    f"evt_inv_{hashlib.md5(f'{request_id}:{datetime.utcnow().isoformat()}'.encode()).hexdigest()[:12]}",
        "event_type":  "INVENTORY_EVALUATED",
        "topic":       TOPIC_OUT,
        "source_agent": "agent_2",
        "payload": {
            "request_id":          request_id,
            "total_items":         len(items),
            "shortage_items":      len(shortage_items),
            "all_items_available": len(shortage_items) == 0,
            "total_shortage_cost": round(total_shortage_cost, 2),
        },
    })

    # If Kafka producer is available, publish to Kafka
    if producer:
        try:
            out_event = {
                "event_type":   "INVENTORY_EVALUATED",
                "source_agent": "agent_2",
                "request_id":   request_id,
                "evaluated_at": result["evaluated_at"],
                "payload":      result,
            }
            await producer.send_and_wait(
                TOPIC_OUT,
                json.dumps(out_event).encode(),
                key=str(request_id).encode(),
            )
            log.info(f"Published inventory evaluation for request {request_id} Ã¢â€ â€™ {TOPIC_OUT}")
        except Exception as e:
            log.warning(f"Failed to publish event to Kafka: {e}")

    agent_status["status"] = "running"
    agent_status["events_processed"] += 1
    agent_status["last_event_at"]    = datetime.utcnow().isoformat()
    agent_status["current_task"]     = f"Evaluated request #{request_id} ({len(shortage_items)} shortage(s))"

    return result


# ------------------------------------------------------------------ #
# Kafka supervisor and consumer loop                                   #
# ------------------------------------------------------------------ #
async def kafka_supervisor():
    """Background task that maintains Kafka producer and consumer connections."""
    global producer, consumer
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
                    group_id="agent2-inventory-group",
                    auto_offset_reset="earliest",
                )
                await c.start()
                consumer = c
                log.info(f"Kafka consumer started on {TOPIC_IN}")
                agent_status["status"] = "running"
                agent_status["current_task"] = "Waiting for procurement requests..."

            if consumer:
                async for msg in consumer:
                    try:
                        event = json.loads(msg.value.decode())
                        request_id = event.get("request_id")
                        log.info(f"Received Kafka event: request_id={request_id}")
                        await evaluate_request(request_id)
                    except Exception as e:
                        log.error(f"Error processing Kafka event: {e}", exc_info=True)

        except Exception as e:
            log.warning(f"Kafka connection attempt failed: {e}. Retrying in 5 seconds...")
            producer = None
            consumer = None
            agent_status["status"] = "degraded"
            await asyncio.sleep(5)


# ------------------------------------------------------------------ #
# FastAPI startup / shutdown                                          #
# ------------------------------------------------------------------ #
@app.on_event("startup")
async def startup():
    global redis_client

    # Redis
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

    # Start Kafka supervisor in background
    asyncio.create_task(kafka_supervisor())


@app.on_event("shutdown")
async def shutdown():
    if producer:
        await producer.stop()
    if consumer:
        await consumer.stop()
    if redis_client:
        await redis_client.aclose()


# ------------------------------------------------------------------ #
# REST API Ã¢â‚¬â€ for frontend and monitoring                              #
# ------------------------------------------------------------------ #
@app.get("/health")
async def health():
    return {"status": "ok", "service": "agent2-inventory", **agent_status}


@app.get("/status")
async def status():
    return agent_status


@app.post("/evaluate/{request_id}", summary="Manually trigger evaluation for a request")
async def manual_evaluate(request_id: int):
    """
    Manually trigger inventory evaluation for a specific request.
    Useful for testing without Kafka.
    """
    try:
        result = await evaluate_request(request_id)
        return result
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/evaluate/{request_id}/result", summary="Get cached evaluation result")
async def get_result(request_id: int):
    """Returns cached evaluation result if available."""
    if not redis_client:
        raise HTTPException(503, "Cache not available")
    ck = hashlib.md5(f"inv_eval:{request_id}".encode()).hexdigest()
    cached = await redis_client.get(ck)
    if not cached:
        raise HTTPException(404, f"No cached result for request {request_id}. Trigger evaluation first.")
    return json.loads(cached)


class TriggerEvent(BaseModel):
    request_id: int

@app.post("/trigger", summary="Publish a test OCR request event to Kafka")
async def trigger_event(event: TriggerEvent):
    """Simulates Agent 1 publishing an OCR request event."""
    if not producer:
        raise HTTPException(503, "Kafka producer not available")
    msg = json.dumps({
        "event_type": "OCR_REQUEST_CREATED",
        "source_agent": "agent_1",
        "request_id": event.request_id,
        "timestamp": datetime.utcnow().isoformat(),
    }).encode()
    await producer.send_and_wait(TOPIC_IN, msg, key=str(event.request_id).encode())
    return {"message": f"Event published for request_id={event.request_id}", "topic": TOPIC_IN}


