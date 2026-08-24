FROM postgres:15-alpine

# Copy all PostgreSQL init scripts
# They run in alphabetical order on first container start
COPY init/ /docker-entrypoint-initdb.d/

# Healthcheck
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
    CMD pg_isready -U ${POSTGRES_USER} -d postgres
