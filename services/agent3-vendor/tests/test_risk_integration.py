import asyncio
import importlib.util
import sys
import types
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]


def install_optional_runtime_stubs():
    redis_package = types.ModuleType("redis")
    redis_package.__path__ = []
    redis_asyncio = types.ModuleType("redis.asyncio")
    redis_asyncio.Redis = type("Redis", (), {})
    kafka_module = types.ModuleType("aiokafka")
    kafka_module.AIOKafkaConsumer = type("AIOKafkaConsumer", (), {})
    kafka_module.AIOKafkaProducer = type("AIOKafkaProducer", (), {})
    sys.modules.setdefault("redis", redis_package)
    sys.modules.setdefault("redis.asyncio", redis_asyncio)
    sys.modules.setdefault("aiokafka", kafka_module)


def load_module(name, relative_path):
    module_path = REPO_ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


install_optional_runtime_stubs()
agent3 = load_module("agent3_vendor_main_for_risk_test", Path("services/agent3-vendor/main.py"))
agent4 = load_module("agent4_procurement_main_for_risk_test", Path("services/agent4-procurement/main.py"))


async def _risk_split_allocations_flow_to_existing_po_handler():
    inventory_evaluation = {
        "request_id": 808,
        "shortages": [{
            "item_description": "Bearings (SKF 6205)",
            "requested_quantity": 13,
            "stock_quantity": 3,
            "shortage_quantity": 10,
            "shortage_cost": 3000,
            "industry": "manufacturing",
            "delivery_deadline": "2026-11-01",
            "has_shortage": True,
        }],
    }
    risk_result = {
        "status": "suitable",
        "company_id": "manufacturing",
        "item": "Bearings (SKF 6205)",
        "required_quantity": 13,
        "available_inventory": 3,
        "shortage_quantity": 10,
        "unfilled_quantity": 0,
        "suitable_vendors": [],
        "excluded_vendors": [],
        "selected_vendors": [
            {
                "vendor_id": "V-MFG-001",
                "purchase_vendor_id": 1,
                "vendor_name": "SKF India Ltd",
                "unit_price": 10.0,
                "lead_time_days": 2,
                "min_order_qty": 1,
                "quantity": 4,
                "total_price": 40.0,
                "suitability_score": 91.0,
                "risk_level": "Low",
                "risk_score": 9.0,
                "risk_status": "scored",
                "risk_factors": ["Consistent delivery performance"],
                "reasons": ["Can supply allocated quantity."],
                "supporting_metrics": {"rating": 4.8},
            },
            {
                "vendor_id": "V-MFG-002",
                "purchase_vendor_id": 2,
                "vendor_name": "Bosch India",
                "unit_price": 12.0,
                "lead_time_days": 4,
                "min_order_qty": 1,
                "quantity": 6,
                "total_price": 72.0,
                "suitability_score": 82.0,
                "risk_level": "Medium",
                "risk_score": 30.0,
                "risk_status": "scored",
                "risk_factors": ["Some late deliveries"],
                "reasons": ["Can supply remaining quantity."],
                "supporting_metrics": {"rating": 4.6},
            },
        ],
    }

    agent3.redis_client = None
    agent3.producer = None
    with patch.object(agent3, "call_gateway_suitability", new=AsyncMock(return_value=risk_result)) as risk_call, \
         patch.object(agent3, "log_procurement_event", new=AsyncMock()):
        recommendation = await agent3.recommend_vendors(inventory_evaluation)

    payload = risk_call.await_args.args[0]
    assert payload["company_id"] == "manufacturing"
    assert payload["item"] == "Bearings (SKF 6205)"
    assert payload["required_quantity"] == 13
    assert payload["available_inventory"] == 3
    assert payload["shortage_quantity"] == 10
    assert payload.get("budget") is None
    assert [row["quantity"] for row in recommendation["recommendations"]] == [4, 6]
    assert all(row["delivery_date_expected"] == "2026-11-01" for row in recommendation["recommendations"])

    created_payloads = []

    async def fake_create_purchase_order(po_payload):
        created_payloads.append(po_payload)
        return {**po_payload, "id": len(created_payloads)}

    agent4.producer = None
    with patch.object(agent4, "create_purchase_order", side_effect=fake_create_purchase_order), \
         patch.object(agent4, "send_approval_email"), \
         patch.object(agent4, "log_procurement_event", new=AsyncMock()):
        result = await agent4.process_vendor_recommendation(recommendation)

    assert result["pos_created"] == 2
    assert [payload["quantity"] for payload in created_payloads] == [4, 6]
    assert [payload["vendor_id"] for payload in created_payloads] == [1, 2]
    assert [payload["unit_price"] for payload in created_payloads] == [10.0, 12.0]
    assert [payload["delivery_date_expected"] for payload in created_payloads] == ["2026-11-01", "2026-11-01"]
    assert "Historical risk: Low" in created_payloads[0]["notes"]
    assert "PO suitability score: 91.0" in created_payloads[0]["notes"]
    assert "Consistent delivery performance" in created_payloads[0]["notes"]
    assert all(payload["item_name"] == "Bearings (SKF 6205)" for payload in created_payloads)


def test_risk_split_allocations_flow_to_existing_po_handler():
    asyncio.run(_risk_split_allocations_flow_to_existing_po_handler())
