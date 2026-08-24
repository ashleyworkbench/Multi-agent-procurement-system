FROM mysql:8.0

# Copy all MySQL init scripts
# They run in alphabetical order on first container start
COPY init/ /docker-entrypoint-initdb.d/

# Healthcheck
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
    CMD mysqladmin ping -h localhost -u${MYSQL_USER} -p${MYSQL_PASSWORD} --silent
