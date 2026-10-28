# Troubleshooting & FAQs

This section addresses common deployment hurdles, service connectivity issues, port conflicts, and operational recovery steps.

---

## 🛠️ Common Issues & Diagnostic Resolutions

### 1. Database Port Conflict (`5432` or `6379` already in use)
- **Symptom:** Docker fails with `Bind for 0.0.0.0:5432 failed: port is already allocated`.
- **Cause:** A local instance of PostgreSQL or Redis is running on the host machine.
- **Resolution:**
  ```bash
  # Check which process is using the port
  sudo lsof -i :5432
  
  # Stop the local host service
  sudo systemctl stop postgresql
  sudo systemctl stop redis-server
  
  # Re-launch Docker containers
  docker compose up -d
  ```

---

### 2. Kafka Connection Timeout (`ConnectionRefusedError: [Errno 111]`)
- **Symptom:** FastAPI backend logs show connection retries to `localhost:9092`.
- **Cause:** Kafka is still negotiating broker state with Zookeeper.
- **Resolution:**
  Kafka requires approximately 10–15 seconds to complete cluster initialization on cold boot. Wait for the broker to announce readiness:
  ```bash
  docker logs -f procureflow-kafka | grep -i "started"
  ```
  If restarting from a corrupted state:
  ```bash
  docker compose stop kafka zookeeper
  docker compose rm -f kafka zookeeper
  docker compose up -d zookeeper kafka
  ```

---

### 3. MinIO S3 Bucket Missing Error (`NoSuchBucket`)
- **Symptom:** OCR file upload fails with `404 Bucket procureflow-documents does not exist`.
- **Cause:** MinIO initialized without running the bucket creation bootstrap.
- **Resolution:**
  Access the MinIO Web Console at `http://localhost:9001` (User: `minioadmin` / Pass: `minioadmin`) and manually create bucket `procureflow-documents`, or execute:
  ```bash
  docker exec -it procureflow-minio mc alias set local http://localhost:9000 minioadmin minioadmin
  docker exec -it procureflow-minio mc mb local/procureflow-documents
  ```

---

### 4. Complete System Reset & Database Rebuild
If you need to completely purge all containers, volumes, and cached tables to start from a clean slate:

=== "Linux / macOS"
    ```bash
    docker compose down -v
    docker compose -f docker-compose.databases.yml up -d
    python3 generate_vendor_seed_csvs.py
    python3 seed_all_vendor_performance.py
    docker compose up -d --build
    ```
=== "Windows PowerShell"
    ```powershell
    .\rebuild-all.ps1
    ```

---

## ❓ Frequently Asked Questions (FAQs)

??? question "Can ProcureFlow work without an active internet connection?"
    The core microservices, database, Kafka event bus, and rule-based vendor ranking can operate in an isolated intranet. However, external LLM calls (e.g. OpenAI GPT-4) and the DocuSign eSignature API require outbound HTTPS internet connectivity unless replaced with self-hosted open-weights models (e.g. Ollama / vLLM with Llama 3) and internal PKI signature certificates.

??? question "How is vendor scoring weighted?"
    The default scoring distribution is:
    - **Price Competitiveness:** 40%
    - **Historical Delivery Punctuality:** 30%
    - **Quality & Defect Rate:** 20%
    - **Compliance & ESG Rating:** 10%
    
    Procurement administrators can adjust these weights per requisition in the Procurement Hub.

??? question "How does the system ensure agents don't make unauthorized purchases?"
    By strict architectural design, AI agents produce **recommendations and drafts only**. State transitions to `PO_EXECUTED` or `PO_DISPATCHED` can only be triggered by an authenticated human user via cryptographic signature or DocuSign authorization.
