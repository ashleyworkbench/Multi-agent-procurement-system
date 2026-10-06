"""
Provisional Labeling & Pillar Scoring Engine
- Evaluates company-approved rules across Delivery, Quality, Pricing, and Compliance
- Assigns provisional Low, Medium, or High risk labels when ground-truth labels are absent
- Explicitly flags records with label_source ("provisional_rule" vs "ground_truth_feedback")
- Computes 0-100 pillar performance scores for Delivery, Quality, Pricing, and Compliance
"""

from typing import Dict, Any, Tuple, List
import logging

log = logging.getLogger("agent-risk.labeler")

DEFAULT_COMPANY_RULES = {
    "delivery": {
        "high_risk_max_on_time": 0.70,
        "high_risk_min_delay_days": 5.0,
        "low_risk_min_on_time": 0.90,
        "low_risk_max_delay_days": 1.0,
    },
    "quality": {
        "high_risk_min_defect_rate": 0.05,
        "high_risk_min_return_rate": 0.03,
        "low_risk_max_defect_rate": 0.015,
        "low_risk_max_return_rate": 0.005,
    },
    "pricing": {
        "high_risk_min_price_variance": 0.12,
        "low_risk_max_price_variance": 0.03,
    },
    "compliance": {
        "high_risk_min_violations": 2,
        "high_risk_max_compliance_score": 65.0,
        "low_risk_min_compliance_score": 88.0,
        "low_risk_max_violations": 0,
    },
    "weights": {
        "delivery": 0.35,
        "quality": 0.30,
        "pricing": 0.15,
        "compliance": 0.20,
    },
    "suitability": {
        "min_history_orders": 3,
        "capability_weight": 0.15,
        "delivery_weight": 0.20,
        "quality_weight": 0.15,
        "pricing_weight": 0.15,
        "compliance_weight": 0.15,
        "risk_weight": 0.20,
    },
    "training": {
        "min_labeled_samples": 30,
        "min_samples_per_class": 3,
    }
}


