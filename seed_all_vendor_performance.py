import csv
import json
import os
from pathlib import Path
import psycopg2

REPO_ROOT = Path(__file__).resolve().parent

PERFORMANCE_FIELDS = (
    "order_id",
    "order_date",
    "vendor_id",
    "vendor_name",
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
)

def seed_db(company_id: str, dbname: str, csv_path: Path):
    if not csv_path.exists():
        print(f"CSV file not found: {csv_path}")
        return 0

    with csv_path.open(newline="", encoding="utf-8-sig") as source:
        rows = list(csv.DictReader(source))

    if not rows:
        print(f"No rows in {csv_path}")
        return 0

    connection = psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "postgres"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        user=os.getenv("POSTGRES_USER", "procurement_admin"),
        password=os.getenv("POSTGRES_PASSWORD", "SecurePass@2024"),
        dbname=dbname,
    )

    columns = ", ".join(("company_id", "source_row_number", *PERFORMANCE_FIELDS, "raw_record"))
    placeholders = ", ".join(["%s"] * (len(PERFORMANCE_FIELDS) + 3))
    query = f"""
        INSERT INTO vendor_performance ({columns})
        VALUES ({placeholders})
        ON CONFLICT (company_id, source_row_number) DO UPDATE SET
            order_id = EXCLUDED.order_id,
            order_date = EXCLUDED.order_date,
            vendor_id = EXCLUDED.vendor_id,
            vendor_name = EXCLUDED.vendor_name,
            on_time_rate = EXCLUDED.on_time_rate,
            delay_days = EXCLUDED.delay_days,
            lead_time = EXCLUDED.lead_time,
            defect_rate = EXCLUDED.defect_rate,
            return_rate = EXCLUDED.return_rate,
            price_variance = EXCLUDED.price_variance,
            compliance_score = EXCLUDED.compliance_score,
            violations = EXCLUDED.violations,
            iso_certified = EXCLUDED.iso_certified,
            spend_tier = EXCLUDED.spend_tier,
            actual_order_outcome = EXCLUDED.actual_order_outcome,
            rating = EXCLUDED.rating,
            ground_truth_risk = EXCLUDED.ground_truth_risk,
            raw_record = EXCLUDED.raw_record
    """
    values = [
        (
            company_id,
            row_number,
            *(row.get(field) or None for field in PERFORMANCE_FIELDS),
            json.dumps(row),
        )
        for row_number, row in enumerate(rows, start=1)
    ]

    try:
        with connection:
            with connection.cursor() as cursor:
                cursor.executemany(query, values)
                inserted = cursor.rowcount
                print(f"Seeded {len(values)} rows into {dbname}.vendor_performance")
                return inserted
    finally:
        connection.close()

if __name__ == "__main__":
    data_dir = REPO_ROOT / "services" / "agent-risk" / "data"
    const_csv = data_dir / "construction_vendor_history_1000_orders.csv"
    mfg_csv = data_dir / "manufacturing_vendor_history_1005_dirty_records.csv"

    print("Seeding construction vendor performance...")
    seed_db("construction", "construction_vendor_db", const_csv)

    print("Seeding manufacturing vendor performance...")
    seed_db("manufacturing", "manufacturing_vendor_db", mfg_csv)
