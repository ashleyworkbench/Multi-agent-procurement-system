"""
Onboarding Service — FastAPI
Handles CSV/XLSX file uploads, schema detection, table creation,
data import, and automatic API generation.
"""

import os
import uuid
import secrets
import traceback
from datetime import datetime
from typing import Optional

import pandas as pd
import psycopg2
from psycopg2 import sql
from fastapi import FastAPI, File, UploadFile, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ------------------------------------------------------------------ #
# App setup                                                           #
# ------------------------------------------------------------------ #
app = FastAPI(
    title="ProcureFlow Onboarding Service",
    description="Upload CSV/XLSX files to auto-generate APIs for agents",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------------ #
# Config                                                              #
# ------------------------------------------------------------------ #
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_USER = os.getenv("POSTGRES_USER", "procurement_admin")
DB_PASS = os.getenv("POSTGRES_PASSWORD", "SecurePass@2024")
ONBOARDING_DB = "onboarding_db"

# In-memory upload registry (swap for DB in production)
upload_registry: dict[str, dict] = {}


# ------------------------------------------------------------------ #
# DB helpers                                                          #
# ------------------------------------------------------------------ #
def get_conn(dbname: str = ONBOARDING_DB):
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASS,
        dbname=dbname,
    )


def ensure_onboarding_db():
    """Create onboarding_db and registry table on first start."""
    try:
        conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT,
            user=DB_USER, password=DB_PASS,
            dbname="postgres",
        )
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (ONBOARDING_DB,))
        if not cur.fetchone():
            cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(ONBOARDING_DB)))
        cur.close()
        conn.close()

        # Create registry table + connected industries table
        conn2 = get_conn()
        conn2.autocommit = True
        cur2 = conn2.cursor()
        cur2.execute("""
            CREATE TABLE IF NOT EXISTS upload_registry (
                id           TEXT PRIMARY KEY,
                filename     TEXT NOT NULL,
                data_type    TEXT NOT NULL,
                industry     TEXT NOT NULL,
                display_name TEXT NOT NULL,
                table_name   TEXT NOT NULL,
                api_key      TEXT NOT NULL,
                row_count    INT,
                col_count    INT,
                status       TEXT NOT NULL DEFAULT 'ready',
                created_at   TIMESTAMP NOT NULL DEFAULT NOW()
            )
        """)
        cur2.execute("""
            CREATE TABLE IF NOT EXISTS connected_industries (
                industry  TEXT NOT NULL,
                data_type TEXT NOT NULL,
                api_key   TEXT NOT NULL,
                connected_at TIMESTAMP NOT NULL DEFAULT NOW(),
                PRIMARY KEY (industry, data_type)
            )
        """)
        cur2.close()
        conn2.close()
    except Exception as e:
        print(f"[WARNING] DB init failed (may already exist): {e}")


# ------------------------------------------------------------------ #
# Startup                                                             #
# ------------------------------------------------------------------ #
@app.on_event("startup")
async def startup():
    ensure_onboarding_db()


# ------------------------------------------------------------------ #
# Models                                                              #
# ------------------------------------------------------------------ #
class UploadRecord(BaseModel):
    id: str
    filename: str
    data_type: str
    industry: str
    display_name: str
    table_name: str
    api_key: str
    row_count: Optional[int]
    col_count: Optional[int]
    status: str
    created_at: str
    api_endpoints: dict


# ------------------------------------------------------------------ #
# Endpoints                                                           #
# ------------------------------------------------------------------ #
@app.get("/health")
async def health():
    return {"status": "ok", "service": "onboarding-service"}


# ------------------------------------------------------------------ #
# Connected industries registry                                        #
# ------------------------------------------------------------------ #
class ConnectRequest(BaseModel):
    industry: str
    data_type: str  # inventory | vendor
    api_key: str

