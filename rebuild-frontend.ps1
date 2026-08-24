# ============================================================================
# Frontend Rebuild Script - Complete with Detailed Logging
# ============================================================================

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  PROCUREFLOW FRONTEND REBUILD" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Navigate to frontend directory
Write-Host "STEP 1/7 - Navigating to frontend directory..." -ForegroundColor Yellow
Set-Location -Path "frontend"
Write-Host "✓ Current directory: $(Get-Location)" -ForegroundColor Green
Write-Host ""

# Step 2: Check if node_modules exists
Write-Host "STEP 2/7 - Checking dependencies..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "✓ node_modules found" -ForegroundColor Green
} else {
    Write-Host "⚠ node_modules not found - will install" -ForegroundColor Yellow
}
Write-Host ""

# Step 3: Install/Update dependencies
Write-Host "STEP 3/7 - Installing dependencies (npm install)..." -ForegroundColor Yellow
Write-Host "This may take 1-2 minutes..." -ForegroundColor Gray
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Dependency installation failed" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 4: Clean Next.js cache
Write-Host "STEP 4/7 - Cleaning Next.js cache..." -ForegroundColor Yellow
if (Test-Path ".next") {
    Remove-Item -Path ".next" -Recurse -Force
    Write-Host "✓ .next directory removed" -ForegroundColor Green
} else {
    Write-Host "✓ No .next directory to clean" -ForegroundColor Green
}
Write-Host ""

# Step 5: Verify new files exist
Write-Host "STEP 5/7 - Verifying new component files..." -ForegroundColor Yellow
$newFiles = @(
    "src/components/workflows/WorkflowView.tsx",
    "src/lib/api.ts",
    "src/app/globals.css"
)

$allFilesExist = $true
foreach ($file in $newFiles) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file exists" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file MISSING!" -ForegroundColor Red
        $allFilesExist = $false
    }
}

if (-not $allFilesExist) {
    Write-Host ""
    Write-Host "✗ Some files are missing. Cannot proceed." -ForegroundColor Red
    exit 1
}
Write-Host "✓ All component files verified" -ForegroundColor Green
Write-Host ""

# Step 6: Build the application
Write-Host "STEP 6/7 - Building Next.js application..." -ForegroundColor Yellow
Write-Host "This may take 2-3 minutes..." -ForegroundColor Gray
Write-Host ""
npm run build
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Build completed successfully!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "✗ Build failed - check errors above" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 7: Start development server
Write-Host "STEP 7/7 - Starting development server..." -ForegroundColor Yellow
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Frontend will start in a moment..." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Access the application at:" -ForegroundColor White
Write-Host "  http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pages to check:" -ForegroundColor White
Write-Host "  • Agent Monitor:    http://localhost:3000/agents" -ForegroundColor Gray
Write-Host "  • Agent Logs:       http://localhost:3000/agent-logs" -ForegroundColor Gray
Write-Host "  • Workflows (NEW):  http://localhost:3000/workflows" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""
Write-Host "Starting server now..." -ForegroundColor Gray
Write-Host ""

npm run dev
