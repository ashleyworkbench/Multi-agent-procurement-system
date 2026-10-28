# Data Flow Diagrams (DFD)

Data Flow Diagrams depict how data travels through the ProcureFlow platform, detailing input sources, processing checkpoints, persistent datastores, and generated system outputs.

---

## 📈 Complete System DFD

The following diagram illustrates the multi-stage data flow across external actors, specialized agents, datastores, and approval entities:

![Data Flow Diagram](../assets/images/dfd.png){: .doc-image }

---

## 🌐 Level 0: Context Diagram

The Context Diagram defines the system boundary and identifies external entities that interact with ProcureFlow.

```mermaid
graph LR
    P[Procurement Manager] -->|1. Upload Invoices & Requisitions| SYS((ProcureFlow System))
    SYS -->|2. Recommendation & Risk Analysis| P
    P -->|3. Financial Approval & Digital Signature| SYS
    
    INV_DEPT[Warehouse / Inventory Systems] -->|4. Stock Levels & Reorder Triggers| SYS
    
    SYS -->|5. Purchase Orders & RFPs| VEND[Manufacturing Vendors & Suppliers]
    VEND -->|6. Price Quotes & Delivery Updates| SYS
    
    VEND <-->|7. Negotiation & FAQ Queries| BOT((RAG Vendor Chatbot))
    BOT <--> SYS
    
    SYS -->|8. Audit Trails & Financial Exports| FIN[Finance & ERP Systems]
```

### External Entities

1. **Procurement Manager / Approvers:** Uploads source procurement requests, reviews agent recommendations, and executes legal/financial authorizations.
2. **Warehouse / Inventory Systems:** Streams inventory updates, consumption logs, and bills of materials (BOMs).
3. **Vendors & Suppliers:** Receives purchase orders, submits quotations, and interacts with the automated vendor chatbot.
4. **Finance & ERP:** Consumes finalized purchase orders, 3-way matching records, and compliance audit logs.

---

## 🔍 Level 1: Process Decomposition

Level 1 breaks down the primary data processing operations across the multi-agent system:

| Process ID | Process Name | Primary Data Inputs | Primary Data Outputs | Interacting Agents |
| :--- | :--- | :--- | :--- | :--- |
| **1.0** | **Document Intelligence & Ingestion** | Raw PDF invoices, scanned POs, image files | Normalized JSON line items, supplier metadata, tax totals | Document OCR Agent |
| **2.0** | **Inventory Deficit Assessment** | Requisition line items, warehouse stock tables | Net deficit quantities, urgency priority | Inventory Analysis Agent |
| **3.0** | **Vendor Scoring & Matching** | Item specifications, vendor historical logs | Ranked vendor matrix, price/quality weights | Vendor Evaluation Agent |
| **4.0** | **Procurement Risk Analysis** | Vendor scorecards, market volatility indices | Composite risk score, anomaly warnings | Risk Assessment Agent |
| **5.0** | **Tiered Governance & Approval** | Draft POs, managerial credentials | Signed PO, DocuSign envelope, audit log | Approval Coordinator Agent |
| **6.0** | **Interactive Vendor Support** | Natural language vendor queries | RAG contextual answers, PO status updates | RAG Chatbot Agent |

---

## 🔄 Detailed Process Breakdown (Level 2)

```mermaid
flowchart TD
    subgraph P1[1.0 Document Ingestion]
        D_IN[Invoice / PO Document] --> OCR[Tesseract / LLM Vision OCR]
        OCR --> PARSE[Structured Line-Item Extractor]
        PARSE --> DB1[(Document Database)]
    end

    subgraph P2[2.0 Stock Analysis]
        PARSE --> INV_COMP[Inventory Comparator]
        DB_INV[(Multi-Warehouse DB)] --> INV_COMP
        INV_COMP --> SHORTAGE[Shortage Detection Engine]
    end

    subgraph P3[3.0 Vendor Selection]
        SHORTAGE --> V_MATCHER[Vendor Matcher]
        DB_VEND[(Vendor Profiles & Performance)] --> V_MATCHER
        V_MATCHER --> V_RANK[AHP Multi-Factor Ranker]
    end

    subgraph P4[4.0 Risk Engine]
        V_RANK --> R_EVAL[Risk Evaluator]
        R_EVAL --> R_SCORE[Composite Risk Index Calculator]
    end

    subgraph P5[5.0 Approval & Order Creation]
        R_SCORE --> PO_GEN[Automated PO Generator]
        PO_GEN --> TIER_CHECK{Financial Threshold}
        TIER_CHECK -->|< $5,000| AUTO[Auto-Approved]
        TIER_CHECK -->|>= $5,000| MANUAL[Manager Review Required]
        MANUAL --> SIGN[DocuSign Digital Signature]
        AUTO --> SIGN
        SIGN --> DB_PO[(Purchase Order Repository)]
        SIGN --> KAFKA[Kafka Audit Stream]
    end
```