class ProvisionalLabeler:
    def __init__(self, rules: Dict[str, Any] = None):
        self.rules = rules or DEFAULT_COMPANY_RULES

    def compute_pillar_scores(self, record: Dict[str, Any]) -> Dict[str, float]:
        """
        Computes 0-100 performance scores for each pillar.
        Higher score = better performance / lower risk.
        """
        on_time = float(record.get("on_time_rate", 0.85))
        delay = float(record.get("delay_days", 1.0))
        defect = float(record.get("defect_rate", 0.01))
        ret = float(record.get("return_rate", 0.005))
        price_var = float(record.get("price_variance", 0.02))
        compliance = float(record.get("compliance_score", 85.0))
        violations = float(record.get("violations", 0.0))
        iso = bool(record.get("iso_certified", False))

        # Delivery Score (0-100)
        # on_time (up to 70 pts) + delay penalty (up to 30 pts)
        delivery_score = min(100.0, max(0.0, (on_time * 70.0) + max(0.0, 30.0 - (delay * 3.5))))

        # Quality Score (0-100)
        # 100 minus defect and return penalties
        quality_score = min(100.0, max(0.0, 100.0 - (defect * 800.0) - (ret * 500.0)))

        # Pricing Score (0-100)
        # 100 minus price variance penalty
        pricing_score = min(100.0, max(0.0, 100.0 - (max(0.0, price_var) * 350.0)))

        # Compliance Score (0-100)
        iso_bonus = 5.0 if iso else 0.0
        compliance_score = min(100.0, max(0.0, compliance - (violations * 12.0) + iso_bonus))

        # Composite Risk Score (0 = Lowest Risk, 100 = Critical Risk)
        weights = self.rules.get("weights", DEFAULT_COMPANY_RULES["weights"])
        perf_score = (
            weights["delivery"] * delivery_score +
            weights["quality"] * quality_score +
            weights["pricing"] * pricing_score +
            weights["compliance"] * compliance_score
        )
        risk_score = round(max(0.0, min(100.0, 100.0 - perf_score)), 2)

        return {
            "delivery_score": round(delivery_score, 2),
            "quality_score": round(quality_score, 2),
            "pricing_score": round(pricing_score, 2),
            "compliance_score": round(compliance_score, 2),
            "risk_score": risk_score,
        }

    def generate_provisional_label(self, record: Dict[str, Any]) -> Tuple[str, List[str]]:
        """
        Classifies record into Low, Medium, or High risk using company rules.
        Returns (label, reasons_list).
        """
        on_time = float(record.get("on_time_rate", 0.85))
        delay = float(record.get("delay_days", 1.0))
        defect = float(record.get("defect_rate", 0.01))
        ret = float(record.get("return_rate", 0.005))
        price_var = float(record.get("price_variance", 0.02))
        compliance = float(record.get("compliance_score", 85.0))
        violations = float(record.get("violations", 0.0))

        d_rules = self.rules.get("delivery", DEFAULT_COMPANY_RULES["delivery"])
        q_rules = self.rules.get("quality", DEFAULT_COMPANY_RULES["quality"])
        p_rules = self.rules.get("pricing", DEFAULT_COMPANY_RULES["pricing"])
        c_rules = self.rules.get("compliance", DEFAULT_COMPANY_RULES["compliance"])

        high_risk_reasons = []
        low_risk_reasons = []

        # Check High Risk Gates
        if on_time < d_rules["high_risk_max_on_time"]:
            high_risk_reasons.append(f"On-time rate ({on_time:.1%}) below threshold {d_rules['high_risk_max_on_time']:.1%}")
        if delay >= d_rules["high_risk_min_delay_days"]:
            high_risk_reasons.append(f"Average delay ({delay:.1f} days) exceeds threshold {d_rules['high_risk_min_delay_days']} days")
        if defect >= q_rules["high_risk_min_defect_rate"]:
            high_risk_reasons.append(f"Defect rate ({defect:.1%}) exceeds threshold {q_rules['high_risk_min_defect_rate']:.1%}")
        if violations >= c_rules["high_risk_min_violations"]:
            high_risk_reasons.append(f"Compliance violations ({violations}) exceed threshold {c_rules['high_risk_min_violations']}")
        if compliance <= c_rules["high_risk_max_compliance_score"]:
            high_risk_reasons.append(f"Compliance score ({compliance:.1f}) below threshold {c_rules['high_risk_max_compliance_score']}")
        if price_var >= p_rules["high_risk_min_price_variance"]:
            high_risk_reasons.append(f"Price variance ({price_var:.1%}) exceeds threshold {p_rules['high_risk_min_price_variance']:.1%}")

        if high_risk_reasons:
            return "High", high_risk_reasons

        # Check Low Risk Gates
        is_low_delivery = (on_time >= d_rules["low_risk_min_on_time"]) and (delay <= d_rules["low_risk_max_delay_days"])
        is_low_quality = (defect <= q_rules["low_risk_max_defect_rate"]) and (ret <= q_rules["low_risk_max_return_rate"])
        is_low_pricing = price_var <= p_rules["low_risk_max_price_variance"]
        is_low_compliance = (compliance >= c_rules["low_risk_min_compliance_score"]) and (violations <= c_rules["low_risk_max_violations"])

        if is_low_delivery and is_low_quality and is_low_compliance:
            low_risk_reasons.append("Consistently high on-time delivery rate with minimal delay")
            low_risk_reasons.append("Negligible defect and return rates")
            low_risk_reasons.append("Exemplary compliance history and zero audit violations")
            return "Low", low_risk_reasons

        # Default to Medium Risk
        med_reasons = []
        if on_time < 0.90:
            med_reasons.append(f"Moderate delivery fulfillment ({on_time:.1%})")
        if defect > 0.015:
            med_reasons.append(f"Minor defect variance ({defect:.1%})")
        if price_var > 0.03:
            med_reasons.append(f"Slight price fluctuation ({price_var:.1%})")
        if not med_reasons:
            med_reasons.append("Performance metrics within standard operational boundaries")

        return "Medium", med_reasons

    def resolve_label_and_source(self, record: Dict[str, Any]) -> Tuple[str, str, List[str]]:
        """
        Determines the label and its source:
        - If ground_truth_risk or actual_risk_label is present -> 'ground_truth_feedback'
        - Else generates provisional rule label -> 'provisional_rule'
        """
        verified_label = record.get("ground_truth_risk") or record.get("actual_risk_label")
        if verified_label and str(verified_label).strip().title() in ["Low", "Medium", "High"]:
            label = str(verified_label).strip().title()
            source = "ground_truth_feedback"
            reasons = [f"Verified historical outcome / Admin feedback ({label})"]
            return label, source, reasons

        label, reasons = self.generate_provisional_label(record)
        return label, "provisional_rule", reasons
