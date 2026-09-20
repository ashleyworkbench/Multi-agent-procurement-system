# ============================================================================
# PROCUREFLOW - WINDOWS POWERSHELL HEALTH CHECK SCRIPT
# Verifies all microservices, agents, and frontend endpoints
# Run in PowerShell: .\test-system.ps1
# ============================================================================

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "   PROCUREFLOW HEALTH & INTEGRATION CHECK        " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

function Test-Endpoint {
    param (
        [string]$Name,
        [string]$Url
    )
    try {
        $resp = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
            Write-Host "  ✅ $Name is UP ($Url)" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $Name returned status $($resp.StatusCode) ($Url)" -ForegroundColor Red
        }
    } catch {
        Write-Host "  ❌ $Name is DOWN/UNAVAILABLE ($Url)" -ForegroundColor Red
    }
}

Write-Host "Testing Service Health Endpoints:" -ForegroundColor Yellow
Test-Endpoint "API Gateway        " "http://localhost:8000/health"
Test-Endpoint "OCR Service        " "http://localhost:8001/health"
Test-Endpoint "Inventory Service  " "http://localhost:8002/health"
Test-Endpoint "Vendor Service     " "http://localhost:8003/health"
Test-Endpoint "Procurement Service" "http://localhost:8004/health"
Test-Endpoint "Agent 2 (Inventory)" "http://localhost:8005/health"
Test-Endpoint "Agent 3 (Vendor)   " "http://localhost:8006/health"
Test-Endpoint "Onboarding Service " "http://localhost:8007/health"
Test-Endpoint "Agent 4 (Procure)  " "http://localhost:8008/health"
Test-Endpoint "Agent 1 (OCR/LLM)  " "http://localhost:8009/health"
Test-Endpoint "Frontend Dashboard " "http://localhost:3000"

Write-Host ""
Write-Host "Testing Gateway Inventory Route (Construction):" -ForegroundColor Yellow
try {
    $inv = Invoke-RestMethod -Uri "http://localhost:8000/inventory/items?industry=construction" -Headers @{ "X-API-KEY" = "GATEWAY-master-key-2024" } -Method Get
    Write-Host ($inv | ConvertTo-Json -Depth 2 | Select-Object -First 10) -ForegroundColor Gray
} catch {
    Write-Host "  Failed to query inventory: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "Testing Procurement Service PO Summary:" -ForegroundColor Yellow
try {
    $summary = Invoke-RestMethod -Uri "http://localhost:8004/dashboard/summary" -Headers @{ "X-API-KEY" = "PROC-f3a8e7d6-9645-4827-34ab-7abc56789012" } -Method Get
    Write-Host ($summary | ConvertTo-Json -Depth 2) -ForegroundColor Gray
} catch {
    Write-Host "  Failed to query PO summary: $_" -ForegroundColor Red
}
Write-Host ""
