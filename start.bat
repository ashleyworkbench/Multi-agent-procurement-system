@echo off
REM ============================================================================
REM PROCUREFLOW - WINDOWS STARTUP SCRIPT (Command Prompt)
REM Starts databases, backend microservices, autonomous agents and dashboard
REM ============================================================================

echo =================================================
echo    PROCUREFLOW - MULTI-AGENT PROCUREMENT SYSTEM  
echo =================================================
echo.

REM 1. Ensure .env exists
if not exist .env (
    echo [INFO] .env file not found. Creating from .env.example...
    copy .env.example .env >nul
    echo [OK] Created .env configuration file.
)

REM 2. Start Infrastructure
echo.
echo [1/4] Starting Infrastructure (PostgreSQL, MySQL, Redis, Kafka, Zookeeper, MinIO)...
docker compose up -d postgres mysql redis zookeeper kafka minio
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start infrastructure containers. Is Docker Desktop running?
    exit /b %errorlevel%
)

echo [INFO] Waiting 20 seconds for database and broker initialization...
timeout /t 20 /nobreak >nul

REM 3. Start Core Backend Services
echo.
echo [2/4] Starting Core Backend Microservices...
docker compose up -d api-gateway ocr-service inventory-service vendor-service procurement-service onboarding-service
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start backend microservices.
    exit /b %errorlevel%
)

echo [INFO] Waiting 10 seconds for backend microservices to initialize...
timeout /t 10 /nobreak >nul

REM 4. Start Autonomous Agents
echo.
echo [3/4] Starting Autonomous AI Agents (1, 2, 3, 4)...
docker compose up -d agent1-ocr agent2-inventory agent3-vendor agent4-procurement
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start autonomous agents.
    exit /b %errorlevel%
)

REM 5. Start Frontend
echo.
echo [4/4] Starting Frontend Dashboard...
docker compose up -d frontend
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start frontend dashboard.
    exit /b %errorlevel%
)

echo.
echo =================================================
echo    Checking Service Status...
echo =================================================
docker compose ps

echo.
echo =================================================
echo    ProcureFlow is UP and READY on Windows!
echo =================================================
echo   Frontend Dashboard:  http://localhost:3000
echo   API Gateway:         http://localhost:8000
echo   Agent 1 (OCR/LLM):   http://localhost:8009
echo   Agent 2 (Inventory): http://localhost:8005
echo   Agent 3 (Vendor):    http://localhost:8006
echo   Agent 4 (Procure):   http://localhost:8008
echo   MinIO Console:       http://localhost:9001 (minioadmin / minioadmin)
echo =================================================
echo.
