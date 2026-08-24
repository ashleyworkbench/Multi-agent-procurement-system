# How Industry Detection Works

## Overview
The system automatically detects which industry an invoice belongs to by analyzing the **item descriptions** extracted by the LLM.

---

## Detection Method: Keyword Scoring Algorithm

### Step-by-Step Process:

#### 1. **Extract Item Descriptions**
After LLM extraction, we have item descriptions like:
```json
{
  "items": [
    {"description": "SKF Bearing 6205", "quantity": 150},
    {"description": "Copper Wire 1mm (roll)", "quantity": 500},
    {"description": "Hydraulic Cylinder", "quantity": 10}
  ]
}
```

#### 2. **Match Against Keyword Dictionary**

Each industry has a predefined list of keywords:

```python
INDUSTRY_KEYWORDS = {
    "construction": [
        "cement", "steel", "sand", "concrete", "brick", 
        "tmt", "rebar", "aggregate", "plywood", "roofing", 
        "tile", "pvc pipe", "aac"
    ],
    
    "pharma": [
        "paracetamol", "ibuprofen", "amoxicillin", 
        "ciprofloxacin", "metformin", "insulin", 
        "tablet", "capsule", "syrup", "mg",
        "pharmaceutical", "medicine", "drug", "antibiotic"
    ],
    
    "manufacturing": [
        "bearing", "motor", "copper wire", "aluminium", 
        "aluminum", "hydraulic", "gear", "v-belt", 
        "solenoid", "pneumatic", "drill bit", "lathe", 
        "cnc", "machining"
    ],
    
    "electronics": [
        "resistor", "capacitor", "microcontroller", 
        "sensor", "led", "arduino", "raspberry", "esp32", 
        "transistor", "mosfet", "pcb", "inductor", 
        "voltage regulator", "ic", "relay"
    ]
}
```

#### 3. **Score Each Industry**

For each item description, the system:
1. Converts description to lowercase
2. Checks if any keyword appears in the description
3. Increments that industry's score for each match

**Example: "SKF Bearing 6205"**
```python
desc_lower = "skf bearing 6205"

Scores:
- construction: 0    (no keywords found)
- pharma: 0          (no keywords found)
- manufacturing: 1   (found "bearing" ✓)
- electronics: 0     (no keywords found)

Result: manufacturing
```

**Example: "Copper Wire 1mm (roll)"**
```python
desc_lower = "copper wire 1mm (roll)"

Scores:
- construction: 0
- pharma: 0
- manufacturing: 1   (found "copper wire" ✓)
- electronics: 0

Result: manufacturing
```

#### 4. **Select Highest Score**

The industry with the highest score wins:
```python
best = max(scores, key=lambda k: scores[k])
```

#### 5. **Fallback to Default**

If **NO** keywords match (score = 0 for all industries):
```python
if scores[best] == 0:
    log.warning(f"Could not detect industry for '{item_description}', defaulting to construction")
    return "construction"
```

---

## Complete Detection Flow

```
Invoice Items
     ↓
┌─────────────────────────────────────────────┐
│ For each item:                              │
│   1. Convert description to lowercase       │
│   2. Check against all keyword lists        │
│   3. Count matches per industry             │
│   4. Select industry with highest score     │
│   5. If all scores = 0, default to         │
│      construction                            │
└─────────────────────────────────────────────┘
     ↓
Collect all detected industries into a set
     ↓
["manufacturing"]  or  ["construction", "electronics"]
```

---

## Examples

### Example 1: Pure Manufacturing Invoice
```json
{
  "items": [
    {"description": "SKF Bearing 6205"},
    {"description": "Copper Wire 1mm"},
    {"description": "Hydraulic Cylinder"},
    {"description": "V-Belt (B-Section)"}
  ]
}
```

**Detection Result:**
- Item 1: manufacturing (keyword: "bearing")
- Item 2: manufacturing (keyword: "copper wire")
- Item 3: manufacturing (keyword: "hydraulic")
- Item 4: manufacturing (keyword: "v-belt")

**Industries Detected:** `["manufacturing"]`

---

### Example 2: Mixed Industry Invoice
```json
{
  "items": [
    {"description": "Cement bags (50kg)"},
    {"description": "Arduino Uno R3"},
    {"description": "Paracetamol 500mg tablets"}
  ]
}
```

**Detection Result:**
- Item 1: construction (keyword: "cement")
- Item 2: electronics (keyword: "arduino")
- Item 3: pharma (keyword: "paracetamol")

