# Configuration & Environment Variables

ProcureFlow is configured via environment variables. Copy `.env.example` to `.env` in the root repository before launching services.

```bash
cp .env.example .env
```

---

## 🔑 Comprehensive Environment Configuration

### 1. General & System Settings
```ini
ENVIRONMENT=production
DEBUG=False
SECRET_KEY=generate_a_secure_random_64_char_key_here
ALLOWED_HOSTS=*
LOG_LEVEL=INFO
```

### 2. Frontend Configuration (Next.js)
```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
NEXT_PUBLIC_APP_NAME="ProcureFlow | Multi-Agent Procurement System"
```

### 3. PostgreSQL Database
```ini
POSTGRES_SERVER=localhost
POSTGRES_PORT=5432
POSTGRES_USER=procureflow_admin
POSTGRES_PASSWORD=your_secure_db_password
POSTGRES_DB=procureflow_db
DATABASE_URL=postgresql://procureflow_admin:your_secure_db_password@localhost:5432/procureflow_db
```

### 4. Redis Cache & Ephemeral State
```ini
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_URL=redis://localhost:6379/0
```

### 5. Apache Kafka & Zookeeper
```ini
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_TOPIC_PREFIX=procureflow
KAFKA_CONSUMER_GROUP=procureflow-agents-group
ZOOKEEPER_CONNECT=localhost:2181
```

### 6. MinIO S3 Object Storage
```ini
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_SECURE=False
MINIO_BUCKET_NAME=procureflow-documents
```

### 7. AI & LLM Provider API Keys
```ini
OPENAI_API_KEY=sk-proj-your-openai-api-key-here
LLM_MODEL_NAME=gpt-4-turbo
EMBEDDING_MODEL=text-embedding-3-small
ANTHROPIC_API_KEY=your_anthropic_key_optional
```

### 8. DocuSign Digital Signatures API
```ini
DOCUSIGN_ACCOUNT_ID=your_docusign_account_id
DOCUSIGN_INTEGRATION_KEY=your_integration_key
DOCUSIGN_USER_ID=your_docusign_user_guid
DOCUSIGN_OAUTH_BASE_URL=account-d.docusign.com
DOCUSIGN_PRIVATE_KEY_PATH=/path/to/private.key
```

### 9. SMTP & Notification Dispatcher
```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=procureflow.notifications@gmail.com
SMTP_PASSWORD=your_app_specific_password
EMAIL_FROM=ProcureFlow <procureflow.notifications@gmail.com>
```

---

## 🔒 Security Best Practices

> [!WARNING]
> Never commit `.env` or RSA private keys to version control. Ensure `.env` is listed in your `.gitignore`. For production deployments, consider injecting secrets via Docker Secrets, AWS Secrets Manager, or HashiCorp Vault.
