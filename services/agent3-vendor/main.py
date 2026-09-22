"""
Agent 3 â€” Vendor Intelligence Agent
=====================================
Listens on: inventory-evaluation-topic
Publishes to: vendor-recommendation-topic

Workflow:
  1. Consume inventory evaluation event from Kafka
  2. For each shortage item â†’ call Integration Gateway â†’ GET /vendors/item/{name}
  3. Score and rank vendors by: rating (40%), price (35%), lead time (25%)
  4. Select best vendor per item
  5. Cache vendor responses in Redis
  6. Publish vendor recommendations to Kafka

Rules:
  - NEVER access databases directly
  - ONLY calls Integration Gateway API
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
    format="%(asctime)s [%(levelname)s] Agent3 | %(message)s",
)
log = logging.getLogger("agent3-vendor")

app = FastAPI(
    title="Agent 3 â€” Vendor Intelligence Agent",
    description="Finds and ranks best vendors for shortage items. "
                "Communicates only via APIs and Kafka.",
    version="1.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ------------------------------------------------------------------ #
# Config                                                               #
# ------------------------------------------------------------------ #
KAFKA_SERVERS       = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TOPIC_IN            = os.getenv("KAFKA_TOPIC_INVENTORY_EVAL",    "inventory-evaluation-topic")
TOPIC_OUT           = os.getenv("KAFKA_TOPIC_VENDOR_RECOMMEND",  "vendor-recommendation-topic")
GATEWAY_URL         = os.getenv("INTEGRATION_GATEWAY_URL",       "http://localhost:8000")
GATEWAY_KEY         = os.getenv("GATEWAY_KEY",                   "GATEWAY-master-key-2024")
PROCUREMENT_SVC_URL = os.getenv("PROCUREMENT_SERVICE_URL",       "http://localhost:8004")
PROCUREMENT_KEY     = os.getenv("PROCUREMENT_KEY",               "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012")
REDIS_HOST          = os.getenv("REDIS_HOST",                    "localhost")
REDIS_PORT          = int(os.getenv("REDIS_PORT",                "6379"))
REDIS_PASSWORD      = os.getenv("REDIS_PASSWORD",                "RedisPass@2024")
CACHE_TTL           = int(os.getenv("CACHE_TTL_SECONDS",         "600"))

# Scoring weights â€” must sum to 1.0
WEIGHT_RATING    = float(os.getenv("WEIGHT_RATING", "0.40"))
WEIGHT_PRICE     = float(os.getenv("WEIGHT_PRICE", "0.35"))
WEIGHT_LEAD_TIME = float(os.getenv("WEIGHT_LEAD_TIME", "0.25"))

# Business Rules Configuration
RULE_MIN_RATING      = float(os.getenv("RULE_MIN_RATING", "3.5"))
RULE_MAX_LEAD_TIME   = int(os.getenv("RULE_MAX_LEAD_DAYS", "21"))
RULE_PREFERRED_BOOST = float(os.getenv("RULE_PREFERRED_BOOST", "0.10"))

# ------------------------------------------------------------------ #
# Global state                                                         #
# ------------------------------------------------------------------ #
producer: Optional[AIOKafkaProducer] = None
consumer: Optional[AIOKafkaConsumer] = None
redis_client: Optional[aioredis.Redis] = None
agent_status = {
    "status":           "running",
    "events_processed": 0,
    "last_event_at":    None,
    "current_task":     "Ready",
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


# ------------------------------------------------------------------ #
# Rule-Based Vendor Selection Engine                                   #
# ------------------------------------------------------------------ #
def evaluate_vendor_rules(vendors: list[dict], requested_qty: int) -> list[dict]:
    """
    Executes rule-based vendor selection:
      - Rule 1 (Quality Gate): Rating must be >= RULE_MIN_RATING (3.5)
      - Rule 2 (Delivery SLA Gate): Lead time must be <= RULE_MAX_LEAD_TIME (21 days)
      - Rule 3 (MOQ Gate): Requested quantity >= vendor MOQ
      - Rule 4 (Preferred Supplier): Contracted/Preferred vendors get score boost
      - Rule 5 (Weighted Scoring): Multi-criteria scoring across Rating, Price, Lead Time
    """
    if not vendors:
        return []

    ratings    = [float(v.get("rating", 0))        for v in vendors]
    prices     = [float(v.get("unit_price", 0))     for v in vendors]
    lead_times = [int(v.get("lead_time_days", 999)) for v in vendors]

    max_rating  = max(ratings)    if ratings    else 1
    min_price   = min(prices)     if prices     else 1
    max_price   = max(prices)     if prices     else 1
    min_lead    = min(lead_times) if lead_times else 1
    max_lead    = max(lead_times) if lead_times else 1

    evaluated = []
    for v, r, p, lt in zip(vendors, ratings, prices, lead_times):
        # 1. Evaluate Rule Gates
        moq = int(v.get("min_order_qty", 1))
        passed_moq = requested_qty >= moq
        passed_rating = r >= RULE_MIN_RATING
        passed_lead_time = lt <= RULE_MAX_LEAD_TIME

        # Preferred vendor status check
        vendor_name_lower = str(v.get("vendor_name", "")).lower()
        is_preferred = any(p in vendor_name_lower for p in ["tata", "l&t", "cipla", "bosch", "reliance", "acc", "mouser"])

        # 2. Multi-factor normalization
        rating_norm    = r / max_rating if max_rating > 0 else 0
        price_norm     = 1 - ((p - min_price) / (max_price - min_price + 1e-9))
        lead_time_norm = 1 - ((lt - min_lead) / (max_lead - min_lead + 1e-9))

        base_score = (
            WEIGHT_RATING    * rating_norm +
            WEIGHT_PRICE     * price_norm +
            WEIGHT_LEAD_TIME * lead_time_norm
        )

        # Apply Rule 4 boost for preferred contracted vendors
        bonus = RULE_PREFERRED_BOOST if is_preferred else 0.0
        final_score = min(1.0, base_score + bonus)

        # Gate compliance flags
        disqualifications = []
        if not passed_rating:
            disqualifications.append(f"Rating {r} below required quality gate {RULE_MIN_RATING}")
        if not passed_lead_time:
            disqualifications.append(f"Lead time {lt}d exceeds SLA maximum of {RULE_MAX_LEAD_TIME}d")
        if not passed_moq:
            disqualifications.append(f"Order qty {requested_qty} below MOQ of {moq}")

        is_fully_compliant = len(disqualifications) == 0

        rule_trace = {
            "rule_1_quality_gate": {
                "rule": f"Rating >= {RULE_MIN_RATING}",
                "value": r,
                "passed": passed_rating,
            },
            "rule_2_delivery_sla": {
                "rule": f"Lead time <= {RULE_MAX_LEAD_TIME} days",
                "value": lt,
                "passed": passed_lead_time,
            },
            "rule_3_moq_compliance": {
                "rule": f"Requested Qty >= MOQ ({moq})",
                "value": requested_qty,
                "passed": passed_moq,
            },
            "rule_4_preferred_status": {
                "is_preferred": is_preferred,
                "bonus_applied": bonus,
            },
            "rule_5_scoring": {
                "base_score": round(base_score, 4),
                "rating_pts": round(rating_norm * WEIGHT_RATING, 4),
                "price_pts": round(price_norm * WEIGHT_PRICE, 4),
                "lead_time_pts": round(lead_time_norm * WEIGHT_LEAD_TIME, 4),
            },
        }

        evaluated.append({
            **v,
            "score":             round(final_score, 4),
            "is_compliant":      is_fully_compliant,
            "can_fulfill":       passed_moq,
            "is_preferred":      is_preferred,
            "disqualifications": disqualifications,
            "rule_evaluations":  rule_trace,
            "score_detail": {
                "rating_score":    round(rating_norm * WEIGHT_RATING, 4),
                "price_score":     round(price_norm * WEIGHT_PRICE, 4),
                "lead_time_score": round(lead_time_norm * WEIGHT_LEAD_TIME, 4),
                "preferred_bonus": bonus,
            },
            "total_cost": round(float(v.get("unit_price", 0)) * requested_qty, 2),
        })

    # Sort priorities:
    # 1. Fully compliant vendors first
    # 2. Can fulfill MOQ
    # 3. Final score descending
    evaluated.sort(key=lambda x: (not x["is_compliant"], not x["can_fulfill"], -x["score"]))
    return evaluated

def score_vendors(vendors: list[dict], requested_qty: int) -> list[dict]:
    return evaluate_vendor_rules(vendors, requested_qty)


# ------------------------------------------------------------------ #
# API helpers                                                          #
# ------------------------------------------------------------------ #
async def call_gateway_vendors(item_name: str, industry: str) -> list[dict]:
    """Fetch vendors for an item via Integration Gateway."""
    ck = hashlib.md5(f"v3_vendors:{industry}:{item_name.lower()}".encode()).hexdigest()

    # Check cache
    if redis_client:
        try:
            cached = await redis_client.get(ck)
            if cached:
                log.info(f"Cache HIT: vendors for {item_name}")
                return json.loads(cached)
        except Exception as e:
            log.warning(f"Cache read error: {e}")

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{GATEWAY_URL}/vendors/item/{item_name}",
            headers={"X-API-KEY": GATEWAY_KEY},
            params={"industry": industry},
        )
        if resp.status_code == 404:
            log.warning(f"No vendors found for {item_name} in {industry}")
            return []
        resp.raise_for_status()
        data = resp.json()
        vendors = data.get("vendors", [])

    # Cache
    if redis_client and vendors:
        try:
            await redis_client.setex(ck, CACHE_TTL, json.dumps(vendors))
        except Exception as e:
            log.warning(f"Cache write error: {e}")

    return vendors


# ------------------------------------------------------------------ #
# Core logic                                                           #
# ------------------------------------------------------------------ #
async def recommend_vendors(inventory_eval: dict) -> dict:
    """
    For each shortage item in the inventory evaluation,
    find and rank vendors, then return recommendations.
    """
    request_id   = inventory_eval["request_id"]
    shortage_items = inventory_eval.get("shortages", [])

    log.info(f"Finding vendors for request {request_id}, {len(shortage_items)} shortage items")

    recommendations = []

    for item in shortage_items:
        item_desc    = item["item_description"]
        req_qty      = item["shortage_quantity"]  # only order the shortage amount
        industry     = item["industry"]

        agent_status["current_task"] = f"Fetching vendors: {item_desc}"

        # Get vendors from gateway
        raw_vendors = await call_gateway_vendors(item_desc, industry)

        if not raw_vendors:
            recommendations.append({
                "item_description": item_desc,
                "requested_quantity": req_qty,
                "industry": industry,
                "vendors_found": 0,
                "best_vendor": None,
                "all_vendors": [],
                "recommendation": "NO_VENDOR_FOUND",
                "notes": "No vendors found in system. Consider onboarding new vendor.",
            })
            log.warning(f"  {item_desc}: No vendors found")
            continue

        # Score vendors
        scored_vendors = score_vendors(raw_vendors, req_qty)
        best           = scored_vendors[0]

        log.info(
            f"  {item_desc}: {len(scored_vendors)} vendors found. "
            f"Best: {best['vendor_name']} "
            f"(score={best['score']}, price={best['unit_price']}, lead={best['lead_time_days']}d)"
        )

        recommendations.append({
            "item_name":         item_desc,
            "item_description":  item_desc,
            "requested_quantity": req_qty,
            "quantity":          req_qty,
            "industry":          industry,
            "shortage_cost":     item.get("shortage_cost", 0.0),
            "vendors_found":     len(scored_vendors),
            "vendor_name":       best.get("vendor_name"),
            "vendor_id":         best.get("vendor_id"),
            "unit_price":        best.get("unit_price", 0.0),
            "total_price":       best.get("total_cost", 0.0),
            "lead_time_days":    best.get("lead_time_days", 0),
            "score":             best.get("score", 0.0),
            "composite_score":   best.get("score", 0.0),
            "best_vendor": {
                "vendor_id":     best.get("vendor_id"),
                "vendor_name":   best["vendor_name"],
                "city":          best.get("city", ""),
                "rating":        best.get("rating"),
                "unit_price":    best.get("unit_price"),
                "lead_time_days": best.get("lead_time_days"),
                "min_order_qty": best.get("min_order_qty"),
                "availability":  best.get("availability"),
                "total_cost":    best.get("total_cost"),
                "score":         best.get("score"),
                "can_fulfill":   best.get("can_fulfill"),
            },
            "all_vendors":    scored_vendors[:5],  # top 5
            "recommendation": "VENDOR_SELECTED" if best.get("can_fulfill") else "PARTIAL_FULFILL",
            "scoring_weights": {
                "rating": WEIGHT_RATING,
                "price":  WEIGHT_PRICE,
                "lead_time": WEIGHT_LEAD_TIME,
            },
        })

    total_recommended_cost = sum(
        r["best_vendor"]["total_cost"]
        for r in recommendations
        if r.get("best_vendor")
    )

    result = {
        "request_id":            request_id,
        "recommended_at":        datetime.utcnow().isoformat(),
        "total_shortage_items":  len(shortage_items),
        "vendors_found":         len([r for r in recommendations if r.get("best_vendor")]),
        "no_vendor_items":       len([r for r in recommendations if not r.get("best_vendor")]),
        "total_recommended_cost": round(total_recommended_cost, 2),
        "recommendations":       recommendations,
        "original_evaluation":   inventory_eval,
    }

    # Cache result in Redis for Agent 3 lookup
    if redis_client:
        try:
            ck = hashlib.md5(f"v3_rec:{request_id}".encode()).hexdigest()
            await redis_client.setex(ck, CACHE_TTL, json.dumps(result))
            log.info(f"Cached vendor recommendations in Redis for request {request_id}")
        except Exception as e:
            log.warning(f"Cache write error for recommendations: {e}")

    # Log event to procurement_db
    await log_procurement_event({
        "event_id":    f"evt_vend_{hashlib.md5(f'{request_id}:{datetime.utcnow().isoformat()}'.encode()).hexdigest()[:12]}",
        "event_type":  "VENDOR_RECOMMENDED",
        "topic":       TOPIC_OUT,
        "source_agent": "agent_3",
        "payload": {
            "request_id":            request_id,
            "total_shortage_items":  len(shortage_items),
            "vendors_found":         result["vendors_found"],
            "total_recommended_cost": result["total_recommended_cost"],
        },
    })

    # If Kafka producer is available, publish to Kafka
    if producer:
        try:
            out_event = {
                "event_type":    "VENDOR_RECOMMENDED",
                "source_agent":  "agent_3",
                "request_id":    request_id,
                "recommended_at": result["recommended_at"],
                "payload":       result,
            }
            await producer.send_and_wait(
                TOPIC_OUT,
                json.dumps(out_event).encode(),
                key=str(request_id).encode(),
            )
            log.info(f"Published vendor recommendation for request {request_id} â†’ {TOPIC_OUT}")
        except Exception as e:
            log.warning(f"Failed to publish event to Kafka: {e}")

    agent_status["status"] = "running"
    agent_status["events_processed"] += 1
    agent_status["last_event_at"]    = datetime.utcnow().isoformat()
    agent_status["current_task"]     = f"Recommended vendors for request #{request_id} ({result['vendors_found']} matched)"

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
                    group_id="agent3-vendor-group",
                    auto_offset_reset="earliest",
                )
                await c.start()
                consumer = c
                log.info(f"Kafka consumer started on {TOPIC_IN}")
                agent_status["status"] = "running"
                agent_status["current_task"] = "Waiting for inventory evaluations..."

            if consumer:
                async for msg in consumer:
                    try:
                        event      = json.loads(msg.value.decode())
                        event_type = event.get("event_type")

                        if event_type != "INVENTORY_EVALUATED":
                            continue

                        request_id     = event.get("request_id")
                        inventory_eval = event.get("payload", {})
                        log.info(f"Received INVENTORY_EVALUATED for request_id={request_id}")

                        if inventory_eval.get("all_items_available"):
                            log.info(f"Request {request_id}: All items in stock. No vendor action needed.")
                            continue

                        await recommend_vendors(inventory_eval)

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
    if producer: await producer.stop()
    if consumer: await consumer.stop()
    if redis_client: await redis_client.aclose()


# ------------------------------------------------------------------ #
# REST API â€” for frontend and monitoring                              #
# ------------------------------------------------------------------ #
@app.get("/health")
async def health():
    return {"status": "ok", "service": "agent3-vendor", **agent_status}


@app.get("/status")
async def status():
    return agent_status


@app.post("/recommend", summary="Manually trigger vendor recommendation")
async def manual_recommend(inventory_eval: dict):
    """
    Manually trigger vendor recommendation with an inventory evaluation payload.
    Useful for testing without Kafka.
    """
    try:
        result = await recommend_vendors(inventory_eval)
        return result
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/recommend/{request_id}/result", summary="Get cached recommendation")
async def get_recommendation(request_id: int):
    """Returns cached vendor recommendation if available."""
    if not redis_client:
        raise HTTPException(503, "Cache not available")
    ck = hashlib.md5(f"v3_rec:{request_id}".encode()).hexdigest()
    cached = await redis_client.get(ck)
    if not cached:
        raise HTTPException(404, f"No cached recommendation for request {request_id}")
    return json.loads(cached)

