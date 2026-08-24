# ============================================================================
# Complete System Rebuild Script - Backend + Frontend
# ============================================================================

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  PROCUREFLOW COMPLETE SYSTEM REBUILD" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will rebuild:" -ForegroundColor White
Write-Host "  1. Backend Docker containers (Agents 1-4, Services)" -ForegroundColor Gray
Write-Host "  2. Frontend Next.js application" -ForegroundColor Gray
Write-Host ""

$confirmation = Read-Host "Continue? (y/n)"
if ($confirmation -ne "y") {
    Write-Host "Cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host "  PHASE 1: BACKEND REBUILD" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host ""

# Step 1: Stop all containers
Write-Host "[1/8] Stopping all Docker containers..." -ForegroundColor Yellow
docker-compose down
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ All containers stopped" -ForegroundColor Green
} else {
    Write-Host "⚠ Some containers may already be stopped" -ForegroundColor Yellow
}
Write-Host ""

# Step 2: Rebuild Agent 1 (has new code)
Write-Host "[2/8] Rebuilding Agent 1 (OCR) with industry check..." -ForegroundColor Yellow
docker-compose build agent1-ocr
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Agent 1 rebuilt successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Agent 1 rebuild failed" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 3: Start infrastructure
Write-Host "[3/8] Starting infrastructure (Databases, Kafka, Redis)..." -ForegroundColor Yellow
docker-compose up -d postgres mysql redis zookeeper kafka minio
Write-Host "⏳ Waiting 30 seconds for infrastructure to be ready..." -ForegroundColor Gray
Start-Sleep -Seconds 30
Write-Host "✓ Infrastructure started" -ForegroundColor Green
Write-Host ""

# Step 4: Start backend services
Write-Host "[4/8] Starting backend services (API Gateway, OCR, etc.)..." -ForegroundColor Yellow
docker-compose up -d api-gateway ocr-service inventory-service vendor-service procurement-service onboarding-service
Write-Host "⏳ Waiting 10 seconds for services..." -ForegroundColor Gray
Start-Sleep -Seconds 10
Write-Host "✓ Backend services started" -ForegroundColor Green
Write-Host ""

# Step 5: Start agents
Write-Host "[5/8] Starting all agents (1, 2, 3, 4)..." -ForegroundColor Yellow
docker-compose up -d agent1-ocr agent2-inventory agent3-vendor agent4-procurement
Write-Host "⏳ Waiting 15 seconds for agents..." -ForegroundColor Gray
Start-Sleep -Seconds 15
Write-Host "✓ All agents started" -ForegroundColor Green
Write-Host ""

# Step 6: Verify containers
Write-Host "[6/8] Verifying container status..." -ForegroundColor Yellow
$containers = docker ps --format "{{.Names}}" | Select-String "procurement"
$containerCount = ($containers | Measure-Object).Count
Write-Host "✓ Found $containerCount running containers" -ForegroundColor Green

# Check critical containers
$criticalContainers = @(
    "procurement_agent1",
    "procurement_agent2", 
    "procurement_agent3",
    "procurement_agent4",
    "procurement_postgres",
    "procurement_kafka"
)

Write-Host ""
Write-Host "Checking critical containers:" -ForegroundColor White
foreach ($container in $criticalContainers) {
    $status = docker ps --filter "name=$container" --format "{{.Status}}"
    if ($status) {
        Write-Host "  ✓ $container : $status" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $container : NOT RUNNING" -ForegroundColor Red
    }
}
Write-Host ""

# Step 7: Check Agent 1 Kafka consumer
Write-Host "[7/8] Verifying Agent 1 Kafka consumer thread..." -ForegroundColor Yellow
Start-Sleep -Seconds 5
$kafkaLogs = docker logs procurement_agent1 --tail 50 2>&1 | Select-String "Kafka consumer connected"
if ($kafkaLogs) {
    Write-Host "✓ Agent 1 Kafka consumer is connected" -ForegroundColor Green
} else {
    Write-Host "⚠ Kafka consumer status unclear - check logs" -ForegroundColor Yellow
}
Write-Host ""

# Step 8: Display agent status
Write-Host "[8/8] Checking agent health endpoints..." -ForegroundColor Yellow
$agents = @(
    @{Name="Agent 1"; Port=8009},
    @{Name="Agent 2"; Port=8005},
    @{Name="Agent 3"; Port=8006},
    @{Name="Agent 4"; Port=8008}
)

foreach ($agent in $agents) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$($agent.Port)/health" -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "  ✓ $($agent.Name) (port $($agent.Port)) - HEALTHY" -ForegroundColor Green
        }
    } catch {
        Write-Host "  ⚠ $($agent.Name) (port $($agent.Port)) - Not responding yet" -ForegroundColor Yellow
    }
}
Write-Host ""
Write-Host "✓ Backend rebuild complete!" -ForegroundColor Green
Write-Host ""

# Phase 2: Frontend
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host "  PHASE 2: FRONTEND REBUILD" -ForegroundColor Magenta
Write-Host "=========================================" -ForegroundColor Magenta
Write-Host ""

Write-Host "Starting frontend rebuild..." -ForegroundColor Yellow
Write-Host ""

# Run frontend rebuild script
& .\rebuild-frontend.ps1
