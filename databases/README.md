# Databases Layer

This directory contains all database init scripts for the multi-agent procurement system.
Both PostgreSQL and MySQL are used to demonstrate that the Integration Gateway is compatible
with multiple database engines. Agents never connect to these databases directly — they only
call service APIs.

---

## Prerequisites

Before you start, make sure you have these installed on your machine:

| Tool | Version | Check |
|---|---|---|
| Docker Desktop | Latest | `docker --version` |
| Docker Compose | v2+ | `docker compose version` |

> On Windows, Docker Desktop includes both. Download from https://www.docker.com/products/docker-desktop

---

## Database Map

| Database | Engine | Purpose | API Key |
|---|---|---|---|
| `ocr_procurement_db` | PostgreSQL | Agent 1 OCR output — procurement requests | `OCR_SERVICE_KEY` |
| `construction_inventory_db` | PostgreSQL | Construction inventory (Cement, Steel, etc.) | `CONSTRUCTION_KEY` |
| `construction_vendor_db` | PostgreSQL | Construction vendors (ACC, Tata Steel, etc.) | `CONSTRUCTION_KEY` |
| `manufacturing_inventory_db` | PostgreSQL | Manufacturing inventory (Bearings, Motors, etc.) | `MANUFACTURING_KEY` |
| `manufacturing_vendor_db` | PostgreSQL | Manufacturing vendors (SKF, Bosch, Siemens, etc.) | `MANUFACTURING_KEY` |
| `pharma_inventory_db` | **MySQL** | Pharmaceutical inventory (Paracetamol, etc.) | `PHARMA_KEY` |
| `pharma_vendor_db` | **MySQL** | Pharma vendors (Cipla, Sun Pharma, etc.) | `PHARMA_KEY` |
| `electronics_inventory_db` | **MySQL** | Electronics inventory (Resistors, Sensors, etc.) | `ELECTRONICS_KEY` |
| `electronics_vendor_db` | **MySQL** | Electronics vendors (Mouser, DigiKey, etc.) | `ELECTRONICS_KEY` |
| `procurement_db` | PostgreSQL | Agent 4 output — purchase orders and audit | `PROCUREMENT_KEY` |

---

## Folder Structure

```
databases/
├── README.md                              <- You are here
├── postgres/
│   ├── Dockerfile
│   └── init/
│       ├── 01_ocr_procurement_db.sql      <- Agent 1 store
│       ├── 02_construction_db.sql         <- Construction industry
│       ├── 03_manufacturing_db.sql        <- Manufacturing industry
│       └── 04_procurement_db.sql          <- Agent 4 store
└── mysql/
    ├── Dockerfile
    └── init/
        ├── 01_pharma_db.sql               <- Pharmaceutical industry
        └── 02_electronics_db.sql          <- Electronics industry
```

---

## Step 1 — Start the Databases

Open a terminal, navigate to the project root (one level above this folder), and run:

```bash
cd "phase 2 dataside agent"

docker-compose -f docker-compose.databases.yml up --build -d
```

- `--build` builds the images with the init scripts baked in
- `-d` runs in detached (background) mode

First run takes 1-2 minutes to pull images and initialize all databases.

---

## Step 2 — Verify Everything is Running

```bash
docker ps
```

You should see two containers with status `healthy`:

```
CONTAINER ID   IMAGE                    STATUS
xxxxxxxxxxxx   procurement_postgres     Up X minutes (healthy)
xxxxxxxxxxxx   procurement_mysql        Up X minutes (healthy)
```

If a container shows `starting` instead of `healthy`, wait 30 more seconds and run `docker ps` again.

---

## Step 3 — Querying PostgreSQL Databases

### Connect interactively (opens a psql shell)

```bash
docker exec -it procurement_postgres psql -U procurement_admin -d <database_name>
```

Replace `<database_name>` with any of:
- `ocr_procurement_db`
- `construction_inventory_db`
- `construction_vendor_db`
- `manufacturing_inventory_db`
- `manufacturing_vendor_db`
- `procurement_db`

**Example:**
```bash
docker exec -it procurement_postgres psql -U procurement_admin -d construction_inventory_db
```

### Useful psql commands (once inside the shell)

```sql
-- List all tables in the current database
\dt

-- Describe a table's columns
\d inventory_items

-- List all databases on this server
\l

-- Switch to a different database
\c manufacturing_inventory_db

-- Exit the shell
\q
```

### Run a query without entering the shell (one-liner)

```bash
docker exec -it procurement_postgres psql -U procurement_admin -d <database_name> -c "YOUR SQL HERE;"
```

---

## PostgreSQL — Quick Query Reference

**OCR Procurement Database (Agent 1 output)**
```bash
# See all procurement requests
docker exec -it procurement_postgres psql -U procurement_admin -d ocr_procurement_db -c "SELECT * FROM procurement_requests;"

# See all line items
docker exec -it procurement_postgres psql -U procurement_admin -d ocr_procurement_db -c "SELECT * FROM procurement_request_items;"

# See items for a specific request (e.g. request id=1)
docker exec -it procurement_postgres psql -U procurement_admin -d ocr_procurement_db -c "SELECT * FROM procurement_request_items WHERE request_id = 1;"
```

