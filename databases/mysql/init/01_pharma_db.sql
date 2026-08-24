-- =============================================================
-- PHARMACEUTICAL INDUSTRY DATABASES
-- Engine: MySQL 8.0
-- Databases: pharma_inventory_db, pharma_vendor_db
-- API Key: PHARMA_KEY
-- NOTE: MySQL syntax — no \c commands, use CREATE DATABASE + USE
-- =============================================================

-- -------------------------------------------------------
-- PHARMA INVENTORY DATABASE
-- -------------------------------------------------------
CREATE DATABASE IF NOT EXISTS pharma_inventory_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE pharma_inventory_db;

CREATE TABLE IF NOT EXISTS inventory_items (
    id                 INT            AUTO_INCREMENT PRIMARY KEY,
    name               VARCHAR(255)   NOT NULL,
    generic_name       VARCHAR(255),
    category           VARCHAR(100)   NOT NULL,
    form               VARCHAR(50)    NOT NULL,   -- Tablet, Capsule, Injection, Syrup
    strength           VARCHAR(50),              -- 500mg, 400mg, 250mg
    unit               VARCHAR(50)    NOT NULL,
    quantity_in_stock  INT            NOT NULL DEFAULT 0,
    unit_price         DECIMAL(15, 2) NOT NULL,
    reorder_level      INT            NOT NULL DEFAULT 1000,
    batch_number       VARCHAR(100),
    expiry_date        DATE,
    storage_condition  VARCHAR(100)   DEFAULT 'Room Temperature',
    warehouse_location VARCHAR(100),
    last_updated       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_item_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_pharma_inv_name     ON inventory_items(name);
CREATE INDEX idx_pharma_inv_category ON inventory_items(category);

INSERT INTO inventory_items
    (name, generic_name, category, form, strength, unit, quantity_in_stock, unit_price, reorder_level, batch_number, expiry_date, storage_condition, warehouse_location)
VALUES
    ('Paracetamol 500mg',      'Paracetamol',       'Analgesic',       'Tablet',    '500mg',  'Strip (10)', 50000,   5.00, 5000, 'BATCH-P001', '2026-12-31', 'Room Temperature',  'Cold Chain - Rack A1'),
    ('Ibuprofen 400mg',        'Ibuprofen',         'NSAID',           'Tablet',    '400mg',  'Strip (10)', 35000,  12.50, 3000, 'BATCH-I001', '2026-10-31', 'Below 25°C',        'Cold Chain - Rack A2'),
    ('Amoxicillin 250mg',      'Amoxicillin',       'Antibiotic',      'Capsule',   '250mg',  'Strip (10)', 25000,  18.00, 2500, 'BATCH-A001', '2025-09-30', 'Room Temperature',  'Cold Chain - Rack A3'),
    ('Amoxicillin 500mg',      'Amoxicillin',       'Antibiotic',      'Capsule',   '500mg',  'Strip (10)', 20000,  28.00, 2000, 'BATCH-A002', '2025-08-31', 'Room Temperature',  'Cold Chain - Rack A3'),
    ('Ciprofloxacin 500mg',    'Ciprofloxacin',     'Antibiotic',      'Tablet',    '500mg',  'Strip (10)', 18000,  22.00, 2000, 'BATCH-C001', '2026-06-30', 'Room Temperature',  'Cold Chain - Rack B1'),
    ('Metformin 500mg',        'Metformin HCl',     'Antidiabetic',    'Tablet',    '500mg',  'Strip (10)', 30000,   8.00, 3000, 'BATCH-M001', '2026-11-30', 'Room Temperature',  'Cold Chain - Rack B2'),
    ('Atorvastatin 10mg',      'Atorvastatin',      'Lipid Lowering',  'Tablet',    '10mg',   'Strip (10)', 22000,  45.00, 2000, 'BATCH-AT01', '2026-08-31', 'Room Temperature',  'Cold Chain - Rack B3'),
    ('Pantoprazole 40mg',      'Pantoprazole',      'Proton Pump Inhibitor', 'Tablet', '40mg', 'Strip (10)', 28000,  18.00, 2500, 'BATCH-PAN1', '2026-09-30', 'Room Temperature',  'Cold Chain - Rack C1'),
    ('Azithromycin 500mg',     'Azithromycin',      'Antibiotic',      'Tablet',    '500mg',  'Strip (3)',  15000,  55.00, 1500, 'BATCH-AZ01', '2025-12-31', 'Room Temperature',  'Cold Chain - Rack C2'),
    ('Insulin (Regular) 40IU', 'Human Insulin',     'Antidiabetic',    'Injection', '40IU/ml','Vial (10ml)', 5000, 180.00,  500, 'BATCH-INS1', '2025-06-30', 'Refrigerated 2-8°C','Refrigerator Unit 1'),
    ('Cetirizine 10mg',        'Cetirizine HCl',    'Antihistamine',   'Tablet',    '10mg',   'Strip (10)', 40000,   6.50, 4000, 'BATCH-CET1', '2026-12-31', 'Room Temperature',  'Cold Chain - Rack D1'),
    ('Omeprazole 20mg',        'Omeprazole',        'Proton Pump Inhibitor', 'Capsule', '20mg', 'Strip (10)', 32000, 14.00, 3000, 'BATCH-OM01', '2026-10-31', 'Room Temperature',  'Cold Chain - Rack D2'),
    ('Dolo 650mg',             'Paracetamol',       'Analgesic',       'Tablet',    '650mg',  'Strip (15)', 45000,   7.50, 4000, 'BATCH-DOL1', '2026-11-30', 'Room Temperature',  'Cold Chain - Rack D3'),
    ('Vitamin C 500mg',        'Ascorbic Acid',     'Supplement',      'Tablet',    '500mg',  'Strip (10)', 60000,   4.00, 5000, 'BATCH-VC01', '2027-03-31', 'Room Temperature',  'Cold Chain - Rack E1'),
    ('Multivitamin Tablets',   'Multiple Vitamins', 'Supplement',      'Tablet',    'Multi',  'Strip (15)', 35000,  12.00, 3000, 'BATCH-MV01', '2027-01-31', 'Room Temperature',  'Cold Chain - Rack E2');


-- -------------------------------------------------------
-- PHARMA VENDOR DATABASE
-- -------------------------------------------------------
CREATE DATABASE IF NOT EXISTS pharma_vendor_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE pharma_vendor_db;

CREATE TABLE IF NOT EXISTS vendors (
    id             INT           AUTO_INCREMENT PRIMARY KEY,
    vendor_name    VARCHAR(255)  NOT NULL,
    contact_person VARCHAR(255),
    email          VARCHAR(255),
    phone          VARCHAR(20),
    city           VARCHAR(100),
    state          VARCHAR(100),
    rating         DECIMAL(3, 2) NOT NULL DEFAULT 3.00,
    is_active      TINYINT(1)    NOT NULL DEFAULT 1,
    created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_vendor_name (vendor_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vendor_products (
    id             INT            AUTO_INCREMENT PRIMARY KEY,
    vendor_id      INT            NOT NULL,
    item_name      VARCHAR(255)   NOT NULL,
    unit_price     DECIMAL(15, 2) NOT NULL,
    lead_time_days INT            NOT NULL DEFAULT 7,
    min_order_qty  INT            NOT NULL DEFAULT 100,
    availability   VARCHAR(50)    NOT NULL DEFAULT 'In Stock',
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_pharma_vp_item   ON vendor_products(item_name);
CREATE INDEX idx_pharma_vp_vendor ON vendor_products(vendor_id);

INSERT INTO vendors (vendor_name, contact_person, email, phone, city, state, rating) VALUES
    ('Cipla Ltd',              'Dr. Arun Bhatia',    'arun.bhatia@cipla.com',       '9900112233', 'Mumbai',    'Maharashtra',  4.80),
    ('Sun Pharmaceutical',     'Dr. Leena Mehta',    'leena.mehta@sunpharma.com',   '9900112234', 'Mumbai',    'Maharashtra',  4.75),
    ('Dr. Reddy\'s Lab',       'Dr. Suresh Rao',     'suresh.rao@drreddys.com',     '9900112235', 'Hyderabad', 'Telangana',    4.70),
    ('Lupin Ltd',              'Dr. Anjali Singh',   'anjali@lupin.com',            '9900112236', 'Mumbai',    'Maharashtra',  4.65),
    ('Zydus Cadila',           'Dr. Ramesh Patel',   'ramesh@zyduscadila.com',      '9900112237', 'Ahmedabad', 'Gujarat',      4.55),
    ('Aurobindo Pharma',       'Dr. Kiran Kumar',    'kiran@aurobindo.com',         '9900112238', 'Hyderabad', 'Telangana',    4.50),
    ('Torrent Pharmaceuticals','Dr. Mita Desai',     'mita@torrentpharma.com',      '9900112239', 'Ahmedabad', 'Gujarat',      4.45),
    ('Alkem Laboratories',     'Dr. Neha Gupta',     'neha@alkem.com',              '9900112240', 'Mumbai',    'Maharashtra',  4.40),
    ('Mankind Pharma',         'Dr. Vinod Sharma',   'vinod@mankindpharma.com',     '9900112241', 'Delhi',     'Delhi',        4.35),
    ('Abbott India',           'Dr. Priya Thomas',   'priya.thomas@abbott.com',     '9900112242', 'Mumbai',    'Maharashtra',  4.60);

INSERT INTO vendor_products (vendor_id, item_name, unit_price, lead_time_days, min_order_qty, availability) VALUES
    -- Cipla
    (1, 'Paracetamol 500mg',    4.80,  2, 1000, 'In Stock'),
    (1, 'Ibuprofen 400mg',     12.00,  3,  500, 'In Stock'),
    (1, 'Cetirizine 10mg',      6.20,  2,  500, 'In Stock'),
    (1, 'Amoxicillin 500mg',   26.50,  4,  500, 'In Stock'),
    -- Sun Pharmaceutical
    (2, 'Metformin 500mg',      7.50,  2, 1000, 'In Stock'),
    (2, 'Atorvastatin 10mg',   43.00,  3,  200, 'In Stock'),
    (2, 'Pantoprazole 40mg',   17.00,  2,  500, 'In Stock'),
    (2, 'Azithromycin 500mg',  52.00,  3,  200, 'In Stock'),
    -- Dr. Reddy's
    (3, 'Paracetamol 500mg',    4.60,  3, 1000, 'In Stock'),
    (3, 'Amoxicillin 250mg',   17.00,  3,  500, 'In Stock'),
    (3, 'Ciprofloxacin 500mg', 21.00,  4,  500, 'In Stock'),
    (3, 'Omeprazole 20mg',     13.50,  2,  500, 'In Stock'),
    -- Lupin
    (4, 'Metformin 500mg',      7.80,  2, 1000, 'In Stock'),
    (4, 'Atorvastatin 10mg',   44.00,  3,  200, 'In Stock'),
    (4, 'Amoxicillin 250mg',   17.50,  3,  500, 'In Stock'),
    -- Zydus Cadila
    (5, 'Paracetamol 500mg',    4.70,  2, 1000, 'In Stock'),
    (5, 'Dolo 650mg',           7.20,  2, 1000, 'In Stock'),
    (5, 'Pantoprazole 40mg',   16.50,  3,  500, 'In Stock'),
    -- Aurobindo Pharma
    (6, 'Amoxicillin 500mg',   27.00,  4,  500, 'In Stock'),
    (6, 'Ciprofloxacin 500mg', 20.50,  3,  500, 'In Stock'),
    (6, 'Azithromycin 500mg',  53.00,  4,  200, 'In Stock'),
    -- Torrent
    (7, 'Ibuprofen 400mg',     11.50,  4,  500, 'In Stock'),
    (7, 'Omeprazole 20mg',     13.00,  3,  500, 'In Stock'),
    -- Alkem
    (8, 'Paracetamol 500mg',    4.90,  2, 1000, 'In Stock'),
    (8, 'Vitamin C 500mg',      3.80,  2, 1000, 'In Stock'),
    -- Mankind Pharma
    (9, 'Paracetamol 500mg',    4.75,  3, 1000, 'In Stock'),
    (9, 'Multivitamin Tablets', 11.50,  3,  500, 'In Stock'),
    (9, 'Vitamin C 500mg',      3.90,  2, 1000, 'In Stock'),
    -- Abbott India
    (10, 'Insulin (Regular) 40IU', 175.00, 3, 100, 'In Stock'),
    (10, 'Multivitamin Tablets',    11.00,  2, 500, 'In Stock');

-- -------------------------------------------------------
-- GRANTS
-- -------------------------------------------------------
GRANT ALL PRIVILEGES ON pharma_inventory_db.* TO 'procurement_admin'@'%';
GRANT ALL PRIVILEGES ON pharma_vendor_db.*    TO 'procurement_admin'@'%';
FLUSH PRIVILEGES;
