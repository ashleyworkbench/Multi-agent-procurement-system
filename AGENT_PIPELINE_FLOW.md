# Automated Procurement System - Agent Pipeline Flow

## Overview
This document describes the complete automated procurement pipeline connecting Agents 1-4.

## Agent Architecture

### Agent 1: Document Intelligence (OCR + LLM)
- **Input**: Invoice uploads via `/upload` endpoint or document reprocessing
- **Processing**:
  1. Uploads document to MinIO
  2. Runs Tesseract OCR extraction
  3. Runs LLM extraction (Groq/Gemini fallback)
  4. Stores procurement request in PostgreSQL
- **Output**: Publishes to `ocr-request-topic`
- **Event Format**:
```json
{
  "event_type": "OCR_REQUEST_CREATED",
  "source_agent": "agent_1",
  "request_id": 123,
  "processing_id": 456,
  "filename": "invoice.pdf",
  "file_path": "invoices/456_invoice.pdf"
}
```

### Agent 2: Inventory Intelligence
- **Input**: Listens on `ocr-request-topic`
- **Processing**:
  1. Fetches procurement request items from OCR Service API
  2. Detects industry from item descriptions
  3. Checks connected industries (blocks unconnected ones)
  4. Queries Integration Gateway for inventory stock
  5. Calculates shortages (requested - available)
  6. Caches results in Redis
- **Output**: Publishes to `inventory-evaluation-topic`
- **Event Format**:
```json
{
  "event_type": "INVENTORY_EVALUATED",
  "source_agent": "agent_2",
  "request_id": 123,
  "evaluated_at": "2026-08-21T16:30:00Z",
  "payload": {
    "request_id": 123,
    "total_items": 5,
    "shortage_items": 2,
    "all_items_available": false,
    "total_shortage_cost": 15000.00,
    "items": [...],
    "shortages": [...]
  }
}
```

### Agent 3: Vendor Intelligence
- **Input**: Listens on `inventory-evaluation-topic`
- **Processing**:
  1. Extracts shortage items from inventory evaluation
  2. For each shortage → queries Integration Gateway for vendors
  3. Scores vendors using weighted algorithm:
     - Rating: 40%
     - Price: 35%
     - Lead time: 25%
  4. Ranks vendors and selects best match
  5. Caches vendor data in Redis
- **Output**: Publishes to `vendor-recommendation-topic`
- **Event Format**:
```json
{
  "event_type": "VENDOR_RECOMMENDED",
  "source_agent": "agent_3",
  "request_id": 123,
  "recommended_at": "2026-08-21T16:31:00Z",
  "payload": {
    "request_id": 123,
    "total_shortage_items": 2,
    "vendors_found": 2,
    "no_vendor_items": 0,
    "total_recommended_cost": 14500.00,
    "recommendations": [...]
  }
}
```

### Agent 4: Procurement Execution
- **Input**: Listens on `vendor-recommendation-topic`
- **Processing**:
  1. Generates unique PO numbers (PO-YYYY-XXXXXX format)
  2. Creates Purchase Orders via Procurement Service API
  3. Calculates delivery dates based on vendor lead times
  4. Logs procurement events
  5. Sets PO status to "PENDING_APPROVAL"
- **Output**: Publishes to `purchase-order-topic`
- **Event Format**:
```json
{
  "event_type": "PURCHASE_ORDER_CREATED",
  "source_agent": "agent_4",
  "request_id": 123,
  "processed_at": "2026-08-21T16:32:00Z",
  "payload": {
    "request_id": 123,
    "pos_created": 2,
    "failed_items": 0,
    "total_po_value": 14500.00,
    "purchase_orders": [...],
    "status": "COMPLETED"
  }
}
```

## Complete Flow Timeline

```
[User Upload] → Agent 1 (OCR/LLM) 
                    ↓ ocr-request-topic
                Agent 2 (Inventory Check)
                    ↓ inventory-evaluation-topic
                Agent 3 (Vendor Selection)
                    ↓ vendor-recommendation-topic
                Agent 4 (PO Generation)
                    ↓ purchase-order-topic
              [Approval Workflow]
```

## Data Flow

1. **Invoice Upload** (User → Agent 1)
   - User uploads invoice via UI → `/upload`
   - Agent 1 extracts data and creates procurement request
   - Published to Kafka: `ocr-request-topic`

2. **Inventory Check** (Agent 1 → Agent 2)
   - Agent 2 consumes from `ocr-request-topic`
   - Checks inventory against requested items
   - Identifies shortages
   - Published to Kafka: `inventory-evaluation-topic`

