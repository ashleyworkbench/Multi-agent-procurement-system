-- =============================================================
-- CONSTRUCTION INDUSTRY DATABASES
-- Engine: PostgreSQL
-- Databases: construction_inventory_db, construction_vendor_db
-- API Key: CONSTRUCTION_KEY
-- =============================================================

\c postgres;

-- -------------------------------------------------------
-- CONSTRUCTION INVENTORY DATABASE
-- -------------------------------------------------------
DROP DATABASE IF EXISTS construction_inventory_db;
CREATE DATABASE construction_inventory_db;

\c construction_inventory_db;

CREATE TABLE IF NOT EXISTS inventory_items (
    id              SERIAL         PRIMARY KEY,
    name            VARCHAR(255)   NOT NULL UNIQUE,
    category        VARCHAR(100)   NOT NULL,
    unit            VARCHAR(50)    NOT NULL,
    quantity_in_stock INTEGER      NOT NULL DEFAULT 0,
    unit_price      NUMERIC(15, 2) NOT NULL,
    reorder_level   INTEGER        NOT NULL DEFAULT 10,
    warehouse_location VARCHAR(100),
    last_updated    TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_construction_inv_name ON inventory_items(name);
CREATE INDEX idx_construction_inv_category ON inventory_items(category);

INSERT INTO inventory_items (name, category, unit, quantity_in_stock, unit_price, reorder_level, warehouse_location) VALUES
    ('Cement (50kg bags)',         'Binding Material',  'Bag',          500,   200.00,  50, 'Warehouse A - Section 1'),
    ('Steel Bars (12mm)',           'Structural Steel',  'Piece',        300,   550.00,  30, 'Yard B - Open Storage'),
    ('Steel Bars (8mm)',            'Structural Steel',  'Piece',        200,   350.00,  20, 'Yard B - Open Storage'),
    ('Sand (river)',                'Aggregate',         'Cubic Meter',  150,   600.00,  20, 'Yard C - Bulk Storage'),
    ('Sand (manufactured)',         'Aggregate',         'Cubic Meter',   80,   750.00,  15, 'Yard C - Bulk Storage'),
    ('Concrete Blocks (6 inch)',    'Masonry',           'Piece',       2000,    35.00, 200, 'Warehouse A - Section 2'),
    ('Bricks (Red Clay)',           'Masonry',           'Piece',      10000,     8.00, 500, 'Yard D - Open Storage'),
    ('Fly Ash Bricks',             'Masonry',           'Piece',       8000,     6.50, 400, 'Yard D - Open Storage'),
    ('TMT Bars (Fe500)',           'Structural Steel',  'Kg',           5000,    70.00, 500, 'Yard B - Covered'),
    ('AAC Blocks',                  'Masonry',           'Cubic Meter',  100,  4500.00,  10, 'Warehouse B - Section 1'),
    ('PVC Pipes (4 inch)',          'Plumbing',          'Piece',        300,   250.00,  30, 'Warehouse A - Section 3'),
    ('Roofing Sheets (GI)',         'Roofing',           'Sheet',        150,   850.00,  20, 'Yard E - Covered'),
    ('Tiles (Vitrified 600x600)',   'Flooring',          'Box',          200,  1200.00,  20, 'Warehouse B - Section 2'),
    ('Waterproofing Compound',      'Chemical',          'Litre',        100,   450.00,  10, 'Warehouse A - Section 4'),
    ('Plywood (18mm)',              'Wood',              'Sheet',        250,   950.00,  25, 'Warehouse B - Section 3');


-- -------------------------------------------------------
-- CONSTRUCTION VENDOR DATABASE
-- -------------------------------------------------------
\c postgres;

DROP DATABASE IF EXISTS construction_vendor_db;
CREATE DATABASE construction_vendor_db;

\c construction_vendor_db;

CREATE TABLE IF NOT EXISTS vendors (
    id              SERIAL         PRIMARY KEY,
    vendor_name     VARCHAR(255)   NOT NULL UNIQUE,
    contact_person  VARCHAR(255),
    email           VARCHAR(255),
    phone           VARCHAR(20),
    city            VARCHAR(100),
    state           VARCHAR(100),
    rating          NUMERIC(3, 2)  NOT NULL DEFAULT 3.00,
    is_active       BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_products (
    id              SERIAL         PRIMARY KEY,
    vendor_id       INTEGER        NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    item_name       VARCHAR(255)   NOT NULL,
    unit_price      NUMERIC(15, 2) NOT NULL,
    lead_time_days  INTEGER        NOT NULL DEFAULT 7,
    min_order_qty   INTEGER        NOT NULL DEFAULT 1,
    availability    VARCHAR(50)    NOT NULL DEFAULT 'In Stock'
);

CREATE INDEX idx_construction_vendor_products_item ON vendor_products(item_name);
CREATE INDEX idx_construction_vendor_products_vendor ON vendor_products(vendor_id);

INSERT INTO vendors (vendor_name, contact_person, email, phone, city, state, rating) VALUES
    ('ACC Cement Ltd',           'Suresh Nair',      'suresh@acccement.com',    '9876543210', 'Mumbai',    'Maharashtra', 4.50),
    ('UltraTech Cement',         'Kavitha Reddy',    'kavitha@ultratech.com',   '9876543211', 'Ahmedabad', 'Gujarat',     4.70),
    ('Tata Steel',               'Rahul Singh',      'rahul@tatasteel.com',     '9876543212', 'Jamshedpur','Jharkhand',   4.80),
    ('JK Cement Ltd',            'Meena Iyer',       'meena@jkcement.com',      '9876543213', 'Delhi',     'Delhi',       4.30),
    ('Dalmia Bharat Cement',     'Arjun Pillai',     'arjun@dalmia.com',        '9876543214', 'Chennai',   'Tamil Nadu',  4.20),
    ('JSW Steel',                'Pooja Mehta',      'pooja@jsw.com',           '9876543215', 'Vijaynagar','Karnataka',   4.60),
    ('Shree Cement',             'Vikram Joshi',     'vikram@shreecement.com',  '9876543216', 'Beawar',    'Rajasthan',   4.40),
    ('Ambuja Cements',           'Neha Gupta',       'neha@ambuja.com',         '9876543217', 'Ahmedabad', 'Gujarat',     4.35),
    ('SAIL (Steel Authority)',   'Deepak Kumar',     'deepak@sail.com',         '9876543218', 'Delhi',     'Delhi',       4.25),
    ('Ramco Cements',            'Lakshmi Sundaram', 'lakshmi@ramco.com',       '9876543219', 'Chennai',   'Tamil Nadu',  4.15);

INSERT INTO vendor_products (vendor_id, item_name, unit_price, lead_time_days, min_order_qty, availability) VALUES
    -- ACC Cement
    (1, 'Cement (50kg bags)',      190.00,  3,  50, 'In Stock'),
    (1, 'Fly Ash Bricks',           6.00,  5, 500, 'In Stock'),
    -- UltraTech Cement
    (2, 'Cement (50kg bags)',      195.00,  2,  50, 'In Stock'),
    (2, 'AAC Blocks',             4200.00,  4,   5, 'In Stock'),
    (2, 'Concrete Blocks (6 inch)', 33.00,  3, 100, 'In Stock'),
    -- Tata Steel
    (3, 'Steel Bars (12mm)',       530.00,  5,  20, 'In Stock'),
    (3, 'Steel Bars (8mm)',        335.00,  5,  20, 'In Stock'),
    (3, 'TMT Bars (Fe500)',         67.00,  4, 100, 'In Stock'),
    -- JK Cement
    (4, 'Cement (50kg bags)',      185.00,  4,  50, 'In Stock'),
    (4, 'Waterproofing Compound',  430.00,  3,  10, 'In Stock'),
    -- Dalmia Bharat Cement
    (5, 'Cement (50kg bags)',      188.00,  5,  50, 'In Stock'),
    (5, 'Concrete Blocks (6 inch)', 32.00,  4, 100, 'In Stock'),
    -- JSW Steel
    (6, 'Steel Bars (12mm)',       525.00,  4,  20, 'In Stock'),
    (6, 'TMT Bars (Fe500)',         65.00,  3, 100, 'In Stock'),
    (6, 'Roofing Sheets (GI)',     820.00,  5,  10, 'In Stock'),
    -- Shree Cement
    (7, 'Cement (50kg bags)',      192.00,  3,  50, 'In Stock'),
    (7, 'Sand (river)',            580.00,  2,  10, 'In Stock'),
    -- Ambuja Cements
    (8, 'Cement (50kg bags)',      193.00,  3,  50, 'In Stock'),
    (8, 'Bricks (Red Clay)',         7.50,  4, 200, 'In Stock'),
    -- SAIL
    (9, 'Steel Bars (12mm)',       520.00,  6,  50, 'In Stock'),
    (9, 'Steel Bars (8mm)',        330.00,  6,  50, 'In Stock'),
    (9, 'TMT Bars (Fe500)',         63.00,  5, 200, 'In Stock'),
    -- Ramco Cements
    (10, 'Cement (50kg bags)',     187.00,  5,  50, 'In Stock'),
    (10, 'Tiles (Vitrified 600x600)', 1150.00, 7, 10, 'In Stock');
