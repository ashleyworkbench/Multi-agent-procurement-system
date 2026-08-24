"""
Vendor Service — FastAPI
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
from fastapi import FastAPI, HTTPException, Header, Depends
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
