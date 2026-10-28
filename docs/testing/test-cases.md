# Software Testing & Verification

ProcureFlow was validated through rigorous end-to-end integration and unit test suites across all agents, database stores, message topics, and external APIs.

---

## 📋 Comprehensive Software Test Cases

Below is the verified test matrix evaluated during system qualification:

| Test ID | Test Scenario | Expected Outcome | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **TC01** | **User Authentication & RBAC** | Access granted according to assigned role (Approver, Officer, Admin). Unauthorized routes return `403 Forbidden`. | Enforced via JWT tokens and middleware. | :white_check_mark: Pass |
| **TC02** | **Document Upload & OCR** | PDF invoice parsed into structured line items with SKU, quantity, and unit price with $\ge 90\%$ accuracy. | OCR extracted all 10 line items with confidence scores $\ge 0.94$. | :white_check_mark: Pass |
| **TC03** | **Inventory Deficit Detection** | Requisition items compared against warehouse database; exact stock shortages flagged with priority rating. | Correctly identified deficits for 3 raw materials with accurate ROP calculations. | :white_check_mark: Pass |
| **TC04** | **Multi-Attribute Vendor Scoring** | Ranked supplier list generated using weighted criteria (Price 40%, Delivery 30%, Quality 20%, Compliance 10%). | Top 3 vendors ranked with rationales matching historical data. | :white_check_mark: Pass |
| **TC05** | **Supply Chain Risk Engine** | Price volatility and supplier dependency risk computed with warning flags for single-source vendors. | High-risk warning emitted for single-source supplier. | :white_check_mark: Pass |
| **TC06** | **Tiered Governance Enforcement** | Orders exceeding $5,000 prevent auto-dispatch and mandate managerial approval. | Orders placed in `AWAITING_APPROVAL` status. | :white_check_mark: Pass |
| **TC07** | **DocuSign Digital Signature** | DocuSign envelope created; webhook confirms signature; SHA-256 hash verified. | Envelope successfully signed and archived to MinIO. | :white_check_mark: Pass |
| **TC08** | **Kafka Event Synchronization** | Events published to `procureflow` topics and ingested by audit log consumer without dropped packets. | 100% of event payloads persisted in chronological order. | :white_check_mark: Pass |
| **TC09** | **RAG Chatbot FAQ & Inquiries** | Contextual answers returned for PO status and delivery questions using vector store. | Accurate answers retrieved with zero hallucinations. | :white_check_mark: Pass |
| **TC10** | **End-to-End PDF Report Generation** | PDF summary compiled with graphs, vendor comparison tables, and audit logs. | Complete multi-page report rendered within 3.2 seconds. | :white_check_mark: Pass |

---

## 🧪 Automated Testing Scripts

Run the built-in system verification scripts to test your running deployment:

=== "Linux / macOS"
    ```bash
    chmod +x test-system.sh
    ./test-system.sh
    ```
=== "Windows PowerShell"
    ```powershell
    .\test-system.ps1
    ```
=== "Windows CMD"
    ```cmd
    test-system.bat
    ```

---

## 🌾 Seeding Test & Benchmark Data

Populate your local databases with synthetic vendor performance and multi-warehouse catalogs using the provided seed generators:

```bash
# Seed Vendor Catalogs
python3 generate_vendor_seed_csvs.py

# Seed Historical Performance Records (Delivery, Defect Rates)
python3 seed_all_vendor_performance.py
```
