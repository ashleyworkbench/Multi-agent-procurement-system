import os
import json
import sqlite3
import logging
import base64
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pathlib import Path
from cryptography.fernet import Fernet

from config import (
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD,
    POSTGRES_DB, SQLITE_DB_PATH
)

log = logging.getLogger("agent-risk.storage")


def _credential_cipher() -> Fernet:
    secret = os.getenv("RISK_SECRET_ENCRYPTION_KEY") or os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("RISK_SECRET_ENCRYPTION_KEY or JWT_SECRET must be configured to store API credentials.")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)

class RiskStorage:
    def __init__(self):
        self.use_postgres = False
        self.sqlite_path = SQLITE_DB_PATH
        Path(self.sqlite_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_pg_conn(self):
        import psycopg2
        from psycopg2.extras import RealDictCursor
        return psycopg2.connect(
            host=POSTGRES_HOST,
            port=POSTGRES_PORT,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD,
            dbname=POSTGRES_DB,
            cursor_factory=RealDictCursor,
            connect_timeout=3
        )

    def _get_sqlite_conn(self):
        conn = sqlite3.connect(self.sqlite_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        """Try PostgreSQL first; fall back to SQLite if PG is unavailable."""
        try:
            conn = self._get_pg_conn()
            self.use_postgres = True
            log.info("Connected to PostgreSQL database for Risk Storage")
            self._create_pg_tables(conn)
            conn.close()
        except Exception as e:
            log.warning(f"PostgreSQL not accessible ({e}). Using SQLite at {self.sqlite_path}")
            self.use_postgres = False
            conn = self._get_sqlite_conn()
            self._create_sqlite_tables(conn)
            conn.close()

    def _create_pg_tables(self, conn):
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS company_risk_configs (
                company_id VARCHAR(100) PRIMARY KEY,
                rules_json JSONB NOT NULL,
                field_mapping_json JSONB NOT NULL,
                auto_retrain_threshold INTEGER NOT NULL DEFAULT 5,
                min_accuracy NUMERIC(5, 4) NOT NULL DEFAULT 0.70,
                min_f1_score NUMERIC(5, 4) NOT NULL DEFAULT 0.65,
                max_degradation NUMERIC(5, 4) NOT NULL DEFAULT 0.05,
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS company_vendor_api_configs (
                company_id VARCHAR(100) PRIMARY KEY,
                connection_name VARCHAR(255) NOT NULL DEFAULT '',
                mode VARCHAR(20) NOT NULL DEFAULT 'dummy',
                endpoint_url TEXT NOT NULL DEFAULT '',
                master_endpoint_url TEXT NOT NULL DEFAULT '',
                auth_type VARCHAR(20) NOT NULL DEFAULT 'none',
                credential_ciphertext TEXT NOT NULL DEFAULT '',
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );

            ALTER TABLE company_vendor_api_configs
                ADD COLUMN IF NOT EXISTS connection_name VARCHAR(255) NOT NULL DEFAULT '';
            ALTER TABLE company_vendor_api_configs
                ADD COLUMN IF NOT EXISTS master_endpoint_url TEXT NOT NULL DEFAULT '';

            CREATE TABLE IF NOT EXISTS vendor_history_snapshots (
                company_id VARCHAR(100) PRIMARY KEY,
                records_json JSONB NOT NULL,
                vendor_master_json JSONB NOT NULL DEFAULT '[]'::jsonb,
                record_count INTEGER NOT NULL,
                cleaning_summary_json JSONB NOT NULL,
                fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
            );

            ALTER TABLE vendor_history_snapshots
                ADD COLUMN IF NOT EXISTS vendor_master_json JSONB NOT NULL DEFAULT '[]'::jsonb;

            CREATE TABLE IF NOT EXISTS vendor_risk_records (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR(100) NOT NULL,
                vendor_id VARCHAR(100) NOT NULL,
                vendor_name VARCHAR(255) NOT NULL,
                risk_level VARCHAR(20) NOT NULL, -- Low, Medium, High
                risk_score NUMERIC(5, 2) NOT NULL,
                delivery_score NUMERIC(5, 2) NOT NULL,
                quality_score NUMERIC(5, 2) NOT NULL,
                pricing_score NUMERIC(5, 2) NOT NULL,
                compliance_score NUMERIC(5, 2) NOT NULL,
                probabilities_json JSONB NOT NULL,
                risk_drivers_json JSONB NOT NULL,
                model_version VARCHAR(50) NOT NULL,
                label_source VARCHAR(50) NOT NULL, -- ground_truth_feedback, provisional_rule, ml_predicted
                raw_metrics_json JSONB NOT NULL,
                updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                UNIQUE(company_id, vendor_id)
            );

            CREATE TABLE IF NOT EXISTS vendor_risk_feedback (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR(100) NOT NULL,
                vendor_id VARCHAR(100) NOT NULL,
                vendor_name VARCHAR(255) NOT NULL,
                order_id VARCHAR(100),
                rating NUMERIC(3, 2) NOT NULL,
                actual_outcome VARCHAR(100) NOT NULL,
                actual_risk_label VARCHAR(20) NOT NULL, -- Low, Medium, High
                notes TEXT,
                submitted_by VARCHAR(100) NOT NULL DEFAULT 'Admin',
                used_in_retraining BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS model_deployments (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR(100) NOT NULL,
                model_version VARCHAR(50) NOT NULL,
                status VARCHAR(50) NOT NULL, -- active, rejected, candidate, archived
                accuracy NUMERIC(5, 4) NOT NULL,
                f1_score NUMERIC(5, 4) NOT NULL,
                precision NUMERIC(5, 4) NOT NULL,
                recall NUMERIC(5, 4) NOT NULL,
                metrics_json JSONB NOT NULL,
                validation_passed BOOLEAN NOT NULL,
                rejection_reason TEXT,
                deployed_at TIMESTAMP NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS data_cleaning_logs (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR(100) NOT NULL,
                vendor_id VARCHAR(100),
                order_id VARCHAR(100),
                field_name VARCHAR(100) NOT NULL,
                issue_type VARCHAR(50) NOT NULL, -- missing_imputed, duplicate_merged, invalid_clamped, format_normalized
                raw_value TEXT,
                cleaned_value TEXT,
                action_taken TEXT NOT NULL,
                explanation TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT NOW()
            );

            ALTER TABLE data_cleaning_logs
                ADD COLUMN IF NOT EXISTS order_id VARCHAR(100);
        """)
        conn.commit()
        cur.close()

    def _create_sqlite_tables(self, conn):
        cur = conn.cursor()
        cur.executescript("""
            CREATE TABLE IF NOT EXISTS company_risk_configs (
                company_id TEXT PRIMARY KEY,
                rules_json TEXT NOT NULL,
                field_mapping_json TEXT NOT NULL,
                auto_retrain_threshold INTEGER NOT NULL DEFAULT 5,
                min_accuracy REAL NOT NULL DEFAULT 0.70,
                min_f1_score REAL NOT NULL DEFAULT 0.65,
                max_degradation REAL NOT NULL DEFAULT 0.05,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS company_vendor_api_configs (
                company_id TEXT PRIMARY KEY,
                connection_name TEXT NOT NULL DEFAULT '',
                mode TEXT NOT NULL DEFAULT 'dummy',
                endpoint_url TEXT NOT NULL DEFAULT '',
                master_endpoint_url TEXT NOT NULL DEFAULT '',
                auth_type TEXT NOT NULL DEFAULT 'none',
                credential_ciphertext TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS vendor_history_snapshots (
                company_id TEXT PRIMARY KEY,
                records_json TEXT NOT NULL,
                vendor_master_json TEXT NOT NULL DEFAULT '[]',
                record_count INTEGER NOT NULL,
                cleaning_summary_json TEXT NOT NULL,
                fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS vendor_risk_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id TEXT NOT NULL,
                vendor_id TEXT NOT NULL,
                vendor_name TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                risk_score REAL NOT NULL,
                delivery_score REAL NOT NULL,
                quality_score REAL NOT NULL,
                pricing_score REAL NOT NULL,
                compliance_score REAL NOT NULL,
                probabilities_json TEXT NOT NULL,
                risk_drivers_json TEXT NOT NULL,
                model_version TEXT NOT NULL,
                label_source TEXT NOT NULL,
                raw_metrics_json TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(company_id, vendor_id)
            );

            CREATE TABLE IF NOT EXISTS vendor_risk_feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id TEXT NOT NULL,
                vendor_id TEXT NOT NULL,
                vendor_name TEXT NOT NULL,
                order_id TEXT,
                rating REAL NOT NULL,
                actual_outcome TEXT NOT NULL,
                actual_risk_label TEXT NOT NULL,
                notes TEXT,
                submitted_by TEXT NOT NULL DEFAULT 'Admin',
                used_in_retraining INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS model_deployments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id TEXT NOT NULL,
                model_version TEXT NOT NULL,
                status TEXT NOT NULL,
                accuracy REAL NOT NULL,
                f1_score REAL NOT NULL,
                precision REAL NOT NULL,
                recall REAL NOT NULL,
                metrics_json TEXT NOT NULL,
                validation_passed INTEGER NOT NULL,
                rejection_reason TEXT,
                deployed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS data_cleaning_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id TEXT NOT NULL,
                vendor_id TEXT,
                order_id TEXT,
                field_name TEXT NOT NULL,
                issue_type TEXT NOT NULL,
                raw_value TEXT,
                cleaned_value TEXT,
                action_taken TEXT NOT NULL,
                explanation TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        """)
        cur.execute("PRAGMA table_info(company_vendor_api_configs)")
        columns = {row["name"] for row in cur.fetchall()}
        if "connection_name" not in columns:
            cur.execute("ALTER TABLE company_vendor_api_configs ADD COLUMN connection_name TEXT NOT NULL DEFAULT ''")
        cur.execute("PRAGMA table_info(company_vendor_api_configs)")
        columns = {row["name"] for row in cur.fetchall()}
        if "master_endpoint_url" not in columns:
            cur.execute("ALTER TABLE company_vendor_api_configs ADD COLUMN master_endpoint_url TEXT NOT NULL DEFAULT ''")
        cur.execute("PRAGMA table_info(vendor_history_snapshots)")
        columns = {row["name"] for row in cur.fetchall()}
        if "vendor_master_json" not in columns:
            cur.execute("ALTER TABLE vendor_history_snapshots ADD COLUMN vendor_master_json TEXT NOT NULL DEFAULT '[]'")
        cur.execute("PRAGMA table_info(data_cleaning_logs)")
        columns = {row["name"] for row in cur.fetchall()}
        if "order_id" not in columns:
            cur.execute("ALTER TABLE data_cleaning_logs ADD COLUMN order_id TEXT")
        conn.commit()
        cur.close()

    def _execute(self, query: str, params: tuple = (), fetch_one=False, fetch_all=False, return_lastrowid=False):
        if self.use_postgres:
            conn = self._get_pg_conn()
            cur = conn.cursor()
            cur.execute(query, params)
            conn.commit()
            res = None
            if fetch_one:
                res = cur.fetchone()
                if res:
                    res = dict(res)
            elif fetch_all:
                res = [dict(r) for r in cur.fetchall()]
            elif return_lastrowid:
                pass
            cur.close()
            conn.close()
            return res
        else:
            conn = self._get_sqlite_conn()
            cur = conn.cursor()
            # Replace %s with ? for SQLite compatibility
            sqlite_query = query.replace("%s", "?")
            cur.execute(sqlite_query, params)
            conn.commit()
            last_id = cur.lastrowid
            res = None
            if fetch_one:
                row = cur.fetchone()
                if row:
                    res = dict(row)
            elif fetch_all:
                res = [dict(r) for r in cur.fetchall()]
            elif return_lastrowid:
                res = last_id
            cur.close()
            conn.close()
            return res

    # ------------------ Company Configuration ------------------ #
    def get_vendor_api_config(self, company_id: str) -> Optional[Dict[str, Any]]:
        row = self._execute(
            "SELECT * FROM company_vendor_api_configs WHERE company_id = %s",
            (company_id,), fetch_one=True,
        )
        if not row:
            return None
        ciphertext = row["credential_ciphertext"] or ""
        credential = _credential_cipher().decrypt(ciphertext.encode()).decode() if ciphertext else ""
        return {
            "company_id": row["company_id"],
            "connection_name": row.get("connection_name") or "Vendor History",
            "mode": row["mode"],
            "endpoint_url": row["endpoint_url"],
            "master_endpoint_url": row.get("master_endpoint_url") or "",
            "auth_type": row["auth_type"],
            "credential": credential,
            "credential_configured": bool(ciphertext),
            "updated_at": str(row["updated_at"]),
        }

    def save_vendor_api_config(
        self, company_id: str, mode: str, endpoint_url: str, auth_type: str,
        credential: Optional[str] = None, connection_name: Optional[str] = None,
        master_endpoint_url: Optional[str] = None,
    ):
        existing = self._execute(
            "SELECT auth_type, credential_ciphertext, connection_name, master_endpoint_url FROM company_vendor_api_configs WHERE company_id = %s",
            (company_id,), fetch_one=True,
        )
        ciphertext = ""
        if credential:
            ciphertext = _credential_cipher().encrypt(credential.encode()).decode()
        elif existing and existing["auth_type"] == auth_type:
            ciphertext = existing["credential_ciphertext"] or ""
        connection_name = connection_name or (existing["connection_name"] if existing else "") or "Vendor History"
        master_endpoint_url = master_endpoint_url if master_endpoint_url is not None else (existing["master_endpoint_url"] if existing else "")

        now_str = datetime.now(timezone.utc).isoformat()
        if self.use_postgres:
            query = """
                INSERT INTO company_vendor_api_configs
                    (company_id, connection_name, mode, endpoint_url, master_endpoint_url, auth_type, credential_ciphertext, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (company_id) DO UPDATE SET
                    connection_name = EXCLUDED.connection_name,
                    mode = EXCLUDED.mode,
                    endpoint_url = EXCLUDED.endpoint_url,
                    master_endpoint_url = EXCLUDED.master_endpoint_url,
                    auth_type = EXCLUDED.auth_type,
                    credential_ciphertext = EXCLUDED.credential_ciphertext,
                    updated_at = NOW()
            """
            params = (company_id, connection_name, mode, endpoint_url, master_endpoint_url, auth_type, ciphertext)
        else:
            query = """
                INSERT INTO company_vendor_api_configs
                    (company_id, connection_name, mode, endpoint_url, master_endpoint_url, auth_type, credential_ciphertext, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (company_id) DO UPDATE SET
                    connection_name = excluded.connection_name,
                    mode = excluded.mode,
                    endpoint_url = excluded.endpoint_url,
                    master_endpoint_url = excluded.master_endpoint_url,
                    auth_type = excluded.auth_type,
                    credential_ciphertext = excluded.credential_ciphertext,
                    updated_at = excluded.updated_at
            """
            params = (company_id, connection_name, mode, endpoint_url, master_endpoint_url, auth_type, ciphertext, now_str)
        self._execute(query, params)

    def save_vendor_history_snapshot(
        self, company_id: str, records: List[Dict[str, Any]], cleaning_summary: Dict[str, Any],
        vendor_master: Optional[List[Dict[str, Any]]] = None,
    ):
        records_json = json.dumps(records)
        vendor_master_json = json.dumps(vendor_master or [])
        summary_json = json.dumps(cleaning_summary)
        now_str = datetime.now(timezone.utc).isoformat()
        if self.use_postgres:
            query = """
                INSERT INTO vendor_history_snapshots
                    (company_id, records_json, vendor_master_json, record_count, cleaning_summary_json, fetched_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
                ON CONFLICT (company_id) DO UPDATE SET
                    records_json = EXCLUDED.records_json,
                    vendor_master_json = EXCLUDED.vendor_master_json,
                    record_count = EXCLUDED.record_count,
                    cleaning_summary_json = EXCLUDED.cleaning_summary_json,
                    fetched_at = NOW()
            """
            params = (company_id, records_json, vendor_master_json, len(records), summary_json)
        else:
            query = """
                INSERT INTO vendor_history_snapshots
                    (company_id, records_json, vendor_master_json, record_count, cleaning_summary_json, fetched_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (company_id) DO UPDATE SET
                    records_json = excluded.records_json,
                    vendor_master_json = excluded.vendor_master_json,
                    record_count = excluded.record_count,
                    cleaning_summary_json = excluded.cleaning_summary_json,
                    fetched_at = excluded.fetched_at
            """
            params = (company_id, records_json, vendor_master_json, len(records), summary_json, now_str)
        self._execute(query, params)

    def get_vendor_history_snapshot(self, company_id: str) -> Optional[Dict[str, Any]]:
        row = self._execute(
            "SELECT * FROM vendor_history_snapshots WHERE company_id = %s",
            (company_id,), fetch_one=True,
        )
        if not row:
            return None
        records = row["records_json"]
        vendor_master = row["vendor_master_json"]
        summary = row["cleaning_summary_json"]
        return {
            "company_id": row["company_id"],
            "records": json.loads(records) if isinstance(records, str) else records,
            "vendor_master": json.loads(vendor_master) if isinstance(vendor_master, str) else vendor_master,
            "record_count": row["record_count"],
            "cleaning_summary": json.loads(summary) if isinstance(summary, str) else summary,
            "fetched_at": str(row["fetched_at"]),
        }

    def get_company_config(self, company_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM company_risk_configs WHERE company_id = %s"
        row = self._execute(query, (company_id,), fetch_one=True)
        if not row:
            return None
        return {
            "company_id": row["company_id"],
            "rules": json.loads(row["rules_json"]) if isinstance(row["rules_json"], str) else row["rules_json"],
            "field_mapping": json.loads(row["field_mapping_json"]) if isinstance(row["field_mapping_json"], str) else row["field_mapping_json"],
            "auto_retrain_threshold": row["auto_retrain_threshold"],
            "min_accuracy": float(row["min_accuracy"]),
            "min_f1_score": float(row["min_f1_score"]),
            "max_degradation": float(row["max_degradation"]),
            "updated_at": str(row["updated_at"]),
        }

    def save_company_config(self, company_id: str, rules: Dict, field_mapping: Dict,
                            auto_retrain_threshold: int = 5, min_accuracy: float = 0.70,
                            min_f1_score: float = 0.65, max_degradation: float = 0.05):
        rules_str = json.dumps(rules)
        fm_str = json.dumps(field_mapping)
        now_str = datetime.now(timezone.utc).isoformat()
        
        if self.use_postgres:
            query = """
                INSERT INTO company_risk_configs 
                    (company_id, rules_json, field_mapping_json, auto_retrain_threshold, min_accuracy, min_f1_score, max_degradation, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (company_id) DO UPDATE SET
                    rules_json = EXCLUDED.rules_json,
                    field_mapping_json = EXCLUDED.field_mapping_json,
                    auto_retrain_threshold = EXCLUDED.auto_retrain_threshold,
                    min_accuracy = EXCLUDED.min_accuracy,
                    min_f1_score = EXCLUDED.min_f1_score,
                    max_degradation = EXCLUDED.max_degradation,
                    updated_at = NOW();
            """
            self._execute(query, (company_id, rules_str, fm_str, auto_retrain_threshold, min_accuracy, min_f1_score, max_degradation))
        else:
            query = """
                INSERT INTO company_risk_configs 
                    (company_id, rules_json, field_mapping_json, auto_retrain_threshold, min_accuracy, min_f1_score, max_degradation, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (company_id) DO UPDATE SET
                    rules_json = excluded.rules_json,
                    field_mapping_json = excluded.field_mapping_json,
                    auto_retrain_threshold = excluded.auto_retrain_threshold,
                    min_accuracy = excluded.min_accuracy,
                    min_f1_score = excluded.min_f1_score,
                    max_degradation = excluded.max_degradation,
                    updated_at = excluded.updated_at;
            """
            self._execute(query, (company_id, rules_str, fm_str, auto_retrain_threshold, min_accuracy, min_f1_score, max_degradation, now_str))

    # ------------------ Vendor Risk Records ------------------ #
    def save_vendor_risk_record(self, company_id: str, vendor_id: str, vendor_name: str,
                                risk_level: str, risk_score: float,
                                delivery_score: float, quality_score: float,
                                pricing_score: float, compliance_score: float,
                                probabilities: Dict, risk_drivers: List[str],
                                model_version: str, label_source: str, raw_metrics: Dict):
        prob_str = json.dumps(probabilities)
        rd_str = json.dumps(risk_drivers)
        raw_str = json.dumps(raw_metrics)
        now_str = datetime.now(timezone.utc).isoformat()

        if self.use_postgres:
            query = """
                INSERT INTO vendor_risk_records 
                    (company_id, vendor_id, vendor_name, risk_level, risk_score,
                     delivery_score, quality_score, pricing_score, compliance_score,
                     probabilities_json, risk_drivers_json, model_version, label_source, raw_metrics_json, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (company_id, vendor_id) DO UPDATE SET
                    vendor_name = EXCLUDED.vendor_name,
                    risk_level = EXCLUDED.risk_level,
                    risk_score = EXCLUDED.risk_score,
                    delivery_score = EXCLUDED.delivery_score,
                    quality_score = EXCLUDED.quality_score,
                    pricing_score = EXCLUDED.pricing_score,
                    compliance_score = EXCLUDED.compliance_score,
                    probabilities_json = EXCLUDED.probabilities_json,
                    risk_drivers_json = EXCLUDED.risk_drivers_json,
                    model_version = EXCLUDED.model_version,
                    label_source = EXCLUDED.label_source,
                    raw_metrics_json = EXCLUDED.raw_metrics_json,
                    updated_at = NOW();
            """
            self._execute(query, (
                company_id, str(vendor_id), vendor_name, risk_level, risk_score,
                delivery_score, quality_score, pricing_score, compliance_score,
                prob_str, rd_str, model_version, label_source, raw_str
            ))
        else:
            query = """
                INSERT INTO vendor_risk_records 
                    (company_id, vendor_id, vendor_name, risk_level, risk_score,
                     delivery_score, quality_score, pricing_score, compliance_score,
                     probabilities_json, risk_drivers_json, model_version, label_source, raw_metrics_json, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (company_id, vendor_id) DO UPDATE SET
                    vendor_name = excluded.vendor_name,
                    risk_level = excluded.risk_level,
                    risk_score = excluded.risk_score,
                    delivery_score = excluded.delivery_score,
                    quality_score = excluded.quality_score,
                    pricing_score = excluded.pricing_score,
                    compliance_score = excluded.compliance_score,
                    probabilities_json = excluded.probabilities_json,
                    risk_drivers_json = excluded.risk_drivers_json,
                    model_version = excluded.model_version,
                    label_source = excluded.label_source,
                    raw_metrics_json = excluded.raw_metrics_json,
                    updated_at = excluded.updated_at;
            """
            self._execute(query, (
                company_id, str(vendor_id), vendor_name, risk_level, risk_score,
                delivery_score, quality_score, pricing_score, compliance_score,
                prob_str, rd_str, model_version, label_source, raw_str, now_str
            ))

    def get_vendor_risk_records(self, company_id: str) -> List[Dict[str, Any]]:
        query = "SELECT * FROM vendor_risk_records WHERE company_id = %s ORDER BY risk_score DESC"
        rows = self._execute(query, (company_id,), fetch_all=True) or []
        res = []
        for r in rows:
            res.append({
                "id": r["id"],
                "company_id": r["company_id"],
                "vendor_id": r["vendor_id"],
                "vendor_name": r["vendor_name"],
                "risk_level": r["risk_level"],
                "risk_score": float(r["risk_score"]),
                "delivery_score": float(r["delivery_score"]),
                "quality_score": float(r["quality_score"]),
                "pricing_score": float(r["pricing_score"]),
                "compliance_score": float(r["compliance_score"]),
                "probabilities": json.loads(r["probabilities_json"]) if isinstance(r["probabilities_json"], str) else r["probabilities_json"],
                "risk_drivers": json.loads(r["risk_drivers_json"]) if isinstance(r["risk_drivers_json"], str) else r["risk_drivers_json"],
                "model_version": r["model_version"],
                "label_source": r["label_source"],
                "raw_metrics": json.loads(r["raw_metrics_json"]) if isinstance(r["raw_metrics_json"], str) else r["raw_metrics_json"],
                "updated_at": str(r["updated_at"])
            })
        return res

    def get_vendor_risk_record(self, company_id: str, vendor_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM vendor_risk_records WHERE company_id = %s AND vendor_id = %s"
        r = self._execute(query, (company_id, str(vendor_id)), fetch_one=True)
        if not r:
            return None
        return {
            "id": r["id"],
            "company_id": r["company_id"],
            "vendor_id": r["vendor_id"],
            "vendor_name": r["vendor_name"],
            "risk_level": r["risk_level"],
            "risk_score": float(r["risk_score"]),
            "delivery_score": float(r["delivery_score"]),
            "quality_score": float(r["quality_score"]),
            "pricing_score": float(r["pricing_score"]),
            "compliance_score": float(r["compliance_score"]),
            "probabilities": json.loads(r["probabilities_json"]) if isinstance(r["probabilities_json"], str) else r["probabilities_json"],
            "risk_drivers": json.loads(r["risk_drivers_json"]) if isinstance(r["risk_drivers_json"], str) else r["risk_drivers_json"],
            "model_version": r["model_version"],
            "label_source": r["label_source"],
            "raw_metrics": json.loads(r["raw_metrics_json"]) if isinstance(r["raw_metrics_json"], str) else r["raw_metrics_json"],
            "updated_at": str(r["updated_at"])
        }

    # ------------------ Admin Feedback ------------------ #
    def add_feedback(self, company_id: str, vendor_id: str, vendor_name: str,
                     rating: float, actual_outcome: str, actual_risk_label: str,
                     order_id: Optional[str] = None, notes: Optional[str] = None,
                     submitted_by: str = "Admin") -> int:
        now_str = datetime.now(timezone.utc).isoformat()
        if self.use_postgres:
            query = """
                INSERT INTO vendor_risk_feedback
                    (company_id, vendor_id, vendor_name, order_id, rating, actual_outcome, actual_risk_label, notes, submitted_by, used_in_retraining, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, FALSE, NOW())
                RETURNING id;
            """
            res = self._execute(query, (company_id, str(vendor_id), vendor_name, order_id, rating, actual_outcome, actual_risk_label, notes, submitted_by), fetch_one=True)
            return res["id"] if res else 1
        else:
            query = """
                INSERT INTO vendor_risk_feedback
                    (company_id, vendor_id, vendor_name, order_id, rating, actual_outcome, actual_risk_label, notes, submitted_by, used_in_retraining, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 0, %s);
            """
            row_id = self._execute(query, (company_id, str(vendor_id), vendor_name, order_id, rating, actual_outcome, actual_risk_label, notes, submitted_by, now_str), return_lastrowid=True)
            return int(row_id) if row_id else 1

    def get_feedback_records(self, company_id: str, only_unconsumed: bool = False) -> List[Dict[str, Any]]:
        if only_unconsumed:
            query = (
                "SELECT * FROM vendor_risk_feedback WHERE company_id = %s AND used_in_retraining = FALSE ORDER BY created_at DESC"
                if self.use_postgres else
                "SELECT * FROM vendor_risk_feedback WHERE company_id = %s AND used_in_retraining = 0 ORDER BY created_at DESC"
            )
        else:
            query = "SELECT * FROM vendor_risk_feedback WHERE company_id = %s ORDER BY created_at DESC"
        rows = self._execute(query, (company_id,), fetch_all=True) or []
        res = []
        for r in rows:
            res.append({
                "id": r["id"],
                "company_id": r["company_id"],
                "vendor_id": r["vendor_id"],
                "vendor_name": r["vendor_name"],
                "order_id": r["order_id"],
                "rating": float(r["rating"]),
                "actual_outcome": r["actual_outcome"],
                "actual_risk_label": r["actual_risk_label"],
                "notes": r["notes"],
                "submitted_by": r["submitted_by"],
                "used_in_retraining": bool(r["used_in_retraining"]),
                "created_at": str(r["created_at"])
            })
        return res

    def mark_feedback_consumed(self, company_id: str):
        query = "UPDATE vendor_risk_feedback SET used_in_retraining = 1 WHERE company_id = %s" if not self.use_postgres else "UPDATE vendor_risk_feedback SET used_in_retraining = TRUE WHERE company_id = %s"
        self._execute(query, (company_id,))

    def get_unconsumed_feedback_count(self, company_id: str) -> int:
        query = (
            "SELECT COUNT(*) as count FROM vendor_risk_feedback WHERE company_id = %s AND used_in_retraining = FALSE"
            if self.use_postgres else
            "SELECT COUNT(*) as count FROM vendor_risk_feedback WHERE company_id = %s AND used_in_retraining = 0"
        )
        row = self._execute(query, (company_id,), fetch_one=True)
        return row["count"] if row else 0

    # ------------------ Model Deployments ------------------ #
    def record_model_deployment(self, company_id: str, model_version: str, status: str,
                                accuracy: float, f1_score: float, precision: float, recall: float,
                                metrics: Dict, validation_passed: bool, rejection_reason: Optional[str] = None):
        met_str = json.dumps(metrics)
        val_int = 1 if validation_passed else 0
        now_str = datetime.now(timezone.utc).isoformat()

        if status == "active":
            # Demote existing active models to archived
            archive_query = "UPDATE model_deployments SET status = 'archived' WHERE company_id = %s AND status = 'active'"
            self._execute(archive_query, (company_id,))

        if self.use_postgres:
            query = """
                INSERT INTO model_deployments
                    (company_id, model_version, status, accuracy, f1_score, precision, recall, metrics_json, validation_passed, rejection_reason, deployed_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            """
            self._execute(query, (company_id, model_version, status, accuracy, f1_score, precision, recall, met_str, validation_passed, rejection_reason))
        else:
            query = """
                INSERT INTO model_deployments
                    (company_id, model_version, status, accuracy, f1_score, precision, recall, metrics_json, validation_passed, rejection_reason, deployed_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            self._execute(query, (company_id, model_version, status, accuracy, f1_score, precision, recall, met_str, val_int, rejection_reason, now_str))

    def get_active_model_deployment(self, company_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM model_deployments WHERE company_id = %s AND status = 'active' ORDER BY deployed_at DESC LIMIT 1"
        r = self._execute(query, (company_id,), fetch_one=True)
        if not r:
            return None
        return {
            "id": r["id"],
            "company_id": r["company_id"],
            "model_version": r["model_version"],
            "status": r["status"],
            "accuracy": float(r["accuracy"]),
            "f1_score": float(r["f1_score"]),
            "precision": float(r["precision"]),
            "recall": float(r["recall"]),
            "metrics": json.loads(r["metrics_json"]) if isinstance(r["metrics_json"], str) else r["metrics_json"],
            "validation_passed": bool(r["validation_passed"]),
            "rejection_reason": r["rejection_reason"],
            "deployed_at": str(r["deployed_at"])
        }

    def get_model_history(self, company_id: str) -> List[Dict[str, Any]]:
        query = "SELECT * FROM model_deployments WHERE company_id = %s ORDER BY deployed_at DESC LIMIT 20"
        rows = self._execute(query, (company_id,), fetch_all=True) or []
        res = []
        for r in rows:
            res.append({
                "id": r["id"],
                "company_id": r["company_id"],
                "model_version": r["model_version"],
                "status": r["status"],
                "accuracy": float(r["accuracy"]),
                "f1_score": float(r["f1_score"]),
                "precision": float(r["precision"]),
                "recall": float(r["recall"]),
                "metrics": json.loads(r["metrics_json"]) if isinstance(r["metrics_json"], str) else r["metrics_json"],
                "validation_passed": bool(r["validation_passed"]),
                "rejection_reason": r["rejection_reason"],
                "deployed_at": str(r["deployed_at"])
            })
        return res

    # ------------------ Data Cleaning Logs ------------------ #
    def add_cleaning_logs(self, logs: List[Dict[str, Any]]):
        if not logs:
            return
        now_str = datetime.now(timezone.utc).isoformat()
        for log_entry in logs:
            c_id = log_entry.get("company_id", "default")
            v_id = str(log_entry.get("vendor_id", ""))
            order_id = log_entry.get("order_id") or log_entry.get("record_id")
            f_name = log_entry.get("field_name", "")
            i_type = log_entry.get("issue_type", "")
            raw = str(log_entry.get("raw_value", ""))
            cleaned = str(log_entry.get("cleaned_value", ""))
            act = log_entry.get("action_taken", "")
            exp = log_entry.get("explanation", "")
            
            if self.use_postgres:
                query = """
                    INSERT INTO data_cleaning_logs
                        (company_id, vendor_id, order_id, field_name, issue_type, raw_value, cleaned_value, action_taken, explanation, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """
                self._execute(query, (c_id, v_id, order_id, f_name, i_type, raw, cleaned, act, exp))
            else:
                query = """
                    INSERT INTO data_cleaning_logs
                        (company_id, vendor_id, order_id, field_name, issue_type, raw_value, cleaned_value, action_taken, explanation, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                self._execute(query, (c_id, v_id, order_id, f_name, i_type, raw, cleaned, act, exp, now_str))

    def get_cleaning_logs(self, company_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        query = "SELECT * FROM data_cleaning_logs WHERE company_id = %s ORDER BY created_at DESC LIMIT %s"
        rows = self._execute(query, (company_id, limit), fetch_all=True) or []
        res = []
        for r in rows:
            res.append({
                "id": r["id"],
                "company_id": r["company_id"],
                "vendor_id": r["vendor_id"],
                "order_id": r.get("order_id"),
                "field_name": r["field_name"],
                "issue_type": r["issue_type"],
                "raw_value": r["raw_value"],
                "cleaned_value": r["cleaned_value"],
                "action_taken": r["action_taken"],
                "explanation": r["explanation"],
                "created_at": str(r["created_at"])
            })
        return res
