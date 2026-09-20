# ============================================================================
# PROCUREFLOW - WINDOWS POWERSHELL STARTUP SCRIPT
# Starts databases, backend microservices, autonomous agents and dashboard
# Run in PowerShell: .\start.ps1
# ============================================================================

$ErrorActionPreference = "Stop"

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   PROCUREFLOW — MULTI-AGENT PROCUREMENT SYSTEM  " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verify Docker is running
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Docker is not running. Please launch Docker Desktop and try again." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Docker is not found or not running. Please install/start Docker Desktop." -ForegroundColor Red
    exit 1
}

# 2. Ensure .env exists
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  .env file not found. Copying default configuration from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✅ Created .env" -ForegroundColor Green
}

# 3. Start Infrastructure
Write-Host "🚀 [1/4] Starting Infrastructure (PostgreSQL, MySQL, Redis, Kafka, Zookeeper, MinIO)..." -ForegroundColor Magenta
docker compose up -d postgres mysql redis zookeeper kafka minio

Write-Host "⏳ Waiting 20 seconds for infrastructure initialization..." -ForegroundColor DarkGray
Start-Sleep -Seconds 20

# 4. Start Core Backend Microservices
Write-Host "🚀 [2/4] Starting Core Backend Microservices..." -ForegroundColor Magenta
docker compose up -d api-gateway ocr-service inventory-service vendor-service procurement-service onboarding-service

Write-Host "⏳ Waiting 10 seconds for backend microservices..." -ForegroundColor DarkGray
Start-Sleep -Seconds 10

# 5. Start Autonomous Agents
Write-Host "🚀 [3/4] Starting Autonomous AI Agents (1, 2, 3, 4)..." -ForegroundColor Magenta
docker compose up -d agent1-ocr agent2-inventory agent3-vendor agent4-procurement

# 6. Start Frontend
Write-Host "🚀 [4/4] Starting Frontend Dashboard..." -ForegroundColor Magenta
docker compose up -d frontend

Write-Host ""
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   Checking Service Status...                    " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
docker compose ps

Write-Host ""
Write-Host "✨ ProcureFlow is UP and READY on Windows!" -ForegroundColor Green
Write-Host "🌐 Frontend Dashboard:  http://localhost:3000" -ForegroundColor Yellow
Write-Host "🌐 API Gateway:         http://localhost:8000" -ForegroundColor White
Write-Host "🌐 Agent 1 (OCR):       http://localhost:8009" -ForegroundColor White
Write-Host "🌐 Agent 2 (Inventory): http://localhost:8005" -ForegroundColor White
Write-Host "🌐 Agent 3 (Vendor):    http://localhost:8006" -ForegroundColor White
Write-Host "🌐 Agent 4 (Procure):   http://localhost:8008" -ForegroundColor White
Write-Host "🌐 MinIO Console:       http://localhost:9001 (minioadmin / minioadmin)" -ForegroundColor White
Write-Host ""
