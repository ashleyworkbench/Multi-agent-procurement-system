import os
from pathlib import Path
from pydantic import BaseModel

# Service Configuration
SERVICE_PORT = int(os.getenv("PORT", "8010"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Gateway and Auth
GATEWAY_URL = os.getenv("INTEGRATION_GATEWAY_URL", "http://localhost:8000")
GATEWAY_KEY = os.getenv("GATEWAY_KEY", "GATEWAY-master-key-2024")

# Database Configuration
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_USER = os.getenv("POSTGRES_USER", "procurement_admin")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "SecurePass@2024")
POSTGRES_DB = os.getenv("RISK_DB_NAME", "procurement_db")

# Fallback SQLite DB path for local development/testing without docker postgres
SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", str(Path(__file__).parent / "risk_analysis.db"))

# Models and Artifacts Directory
ARTIFACTS_DIR = Path(os.getenv("RISK_ARTIFACTS_DIR", str(Path(__file__).parent / "data" / "models")))
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

# Default Company ID
DEFAULT_COMPANY_ID = os.getenv("DEFAULT_COMPANY_ID", "construction")

# Retraining and Evaluation Defaults
DEFAULT_AUTO_RETRAIN_THRESHOLD = int(os.getenv("AUTO_RETRAIN_THRESHOLD", "5"))
DEFAULT_MIN_ACCURACY = float(os.getenv("MIN_ACCURACY", "0.70"))
DEFAULT_MIN_F1_SCORE = float(os.getenv("MIN_F1_SCORE", "0.65"))
DEFAULT_MAX_DEGRADATION = float(os.getenv("MAX_DEGRADATION", "0.05"))
