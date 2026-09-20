#!/bin/bash
echo "================================================="
echo "   PROCUREFLOW HEALTH & INTEGRATION CHECK        "
echo "================================================="
echo ""

check_service() {
    local name="$1"
    local url="$2"
    if curl -s -f "$url" > /dev/null 2>&1; then
        echo "  ✅ $name is UP ($url)"
    else
        echo "  ❌ $name is DOWN/UNAVAILABLE ($url)"
    fi
}

echo "Testing Service Health Endpoints:"
check_service "API Gateway        " "http://localhost:8000/health"
check_service "OCR Service        " "http://localhost:8001/health"
check_service "Inventory Service  " "http://localhost:8002/health"
check_service "Vendor Service     " "http://localhost:8003/health"
check_service "Procurement Service" "http://localhost:8004/health"
check_service "Agent 2 (Inventory)" "http://localhost:8005/health"
check_service "Agent 3 (Vendor)   " "http://localhost:8006/health"
check_service "Onboarding Service " "http://localhost:8007/health"
check_service "Agent 4 (Procure)  " "http://localhost:8008/health"
check_service "Agent 1 (OCR/LLM)  " "http://localhost:8009/health"
check_service "Frontend Dashboard " "http://localhost:3000"

echo ""
echo "Testing Gateway Inventory Route (Construction):"
curl -s -H "X-API-KEY: GATEWAY-master-key-2024" "http://localhost:8000/inventory/items?industry=construction" | head -c 200
echo ""
echo ""
echo "Testing Procurement Service PO Summary:"
curl -s -H "X-API-KEY: PROC-f3a8e7d6-9645-4827-34ab-7abc56789012" "http://localhost:8004/dashboard/summary" | head -c 200
echo ""