**Construction Inventory Database**
```bash
# All inventory items
docker exec -it procurement_postgres psql -U procurement_admin -d construction_inventory_db -c "SELECT id, name, quantity_in_stock, unit_price, unit FROM inventory_items;"

# Items low on stock (below reorder level)
docker exec -it procurement_postgres psql -U procurement_admin -d construction_inventory_db -c "SELECT name, quantity_in_stock, reorder_level FROM inventory_items WHERE quantity_in_stock < reorder_level;"

# Search for a specific item (case-insensitive)
docker exec -it procurement_postgres psql -U procurement_admin -d construction_inventory_db -c "SELECT * FROM inventory_items WHERE name ILIKE '%cement%';"
```

**Construction Vendor Database**
```bash
# All vendors with rating
docker exec -it procurement_postgres psql -U procurement_admin -d construction_vendor_db -c "SELECT vendor_name, city, state, rating FROM vendors ORDER BY rating DESC;"

# All products supplied by vendors
docker exec -it procurement_postgres psql -U procurement_admin -d construction_vendor_db -c "SELECT v.vendor_name, vp.item_name, vp.unit_price, vp.lead_time_days FROM vendors v JOIN vendor_products vp ON v.id = vp.vendor_id ORDER BY vp.item_name;"

# Find all vendors who supply a specific item
docker exec -it procurement_postgres psql -U procurement_admin -d construction_vendor_db -c "SELECT v.vendor_name, vp.unit_price, vp.lead_time_days FROM vendors v JOIN vendor_products vp ON v.id = vp.vendor_id WHERE vp.item_name ILIKE '%cement%' ORDER BY vp.unit_price;"
```

**Manufacturing Inventory Database**
```bash
# All inventory items
docker exec -it procurement_postgres psql -U procurement_admin -d manufacturing_inventory_db -c "SELECT id, name, category, quantity_in_stock, unit_price FROM inventory_items ORDER BY category;"

# Search for bearings
docker exec -it procurement_postgres psql -U procurement_admin -d manufacturing_inventory_db -c "SELECT * FROM inventory_items WHERE name ILIKE '%bearing%';"
```

**Manufacturing Vendor Database**
```bash
# All vendors
docker exec -it procurement_postgres psql -U procurement_admin -d manufacturing_vendor_db -c "SELECT vendor_name, city, rating FROM vendors ORDER BY rating DESC;"

# Vendor products with price comparison
docker exec -it procurement_postgres psql -U procurement_admin -d manufacturing_vendor_db -c "SELECT v.vendor_name, vp.item_name, vp.unit_price, vp.lead_time_days FROM vendors v JOIN vendor_products vp ON v.id = vp.vendor_id WHERE vp.item_name ILIKE '%motor%' ORDER BY vp.unit_price;"
```

**Procurement Database (Agent 4 output)**
```bash
# All purchase orders
docker exec -it procurement_postgres psql -U procurement_admin -d procurement_db -c "SELECT po_number, vendor_name, item_name, quantity, total_price, status FROM purchase_orders;"

# Pending approval orders only
docker exec -it procurement_postgres psql -U procurement_admin -d procurement_db -c "SELECT po_number, vendor_name, item_name, total_price FROM purchase_orders WHERE status = 'PENDING_APPROVAL';"

# Full audit trail
docker exec -it procurement_postgres psql -U procurement_admin -d procurement_db -c "SELECT po_number, action, old_status, new_status, performed_by, created_at FROM procurement_audit ORDER BY created_at;"

# All Kafka events logged
docker exec -it procurement_postgres psql -U procurement_admin -d procurement_db -c "SELECT event_type, source_agent, topic, created_at FROM procurement_events ORDER BY created_at;"
```

---

## Step 4 — Querying MySQL Databases

### Connect interactively (opens a mysql shell)

```bash
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 <database_name>
```

Replace `<database_name>` with any of:
- `pharma_inventory_db`
- `pharma_vendor_db`
- `electronics_inventory_db`
- `electronics_vendor_db`

**Example:**
```bash
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 pharma_inventory_db
```

### Useful MySQL commands (once inside the shell)

```sql
-- List all tables
SHOW TABLES;

-- Describe a table's columns
DESCRIBE inventory_items;

-- List all databases on this server
SHOW DATABASES;

-- Switch to a different database
USE electronics_inventory_db;

-- Exit the shell
exit
```

### Run a query without entering the shell (one-liner)

```bash
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 <database_name> -e "YOUR SQL HERE;"
```

---

## MySQL — Quick Query Reference

