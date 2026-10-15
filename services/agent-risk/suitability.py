"""PO-specific vendor suitability using company history and master capabilities."""

from __future__ import annotations

from datetime import date, datetime
from math import isfinite
import re
from typing import Any, Dict, List, Optional

from labeler import DEFAULT_COMPANY_RULES, ProvisionalLabeler


def _number(value: Any) -> Optional[float]:
    try:
        number = float(value)
        return number if isfinite(number) else None
    except (TypeError, ValueError):
        return None


def _aggregate_history(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    metric_fields = (
        "on_time_rate", "delay_days", "lead_time", "defect_rate", "return_rate",
        "price_variance", "compliance_score", "violations",
    )
    result: Dict[str, Any] = {"vendor_id": records[0]["vendor_id"]}
    for field in metric_fields:
        values = [_number(row.get(field)) for row in records]
        valid = [value for value in values if value is not None]
        if valid:
            result[field] = sum(valid) / len(valid)
    result["iso_certified"] = any(
        str(row.get("iso_certified", "")).strip().lower() in {"true", "yes", "1", "y"}
        for row in records
    )
    result["spend_tier"] = records[-1].get("spend_tier") or "Medium"
    ratings = [_number(row.get("rating")) for row in records]
    valid_ratings = [rating for rating in ratings if rating is not None and 1.0 <= rating <= 5.0]
    if valid_ratings:
        result["rating"] = sum(valid_ratings) / len(valid_ratings)
    outcomes: Dict[str, int] = {}
    for row in records:
        outcome = str(row.get("actual_order_outcome") or "").strip().casefold()
        if outcome:
            outcomes[outcome] = outcomes.get(outcome, 0) + 1
    if outcomes:
        result["outcome_counts"] = outcomes
    return result


def _matching_product(vendor: Dict[str, Any], item: str, category: Optional[str]) -> Optional[Dict[str, Any]]:
    requested = " ".join(item.casefold().split())
    requested_tokens = re.findall(r"[a-z0-9]+", requested)
    normalized_requested = {token[:-1] if token.endswith("s") and len(token) > 3 else token for token in requested_tokens}
    normalized_category = " ".join(re.findall(r"[a-z0-9]+", str(category or "").casefold()))
    products = vendor.get("supported_products") or []
    for product in products:
        product_name = " ".join(str(product.get("item_name", "")).casefold().split())
        product_tokens = re.findall(r"[a-z0-9]+", product_name)
        normalized_product = {token[:-1] if token.endswith("s") and len(token) > 3 else token for token in product_tokens}
        product_category = str(product.get("category") or "").strip().casefold()
        name_match = bool(normalized_requested) and normalized_requested.issubset(normalized_product)
        category_request = bool(normalized_category) and normalized_requested.issubset(set(normalized_category.split()))
        category_match = category_request and product_category == str(category).strip().casefold()
        if name_match or category_match:
            return product
    return None


def _deadline_days(value: Any) -> Optional[int]:
    if value is None or not str(value).strip():
        return None
    try:
        target = date.fromisoformat(str(value)[:10])
    except ValueError:
        return -1
    return (target - date.today()).days


def _risk_profile(
    metrics: Optional[Dict[str, Any]],
    records_count: int,
    labeler: ProvisionalLabeler,
    model: Any = None,
    preprocessor: Any = None,
    minimum_history: int = 3,
) -> Dict[str, Any]:
    if metrics is None or records_count < minimum_history:
        return {
            "status": "insufficient_data",
            "risk_level": None,
            "risk_score": None,
            "confidence": None,
            "risk_factors": [
                f"Only {records_count} valid historical orders; {minimum_history} required for risk classification."
            ],
            "supporting_metrics": metrics or {},
        }

    if model is not None and preprocessor is not None:
        features, _ = preprocessor.transform_inference_data([metrics])
        risk_level = str(model.predict(features)[0])
        probabilities = model.predict_proba(features)[0]
        confidence = max(probabilities.values()) if probabilities else None
        scores = labeler.compute_pillar_scores(metrics)
        factors = model.explain_prediction(metrics, probabilities)
        return {
            "status": "scored",
            "risk_level": risk_level,
            "risk_score": scores["risk_score"],
            "confidence": confidence,
            "risk_factors": factors,
            "supporting_metrics": metrics,
            "probabilities": probabilities,
            "model_version": model.version,
        }

    risk_level, factors = labeler.generate_provisional_label(metrics)
    scores = labeler.compute_pillar_scores(metrics)
    return {
        "status": "scored",
        "risk_level": risk_level,
        "risk_score": scores["risk_score"],
        "confidence": None,
        "risk_factors": factors,
        "supporting_metrics": metrics,
        "probabilities": None,
        "model_version": None,
    }


def evaluate_po_suitability(
    request: Dict[str, Any],
    vendor_master: List[Dict[str, Any]],
    performance_records: List[Dict[str, Any]],
    company_rules: Optional[Dict[str, Any]] = None,
    model: Any = None,
    preprocessor: Any = None,
) -> Dict[str, Any]:
    """Filter hard PO requirements before ranking vendors and planning split awards."""
    company_id = str(request.get("company_id") or request.get("industry") or "")
    item = str(request.get("item") or request.get("item_description") or "").strip()
    quantity = int(request.get("shortage_quantity") or 0)
    if not company_id or not item or quantity <= 0:
        raise ValueError("company_id, item, and a positive shortage_quantity are required.")

    rules = company_rules or DEFAULT_COMPANY_RULES
    suitability_rules = rules.get("suitability", {})
    minimum_history = int(suitability_rules.get("min_history_orders", 3))
    weights = {
        "capability": float(suitability_rules.get("capability_weight", 0.15)),
        "delivery": float(suitability_rules.get("delivery_weight", 0.20)),
        "quality": float(suitability_rules.get("quality_weight", 0.15)),
        "pricing": float(suitability_rules.get("pricing_weight", 0.15)),
        "compliance": float(suitability_rules.get("compliance_weight", 0.15)),
        "risk": float(suitability_rules.get("risk_weight", 0.20)),
    }
    labeler = ProvisionalLabeler(rules=rules)
    history_by_vendor: Dict[str, List[Dict[str, Any]]] = {}
    for record in performance_records:
        history_by_vendor.setdefault(str(record["vendor_id"]), []).append(record)

    available_inventory = int(request.get("available_inventory") or 0)
    max_quantity = int(request.get("required_quantity") or (quantity + available_inventory))
    max_unit_price = _number(request.get("max_unit_price"))
    total_budget = _number(request.get("budget") or request.get("max_total_price"))
    category = request.get("category")
    deadline_days = _deadline_days(request.get("delivery_deadline"))
    if deadline_days == -1:
        raise ValueError("delivery_deadline must be an ISO date.")
    explicit_max_days = request.get("max_delivery_days")
    if explicit_max_days is not None:
        max_delivery_days = int(explicit_max_days)
        deadline_days = max_delivery_days if deadline_days is None else min(deadline_days, max_delivery_days)
    required_certs = {str(value).casefold() for value in request.get("required_certifications", [])}
    min_quality = _number(request.get("minimum_quality_score"))
    min_compliance = _number(request.get("minimum_compliance_score"))

    evaluated: List[Dict[str, Any]] = []
    excluded: List[Dict[str, Any]] = []
    for vendor in vendor_master:
        if str(vendor.get("company_id")) != company_id:
            continue
        vendor_id = str(vendor.get("vendor_id", ""))
        if not vendor.get("active_status", False):
            excluded.append({"vendor_id": vendor_id, "reason": "Vendor is inactive."})
            continue
        product = _matching_product(vendor, item, category)
        if product is None:
            excluded.append({"vendor_id": vendor_id, "reason": f"Does not list {item} or the requested category."})
            continue
        availability = str(product.get("availability", "")).strip().casefold()
        if availability not in {"in stock", "available", "active"}:
            excluded.append({"vendor_id": vendor_id, "reason": f"Product availability is '{availability or 'unknown'}'."})
            continue

        capacity = _number(product.get("capacity"))
        if capacity is None:
            capacity = _number((vendor.get("capacity") or {}).get(product.get("item_name")))
        # Unknown capacity is allowed; explicitly zero capacity is not.
        if capacity is not None and capacity <= 0:
            excluded.append({"vendor_id": vendor_id, "reason": "No available capacity for this product."})
            continue
        unit_price = _number(product.get("unit_price"))
        lead_days = _number(product.get("lead_time_days"))
        min_order = int(product.get("min_order_qty") or 1)
        if unit_price is None or unit_price < 0 or lead_days is None or lead_days < 0:
            excluded.append({"vendor_id": vendor_id, "reason": "Price or lead-time data is invalid."})
            continue
        if deadline_days is not None and lead_days > deadline_days:
            excluded.append({"vendor_id": vendor_id, "reason": f"Lead time {lead_days:g} days exceeds the {deadline_days}-day deadline."})
            continue
        if max_unit_price is not None and unit_price > max_unit_price:
            excluded.append({"vendor_id": vendor_id, "reason": f"Unit price {unit_price:g} exceeds PO limit {max_unit_price:g}."})
            continue
        certifications = {str(value).casefold() for value in (vendor.get("certifications") or [])}
        if not required_certs.issubset(certifications):
            missing = sorted(required_certs - certifications)
            excluded.append({"vendor_id": vendor_id, "reason": f"Missing required certification(s): {', '.join(missing)}."})
            continue

        history = history_by_vendor.get(vendor_id, [])
        metrics = _aggregate_history(history) if history else None
        risk = _risk_profile(metrics, len(history), labeler, model, preprocessor, minimum_history)
        if min_quality is not None:
            if metrics is None or metrics.get("defect_rate") is None:
                excluded.append({"vendor_id": vendor_id, "reason": "Cannot verify required quality score from history."})
                continue
            quality_score = max(0.0, 100.0 - metrics["defect_rate"] * 800.0 - metrics.get("return_rate", 0.0) * 500.0)
            if quality_score < min_quality:
                excluded.append({"vendor_id": vendor_id, "reason": f"Quality score {quality_score:.1f} is below required {min_quality:g}."})
                continue
        if min_compliance is not None:
            if metrics is None or metrics.get("compliance_score") is None:
                excluded.append({"vendor_id": vendor_id, "reason": "Cannot verify required compliance from history."})
                continue
            if metrics["compliance_score"] < min_compliance:
                excluded.append({"vendor_id": vendor_id, "reason": f"Compliance score {metrics['compliance_score']:.1f} is below required {min_compliance:g}."})
                continue

        # Unknown capacity gets a neutral capability score; verified capacity is scored normally.
        capacity_score = 75.0 if capacity is None else min(100.0, capacity / max(quantity, 1) * 100.0)
        components = {"capability": capacity_score, "pricing": 100.0}
        if max_unit_price is not None and max_unit_price > 0:
            components["pricing"] = max(0.0, min(100.0, (max_unit_price - unit_price) / max_unit_price * 100.0))
        elif total_budget is not None and total_budget > 0:
            components["pricing"] = max(0.0, min(100.0, (total_budget / quantity - unit_price) / (total_budget / quantity) * 100.0))

        if capacity is None:
            reasons = [f"Product capability matches {product.get('item_name')}; current capacity is unverified."]
        else:
            reasons = [f"Can supply up to {int(capacity)} units of {product.get('item_name')}."]
        if deadline_days is not None:
            reasons.append(f"Lead time {lead_days:g} days meets the {deadline_days}-day delivery requirement.")
        if metrics is not None:
            on_time = metrics.get("on_time_rate")
            delay = metrics.get("delay_days")
            if on_time is not None:
                delivery_score = max(0.0, min(100.0, on_time * 70 + max(0.0, 30 - (delay or 0) * 3.5)))
                outcomes = metrics.get("outcome_counts", {})
                completed = sum(outcomes.values())
                on_time_outcomes = sum(
                    count for name, count in outcomes.items()
                    if any(token in name for token in ("on_time", "on-time", "perfect", "delivered"))
                )
                if completed:
                    outcome_score = on_time_outcomes / completed * 100.0
                    delivery_score = delivery_score * 0.75 + outcome_score * 0.25
                components["delivery"] = delivery_score
                reasons.append(f"Historical on-time rate is {on_time:.1%}; average delay is {(delay or 0):.1f} days.")
            defect = metrics.get("defect_rate")
            quality_score = None
            if defect is not None:
                quality_score = max(0.0, min(100.0, 100 - defect * 800 - metrics.get("return_rate", 0.0) * 500))
                reasons.append(f"Historical defect rate is {defect:.1%}.")
            if metrics.get("rating") is not None:
                rating_score = max(0.0, min(100.0, (metrics["rating"] - 1.0) * 25.0))
                quality_score = rating_score if quality_score is None else quality_score * 0.7 + rating_score * 0.3
                reasons.append(f"Average historical vendor rating is {metrics['rating']:.2f}/5.")
            if quality_score is not None:
                components["quality"] = quality_score
            compliance = metrics.get("compliance_score")
            if compliance is not None:
                components["compliance"] = max(0.0, min(100.0, compliance - metrics.get("violations", 0.0) * 12))
                reasons.append(f"Historical compliance score is {compliance:.1f} with {metrics.get('violations', 0):g} violations.")
            for outcome, count in metrics.get("outcome_counts", {}).items():
                reasons.append(f"Previous outcome '{outcome}' recorded {count} time(s).")
        if metrics is not None and risk["status"] == "scored":
            if risk["risk_score"] is not None:
                components["risk"] = max(0.0, 100.0 - risk["risk_score"])
                reasons.extend(risk["risk_factors"])
        if risk["status"] == "insufficient_data":
            reasons.extend(risk["risk_factors"])
        if product.get("category"):
            reasons.append(f"Supplies category {product['category']}.")

        evaluated.append({
            "vendor_id": vendor_id,
            "purchase_vendor_id": int(vendor["purchase_vendor_id"]),
            "vendor_name": vendor["vendor_name"],
            "product": product.get("item_name"),
            "category": product.get("category"),
            "unit_price": unit_price,
            "lead_time_days": int(lead_days),
            "min_order_qty": min_order,
            "capacity": int(capacity) if capacity is not None else None,
            "suitability_score": 0.0,
            "_score_components": components,
            "risk_level": risk["risk_level"],
            "risk_score": risk["risk_score"],
            "risk_status": risk["status"],
            "confidence": risk["confidence"],
            "risk_factors": risk["risk_factors"],
            "supporting_metrics": risk["supporting_metrics"],
            "model_version": risk.get("model_version"),
            "reasons": reasons,
        })

    if evaluated and max_unit_price is None and total_budget is None:
        prices = [row["unit_price"] for row in evaluated]
        min_price = min(prices)
        max_price = max(prices)
        for row in evaluated:
            spread = max_price - min_price
            row["_score_components"]["pricing"] = (
                100.0 if spread == 0 else 100.0 * (max_price - row["unit_price"]) / spread
            )

    for row in evaluated:
        components = row.pop("_score_components")
        applicable_weight = sum(weights[name] for name in components)
        row["suitability_score"] = round(
            sum(components[name] * weights[name] for name in components) / applicable_weight,
            2,
        )

    evaluated.sort(key=lambda row: (
        row["suitability_score"] * -1,
        row["risk_score"] if row["risk_score"] is not None else 101,
        row["unit_price"],
    ))
    allocations = []
    remaining = quantity
    budget_remaining = total_budget
    for candidate in evaluated:
        if remaining <= 0:
            break
        if budget_remaining is not None:
            budget_capacity = int(budget_remaining // candidate["unit_price"]) if candidate["unit_price"] > 0 else remaining
            capacity = min(candidate["capacity"], budget_capacity)
        else:
            capacity = candidate["capacity"]
        allocation = remaining if capacity is None else min(remaining, capacity)
        if allocation < candidate["min_order_qty"]:
            continue
        candidate_total = round(allocation * candidate["unit_price"], 2)
        allocations.append({
            **candidate,
            "quantity": allocation,
            "total_price": candidate_total,
            "reasons": candidate["reasons"] + [f"Allocated {allocation} of {quantity} requested units."],
        })
        remaining -= allocation
        if budget_remaining is not None:
            budget_remaining -= candidate_total

    status = "suitable" if remaining == 0 else "partial_supply" if allocations else "no_suitable_vendor"
    selected = allocations[0] if allocations else None
    return {
        "status": status,
        "company_id": company_id,
        "item": item,
        "required_quantity": max_quantity,
        "available_inventory": available_inventory,
        "shortage_quantity": quantity,
        "selected_vendor": selected,
        "selected_vendors": allocations,
        "unfilled_quantity": remaining,
        "suitable_vendors": evaluated,
        "excluded_vendors": excluded,
    }



