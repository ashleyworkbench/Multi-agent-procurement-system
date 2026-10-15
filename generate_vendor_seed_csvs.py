import csv
import random
from pathlib import Path

# Deterministic seed
random.seed(42)

CONSTRUCTION_VENDORS = [
    ("V-CONST-001", "ACC Cement Ltd", "Low"),
    ("V-CONST-002", "UltraTech Cement", "Low"),
    ("V-CONST-003", "Tata Steel", "Low"),
    ("V-CONST-004", "JK Cement Ltd", "Medium"),
    ("V-CONST-005", "Dalmia Bharat Cement", "Medium"),
    ("V-CONST-006", "JSW Steel", "Low"),
    ("V-CONST-007", "Shree Cement", "Medium"),
    ("V-CONST-008", "Ambuja Cements", "Low"),
    ("V-CONST-009", "SAIL (Steel Authority)", "High"),
    ("V-CONST-010", "Ramco Cements", "Medium"),
]

MANUFACTURING_VENDORS = [
    ("V-MFG-001", "SKF India Ltd", "Low"),
    ("V-MFG-002", "Bosch India", "Low"),
    ("V-MFG-003", "Siemens India", "Low"),
    ("V-MFG-004", "ABB India", "Medium"),
    ("V-MFG-005", "Hindalco Industries", "Medium"),
    ("V-MFG-006", "Havells India", "Low"),
    ("V-MFG-007", "Polycab India", "Medium"),
    ("V-MFG-008", "Tata Metaliks", "High"),
    ("V-MFG-009", "NBC Bearings", "Medium"),
    ("V-MFG-010", "Kirloskar Electric", "High"),
]

FIELDNAMES = [
    "order_id",
    "order_date",
    "vendor_id",
    "vendor_name",
    "company_id",
    "on_time_rate",
    "delay_days",
    "lead_time",
    "defect_rate",
    "return_rate",
    "price_variance",
    "compliance_score",
    "violations",
    "iso_certified",
    "spend_tier",
    "actual_order_outcome",
    "rating",
    "ground_truth_risk",
]

def generate_profile_row(company_id, vendor_id, vendor_name, base_risk, order_seq):
    # Determine risk category for this specific order with small variation around vendor base_risk
    p = random.random()
    if base_risk == "Low":
        risk = "Low" if p < 0.85 else ("Medium" if p < 0.97 else "High")
    elif base_risk == "Medium":
        risk = "Medium" if p < 0.70 else ("Low" if p < 0.85 else "High")
    else:  # High
        risk = "High" if p < 0.80 else ("Medium" if p < 0.95 else "Low")

    year = random.choice([2023, 2024, 2025])
    month = random.randint(1, 12)
    day = random.randint(1, 28)
    order_date = f"{year}-{month:02d}-{day:02d}"

    prefix = "CONST" if company_id == "construction" else "MFG"
    order_id = f"PO-{prefix}-{order_seq:05d}"

    if risk == "Low":
        on_time = round(random.uniform(0.92, 0.99), 3)
        delay = round(random.uniform(0.0, 1.2), 1)
        lead_time = random.randint(2, 7)
        defect = round(random.uniform(0.001, 0.015), 4)
        return_rate = round(random.uniform(0.000, 0.008), 4)
        price_var = round(random.uniform(-0.02, 0.03), 3)
        compliance = round(random.uniform(90.0, 99.0), 1)
        violations = 0
        iso = random.choice([True, True, True, False])
        spend = random.choice(["Medium", "High", "High"])
        outcome = "on_time_delivery"
        rating = round(random.uniform(4.4, 4.9), 1)
    elif risk == "Medium":
        on_time = round(random.uniform(0.75, 0.88), 3)
        delay = round(random.uniform(1.5, 4.5), 1)
        lead_time = random.randint(5, 12)
        defect = round(random.uniform(0.018, 0.045), 4)
        return_rate = round(random.uniform(0.010, 0.028), 4)
        price_var = round(random.uniform(0.04, 0.09), 3)
        compliance = round(random.uniform(72.0, 86.0), 1)
        violations = random.choice([0, 1, 1])
        iso = random.choice([True, False])
        spend = random.choice(["Low", "Medium"])
        outcome = random.choice(["delayed_delivery", "on_time_delivery"])
        rating = round(random.uniform(3.4, 4.2), 1)
    else:  # High
        on_time = round(random.uniform(0.50, 0.69), 3)
        delay = round(random.uniform(5.5, 12.0), 1)
        lead_time = random.randint(10, 20)
        defect = round(random.uniform(0.055, 0.12), 4)
        return_rate = round(random.uniform(0.035, 0.08), 4)
        price_var = round(random.uniform(0.12, 0.25), 3)
        compliance = round(random.uniform(45.0, 64.0), 1)
        violations = random.randint(2, 4)
        iso = random.choice([False, False, True])
        spend = random.choice(["Low", "Medium"])
        outcome = random.choice(["delayed_delivery", "defective_shipment"])
        rating = round(random.uniform(2.1, 3.2), 1)

    return {
        "order_id": order_id,
        "order_date": order_date,
        "vendor_id": vendor_id,
        "vendor_name": vendor_name,
        "company_id": company_id,
        "on_time_rate": on_time,
        "delay_days": delay,
        "lead_time": lead_time,
        "defect_rate": defect,
        "return_rate": return_rate,
        "price_variance": price_var,
        "compliance_score": compliance,
        "violations": violations,
        "iso_certified": iso,
        "spend_tier": spend,
        "actual_order_outcome": outcome,
        "rating": rating,
        "ground_truth_risk": risk,
    }