@app.post("/connections/connect", summary="Mark an industry data source as connected")
async def connect_industry(req: ConnectRequest):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO connected_industries (industry, data_type, api_key, connected_at)
            VALUES (%s, %s, %s, NOW())
            ON CONFLICT (industry, data_type) DO UPDATE
              SET api_key = EXCLUDED.api_key, connected_at = NOW()
        """, (req.industry, req.data_type, req.api_key))
        conn.commit()
        cur.close()
        conn.close()
        return {"message": f"{req.industry}/{req.data_type} connected"}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.delete("/connections/disconnect", summary="Disconnect an industry data source")
async def disconnect_industry(industry: str, data_type: str):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM connected_industries WHERE industry = %s AND data_type = %s",
                    (industry, data_type))
        conn.commit()
        cur.close()
        conn.close()
        return {"message": f"{industry}/{data_type} disconnected"}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/connections", summary="List all connected industry data sources")
async def list_connections():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT industry, data_type, api_key, connected_at FROM connected_industries ORDER BY connected_at DESC")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return [{"industry": r[0], "data_type": r[1], "api_key": r[2], "connected_at": str(r[3])} for r in rows]
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/connections/industries", summary="Get list of connected industry names")
async def connected_industry_names():
    """Used by agents to know which industries are active."""
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT DISTINCT industry FROM connected_industries")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return {"connected_industries": [r[0] for r in rows]}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/onboarding/upload", summary="Upload CSV or XLSX file")
async def upload_file(
    file: UploadFile = File(...),
    data_type: str = "inventory",     # inventory | vendors | custom
    industry: str = "pharma",
    display_name: str = "",
):
    """
    Step 1 of the onboarding pipeline.
    Accepts a CSV or XLSX file, parses it, creates a PostgreSQL table,
    imports the data, generates an API key and returns endpoint info.
    """
    # Validate file type
    allowed = (".csv", ".xlsx", ".xls")
    if not file.filename or not any(file.filename.lower().endswith(ext) for ext in allowed):
        raise HTTPException(400, "Only CSV and Excel files (.csv, .xlsx, .xls) are supported.")

    upload_id = f"upl_{uuid.uuid4().hex[:8]}"
    api_key = f"CUSTOM-{industry[:4].upper()}-{secrets.token_hex(8).upper()}"

    # Safe table name
    safe_name = (display_name or file.filename).lower()
    safe_name = "".join(c if c.isalnum() else "_" for c in safe_name).strip("_")[:40]
    table_name = f"custom_{safe_name}_{upload_id[-4:]}"

    try:
        # Read file into DataFrame
        content = await file.read()
        if file.filename.lower().endswith(".csv"):
            import io
            df = pd.read_csv(io.BytesIO(content))
        else:
            import io
            df = pd.read_excel(io.BytesIO(content))

        # Clean column names
        df.columns = [
            "".join(c if c.isalnum() else "_" for c in str(col)).lower().strip("_")
            for col in df.columns
        ]

        row_count = len(df)
        col_count = len(df.columns)

        # Create table + import data
        conn = get_conn()
        cur = conn.cursor()

        # Build CREATE TABLE from dtypes
        type_map = {
            "int64": "BIGINT",
            "float64": "DOUBLE PRECISION",
            "bool": "BOOLEAN",
            "object": "TEXT",
            "datetime64[ns]": "TIMESTAMP",
        }
        col_defs = ", ".join(
            f"{col} {type_map.get(str(df[col].dtype), 'TEXT')}"
            for col in df.columns
        )
        cur.execute(
            sql.SQL("CREATE TABLE IF NOT EXISTS {} ({})").format(
                sql.Identifier(table_name),
                sql.SQL(col_defs),
            )
        )

        # Insert rows
        cols = list(df.columns)
        for _, row in df.iterrows():
            values = [None if pd.isna(v) else v for v in row]
            cur.execute(
                sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                    sql.Identifier(table_name),
                    sql.SQL(", ").join(map(sql.Identifier, cols)),
                    sql.SQL(", ").join(sql.Placeholder() * len(cols)),
                ),
                values,
            )

        conn.commit()
        cur.close()
        conn.close()

        # Register in onboarding_db
        conn2 = get_conn()
        cur2 = conn2.cursor()
        cur2.execute("""
            INSERT INTO upload_registry
              (id, filename, data_type, industry, display_name, table_name, api_key, row_count, col_count, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'ready')
        """, (upload_id, file.filename, data_type, industry,
              display_name or file.filename, table_name, api_key, row_count, col_count))
        conn2.commit()
        cur2.close()
        conn2.close()

        base = f"/api/v1/custom/{industry}/{data_type}"
        return {
            "upload_id": upload_id,
            "filename": file.filename,
            "table_name": table_name,
            "row_count": row_count,
            "col_count": col_count,
            "columns": cols,
            "api_key": api_key,
            "status": "ready",
            "api_endpoints": {
                "list_all":    f"GET {base}/items",
                "get_by_name": f"GET {base}/item/{{name}}",
                "search":      f"GET {base}/search?q={{query}}",
            },
            "preview": df.head(5).fillna("").to_dict(orient="records"),
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(500, f"Import failed: {str(e)}")


@app.get("/onboarding/uploads", summary="List all uploaded datasets")
async def list_uploads():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, filename, data_type, industry, display_name,
                   table_name, api_key, row_count, col_count, status, created_at
            FROM upload_registry ORDER BY created_at DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        cols = ["id","filename","data_type","industry","display_name",
                "table_name","api_key","row_count","col_count","status","created_at"]
        result = []
        for row in rows:
            d = dict(zip(cols, row))
            d["created_at"] = str(d["created_at"])
            base = f"/api/v1/custom/{d['industry']}/{d['data_type']}"
            d["api_endpoints"] = {
                "list_all":    f"GET {base}/items",
                "get_by_name": f"GET {base}/item/{{name}}",
            }
            result.append(d)
        return result
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/onboarding/data/{upload_id}", summary="Query data from an uploaded dataset")
async def get_upload_data(upload_id: str, limit: int = 500):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT table_name, data_type, industry FROM upload_registry WHERE id = %s",
            (upload_id,)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Upload not found")
        table_name, data_type, industry = row

        cur.execute(
            sql.SQL("SELECT * FROM {} LIMIT %s").format(sql.Identifier(table_name)),
            (limit,)
        )
        cols = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
        cur.close()
        conn.close()

        items = [dict(zip(cols, r)) for r in rows]
        return {"upload_id": upload_id, "data_type": data_type, "industry": industry, "items": items, "total": len(items)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


async def get_upload(upload_id: str):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT * FROM upload_registry WHERE id = %s", (upload_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Upload not found")
        cols = ["id","filename","data_type","industry","display_name",
                "table_name","api_key","row_count","col_count","status","created_at"]
        d = dict(zip(cols, row))
        d["created_at"] = str(d["created_at"])
        cur.close()
        conn.close()
        return d
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


@app.delete("/onboarding/uploads/{upload_id}", summary="Delete an upload")
async def delete_upload(upload_id: str):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT table_name FROM upload_registry WHERE id = %s", (upload_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Upload not found")
        table_name = row[0]
        cur.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(sql.Identifier(table_name)))
        cur.execute("DELETE FROM upload_registry WHERE id = %s", (upload_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"message": f"Upload {upload_id} and table {table_name} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# ------------------------------------------------------------------ #
# Dashboard mock endpoints (frontend uses these)                     #
# ------------------------------------------------------------------ #
@app.get("/dashboard/stats")
async def dashboard_stats():
    from lib.mock_dashboard import STATS
    return STATS

@app.get("/dashboard/chart")
async def dashboard_chart():
    from lib.mock_dashboard import CHART
    return CHART

@app.get("/dashboard/recent-requests")
async def dashboard_recent():
    from lib.mock_dashboard import RECENT_REQUESTS
    return RECENT_REQUESTS

@app.get("/dashboard/top-vendors")
async def dashboard_vendors():
    from lib.mock_dashboard import TOP_VENDORS
    return TOP_VENDORS

@app.get("/dashboard/agent-status")
async def dashboard_agents():
    from lib.mock_dashboard import AGENTS
    return AGENTS

@app.get("/dashboard/activity")
async def dashboard_activity():
    from lib.mock_dashboard import ACTIVITY
    return ACTIVITY

@app.get("/dashboard/data-sources")
async def dashboard_sources():
    from lib.mock_dashboard import DATA_SOURCES
    return DATA_SOURCES
