# ============================================================================
# PROCUREFLOW - WINDOWS POWERSHELL STOP SCRIPT
# Stops all ProcureFlow containers cleanly
# Run in PowerShell: .\stop.ps1
# ============================================================================

Write-Host "Stopping all ProcureFlow services..." -ForegroundColor Yellow
docker compose down
Write-Host "✅ All containers stopped cleanly." -ForegroundColor Green
