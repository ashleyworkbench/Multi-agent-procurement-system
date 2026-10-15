# Multi-Agent Procurement System (ProcureFlow)
## Core Code Snippets & Architecture Reference for Project Report

This document compiles the most important code snippets across the **ProcureFlow** multi-agent architecture for direct inclusion in project reports, technical documentations, and IEEE/academic project dossier submissions.

---

### 1. ProcureFlow Admin Dashboard: Summary Metrics & Quick Actions
**Module:** `services/procurement-service/main.py` & `frontend/src/components/dashboard`  
**Purpose:** Provides real-time aggregated operational metrics across PostgreSQL database instances using optimized SQL aggregation and `COUNT(*)` queries, paired with quick action triggers.

```python
from fastapi import APIRouter, Depends, HTTPException
import psycopg2
from psycopg2.extras import RealDictCursor

router = APIRouter(prefix="/api/admin/dashboard", tags=["Admin Dashboard"])

@router.get("/metrics")
async def get_dashboard_metrics(db_conn = Depends(get_database_connection)):
    """
    Computes key executive KPIs for ProcureFlow Admin Dashboard:
    - Total Purchase Orders
    - Pending Approvals
    - Active Vendors
    - Inventory Shortages (Stock <= Reorder Level)
    - High-Risk Procurement Flags
    """
    cursor = db_conn.cursor(cursor_factory=RealDictCursor)
    try:
        # 1. Purchase Orders & Approvals (procurement_db)
        cursor.execute("""
            SELECT
                COUNT(*)                                            AS total_purchase_orders,
                COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL') AS pending_approvals,
                COUNT(*) FILTER (WHERE status = 'APPROVED')         AS approved_orders,
                COALESCE(SUM(total_price), 0.0)                     AS total_procurement_spend
            FROM purchase_orders;
        """)
        po_metrics = cursor.fetchone()

        # 2. Total Vendors (manufacturing_vendor_db / construction_vendor_db)
        cursor.execute("""
            SELECT 
                COUNT(*)                                     AS total_vendors,
                COUNT(*) FILTER (WHERE active_status = TRUE) AS active_vendors
            FROM vendor_master;
        """)
        vendor_metrics = cursor.fetchone()

        # 3. Inventory Shortages (Stock <= Reorder Level)
        cursor.execute("""
            SELECT 
                COUNT(*) AS inventory_shortages,
                COUNT(*) FILTER (WHERE quantity_in_stock = 0) AS out_of_stock_critical
            FROM inventory_items
            WHERE quantity_in_stock <= reorder_level;
        """)
        inventory_metrics = cursor.fetchone()

        # 4. Procurement Risks (Flagged performance / Compliance breaches)
        cursor.execute("""
            SELECT 
                COUNT(*) AS procurement_risks
            FROM vendor_performance
            WHERE ground_truth_risk = 'HIGH' 
               OR compliance_score::numeric < 70.0;
        """)
        risk_metrics = cursor.fetchone()

        # 5. Quick Actions Definition
        quick_actions = [
            {
                "id": "trigger_agent_pipeline",
                "label": "Run Autonomous Procurement Pipeline",
                "endpoint": "/api/pipeline/run",
                "method": "POST",
                "icon": "PlayCircle",
                "description": "Trigger Agents 1-4 to process queued purchase requisitions."
            },
            {
                "id": "review_pending_approvals",
                "label": "Review Pending Approvals",
                "endpoint": "/api/purchase-orders?status=PENDING_APPROVAL",
                "method": "GET",
                "icon": "FileCheck",
                "description": "Approve or reject POs requiring Tier-1 or Tier-2 clearance."
            },
            {
                "id": "emergency_reorder",
                "label": "Auto-Replenish Shortages",
                "endpoint": "/api/inventory/replenish",
                "method": "POST",
                "icon": "AlertTriangle",
                "description": "Issue bulk RFQs for all items at or below reorder threshold."
            }
        ]

        return {
            "status": "success",
            "kpis": {
                "total_purchase_orders": po_metrics["total_purchase_orders"],
                "pending_approvals":    po_metrics["pending_approvals"],
                "total_vendors":        vendor_metrics["total_vendors"],
                "inventory_shortages":  inventory_metrics["inventory_shortages"],
                "procurement_risks":    risk_metrics["procurement_risks"],
                "total_spend":          float(po_metrics["total_procurement_spend"])
            },
            "quick_actions": quick_actions
        }
    finally:
        cursor.close()
```

---

### 2. Frontend Stat Card Component (React + Tailwind CSS + Lucide Icons)
**Module:** `frontend/src/components/dashboard/StatCards.tsx`  
**Purpose:** Displays executive summary statistics with responsive badges and action handlers.

