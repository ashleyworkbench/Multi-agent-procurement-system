# Deployment Guide

This guide covers deploying ProcureFlow to production environments.

## 📋 Table of Contents

- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Security Hardening](#security-hardening)
- [Docker Deployment](#docker-deployment)
- [Cloud Deployment](#cloud-deployment)
- [Environment Configuration](#environment-configuration)
- [Monitoring & Logging](#monitoring--logging)
- [Backup & Recovery](#backup--recovery)
- [Scaling](#scaling)

## Pre-Deployment Checklist

Before deploying to production, ensure:

- [ ] All passwords changed from defaults
- [ ] API keys rotated and secured
- [ ] SSL/TLS certificates configured
- [ ] Firewall rules configured
- [ ] Database backups automated
- [ ] Monitoring tools configured
- [ ] Log aggregation set up
- [ ] Disaster recovery plan documented
- [ ] Security audit completed

## Security Hardening

### 1. Update All Credentials

```bash
# Generate secure passwords
openssl rand -base64 32

# Update .env file with new credentials
POSTGRES_PASSWORD=<generated-password>
MYSQL_ROOT_PASSWORD=<generated-password>
REDIS_PASSWORD=<generated-password>
```

### 2. Enable SSL/TLS

**PostgreSQL:**
```yaml
# docker-compose.yml
postgres:
  command: >
    -c ssl=on
    -c ssl_cert_file=/var/lib/postgresql/server.crt
    -c ssl_key_file=/var/lib/postgresql/server.key
  volumes:
    - ./certs/postgres.crt:/var/lib/postgresql/server.crt
    - ./certs/postgres.key:/var/lib/postgresql/server.key
```

**MySQL:**
```yaml
mysql:
  command: --ssl-ca=/etc/mysql/certs/ca.pem
  volumes:
    - ./certs/mysql-ca.pem:/etc/mysql/certs/ca.pem
```

**Redis:**
```yaml
redis:
  command: >
    redis-server
    --requirepass ${REDIS_PASSWORD}
    --tls-port 6380
    --tls-cert-file /tls/redis.crt
    --tls-key-file /tls/redis.key
```

### 3. Configure Firewall

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable

# Block direct database access from outside
sudo ufw deny 5432/tcp
sudo ufw deny 3306/tcp
```

### 4. Network Isolation

Create separate networks for different services:

```yaml
networks:
  frontend_network:
    driver: bridge
  backend_network:
    driver: bridge
    internal: true  # No external access
  database_network:
    driver: bridge
    internal: true  # No external access
```

### 5. API Rate Limiting

Add rate limiting to prevent abuse:

```python
# In FastAPI services
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.get("/api/endpoint")
@limiter.limit("10/minute")
async def endpoint():
    return {"status": "ok"}
```

## Docker Deployment

### Production Docker Compose

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    restart: always
    environment:
      NODE_ENV: production
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G

  agent1-ocr:
    restart: always
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1'
          memory: 1G
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8009/health')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  postgres:
    restart: always
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G

  redis:
    restart: always
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 1gb
      --maxmemory-policy allkeys-lru
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
```

### Deploy to Production

```bash
# Build and deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Verify
docker ps
docker-compose logs -f
```

## Cloud Deployment

### AWS Deployment

**Using ECS (Elastic Container Service):**

1. **Push images to ECR:**

```bash
# Authenticate
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Tag images
docker tag procureflow-frontend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/procureflow-frontend:latest

# Push
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/procureflow-frontend:latest
```

2. **Create ECS Task Definitions:**

```json
{
  "family": "procureflow-agents",
  "containerDefinitions": [
    {
      "name": "agent1-ocr",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/agent1-ocr:latest",
      "memory": 1024,
      "cpu": 512,
      "essential": true,
      "environment": [
        {"name": "KAFKA_BOOTSTRAP_SERVERS", "value": "kafka:9092"}
      ],
      "secrets": [
        {"name": "POSTGRES_PASSWORD", "valueFrom": "arn:aws:secretsmanager:..."}
      ]
    }
  ]
}
```

3. **Use RDS for databases:**

```bash
# Create RDS PostgreSQL instance
aws rds create-db-instance \
  --db-instance-identifier procureflow-postgres \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --master-username admin \
  --master-user-password <secure-password> \
  --allocated-storage 100
```

4. **Use ElastiCache for Redis:**

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id procureflow-redis \
  --cache-node-type cache.t3.medium \
  --engine redis \
  --num-cache-nodes 1
```

### Azure Deployment

**Using Azure Container Instances:**

```bash
# Create resource group
az group create --name procureflow-rg --location eastus

# Create container registry
az acr create --resource-group procureflow-rg --name procureflowacr --sku Basic

# Deploy containers
az container create \
  --resource-group procureflow-rg \
  --name procureflow-agents \
  --image procureflowacr.azurecr.io/agent1-ocr:latest \
  --cpu 2 \
  --memory 4 \
  --environment-variables \
    KAFKA_BOOTSTRAP_SERVERS=kafka:9092
```

### Google Cloud Platform (GCP)

**Using Google Kubernetes Engine (GKE):**

1. **Create GKE cluster:**

```bash
gcloud container clusters create procureflow-cluster \
  --num-nodes=3 \
  --machine-type=n1-standard-2 \
  --zone=us-central1-a
```

2. **Deploy using Kubernetes:**

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent1-ocr
spec:
  replicas: 2
  selector:
    matchLabels:
      app: agent1-ocr
  template:
    metadata:
      labels:
        app: agent1-ocr
    spec:
      containers:
      - name: agent1-ocr
        image: gcr.io/project-id/agent1-ocr:latest
        ports:
        - containerPort: 8009
        env:
        - name: KAFKA_BOOTSTRAP_SERVERS
          value: "kafka:9092"
```

```bash
kubectl apply -f deployment.yaml
```

## Environment Configuration

### Production .env Template

```bash
# Production Environment
ENVIRONMENT=production
LOG_LEVEL=WARNING

# Database URLs (use managed services)
POSTGRES_HOST=procureflow-db.xxxx.rds.amazonaws.com
MYSQL_HOST=procureflow-mysql.xxxx.rds.amazonaws.com

# Redis (use managed service)
REDIS_HOST=procureflow-redis.xxxx.cache.amazonaws.com

# Kafka (use managed service like AWS MSK)
KAFKA_BOOTSTRAP_SERVERS=b-1.procureflow.xxxx.kafka.us-east-1.amazonaws.com:9092

# Frontend (use CDN)
NEXT_PUBLIC_API_URL=https://api.procureflow.com

# Enable monitoring
SENTRY_DSN=https://xxxx@sentry.io/xxxx
DATADOG_API_KEY=xxxx
```

## Monitoring & Logging

### 1. Application Monitoring (Datadog/New Relic)

```python
# Add to agents
import ddtrace
ddtrace.patch_all()

from ddtrace import tracer

@tracer.wrap()
def process_request(request_id):
    # Your code
    pass
```

### 2. Log Aggregation (ELK Stack)

```yaml
# docker-compose.monitoring.yml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
    ports:
      - "9200:9200"

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    volumes:
      - ./logstash.conf:/usr/share/logstash/pipeline/logstash.conf

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    ports:
      - "5601:5601"
```

### 3. Prometheus + Grafana

```yaml
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

## Backup & Recovery

### 1. Automated Database Backups

```bash
# PostgreSQL backup script
#!/bin/bash
BACKUP_DIR="/backups/postgres"
DATE=$(date +%Y%m%d_%H%M%S)

docker exec procurement_postgres pg_dumpall -U procurement_admin | gzip > "$BACKUP_DIR/backup_$DATE.sql.gz"

# Keep only last 30 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete
```

```bash
# Schedule with cron
0 2 * * * /path/to/backup-script.sh
```

### 2. Disaster Recovery Plan

1. **Database Restore:**

```bash
# Restore PostgreSQL
gunzip < backup_20240101_020000.sql.gz | docker exec -i procurement_postgres psql -U procurement_admin
```

2. **Volume Backup:**

```bash
# Backup Docker volumes
docker run --rm -v postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_data.tar.gz /data
```

## Scaling

### Horizontal Scaling

**Scale agents:**

```yaml
# docker-compose.yml
services:
  agent2-inventory:
    deploy:
      replicas: 3  # Run 3 instances
```

**Load balancing:**

```yaml
services:
  nginx:
    image: nginx
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    ports:
      - "80:80"

# nginx.conf
upstream api_gateway {
    server api-gateway-1:8000;
    server api-gateway-2:8000;
    server api-gateway-3:8000;
}
```

### Vertical Scaling

```yaml
services:
  postgres:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
```

### Database Scaling

- **Read Replicas**: For PostgreSQL/MySQL
- **Sharding**: Partition data by industry
- **Connection Pooling**: Use PgBouncer/ProxySQL

## Health Checks

```yaml
services:
  agent1-ocr:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8009/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## SSL/TLS with Let's Encrypt

```bash
# Install certbot
sudo apt-get install certbot

# Get certificate
sudo certbot certonly --standalone -d procureflow.com -d www.procureflow.com

# Auto-renewal
sudo certbot renew --dry-run
```

## Performance Optimization

1. **Enable HTTP/2**
2. **Use CDN for static assets**
3. **Enable gzip compression**
4. **Optimize database queries**
5. **Implement caching strategy**
6. **Use connection pooling**

---

**For questions about deployment, open an issue on GitHub or contact the team.**
