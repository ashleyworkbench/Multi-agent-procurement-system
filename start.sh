#!/bin/bash
set -e

echo "================================================="
echo "   PROCUREFLOW — MULTI-AGENT PROCUREMENT SYSTEM  "
echo "================================================="
echo ""

if [ ! -f .env ]; then
    echo "⚠️ .env file not found. Copying from .env.example..."
    cp .env.example .env
fi

echo "🚀 [1/4] Starting Infrastructure (Databases, Kafka, Redis, MinIO)..."
docker compose up -d postgres mysql redis zookeeper kafka minio

echo "⏳ Waiting 20 seconds for infrastructure initialization..."
sleep 20

echo "🚀 [2/4] Starting Core Backend Microservices..."
docker compose up -d api-gateway ocr-service inventory-service vendor-service procurement-service onboarding-service

echo "⏳ Waiting 10 seconds for backend microservices..."
sleep 10

echo "🚀 [3/4] Starting Autonomous AI Agents (1, 2, 3, 4)..."
docker compose up -d agent1-ocr agent2-inventory agent3-vendor agent4-procurement

echo "🚀 [4/4] Starting Frontend Dashboard..."
docker compose up -d frontend

echo ""
echo "================================================="
echo "   Checking Service Status...                    "
echo "================================================="
docker compose ps

echo ""
echo "✨ System is UP and READY!"
echo "🌐 Frontend Dashboard: http://localhost:3000"
echo "🌐 API Gateway:        http://localhost:8000"
echo "🌐 Agent 1 (OCR):      http://localhost:8009"
echo "🌐 Agent 2 (Inventory):http://localhost:8005"
echo "🌐 Agent 3 (Vendor):   http://localhost:8006"
echo "🌐 Agent 4 (Procure):  http://localhost:8008"
echo "🌐 MinIO Console:      http://localhost:9001 (minioadmin / minioadmin)"
echo ""