**Industries Detected:** `["construction", "electronics", "pharma"]`

---

### Example 3: No Keywords Match
```json
{
  "items": [
    {"description": "Office Chair (ergonomic)"},
    {"description": "Desk Lamp LED"}
  ]
}
```

**Detection Result:**
- Item 1: construction (default - no match)
- Item 2: construction (default - no match)

**Industries Detected:** `["construction"]` (fallback)

---

## Where Detection Happens

Industry detection occurs in **TWO** places:

### 1. **Agent 1** (kafka_consumer.py)
- **When:** After LLM extraction, BEFORE creating procurement request
- **Purpose:** Validate that all detected industries are connected
- **Action:** Blocks processing if any industry is not connected

```python
# In Agent 1
detected_industries = detect_industries_from_items(structured_data.get("items", []))
connected_industries = get_connected_industries()

if any industry not connected:
    FAIL with error message
```

### 2. **Agent 2** (main.py)
- **When:** Processing inventory evaluation
- **Purpose:** Route inventory queries to correct database
- **Action:** Queries manufacturing_inventory_db vs construction_inventory_db

```python
# In Agent 2
for item in items:
    industry = detect_industry(item["description"])
    stock_data = call_gateway_inventory(item["description"], industry)
```

---

## Accuracy & Limitations

### ✅ **Works Well For:**
- Standard industry terms (bearing, cement, resistor)
- Common product names (paracetamol, steel, arduino)
- Technical terms (hydraulic, cnc, pcb)

### ⚠️ **Limitations:**
- **Generic terms**: "Office Chair" doesn't match any keywords
- **Ambiguous items**: "Wire" could be construction or manufacturing
- **New/unusual terms**: Custom product names may not match
- **Typos**: "bering" instead of "bearing" won't match

### 💡 **Fallback Behavior:**
When no keywords match, defaults to **construction** (most common industry in procurement)

---

## Improving Detection

### Option 1: Add More Keywords (Easy)
Edit the `INDUSTRY_KEYWORDS` dictionary:
```python
"manufacturing": [
    "bearing", "motor", "copper wire",
    # Add new keywords here:
    "gear box", "shaft", "coupling", "pulley"
]
```

### Option 2: Use Machine Learning (Advanced)
- Train a classifier on labeled invoice data
- Use word embeddings (Word2Vec, BERT)
- Handle typos and variations better
- Better accuracy on ambiguous cases

### Option 3: Let Users Override (Manual)
- Add "Industry" field in upload form
- User manually selects industry
- Skip auto-detection entirely

### Option 4: Multi-label Classification
- Allow items to belong to multiple industries
- Example: "Steel Wire" → both construction AND manufacturing
- More complex logic needed

---

## Testing Industry Detection

### Test Function:
```python
def test_detection():
    test_items = [
        {"description": "SKF Bearing 6205"},
        {"description": "Cement bags (50kg)"},
        {"description": "Arduino Uno R3"},
        {"description": "Paracetamol 500mg"}
    ]
    
    for item in test_items:
        industry = detect_industry(item["description"])
        print(f"{item['description']:<30} → {industry}")
```

### Expected Output:
```
SKF Bearing 6205               → manufacturing
Cement bags (50kg)             → construction
Arduino Uno R3                 → electronics
Paracetamol 500mg              → pharma
```

---

## Configuration

The keyword dictionary is **hardcoded** in:
- `services/agent1-ocr/app/kafka_consumer.py` (Agent 1)
- `services/agent2-inventory/main.py` (Agent 2)

**Important:** Keep both files synchronized with the same keywords!

---

## Logs

When detection happens, you'll see logs like:
```
2026-08-22 05:30:15 - agent1-consumer - INFO - Detected industry 'manufacturing' for item 'SKF Bearing 6205' (score=1)
2026-08-22 05:30:15 - agent1-consumer - WARNING - Could not detect industry for 'Office Chair', defaulting to construction
```

---

## Summary

| Aspect | Details |
|--------|---------|
| **Method** | Keyword matching with scoring |
| **Input** | Item descriptions from LLM extraction |
| **Output** | Set of detected industries |
| **Fallback** | Defaults to "construction" if no match |
| **Used By** | Agent 1 (validation), Agent 2 (routing) |
| **Accuracy** | Good for standard terms, limited for generic items |
| **Customizable** | Yes - edit INDUSTRY_KEYWORDS dictionary |

The system prioritizes **simplicity and speed** over perfect accuracy. For most procurement use cases, this keyword-based approach is sufficient and requires no training data or ML models.
