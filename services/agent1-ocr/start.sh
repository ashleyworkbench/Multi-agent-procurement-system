#!/bin/sh
set -e

echo "Starting Agent 1 OCR Service..."

# Start Kafka consumer in background, restart on crash
while true; do
    echo "Starting Kafka consumer..."
    python -m app.kafka_consumer || echo "Kafka consumer crashed, restarting in 10s..."
    sleep 10
done &

# Start FastAPI (foreground)
exec uvicorn app.main:app --host 0.0.0.0 --port 8009
