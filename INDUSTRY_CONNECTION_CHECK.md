# Industry Connection Check - Agent 1 Fix

## Problem
Procurement requests were being created even when the required industry databases (inventory and vendor) were not connected, causing downstream agents to fail silently or create incomplete purchase orders.

## Solution
Added industry detection and connection validation in Agent 1 **BEFORE** creating procurement requests in the database.

---

## What Changed

### File Modified: `services/agent1-ocr/app/kafka_consumer.py`

#### 1. Added Industry Detection Keywords
```python
INDUSTRY_KEYWORDS = {
    "construction": ["cement", "steel", "sand", "concrete", ...],
    "pharma": ["paracetamol", "ibuprofen", "amoxicillin", ...],
    "manufacturing": ["bearing", "motor", "copper wire", ...],
    "electronics": ["resistor", "capacitor", "microcontroller", ...]
}
```

#### 2. Added Helper Functions
- `detect_industry(item_description)` - Detects industry from item keywords
- `detect_industries_from_items(items)` - Detects all industries from invoice items
- `get_connected_industries()` - Fetches connected industries from onboarding service

#### 3. Added Validation Check in Processing Pipeline

**Location**: After LLM extraction completes, BEFORE creating procurement request

```python
# Check connected industries BEFORE creating procurement request
detected_industries = detect_industries_from_items(structured_data.get("items", []))
connected_industries = get_connected_industries()

unconnected = [ind for ind in detected_industries if ind not in connected_industries]

if unconnected:
    error_msg = (
        f"Cannot process request: Industries {unconnected} are not connected. "
        f"Please connect these data sources in the Data Sources page before uploading invoices for these industries. "
        f"Currently connected: {list(connected_industries)}"
    )
    log.error(f"Processing {processing_id} blocked: {error_msg}")
    crud.update_gemini_status(db, processing_id, "failed")
    crud.save_processing_error(db, processing_id, error_msg)
    return  # Stop processing - do NOT create procurement request
```

---

## How It Works

### Processing Flow (Updated)

```
1. Upload Invoice → Agent 1
        ↓
2. OCR Extraction ✓
        ↓
3. LLM Extraction ✓
        ↓
4. Detect Industries from Items (NEW)
        ↓
5. Check Connected Industries (NEW)
        ↓
    ┌─────────────────────┐
    │ All Connected?      │
    └─────────────────────┘
             │
        ┌────┴────┐
       YES       NO
        │         │
        ↓         ↓
   Continue    FAIL with clear error message
   Create      - Shows which industries missing
   Request     - Shows currently connected
   Publish     - Saves to error_message field
   to Kafka    - Status: "failed"
```

---

## Error Message Format

When an unconnected industry is detected:

```
Cannot process request: Industries ['manufacturing'] are not connected. 
Please connect these data sources in the Data Sources page before uploading invoices for these industries. 
Currently connected: ['construction']
```

This error is:
- ✅ Stored in `document_processing.error_message`
- ✅ Logged in Agent 1 logs
- ✅ Visible in frontend when checking processing status
- ✅ Shows exact industries that need to be connected

---

## User Experience

### Before Fix:
1. Upload manufacturing invoice
2. Request created (even though manufacturing not connected)
3. Agent 2 blocks items silently
4. Agent 3 finds no vendors
5. Agent 4 creates empty/failed POs
6. **User confused** - no clear error message

### After Fix:
1. Upload manufacturing invoice
2. LLM extraction completes
3. **Agent 1 detects manufacturing items**
4. **Agent 1 checks: manufacturing NOT connected**
5. **Agent 1 BLOCKS processing with clear error:**
   ```
   Cannot process request: Industries ['manufacturing'] are not connected.
   Please connect these data sources in the Data Sources page...
   ```
6. **User sees clear error** in frontend
7. User goes to Data Sources page
8. User connects manufacturing databases
9. User re-uploads or reprocesses document
10. ✅ Success - flows through all agents

---

## Where User Sees the Error

### 1. Processing Status Endpoint
```bash
GET http://localhost:8009/processing/{processing_id}

Response:
{
  "status": "failed",
  "gemini_status": "failed",
  "error_message": "Cannot process request: Industries ['manufacturing'] are not connected. ..."
}
```

### 2. Document Details Endpoint
```bash
GET http://localhost:8009/documents/{processing_id}

Response:
{
  "status": "failed",
  "error_message": "Cannot process request: Industries ['manufacturing'] are not connected. ..."
}
```

### 3. Frontend UI
The error message appears in:
- Requests page
- Document history
- Processing status indicator

---

## Configuration

The onboarding service URL is configurable via environment variable:

```env
ONBOARDING_SERVICE_URL=http://onboarding-service:8000
```

Default: `http://onboarding-service:8000` (Docker internal network)

---

## Testing

### Test 1: Upload with Unconnected Industry

1. Ensure manufacturing is NOT connected:
   ```bash
   curl http://localhost:8007/connections/industries
   # Should NOT include "manufacturing"
   ```

2. Upload a manufacturing invoice:
   ```bash
   curl -F "file=@manufacturing_invoice.pdf" http://localhost:8009/upload
   ```

3. Check processing status:
   ```bash
   curl http://localhost:8009/processing/{processing_id}
   ```

4. **Expected Result**: 
   - Status: `failed`
   - Error message clearly states manufacturing not connected

### Test 2: Upload with Connected Industry

1. Connect manufacturing:
   ```bash
   curl -X POST http://localhost:8007/connections/connect \
     -H "Content-Type: application/json" \
     -d '{"industry": "manufacturing", "data_type": "inventory"}'
   
   curl -X POST http://localhost:8007/connections/connect \
     -H "Content-Type: application/json" \
     -d '{"industry": "manufacturing", "data_type": "vendor"}'
   ```

2. Upload manufacturing invoice again

3. **Expected Result**:
   - Status: `completed`
   - Request created successfully
   - Flows through all 4 agents automatically

---

## Benefits

1. **Early Failure** - Fails fast at Agent 1, not downstream
2. **Clear Error Messages** - User knows exactly what to do
3. **No Orphaned Data** - Doesn't create incomplete requests
4. **Better UX** - Guides user to connect data sources
5. **Prevents Confusion** - No silent failures in pipeline
6. **Consistent with Agent 2** - Uses same industry detection logic

---

## Rollback Plan

If issues occur, restart Agent 1 with the previous image:

```bash
docker restart procurement_agent1
```

Or revert the `kafka_consumer.py` file and rebuild.

---

**Status**: ✅ Implemented and Deployed
**Date**: August 22, 2026
**Agent Modified**: Agent 1 (Document Intelligence)
