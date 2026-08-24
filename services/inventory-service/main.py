"""
Inventory Service — FastAPI
===========================
Sits behind the Integration Gateway.
Provides inventory data from PostgreSQL (construction, manufacturing)
and MySQL (pharma, electronics) databases.

API Key authentication per industry.
Agents NEVER call this directly — only the Gateway does.
"""

import os
import logging
from typing import Optional

import psycopg2
from psycopg2.extras import RealDictCursor
import pymysql
import pymysql.cursors
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("inventory-service")

app = FastAPI(
    title="Inventory Service",
    description="Industry inventory data service. Accessed only via Integration Gateway.",
    version="1.0.0",
)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ------------------------------------------------------------------ #
# Config                                                               #
# ------------------------------------------------------------------ #
PG_HOST  = os.getenv("POSTGRES_HOST", "localhost")
PG_PORT  = os.getenv("POSTGRES_PORT", "5432")
PG_USER  = os.getenv("POSTGRES_USER", "procurement_admin")
PG_PASS  = os.getenv("POSTGRES_PASSWORD", "SecurePass@2024")

MY_HOST  = os.getenv("MYSQL_HOST", "localhost")
MY_PORT  = int(os.getenv("MYSQL_PORT", "3306"))
MY_USER  = os.getenv("MYSQL_USER", "procurement_admin")
MY_PASS  = os.getenv("MYSQL_PASSWORD", "SecurePass@2024")

API_KEYS = {
    "construction":  os.getenv("CONSTRUCTION_KEY",  "CONST-a8f3d2e1-4b9c-4d7f-89ab-cdef01234567"),
    "pharma":        os.getenv("PHARMA_KEY",         "PHARM-b7e2c1d0-3a8b-4c6e-78ab-bcde90123456"),
    "manufacturing": os.getenv("MANUFACTURING_KEY",  "MANUF-c6d1b0e9-2978-4b5d-67ab-abcd89012345"),
    "electronics":   os.getenv("ELECTRONICS_KEY",    "ELEC-d5c0a9f8-1867-4a4c-56ab-9abc78901234"),
}

# Map industry → database name + engine
INDUSTRY_DB = {
    "construction":  {"engine": "postgres", "db": "construction_inventory_db"},
    "manufacturing": {"engine": "postgres", "db": "manufacturing_inventory_db"},
    "pharma":        {"engine": "mysql",    "db": "pharma_inventory_db"},
    "electronics":   {"engine": "mysql",    "db": "electronics_inventory_db"},
}


# ------------------------------------------------------------------ #
# Auth                                                                 #
# ------------------------------------------------------------------ #
def get_industry_from_key(x_api_key: str = Header(...)) -> str:
    for industry, key in API_KEYS.items():
        if x_api_key == key:
            return industry
    raise HTTPException(401, "Invalid API key")


# ------------------------------------------------------------------ #
# DB connection helpers                                                #
# ------------------------------------------------------------------ #
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


# ------------------------------------------------------------------ #
# Endpoints                                                            #
# ------------------------------------------------------------------ #
@app.get("/health")
async def health():
    return {"status": "ok", "service": "inventory-service"}


@app.get("/inventory/{industry}/items")
async def get_all_items(
    industry: str,
    verified_industry: str = Depends(get_industry_from_key),
):
    """Returns all inventory items for the given industry."""
    if industry not in INDUSTRY_DB:
        raise HTTPException(400, f"Unknown industry: {industry}")
    if industry != verified_industry:
        raise HTTPException(403, "API key does not match requested industry")

    conn, engine = get_db_conn(industry)
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM inventory_items ORDER BY name")
        rows = cur.fetchall()
        return {
            "industry": industry,
            "engine": engine,
            "items": [dict(r) for r in rows],
            "total": len(rows),
        }
    finally:
        conn.close()


@app.get("/inventory/{industry}/item/{item_name}")
async def get_item(
    industry: str,
    item_name: str,
    verified_industry: str = Depends(get_industry_from_key),
):
    """
    Returns stock info for a named item.
    Performs fuzzy name match (ILIKE/LIKE) so agents don't need
    exact names — 'Cement' matches 'Cement (50kg bags)'.
    """
    if industry not in INDUSTRY_DB:
        raise HTTPException(400, f"Unknown industry: {industry}")
    if industry != verified_industry:
        raise HTTPException(403, "API key does not match requested industry")

    conn, engine = get_db_conn(industry)
    try:
        cur = conn.cursor()
        # Fuzzy match on name
        if engine == "postgres":
            cur.execute(
                "SELECT * FROM inventory_items WHERE name ILIKE %s ORDER BY name LIMIT 1",
                (f"%{item_name}%",),
            )
        else:
            cur.execute(
                "SELECT * FROM inventory_items WHERE name LIKE %s ORDER BY name LIMIT 1",
                (f"%{item_name}%",),
            )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, f"Item '{item_name}' not found in {industry} inventory")
        return {
            "industry": industry,
            "engine": engine,
            "item": dict(row),
        }
    finally:
        conn.close()
