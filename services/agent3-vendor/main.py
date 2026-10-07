"""
Agent 3 — Vendor Intelligence Agent
====================================
Listens on: inventory-evaluation-topic
Publishes to: vendor-recommendation-topic

Workflow:
  1. Consume inventory evaluation event from Kafka
  2. For each shortage item -> call Integration Gateway -> Risk suitability API
  3. Score and rank vendors through Risk Agent
  4. Select suitable vendor(s) per item
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
from dotenv import load_dotenv


load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] Agent3 | %(message)s",
)

log = logging.getLogger("agent3-vendor")


app = FastAPI(
    title="Agent 3 — Vendor Intelligence Agent",
    description=(
        "Finds and ranks best vendors for shortage items. "
        "Communicates only via APIs and Kafka."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------ #
# Config
# ------------------------------------------------------------------ #

KAFKA_SERVERS = os.getenv(
    "KAFKA_BOOTSTRAP_SERVERS",
    "localhost:9092",
)

TOPIC_IN = os.getenv(
    "KAFKA_TOPIC_INVENTORY_EVAL",
    "inventory-evaluation-topic",
)

TOPIC_OUT = os.getenv(
    "KAFKA_TOPIC_VENDOR_RECOMMEND",
    "vendor-recommendation-topic",
)

GATEWAY_URL = os.getenv(
    "INTEGRATION_GATEWAY_URL",
    "http://localhost:8000",
)

GATEWAY_KEY = os.getenv(
    "GATEWAY_KEY",
    "GATEWAY-master-key-2024",
)

PROCUREMENT_SVC_URL = os.getenv(
    "PROCUREMENT_SERVICE_URL",
    "http://localhost:8004",
)

PROCUREMENT_KEY = os.getenv(
    "PROCUREMENT_KEY",
    "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012",
)

REDIS_HOST = os.getenv(
    "REDIS_HOST",
    "localhost",
)

REDIS_PORT = int(
    os.getenv("REDIS_PORT", "6379")
)

REDIS_PASSWORD = os.getenv(
    "REDIS_PASSWORD",
    "RedisPass@2024",
)

CACHE_TTL = int(
    os.getenv("CACHE_TTL_SECONDS", "600")
)


# ------------------------------------------------------------------ #
# Global state
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
# API helpers
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
        log.warning(
            f"Could not log procurement event: {e}"
        )


async def call_gateway_suitability(request_payload: dict) -> dict:
    """
    Ask Agent 5 to score company risk and PO-specific eligibility.

    HTTP 409 is treated as a normal business result indicating that
    no suitable vendor was found for this particular shortage item.
    Other HTTP errors remain fatal.
    """

    async with httpx.AsyncClient(timeout=45.0) as client:

        response = await client.post(
            f"{GATEWAY_URL}/risk/suitability",
            json=request_payload,
            headers={"X-API-KEY": GATEWAY_KEY},
        )

        # ---------------------------------------------------------- #
        # 409 = No suitable vendor for this specific item.
        # Treat it as a business result instead of aborting
        # the entire Agent 3 recommendation process.
        # ---------------------------------------------------------- #

        if response.status_code == 409:

            try:
                error_data = response.json()

            except Exception:
                error_data = {}

            return {
                "status": "NO_SUITABLE_VENDOR",
                "selected_vendors": [],
                "suitable_vendors": error_data.get(
                    "suitable_vendors",
                    [],
                ),
                "excluded_vendors": error_data.get(
                    "excluded_vendors",
                    [],
                ),
                "unfilled_quantity": int(
                    request_payload.get(
                        "shortage_quantity",
                        0,
                    )
                    or 0
                ),
                "reason": error_data.get(
                    "detail",
                    "No suitable vendor found for this shortage.",
                ),
            }

        # All other HTTP errors remain fatal.
        response.raise_for_status()

        return response.json()


# ------------------------------------------------------------------ #
# Core logic
# ------------------------------------------------------------------ #

async def recommend_vendors(inventory_eval: dict):
    """
    For each shortage item in the inventory evaluation,
    find and rank vendors, then return recommendations.
    """

    request_id = inventory_eval["request_id"]

    # -------------------------------------------------------------- #
    # Idempotency protection.
    # Prevent the same inventory request from being processed twice
    # when both the Kafka path and REST/manual path are triggered.
    # -------------------------------------------------------------- #
    cache_key = hashlib.md5(
        f"v3_rec:{request_id}".encode()
    ).hexdigest()

    lock_key = hashlib.md5(
        f"v3_rec_lock:{request_id}".encode()
    ).hexdigest()

    if redis_client:
        existing = await redis_client.get(cache_key)

        if existing:
            log.info(
                f"Request {request_id} already processed — "
                f"returning cached recommendation"
            )
            return json.loads(existing)

        # Atomic Redis lock prevents two concurrent calls from
        # processing/publishing the same request.
        lock_acquired = await redis_client.set(
            lock_key,
            "1",
            ex=max(CACHE_TTL, 300),
            nx=True,
        )

        if not lock_acquired:
            log.warning(
                f"Request {request_id} is already being processed — "
                f"skipping duplicate recommendation"
            )

            # Give the first worker a short window to finish and
            # return the cached result if it becomes available.
            for _ in range(50):
                existing = await redis_client.get(cache_key)

                if existing:
                    return json.loads(existing)

                await asyncio.sleep(0.2)

            return {
                "request_id": request_id,
                "status": "ALREADY_PROCESSING",
                "recommendations": [],
                "message": (
                    "Vendor recommendation is already being "
                    "processed for this request."
                ),
            }
      

    shortage_items = inventory_eval.get(
        "shortages",
        [],
    )

    log.info(
        f"Finding vendors for request {request_id}, "
        f"{len(shortage_items)} shortage items"
    )

    recommendations = []

    for item in shortage_items:

        item_desc = item["item_description"]

        req_qty = item[
            "shortage_quantity"
        ]

        industry = item[
            "industry"
        ]

        agent_status["current_task"] = (
            f"Evaluating PO suitability: {item_desc}"
        )

        suitability_request = {
            "request_id": request_id,
            "company_id": industry,
            "item": item_desc,
            "category": item.get("category"),
            "required_quantity": int(
                item.get(
                    "requested_quantity",
                    req_qty
                    + item.get(
                        "stock_quantity",
                        0,
                    ),
                )
            ),
            "available_inventory": int(
                item.get(
                    "stock_quantity",
                    0,
                )
                or 0
            ),
            "shortage_quantity": int(
                req_qty
            ),
            "delivery_deadline": (
                item.get("delivery_deadline")
                or item.get("required_delivery_date")
            ),
            "max_delivery_days": item.get(
                "max_delivery_days"
            ),
            "max_unit_price": item.get(
                "max_unit_price"
            ),
            "budget": (
                item.get("po_budget")
                or item.get("budget")
            ),
            "minimum_quality_score": item.get(
                "minimum_quality_score"
            ),
            "minimum_compliance_score": item.get(
                "minimum_compliance_score"
            ),
            "required_certifications": (
                item.get(
                    "required_certifications"
                )
                or []
            ),
        }

        # ---------------------------------------------------------- #
        # Call Risk Agent through Gateway.
        # A 409 is converted into a normal business result.
        # ---------------------------------------------------------- #

        suitability = await call_gateway_suitability(
            suitability_request
        )

        allocations = suitability.get(
            "selected_vendors",
            [],
        )

        suitable_vendors = suitability.get(
            "suitable_vendors",
            [],
        )

        # ---------------------------------------------------------- #
        # No vendor for this specific shortage.
        # Record it and continue with the next shortage item.
        # ---------------------------------------------------------- #

        if not allocations:

            recommendations.append(
                {
                    "item_name": item_desc,
                    "item_description": item_desc,
                    "requested_quantity": req_qty,
                    "quantity": req_qty,
                    "industry": industry,
                    "vendors_found": 0,
                    "best_vendor": None,
                    "all_vendors": suitable_vendors[:5],
                    "recommendation": suitability.get(
                        "status",
                        "NO_SUITABLE_VENDOR",
                    ).upper(),
                    "notes": suitability.get(
                        "reason",
                        "No vendor met the hard PO requirements.",
                    ),
                    "excluded_vendors": suitability.get(
                        "excluded_vendors",
                        [],
                    ),
                }
            )

            log.warning(
                f"  {item_desc}: no suitable vendors "
                f"for shortage of {req_qty}"
            )

            continue

        # ---------------------------------------------------------- #
        # Process selected vendor allocations.
        # ---------------------------------------------------------- #

        for allocation in allocations:

            purchase_vendor_id = int(
                allocation["purchase_vendor_id"]
            )

            quantity = int(
                allocation["quantity"]
            )

            score = float(
                allocation["suitability_score"]
            )

            recommendation_reasons = list(
                dict.fromkeys(
                    [
                        *(allocation.get("reasons") or []),
                        *(allocation.get("risk_factors") or []),
                    ]
                )
            )

            po_vendor = {
                "vendor_id": purchase_vendor_id,
                "risk_vendor_id": allocation["vendor_id"],
                "vendor_name": allocation["vendor_name"],
                "city": allocation.get(
                    "city",
                    "",
                ),
                "rating": allocation.get(
                    "supporting_metrics",
                    {},
                ).get(
                    "rating"
                ),
                "unit_price": allocation["unit_price"],
                "lead_time_days": allocation[
                    "lead_time_days"
                ],
                "min_order_qty": allocation[
                    "min_order_qty"
                ],
                "availability": "In Stock",
                "total_cost": allocation["total_price"],
                "score": score,
                "suitability_score": score,
                "risk_level": allocation.get(
                    "risk_level"
                ),
                "risk_score": allocation.get(
                    "risk_score"
                ),
                "risk_status": allocation.get(
                    "risk_status"
                ),
                "confidence": allocation.get(
                    "confidence"
                ),
                "risk_factors": allocation.get(
                    "risk_factors",
                    [],
                ),
                "reasons": recommendation_reasons,
                "can_fulfill": True,
            }

            recommendations.append(
                {
                    "item_name": item_desc,
                    "item_description": item_desc,
                    "requested_quantity": quantity,
                    "quantity": quantity,
                    "industry": industry,
                    "shortage_cost": allocation[
                        "total_price"
                    ],
                    "vendors_found": len(
                        suitable_vendors
                    ),
                    "vendor_name": allocation[
                        "vendor_name"
                    ],
                    "vendor_id": purchase_vendor_id,
                    "risk_vendor_id": allocation[
                        "vendor_id"
                    ],
                    "unit_price": allocation[
                        "unit_price"
                    ],
                    "total_price": allocation[
                        "total_price"
                    ],
                    "lead_time_days": allocation[
                        "lead_time_days"
                    ],
                    "delivery_date_expected": (
                        item.get("delivery_deadline")
                        or item.get(
                            "required_delivery_date"
                        )
                    ),
                    "score": score,
                    "composite_score": score,
                    "risk_level": allocation.get(
                        "risk_level"
                    ),
                    "risk_score": allocation.get(
                        "risk_score"
                    ),
                    "suitability_score": score,
                    "best_vendor": po_vendor,
                    "all_vendors": suitable_vendors[:5],
                    "recommendation": "VENDOR_SELECTED",
                    "suitability_status": suitability.get(
                        "status"
                    ),
                    "unfilled_quantity": suitability.get(
                        "unfilled_quantity",
                        0,
                    ),
                    "reasons": recommendation_reasons,
                }
            )

        # ---------------------------------------------------------- #
        # Handle partial fulfillment.
        # ---------------------------------------------------------- #

        unfilled = int(
            suitability.get(
                "unfilled_quantity",
                0,
            )
            or 0
        )

        if unfilled:

            recommendations.append(
                {
                    "item_name": item_desc,
                    "item_description": item_desc,
                    "requested_quantity": unfilled,
                    "quantity": unfilled,
                    "industry": industry,
                    "vendors_found": len(
                        suitable_vendors
                    ),
                    "best_vendor": None,
                    "all_vendors": suitable_vendors[:5],
                    "recommendation": "UNFILLED_SHORTAGE",
                    "notes": (
                        f"No remaining capable vendor "
                        f"for {unfilled} units."
                    ),
                }
            )

    # -------------------------------------------------------------- #
    # Calculate total recommended cost.
    # -------------------------------------------------------------- #

    total_recommended_cost = sum(
        r["best_vendor"]["total_cost"]
        for r in recommendations
        if r.get("best_vendor")
    )

    result = {
        "request_id": request_id,
        "recommended_at": datetime.utcnow().isoformat(),
        "total_shortage_items": len(
            shortage_items
        ),
        "vendors_found": len(
            [
                r
                for r in recommendations
                if r.get("best_vendor")
            ]
        ),
        "no_vendor_items": len(
            [
                r
                for r in recommendations
                if not r.get("best_vendor")
            ]
        ),
        "total_recommended_cost": round(
            total_recommended_cost,
            2,
        ),
        "recommendations": recommendations,
        "original_evaluation": inventory_eval,
    }

    # -------------------------------------------------------------- #
    # Cache result in Redis.
    # -------------------------------------------------------------- #

    if redis_client:

        try:

            await redis_client.setex(
                cache_key,
                CACHE_TTL,
                json.dumps(result),
            )

            log.info(
                f"Cached vendor recommendations "
                f"in Redis for request {request_id}"
            )

        except Exception as e:

            log.warning(
                f"Cache write error for recommendations: {e}"
            )

    # -------------------------------------------------------------- #
    # Log event to procurement service.
    # -------------------------------------------------------------- #

    event_id = (
        "evt_vend_"
        + hashlib.md5(
            f"{request_id}:{datetime.utcnow().isoformat()}".encode()
        ).hexdigest()[:12]
    )

    await log_procurement_event(
        {
            "event_id": event_id,
            "event_type": "VENDOR_RECOMMENDED",
            "topic": TOPIC_OUT,
            "source_agent": "agent_3",
            "payload": {
                "request_id": request_id,
                "total_shortage_items": len(
                    shortage_items
                ),
                "vendors_found": result[
                    "vendors_found"
                ],
                "total_recommended_cost": result[
                    "total_recommended_cost"
                ],
                "recommendations": result[
                    "recommendations"
                ],
            },
        }
    )

    # -------------------------------------------------------------- #
    # Publish recommendation to Kafka.
    # -------------------------------------------------------------- #

    if producer:

        try:

            out_event = {
                "event_type": "VENDOR_RECOMMENDED",
                "source_agent": "agent_3",
                "request_id": request_id,
                "recommended_at": result[
                    "recommended_at"
                ],
                "payload": result,
            }

            await producer.send_and_wait(
                TOPIC_OUT,
                json.dumps(
                    out_event
                ).encode(),
                key=str(
                    request_id
                ).encode(),
            )
            log.info(
                f"Published vendor recommendation "
                f"for request {request_id} -> {TOPIC_OUT}"
            )
        except Exception as e:

            log.warning(
                f"Failed to publish event to Kafka: {e}"
            )

    agent_status["status"] = "running"

    agent_status["events_processed"] += 1

    agent_status["last_event_at"] = (
        datetime.utcnow().isoformat()
    )

    agent_status["current_task"] = (
        f"Recommended vendors for request "
        f"#{request_id} "
        f"({result['vendors_found']} matched)"
    )

    if redis_client:
        try:
            await redis_client.delete(lock_key)
        except Exception as e:
            log.warning(
                f"Could not release recommendation lock for "
                f"request {request_id}: {e}"
            )

    return result


# ------------------------------------------------------------------ #
# Kafka supervisor and consumer loop
# ------------------------------------------------------------------ #

async def kafka_supervisor():

    global consumer, producer

    log.info(
        f"Starting Kafka supervisor for {TOPIC_IN}"
    )

    while True:

        try:

            if not producer:

                p = AIOKafkaProducer(
                    bootstrap_servers=KAFKA_SERVERS
                )

                await p.start()

                producer = p

                log.info(
                    "Kafka producer connected successfully"
                )

            if not consumer:

                c = AIOKafkaConsumer(
                    TOPIC_IN,
                    bootstrap_servers=KAFKA_SERVERS,
                    group_id="agent3-vendor-group",
                    auto_offset_reset="earliest",
                )

                await c.start()

                consumer = c

                log.info(
                    f"Kafka consumer started on {TOPIC_IN}"
                )

                agent_status["status"] = "running"

                agent_status["current_task"] = (
                    "Waiting for inventory evaluations..."
                )

            if consumer:

                async for msg in consumer:

                    try:

                        event = json.loads(
                            msg.value.decode()
                        )

                        event_type = event.get(
                            "event_type"
                        )

                        if event_type != "INVENTORY_EVALUATED":
                            continue

                        request_id = event.get(
                            "request_id"
                        )

                        inventory_eval = event.get(
                            "payload",
                            {},
                        )

                        log.info(
                            f"Received INVENTORY_EVALUATED "
                            f"for request_id={request_id}"
                        )

                        if inventory_eval.get(
                            "all_items_available"
                        ):

                            log.info(
                                f"Request {request_id}: "
                                f"All items in stock. "
                                f"No vendor action needed."
                            )

                            continue

                        await recommend_vendors(
                            inventory_eval
                        )

                    except Exception as e:

                        log.error(
                            f"Error processing Kafka event: {e}",
                            exc_info=True,
                        )

        except Exception as e:

            log.warning(
                f"Kafka connection attempt failed: {e}. "
                f"Retrying in 5 seconds..."
            )

            producer = None
            consumer = None

            agent_status["status"] = "degraded"

            await asyncio.sleep(5)


# ------------------------------------------------------------------ #
# FastAPI startup / shutdown
# ------------------------------------------------------------------ #

@app.on_event("startup")
async def startup():

    global redis_client

    try:

        redis_client = aioredis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            password=REDIS_PASSWORD,
            decode_responses=True,
        )

        await redis_client.ping()

        log.info(
            "Redis connected"
        )

    except Exception as e:

        log.warning(
            f"Redis not available: {e}"
        )

        redis_client = None

    asyncio.create_task(
        kafka_supervisor()
    )


@app.on_event("shutdown")
async def shutdown():

    if producer:
        await producer.stop()

    if consumer:
        await consumer.stop()

    if redis_client:
        await redis_client.aclose()


# ------------------------------------------------------------------ #
# REST API — for frontend and monitoring
# ------------------------------------------------------------------ #

@app.get("/health")
async def health():

    return {
        "status": "ok",
        "service": "agent3-vendor",
        **agent_status,
    }


@app.get("/status")
async def status():

    return agent_status


@app.post(
    "/recommend",
    summary="Manually trigger vendor recommendation",
)
async def manual_recommend(
    inventory_eval: dict,
):
    """
    Manually trigger vendor recommendation
    with an inventory evaluation payload.
    Useful for testing without Kafka.
    """

    try:

        result = await recommend_vendors(
            inventory_eval
        )

        return result

    except Exception as e:

        raise HTTPException(
            500,
            str(e),
        )


@app.get(
    "/recommend/{request_id}/result",
    summary="Get cached recommendation",
)
async def get_recommendation(
    request_id: int,
):
    """Returns cached vendor recommendation if available."""

    if not redis_client:

        raise HTTPException(
            503,
            "Cache not available",
        )

    ck = hashlib.md5(
        f"v3_rec:{request_id}".encode()
    ).hexdigest()

    cached = await redis_client.get(
        ck
    )

    if not cached:

        raise HTTPException(
            404,
            f"No cached recommendation for request {request_id}",
        )

    return json.loads(cached)