```tsx
import React from 'react';
import { ShoppingCart, Clock, Users, AlertTriangle, ShieldAlert } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  variant?: 'normal' | 'warning' | 'danger';
}

export const DashboardStats: React.FC<{ metrics: any }> = ({ metrics }) => {
  const cards = [
    { label: "Total POs",           value: metrics.total_purchase_orders, icon: ShoppingCart, variant: 'normal' },
    { label: "Pending Approvals",   value: metrics.pending_approvals,     icon: Clock,        variant: 'warning' },
    { label: "Active Vendors",      value: metrics.total_vendors,         icon: Users,        variant: 'normal' },
    { label: "Inventory Shortage",  value: metrics.inventory_shortages,   icon: AlertTriangle,variant: 'danger' },
    { label: "Procurement Risks",   value: metrics.procurement_risks,     icon: ShieldAlert,  variant: 'danger' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 my-6">
      {cards.map((c) => (
        <div key={c.label} className="bg-white rounded-xl shadow-sm p-4 border border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">{c.label}</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{c.value ?? 0}</h3>
          </div>
          <div className={`p-3 rounded-lg ${
            c.variant === 'danger' ? 'bg-red-50 text-red-600' :
            c.variant === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
          }`}>
            <c.icon size={22} />
          </div>
        </div>
      ))}
    </div>
  );
};
```

---

### 3. Agent 1: OCR & Requisition Extraction Pipeline
**Module:** `services/agent1-ocr/main.py`  
**Purpose:** Ingests unstructured invoices/RFQs, runs layout-aware text extraction, and publishes normalized requisition events to Kafka.

```python
@app.post("/extract-requisition")
async def extract_requisition_document(file: UploadFile = File(...)):
    """Extracts line items, vendor hints, and quantities from uploaded document."""
    file_bytes = await file.read()
    extracted_text = perform_ocr_extraction(file_bytes)
    
    # Structured Entity Extraction via LLM / Regex Parser
    parsed_requisition = extract_entities(extracted_text)
    
    # Publish to Kafka 'requisition-created' topic
    kafka_producer.send(
        topic="procurement.requisitions",
        key=str(parsed_requisition["request_id"]).encode("utf-8"),
        value=json.dumps(parsed_requisition).encode("utf-8")
    )
    return {"status": "QUEUED", "request_id": parsed_requisition["request_id"]}
```

---

### 4. Agent 2: Inventory & Shortage Verification
**Module:** `services/agent2-inventory/main.py`  
**Purpose:** Checks local warehouse stock to prevent duplicate orders and triggers procurement only for deficit quantities.

```python
def check_stock_and_reorder(item_name: str, requested_qty: int, db_cursor):
    """
    Evaluates current inventory levels against requested demand and reorder point.
    """
    db_cursor.execute("""
        SELECT id, name, quantity_in_stock, reorder_level 
        FROM inventory_items 
        WHERE LOWER(name) = LOWER(%s);
    """, (item_name,))
    item = db_cursor.fetchone()
    
    if not item:
        return {"status": "UNKNOWN_ITEM", "procure_needed": requested_qty}

    available_stock = item["quantity_in_stock"]
    shortage = max(0, requested_qty - available_stock)
    
    return {
        "item_id": item["id"],
        "in_stock": available_stock,
        "reorder_threshold": item["reorder_level"],
        "procure_needed": shortage,
        "is_shortage": available_stock <= item["reorder_level"]
    }
```

---

### 5. Agent 3: Vendor Selection & Multi-Factor Scoring
**Module:** `services/agent3-vendor/main.py`  
**Purpose:** Scores vendors across unit price, lead time, historical defect rate, and compliance rating.

```python
def rank_vendors(candidates: list, price_weight=0.4, lead_weight=0.3, quality_weight=0.3):
    """Computes weighted suitability score for candidate vendors."""
    ranked = []
    for vendor in candidates:
        norm_price = 1.0 / (1.0 + float(vendor["unit_price"]))
        norm_lead = 1.0 / (1.0 + float(vendor["lead_time_days"]))
        quality_score = float(vendor["compliance_score"]) / 100.0
        
        final_score = (
            (norm_price * price_weight) +
            (norm_lead * lead_weight) +
            (quality_score * quality_weight)
        )
        ranked.append({**vendor, "composite_score": round(final_score, 4)})
        
    return sorted(ranked, key=lambda x: x["composite_score"], reverse=True)
```

---

### 6. Agent 4: Purchase Order Generation & Multi-Tier Approvals
**Module:** `services/agent4-procurement/main.py`  
**Purpose:** Automates PO generation with role-based sign-off thresholds (Officer vs. Manager vs. Director).

```python
def determine_approval_tier(total_amount_inr: float) -> str:
    """Enforces multi-tier governance based on financial value."""
    if total_amount_inr < 50_000:
        return "TIER_1_OFFICER"       # Procurement Officer Sign-off
    elif total_amount_inr < 250_000:
        return "TIER_2_MANAGER"       # Operations Manager Sign-off
    else:
        return "TIER_3_DIRECTOR"      # Finance Director + Legal Sign-off

def create_purchase_order(po_payload: dict, db_cursor):
    tier = determine_approval_tier(po_payload["total_price"])
    db_cursor.execute("""
        INSERT INTO purchase_orders (
            po_number, request_id, vendor_id, vendor_name, 
            item_name, quantity, unit_price, total_price, 
            approval_tier, status
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'PENDING_APPROVAL')
        RETURNING id, po_number, status, approval_tier;
    """, (
        po_payload["po_number"], po_payload["request_id"], po_payload["vendor_id"],
        po_payload["vendor_name"], po_payload["item_name"], po_payload["quantity"],
        po_payload["unit_price"], po_payload["total_price"], tier
    ))
    return db_cursor.fetchone()
```
