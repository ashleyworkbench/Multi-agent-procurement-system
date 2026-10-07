"""
Vendor Service ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â FastAPI
========================
Provides vendor data from PostgreSQL (construction, manufacturing)
and MySQL (pharma, electronics) databases.
Accessed only via Integration Gateway.
"""

import os
import logging

import psycopg2
from psycopg2.extras import RealDictCursor
import pymysql
import pymysql.cursors
from fastapi import FastAPI, HTTPException, Header, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("vendor-service")

app = FastAPI(
    title="Vendor Service",
    description="Industry vendor data. Accessed only via Integration Gateway.",
    version="1.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

PG_HOST = os.getenv("POSTGRES_HOST", "localhost")
PG_PORT = os.getenv("POSTGRES_PORT", "5432")
PG_USER = os.getenv("POSTGRES_USER", "procurement_admin")
PG_PASS = os.getenv("POSTGRES_PASSWORD", "SecurePass@2024")

MY_HOST = os.getenv("MYSQL_HOST", "localhost")
MY_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MY_USER = os.getenv("MYSQL_USER", "procurement_admin")
MY_PASS = os.getenv("MYSQL_PASSWORD", "SecurePass@2024")

API_KEYS = {
    "construction":  os.getenv("CONSTRUCTION_KEY",  "CONST-a8f3d2e1-4b9c-4d7f-89ab-cdef01234567"),
    "pharma":        os.getenv("PHARMA_KEY",         "PHARM-b7e2c1d0-3a8b-4c6e-78ab-bcde90123456"),
    "manufacturing": os.getenv("MANUFACTURING_KEY",  "MANUF-c6d1b0e9-2978-4b5d-67ab-abcd89012345"),
    "electronics":   os.getenv("ELECTRONICS_KEY",    "ELEC-d5c0a9f8-1867-4a4c-56ab-9abc78901234"),
}

INDUSTRY_DB = {
    "construction":  {"engine": "postgres", "db": "construction_vendor_db"},
    "manufacturing": {"engine": "postgres", "db": "manufacturing_vendor_db"},
    "pharma":        {"engine": "mysql",    "db": "pharma_vendor_db"},
    "electronics":   {"engine": "mysql",    "db": "electronics_vendor_db"},
}


def get_industry_from_key(x_api_key: str = Header(...)) -> str:
    for industry, key in API_KEYS.items():
        if x_api_key == key:
            return industry
    raise HTTPException(401, "Invalid API key")


def pg_conn(dbname: str):
    return psycopg2.connect(
        host=PG_HOST, port=PG_PORT,
        user=PG_USER, password=PG_PASS,
        dbname=dbname, cursor_factory=RealDictCursor,
    )

def my_conn(dbname: str):
    return pymysql.connect(
        host=MY_HOST, port=MY_PORT,
        user=MY_USER, password=MY_PASS,
        database=dbname, cursorclass=pymysql.cursors.DictCursor,
    )

def get_db_conn(industry: str):
    cfg = INDUSTRY_DB[industry]
    if cfg["engine"] == "postgres":
        return pg_conn(cfg["db"]), "postgres"
    return my_conn(cfg["db"]), "mysql"


@app.get("/health")
async def health():
    return {"status": "ok", "service": "vendor-service"}


@app.get("/vendor-performance/health")
async def vendor_performance_health(
    industry: str = Query(...),
    verified_industry: str = Depends(get_industry_from_key),
):
    if industry not in INDUSTRY_DB:
        raise HTTPException(400, f"Unknown industry: {industry}")
    if industry != verified_industry:
        raise HTTPException(403, "API key does not match requested industry")
    return {"status": "ok", "service": "vendor-performance", "company_id": industry}


@app.get("/vendor-performance/vendors")
async def get_vendor_performance_vendors(
    industry: str = Query(...),
    verified_industry: str = Depends(get_industry_from_key),
):
    """Return stable vendor IDs and product-level PO capabilities."""
    if industry not in INDUSTRY_DB:
        raise HTTPException(400, f"Unknown industry: {industry}")
    if industry != verified_industry:
        raise HTTPException(403, "API key does not match requested industry")

    if industry != "manufacturing":
        legacy = await get_all_vendors(industry, verified_industry)
        vendors = []
        for row in legacy["vendors"]:
            purchase_vendor_id = int(row["id"])
            products = [
                {
                    **product,
                    "category": product.get("product_category"),
                    "capacity": product.get("capacity_units"),
                }
                for product in row.get("vendor_products", [])
            ]
            vendors.append({
                "vendor_id": f"V-CONST-{purchase_vendor_id:03d}",
                "company_id": industry,
                "purchase_vendor_id": purchase_vendor_id,
                "vendor_name": row["vendor_name"],
                "city": row.get("city"),
                "state": row.get("state"),
                "supported_categories": [],
                "supported_products": products,
                "capacity": {},
                "active_status": bool(row.get("is_active", True)),
                "certifications": [],
                "rating": float(row.get("rating") or 0),
            })
        return {"company_id": industry, "vendors": vendors, "total": len(vendors)}

    conn, _ = get_db_conn(industry)
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT vendor_id, company_id, purchase_vendor_id, vendor_name, city, state,
                   supported_categories, supported_products, capacity, active_status,
                   compliance_info, certifications
            FROM vendor_master
            WHERE company_id = %s AND active_status = TRUE
            ORDER BY vendor_id
        """, (industry,))
        vendors = [dict(row) for row in cur.fetchall()]
        return {"company_id": industry, "vendors": vendors, "total": len(vendors)}
    finally:
        conn.close()


@app.get("/vendor-performance/history")
async def get_vendor_performance_history(
    industry: str = Query(...),
    vendor_id: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    product: str | None = Query(None),
    category: str | None = Query(None),
    verified_industry: str = Depends(get_industry_from_key),
):
    """Return raw performance history; risk-side cleaning preserves dirty values."""
    if industry not in INDUSTRY_DB:
        raise HTTPException(400, f"Unknown industry: {industry}")
    if industry != verified_industry:
        raise HTTPException(403, "API key does not match requested industry")

    conditions = ["performance.company_id = %s"]
    params: list = [industry]
    if vendor_id:
        conditions.append("performance.vendor_id = %s")
        params.append(vendor_id)
    if start_date:
        conditions.append("performance.order_date >= %s")
        params.append(start_date)
    if end_date:
        conditions.append("performance.order_date <= %s")
        params.append(end_date)
    if product:
        conditions.append("EXISTS (SELECT 1 FROM vendor_master AS master WHERE master.company_id = performance.company_id AND master.vendor_id = performance.vendor_id AND master.supported_products::text ILIKE %s)")
        params.append(f"%{product}%")
    if category:
        conditions.append("EXISTS (SELECT 1 FROM vendor_master AS master, unnest(master.supported_categories) item WHERE master.company_id = performance.company_id AND master.vendor_id = performance.vendor_id AND item ILIKE %s)")
        params.append(f"%{category}%")

    conn, _ = get_db_conn(industry)
    try:
        cur = conn.cursor()
        cur.execute(f"""
            SELECT performance.source_row_number, performance.company_id, performance.order_id,
                   performance.order_date, performance.vendor_id, performance.vendor_name,
                   performance.on_time_rate, performance.delay_days, performance.lead_time,
                   performance.defect_rate, performance.return_rate, performance.price_variance,
                   performance.compliance_score, performance.violations, performance.iso_certified,
                   performance.spend_tier, performance.actual_order_outcome, performance.rating,
                   performance.ground_truth_risk, performance.raw_record
            FROM vendor_performance AS performance
            WHERE {' AND '.join(conditions)}
            ORDER BY performance.source_row_number
        """, tuple(params))
        records = [dict(row) for row in cur.fetchall()]
        return {"company_id": industry, "records": records, "total": len(records)}
    finally:
        conn.close()


@app.get("/vendor-performance/history/{vendor_id}")
async def get_vendor_performance_history_for_vendor(
    vendor_id: str,
    industry: str = Query(...),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    verified_industry: str = Depends(get_industry_from_key),
):
    if industry not in INDUSTRY_DB:
        raise HTTPException(400, f"Unknown industry: {industry}")
    if industry != verified_industry:
        raise HTTPException(403, "API key does not match requested industry")

    params: list = [industry, vendor_id]
    conditions = ["company_id = %s", "vendor_id = %s"]
    if start_date:
        conditions.append("order_date >= %s")
        params.append(start_date)
    if end_date:
        conditions.append("order_date <= %s")
        params.append(end_date)
    conn, _ = get_db_conn(industry)
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM vendor_master WHERE company_id = %s AND vendor_id = %s", (industry, vendor_id))
        if not cur.fetchone():
            raise HTTPException(404, f"Vendor '{vendor_id}' not found in {industry} vendor master")
        cur.execute(f"""
            SELECT source_row_number, company_id, order_id, order_date, vendor_id, vendor_name,
                   on_time_rate, delay_days, lead_time, defect_rate, return_rate, price_variance,
                   compliance_score, violations, iso_certified, spend_tier, actual_order_outcome,
                   rating, ground_truth_risk, raw_record
            FROM vendor_performance
            WHERE {' AND '.join(conditions)}
            ORDER BY source_row_number
        """, tuple(params))
        records = [dict(row) for row in cur.fetchall()]
        return {"company_id": industry, "vendor_id": vendor_id, "records": records, "total": len(records)}
    finally:
        conn.close()


@app.get("/vendors/{industry}")
async def get_all_vendors(
    industry: str,
    verified_industry: str = Depends(get_industry_from_key),
):
    if industry not in INDUSTRY_DB:
        raise HTTPException(400, f"Unknown industry: {industry}")
    if industry != verified_industry:
        raise HTTPException(403, "API key does not match requested industry")

    conn, engine = get_db_conn(industry)
    try:
        cur = conn.cursor()
        if engine == "postgres":
            cur.execute("""
                SELECT v.*,
                  COALESCE(
                    json_agg(
                      json_build_object(
                        'item_name', vp.item_name,
                        'unit_price', vp.unit_price,
                        'lead_time_days', vp.lead_time_days,
                        'min_order_qty', vp.min_order_qty,
                        'availability', vp.availability
                      )
                    ) FILTER (WHERE vp.id IS NOT NULL), '[]'
                  ) AS vendor_products
                FROM vendors v
                LEFT JOIN vendor_products vp ON v.id = vp.vendor_id
                WHERE v.is_active = TRUE
                GROUP BY v.id
                ORDER BY v.rating DESC
            """)
        else:
            cur.execute("""
                SELECT v.*,
                  JSON_ARRAYAGG(
                    JSON_OBJECT(
                      'item_name', vp.item_name,
                      'unit_price', vp.unit_price,
                      'lead_time_days', vp.lead_time_days,
                      'min_order_qty', vp.min_order_qty,
                      'availability', vp.availability
                    )
                  ) AS vendor_products
                FROM vendors v
                LEFT JOIN vendor_products vp ON v.id = vp.vendor_id
                WHERE v.is_active = 1
                GROUP BY v.id
                ORDER BY v.rating DESC
            """)
        rows = cur.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            # MySQL returns JSON string, PostgreSQL returns list
            if isinstance(d.get("vendor_products"), str):
                import json as _json
                d["vendor_products"] = _json.loads(d["vendor_products"])
            result.append(d)
        return {"industry": industry, "vendors": result, "total": len(result)}
    finally:
        conn.close()


@app.get("/vendors/{industry}/item/{item_name}")
async def get_vendors_for_item(
    industry: str,
    item_name: str,
    verified_industry: str = Depends(get_industry_from_key),
):
    """
    Returns all vendors who supply the given item, with pricing,
    lead time, and vendor rating. Agent 3 calls this.
    """
    if industry not in INDUSTRY_DB:
        raise HTTPException(400, f"Unknown industry: {industry}")
    if industry != verified_industry:
        raise HTTPException(403, "API key does not match requested industry")

    conn, engine = get_db_conn(industry)
    try:
        cur = conn.cursor()
        if engine == "postgres":
            cur.execute("""
                SELECT
                    v.id          AS vendor_id,
                    v.vendor_name,
                    v.city,
                    v.rating,
                    vp.item_name,
                    vp.unit_price,
                    vp.lead_time_days,
                    vp.min_order_qty,
                    vp.availability
                FROM vendors v
                JOIN vendor_products vp ON v.id = vp.vendor_id
                WHERE vp.item_name ILIKE %s
                  AND v.is_active = TRUE
                ORDER BY v.rating DESC, vp.unit_price ASC
            """, (f"%{item_name}%",))
        else:
            cur.execute("""
                SELECT
                    v.id          AS vendor_id,
                    v.vendor_name,
                    v.city,
                    v.rating,
                    vp.item_name,
                    vp.unit_price,
                    vp.lead_time_days,
                    vp.min_order_qty,
                    vp.availability
                FROM vendors v
                JOIN vendor_products vp ON v.id = vp.vendor_id
                WHERE vp.item_name LIKE %s
                  AND v.is_active = 1
                ORDER BY v.rating DESC, vp.unit_price ASC
            """, (f"%{item_name}%",))

        rows = cur.fetchall()
        if not rows:
            raise HTTPException(404, f"No vendors found for '{item_name}' in {industry}")
        return {
            "industry": industry,
            "item_name": item_name,
            "vendors": [dict(r) for r in rows],
            "total": len(rows),
        }
    finally:
        conn.close()


@app.get("/vendors/{industry}/{vendor_id}")
async def get_vendor(
    industry: str,
    vendor_id: int,
    verified_industry: str = Depends(get_industry_from_key),
):
    if industry not in INDUSTRY_DB:
        raise HTTPException(400, f"Unknown industry: {industry}")
    if industry != verified_industry:
        raise HTTPException(403, "API key does not match requested industry")

    conn, engine = get_db_conn(industry)
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM vendors WHERE id = %s", (vendor_id,))
        vendor = cur.fetchone()
        if not vendor:
            raise HTTPException(404, f"Vendor {vendor_id} not found")

        cur.execute("SELECT * FROM vendor_products WHERE vendor_id = %s", (vendor_id,))
        products = cur.fetchall()

        return {
            "vendor": dict(vendor),
            "products": [dict(p) for p in products],
        }
    finally:
        conn.close()