3. **Vendor Selection** (Agent 2 → Agent 3)
   - Agent 3 consumes from `inventory-evaluation-topic`
   - Finds and ranks vendors for shortage items
   - Selects best vendors
   - Published to Kafka: `vendor-recommendation-topic`

4. **PO Creation** (Agent 3 → Agent 4)
   - Agent 4 consumes from `vendor-recommendation-topic`
   - Generates purchase orders
   - Stores in procurement database
   - Published to Kafka: `purchase-order-topic`

## Kafka Topics Summary

| Topic | Producer | Consumer | Purpose |
|-------|----------|----------|---------|
| `invoice-topic` | Agent 1 (internal) | Agent 1 (consumer thread) | Internal queue for document processing |
| `ocr-request-topic` | Agent 1 | Agent 2 | OCR completion → Inventory check |
| `inventory-evaluation-topic` | Agent 2 | Agent 3 | Inventory results → Vendor selection |
| `vendor-recommendation-topic` | Agent 3 | Agent 4 | Vendor selection → PO creation |
| `purchase-order-topic` | Agent 4 | (Future: Approval system) | PO creation → Approval workflow |

## Key Features

### 1. **Fully Automated Pipeline**
- Zero manual intervention required from upload to PO generation
- Each agent processes asynchronously via Kafka events
- Failure at any stage doesn't block upstream agents

### 2. **Industry-Aware Processing**
- Auto-detects industry from item descriptions
- Routes queries to appropriate databases
- Blocks processing for unconnected industries

### 3. **Intelligent Vendor Selection**
- Multi-factor scoring algorithm
- Considers: rating, price, lead time, fulfillment capability
- Caches vendor data for performance

### 4. **Resilience & Monitoring**
- Redis caching at each layer
- Structured logging with timestamps
- Health endpoints for monitoring
- Automatic retry via Kafka consumer groups

### 5. **API-Only Architecture**
- Agents never access databases directly
- All data access via service APIs
- Clean separation of concerns
- Easy to scale and maintain

## Testing the Pipeline

### End-to-End Test
```bash
# 1. Upload an invoice
curl -F "file=@invoice.pdf" http://localhost:8009/upload

# 2. Monitor processing
curl http://localhost:8009/processing/{processing_id}

# 3. Check agent statuses
curl http://localhost:8005/status  # Agent 2
curl http://localhost:8006/status  # Agent 3
curl http://localhost:8008/status  # Agent 4

# 4. View generated POs
curl http://localhost:8004/purchase-orders
```

### Manual Trigger (for testing)
```bash
# Trigger Agent 2 manually
curl -X POST http://localhost:8005/evaluate/{request_id}

# Trigger Agent 3 manually
curl -X POST http://localhost:8006/recommend \
  -H "Content-Type: application/json" \
  -d @inventory_eval.json

# Trigger Agent 4 manually
curl -X POST http://localhost:8008/process \
  -H "Content-Type: application/json" \
  -d @vendor_rec.json
```

## Monitoring & Debugging

### Check Kafka Topics
```bash
# List all topics
docker exec procurement_kafka kafka-topics --bootstrap-server localhost:9092 --list

# Check messages in a topic
docker exec procurement_kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic ocr-request-topic \
  --from-beginning \
  --max-messages 10
```

### Check Agent Logs
```bash
docker logs procurement_agent1  # Agent 1: OCR
docker logs procurement_agent2  # Agent 2: Inventory
docker logs procurement_agent3  # Agent 3: Vendor
docker logs procurement_agent4  # Agent 4: Procurement
```

### Check Redis Cache
```bash
docker exec procurement_redis redis-cli -a RedisPass@2024 KEYS "*"
docker exec procurement_redis redis-cli -a RedisPass@2024 GET <key>
```

## Current Status

✅ **Agent 1**: Fully operational (OCR + LLM extraction working)
✅ **Agent 2**: Ready to consume from `ocr-request-topic`
✅ **Agent 3**: Ready to consume from `inventory-evaluation-topic`
✅ **Agent 4**: Ready to consume from `vendor-recommendation-topic`
✅ **Kafka**: All topics auto-created, consumers connected
✅ **Redis**: Caching layer operational
✅ **Databases**: All schemas in place

## Next Steps

The system is now fully connected and operational. When you upload an invoice:

1. ✅ Agent 1 will extract the data and publish to Kafka
2. ✅ Agent 2 will check inventory and identify shortages
3. ✅ Agent 3 will find and rank vendors
4. ✅ Agent 4 will generate purchase orders

All processing happens automatically via Kafka event propagation!
