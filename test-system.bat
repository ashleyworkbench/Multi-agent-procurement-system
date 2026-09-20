@echo off
REM ============================================================================
REM PROCUREFLOW - WINDOWS HEALTH CHECK SCRIPT (Command Prompt)
REM Verifies all microservices, agents, and frontend endpoints
REM ============================================================================

echo =================================================
echo    PROCUREFLOW HEALTH ^& INTEGRATION CHECK (WINDOWS)
echo =================================================
echo.

echo Testing Service Health Endpoints:
curl.exe -s -f "http://localhost:8000/health" >nul 2>&1 && echo   [OK] API Gateway        (http://localhost:8000/health) || echo   [FAIL] API Gateway
curl.exe -s -f "http://localhost:8001/health" >nul 2>&1 && echo   [OK] OCR Service        (http://localhost:8001/health) || echo   [FAIL] OCR Service
curl.exe -s -f "http://localhost:8002/health" >nul 2>&1 && echo   [OK] Inventory Service  (http://localhost:8002/health) || echo   [FAIL] Inventory Service
curl.exe -s -f "http://localhost:8003/health" >nul 2>&1 && echo   [OK] Vendor Service     (http://localhost:8003/health) || echo   [FAIL] Vendor Service
curl.exe -s -f "http://localhost:8004/health" >nul 2>&1 && echo   [OK] Procurement Service (http://localhost:8004/health) || echo   [FAIL] Procurement Service
curl.exe -s -f "http://localhost:8005/health" >nul 2>&1 && echo   [OK] Agent 2 (Inventory)(http://localhost:8005/health) || echo   [FAIL] Agent 2
curl.exe -s -f "http://localhost:8006/health" >nul 2>&1 && echo   [OK] Agent 3 (Vendor)   (http://localhost:8006/health) || echo   [FAIL] Agent 3
curl.exe -s -f "http://localhost:8007/health" >nul 2>&1 && echo   [OK] Onboarding Service (http://localhost:8007/health) || echo   [FAIL] Onboarding Service
curl.exe -s -f "http://localhost:8008/health" >nul 2>&1 && echo   [OK] Agent 4 (Procure)  (http://localhost:8008/health) || echo   [FAIL] Agent 4
curl.exe -s -f "http://localhost:8009/health" >nul 2>&1 && echo   [OK] Agent 1 (OCR/LLM)  (http://localhost:8009/health) || echo   [FAIL] Agent 1
curl.exe -s -f "http://localhost:3000" >nul 2>&1 && echo   [OK] Frontend Dashboard (http://localhost:3000) || echo   [FAIL] Frontend Dashboard

echo.
echo Testing Gateway Inventory Route (Construction):
curl.exe -s -H "X-API-KEY: GATEWAY-master-key-2024" "http://localhost:8000/inventory/items?industry=construction"
echo.
echo.
echo Testing Procurement Service PO Summary:
curl.exe -s -H "X-API-KEY: PROC-f3a8e7d6-9645-4827-34ab-7abc56789012" "http://localhost:8004/dashboard/summary"
echo.
