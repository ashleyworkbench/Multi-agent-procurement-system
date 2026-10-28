# Deployment & Containerization Guide

ProcureFlow is packaged as a multi-container Docker application with defined network topologies, volume persistence, and isolated services.

---

## 💻 Hardware & Software Prerequisites

| Component | Minimum Specification | Recommended Specification |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 20.04+ / Debian 11+ / macOS / Windows 11 WSL2 | Linux Ubuntu 22.04 LTS |
| **CPU** | 4 Cores (x86_64 or ARM64) | 8 Cores |
| **Memory (RAM)** | 8 GB RAM | 16 GB RAM |
| **Disk Space** | 20 GB free SSD | 50 GB SSD |
| **Docker Engine** | Docker 24.0+ & Docker Compose v2.20+ | Docker Engine 26.0+ |

---

## 🐳 Container Architecture & Port Allocations

| Container Service | Base Image | Host Port | Internal Port | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **`procureflow-frontend`** | `node:18-alpine` | `3000` | `3000` | Next.js 14 Interactive Web UI |
| **`procureflow-api`** | `python:3.11-slim` | `8000` | `8000` | FastAPI Microservices Gateway |
| **`procureflow-postgres`** | `postgres:15-alpine` | `5432` | `5432` | Relational Storage & Transactions |
| **`procureflow-redis`** | `redis:7-alpine` | `6379` | `6379` | Ephemeral Caching & Sessions |
| **`procureflow-kafka`** | `confluentinc/cp-kafka:7.5.0`| `9092` | `9092` | Distributed Event Streaming Bus |
| **`procureflow-zookeeper`**| `confluentinc/cp-zookeeper:7.5.0`| `2181` | `2181` | Kafka Cluster Coordination |
| **`procureflow-minio`** | `minio/minio:latest` | `9000` / `9001` | `9000` / `9001` | S3-Compatible Object Storage |

---

## 🚀 Quick Start Deployment

### 1. Clone & Configure
```bash
git clone https://github.com/ashleyworkbench/Multi-agent-procurement-system.git
cd Multi-agent-procurement-system
cp .env.example .env
```

### 2. Boot Infrastructure & Databases
You can boot the persistence and messaging layers first:
```bash
docker compose -f docker-compose.databases.yml up -d
```

### 3. Launch Full System
```bash
docker compose up -d --build
```

Alternatively, use the convenience launch scripts:
=== "Linux / macOS"
    ```bash
    chmod +x start.sh
    ./start.sh
    ```
=== "Windows PowerShell"
    ```powershell
    .\start.ps1
    ```
=== "Windows CMD"
    ```cmd
    start.bat
    ```

---

## 🔍 Service Health Verification

Check that all containers are healthy:
```bash
docker compose ps
```

Verify service connectivity:
```bash
# Check Backend Health
curl -s http://localhost:8000/health | jq .

# Check Database Connectivity
docker exec -it procureflow-postgres pg_isready -U procureflow_admin

# Check Kafka Broker Status
docker exec -it procureflow-kafka kafka-broker-api-versions --bootstrap-server localhost:9092
```

---

## 🌐 GitHub Pages Deployment for this Documentation

To host this documentation on GitHub Pages:

1. Push your repository to GitHub.
2. In your GitHub repository settings, navigate to **Settings > Pages**.
3. Under **Build and deployment > Source**, select **GitHub Actions**.
4. The included `.github/workflows/deploy-docs.yml` will automatically build the site and publish it to:
   `https://<your-username>.github.io/Multi-agent-procurement-system/`