def inject_anomalies(rows):
    # Within the 100 rows per vendor, create duplicate keys without changing total row count
    # 1. Duplicates: duplicate order_ids within same vendor
    # Vendor 1 (indices 0..99): make row 1 duplicate order_id of row 0
    rows[1]["order_id"] = rows[0]["order_id"]
    # Vendor 2 (indices 100..199): make row 101 duplicate order_id of row 100
    rows[101]["order_id"] = rows[100]["order_id"]
    # Vendor 5 (indices 400..499): make row 401 duplicate of 400
    rows[401]["order_id"] = rows[400]["order_id"]

    # 2. Missing values (e.g. empty delay_days or None)
    missing_indices = [15, 75, 180, 420, 650]
    for idx in missing_indices:
        rows[idx]["delay_days"] = ""
        rows[idx]["defect_rate"] = None

    # 3. Invalid/clamped values (e.g. on_time_rate > 1.0 or compliance_score > 100)
    invalid_indices = [22, 110, 250, 500, 820]
    for idx in invalid_indices:
        rows[idx]["on_time_rate"] = 1.35  # clamped by cleaner
        rows[idx]["compliance_score"] = 115.0  # clamped by cleaner

def generate_dataset(company_id, vendor_list, target_count, output_path):
    rows = []
    order_seq = 1
    per_vendor = target_count // len(vendor_list)
    for v_id, v_name, base_risk in vendor_list:
        for _ in range(per_vendor):
            row = generate_profile_row(company_id, v_id, v_name, base_risk, order_seq)
            rows.append(row)
            order_seq += 1

    # Inject dirty anomalies (duplicates, missing, clamped values)
    inject_anomalies(rows)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Generated {len(rows)} rows for {company_id} at {output_path}")

if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    data_dir = root / "services" / "agent-risk" / "data"

    const_path = data_dir / "construction_vendor_history_1000_orders.csv"
    mfg_path = data_dir / "manufacturing_vendor_history_1005_dirty_records.csv"

    generate_dataset("construction", CONSTRUCTION_VENDORS, 1000, const_path)
    generate_dataset("manufacturing", MANUFACTURING_VENDORS, 1000, mfg_path)
