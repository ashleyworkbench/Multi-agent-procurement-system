"""One-time development seed for Manufacturing vendor performance history.

Runtime vendor data is served from PostgreSQL APIs. This script is only for
loading the existing dirty CSV into the PostgreSQL seed schema.
"""

import argparse
import csv
import json
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_CSV = REPO_ROOT / "services" / "agent-risk" / "data" / "manufacturing_vendor_history_1005_dirty_records.csv"
VENDOR_IDS = {f"V-MFG-{number:03d}" for number in range(1, 11)}
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


def load_rows() -> list[dict[str, str]]:
    with SOURCE_CSV.open(newline="", encoding="utf-8-sig") as source:
        rows = list(csv.DictReader(source))
    if not rows:
        raise ValueError(f"No seed rows found in {SOURCE_CSV}")

    unknown_ids = sorted({row.get("vendor_id", "") for row in rows} - VENDOR_IDS)
    if unknown_ids:
        raise ValueError(f"Seed contains unknown vendor IDs: {', '.join(unknown_ids)}")
    if any(row.get("company_id") != "manufacturing" for row in rows):
        raise ValueError("Manufacturing seed contains records for another company.")
    return rows


def seed_database(rows: list[dict[str, str]]) -> int:
    load_dotenv(REPO_ROOT / ".env")
    connection = psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=os.getenv("POSTGRES_PORT", "5432"),
        user=os.getenv("POSTGRES_USER", "procurement_admin"),
        password=os.getenv("POSTGRES_PASSWORD", "SecurePass@2024"),
        dbname="manufacturing_vendor_db",
    )
    columns = ", ".join(("company_id", "source_row_number", *PERFORMANCE_FIELDS, "raw_record"))
    placeholders = ", ".join(["%s"] * (len(PERFORMANCE_FIELDS) + 3))
    query = f"""
        INSERT INTO vendor_performance ({columns})
        VALUES ({placeholders})
        ON CONFLICT (company_id, source_row_number) DO NOTHING
    """
    values = [
        (
            row["company_id"],
            row_number,
            *(row.get(field) or None for field in PERFORMANCE_FIELDS),
            json.dumps(row),
        )
        for row_number, row in enumerate(rows, start=1)
    ]
    try:
        with connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT vendor_id FROM vendor_master WHERE company_id = %s", ("manufacturing",))
                known_ids = {result[0] for result in cursor.fetchall()}
                unknown_ids = sorted({row["vendor_id"] for row in rows} - known_ids)
                if unknown_ids:
                    raise ValueError(f"No vendor_master rows for IDs: {', '.join(unknown_ids)}")
                cursor.executemany(query, values)
                return cursor.rowcount
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Validate the CSV without connecting to PostgreSQL.")
    args = parser.parse_args()
    rows = load_rows()
    if args.dry_run:
        print(f"Validated {len(rows)} Manufacturing rows across {len({row['vendor_id'] for row in rows})} vendor IDs.")
        return
    inserted = seed_database(rows)
    print(f"Seeded {inserted} new rows from {SOURCE_CSV.name} into vendor_performance.")


if __name__ == "__main__":
    main()