**Pharma Inventory Database**
```bash
# All pharma inventory items
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 pharma_inventory_db -e "SELECT name, form, strength, quantity_in_stock, unit_price FROM inventory_items;"

# Items requiring refrigeration
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 pharma_inventory_db -e "SELECT name, quantity_in_stock, storage_condition FROM inventory_items WHERE storage_condition LIKE '%Refrigerat%';"

# Items expiring within 6 months
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 pharma_inventory_db -e "SELECT name, quantity_in_stock, expiry_date FROM inventory_items WHERE expiry_date <= DATE_ADD(NOW(), INTERVAL 6 MONTH) ORDER BY expiry_date;"

# Search by category
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 pharma_inventory_db -e "SELECT name, category, quantity_in_stock FROM inventory_items WHERE category = 'Antibiotic';"
```

**Pharma Vendor Database**
```bash
# All pharma vendors ranked by rating
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 pharma_vendor_db -e "SELECT vendor_name, city, rating FROM vendors ORDER BY rating DESC;"

# Find all vendors who supply Paracetamol with price comparison
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 pharma_vendor_db -e "SELECT v.vendor_name, vp.unit_price, vp.lead_time_days, vp.min_order_qty FROM vendors v JOIN vendor_products vp ON v.id = vp.vendor_id WHERE vp.item_name LIKE '%Paracetamol%' ORDER BY vp.unit_price;"

# All products from a specific vendor (e.g. Cipla, id=1)
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 pharma_vendor_db -e "SELECT vp.item_name, vp.unit_price, vp.lead_time_days FROM vendor_products vp WHERE vp.vendor_id = 1;"
```

**Electronics Inventory Database**
```bash
# All electronics items
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 electronics_inventory_db -e "SELECT name, category, quantity_in_stock, unit_price, part_number FROM inventory_items ORDER BY category;"

# Microcontrollers only
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 electronics_inventory_db -e "SELECT name, quantity_in_stock, unit_price, manufacturer FROM inventory_items WHERE category = 'Microcontrollers';"

# Search by part number
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 electronics_inventory_db -e "SELECT * FROM inventory_items WHERE part_number = 'DS18B20';"
```

**Electronics Vendor Database**
```bash
# All electronics vendors with country
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 electronics_vendor_db -e "SELECT vendor_name, city, country, rating FROM vendors ORDER BY rating DESC;"

# Find all vendors for Arduino Uno
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 electronics_vendor_db -e "SELECT v.vendor_name, vp.unit_price, vp.lead_time_days, vp.availability FROM vendors v JOIN vendor_products vp ON v.id = vp.vendor_id WHERE vp.item_name LIKE '%Arduino%' ORDER BY vp.unit_price;"

# Indian vendors only
docker exec -it procurement_mysql mysql -u procurement_admin -pSecurePass@2024 electronics_vendor_db -e "SELECT vendor_name, city, rating FROM vendors WHERE country = 'India' ORDER BY rating DESC;"
```

---

## Credentials Reference

| Engine | Host (external) | Port | Username | Password |
|---|---|---|---|---|
| PostgreSQL | `localhost` | `5432` | `procurement_admin` | `SecurePass@2024` |
| MySQL | `localhost` | `3306` | `procurement_admin` | `SecurePass@2024` |

> These credentials are only for local development / inspection.
> Agents in the system never use these — they authenticate using API Keys only.

---

## Connecting with a GUI Tool (Optional)

If you prefer a visual interface, use any of these tools:

**For PostgreSQL:**
- [pgAdmin 4](https://www.pgadmin.org/) — free, official PostgreSQL GUI
- [DBeaver](https://dbeaver.io/) — supports both PostgreSQL and MySQL

**For MySQL:**
- [MySQL Workbench](https://www.mysql.com/products/workbench/) — free, official MySQL GUI
- [DBeaver](https://dbeaver.io/) — works for both engines

Connection settings for both:
- Host: `localhost`
- Port: `5432` (PostgreSQL) or `3306` (MySQL)
- Username: `procurement_admin`
- Password: `SecurePass@2024`

---

## Stopping the Databases

```bash
# Stop containers but keep data
docker-compose -f docker-compose.databases.yml down

# Stop containers AND wipe all data (full reset)
docker-compose -f docker-compose.databases.yml down -v
```

> Use `-v` only if you want a completely clean slate. It deletes all database volumes.

---

## Troubleshooting

**Container won't start / exits immediately**
```bash
# Check logs for errors
docker logs procurement_postgres
docker logs procurement_mysql
```

**`psql: command not found` or `mysql: command not found`**
You don't need these installed locally — the commands run inside the container via `docker exec`.
Always prefix with `docker exec -it procurement_postgres psql ...`

**`FATAL: password authentication failed`**
Make sure your `.env` file is in the project root (one level above this folder) and matches
the credentials in the commands above.

**Data missing after restart**
If you previously ran `docker-compose down -v`, all volumes were deleted and databases were
wiped. Run `docker-compose -f docker-compose.databases.yml up --build -d` to recreate everything.

**Port already in use (5432 or 3306)**
You have a local PostgreSQL or MySQL instance running. Either stop it or change the host port
in `docker-compose.databases.yml` (e.g., `"5433:5432"` for PostgreSQL).
