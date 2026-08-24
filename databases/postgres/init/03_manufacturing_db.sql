-- =============================================================
-- MANUFACTURING INDUSTRY DATABASES
-- Engine: PostgreSQL
-- Databases: manufacturing_inventory_db, manufacturing_vendor_db
-- API Key: MANUFACTURING_KEY
-- =============================================================

\c postgres;

-- -------------------------------------------------------
-- MANUFACTURING INVENTORY DATABASE
-- -------------------------------------------------------
DROP DATABASE IF EXISTS manufacturing_inventory_db;
CREATE DATABASE manufacturing_inventory_db;

\c manufacturing_inventory_db;

CREATE TABLE IF NOT EXISTS inventory_items (
    id                 SERIAL         PRIMARY KEY,
    name               VARCHAR(255)   NOT NULL UNIQUE,
    category           VARCHAR(100)   NOT NULL,
    unit               VARCHAR(50)    NOT NULL,
    quantity_in_stock  INTEGER        NOT NULL DEFAULT 0,
    unit_price         NUMERIC(15, 2) NOT NULL,
    reorder_level      INTEGER        NOT NULL DEFAULT 10,
    part_number        VARCHAR(100),
    warehouse_location VARCHAR(100),
    last_updated       TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mfg_inv_name ON inventory_items(name);
CREATE INDEX idx_mfg_inv_category ON inventory_items(category);
CREATE INDEX idx_mfg_inv_part_number ON inventory_items(part_number);

INSERT INTO inventory_items (name, category, unit, quantity_in_stock, unit_price, reorder_level, part_number, warehouse_location) VALUES
    ('Bearings (SKF 6205)',          'Mechanical Components', 'Piece',   250,   300.00,  30, 'SKF-6205',      'Store A - Rack 1'),
    ('Bearings (6202 Deep Groove)',  'Mechanical Components', 'Piece',   180,   220.00,  20, 'SKF-6202',      'Store A - Rack 1'),
    ('Bearings (Taper Roller)',      'Mechanical Components', 'Piece',    90,   750.00,  10, 'TRB-32006',     'Store A - Rack 2'),
    ('Electric Motors (1HP)',        'Electrical Equipment',  'Unit',     40,  5500.00,   5, 'MOT-1HP-3PH',   'Store B - Section 1'),
    ('Electric Motors (5HP)',        'Electrical Equipment',  'Unit',     25,  18000.00,  3, 'MOT-5HP-3PH',   'Store B - Section 1'),
    ('Electric Motors (10HP)',       'Electrical Equipment',  'Unit',     15,  32000.00,  2, 'MOT-10HP-3PH',  'Store B - Section 2'),
    ('Copper Wire (1mm)',            'Electrical Materials',  'Kg',      500,   680.00,  50, 'CW-1MM',        'Store C - Rack 1'),
    ('Copper Wire (2.5mm)',          'Electrical Materials',  'Kg',      350,   780.00,  40, 'CW-2.5MM',      'Store C - Rack 1'),
    ('Copper Wire (4mm)',            'Electrical Materials',  'Kg',      200,   890.00,  30, 'CW-4MM',        'Store C - Rack 2'),
    ('Aluminium Sheet (2mm)',        'Raw Materials',         'Sheet',   120,  2800.00,  15, 'AL-SH-2MM',     'Store D - Rack 1'),
    ('Aluminium Sheet (3mm)',        'Raw Materials',         'Sheet',    80,  3500.00,  10, 'AL-SH-3MM',     'Store D - Rack 1'),
    ('Stainless Steel Sheet (2mm)',  'Raw Materials',         'Sheet',    60,  4200.00,   8, 'SS-SH-2MM',     'Store D - Rack 2'),
    ('Hydraulic Oil (ISO 46)',       'Lubricants',            'Litre',   400,   220.00,  50, 'HYD-OIL-46',    'Store E - Section 1'),
    ('Gear Oil (SAE 90)',            'Lubricants',            'Litre',   300,   180.00,  40, 'GEAR-OIL-90',   'Store E - Section 1'),
    ('V-Belts (A-Type)',             'Transmission Parts',    'Piece',   200,   150.00,  25, 'VB-A-TYPE',     'Store A - Rack 3'),
    ('Pneumatic Cylinders (50mm)',   'Pneumatic Components',  'Piece',    30,  2200.00,   5, 'PC-50MM',       'Store B - Section 3'),
    ('Solenoid Valves (24V DC)',     'Pneumatic Components',  'Piece',    45,  1800.00,   8, 'SV-24VDC',      'Store B - Section 3'),
    ('Safety Gloves (Cut Resistant)','Safety Equipment',      'Pair',    500,    85.00, 100, 'SF-GLOVE-CR',   'Store F - Rack 1'),
    ('Safety Helmets',               'Safety Equipment',      'Piece',   200,   250.00,  30, 'SF-HELMET',     'Store F - Rack 2'),
    ('Drill Bits (HSS Set)',         'Cutting Tools',         'Set',     100,   450.00,  15, 'DB-HSS-SET',    'Store G - Rack 1');


-- -------------------------------------------------------
-- MANUFACTURING VENDOR DATABASE
-- -------------------------------------------------------
\c postgres;

DROP DATABASE IF EXISTS manufacturing_vendor_db;
CREATE DATABASE manufacturing_vendor_db;

\c manufacturing_vendor_db;

CREATE TABLE IF NOT EXISTS vendors (
    id             SERIAL         PRIMARY KEY,
    vendor_name    VARCHAR(255)   NOT NULL UNIQUE,
    contact_person VARCHAR(255),
    email          VARCHAR(255),
    phone          VARCHAR(20),
    city           VARCHAR(100),
    state          VARCHAR(100),
    rating         NUMERIC(3, 2)  NOT NULL DEFAULT 3.00,
    is_active      BOOLEAN        NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendor_products (
    id             SERIAL         PRIMARY KEY,
    vendor_id      INTEGER        NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    item_name      VARCHAR(255)   NOT NULL,
    unit_price     NUMERIC(15, 2) NOT NULL,
    lead_time_days INTEGER        NOT NULL DEFAULT 7,
    min_order_qty  INTEGER        NOT NULL DEFAULT 1,
    availability   VARCHAR(50)    NOT NULL DEFAULT 'In Stock'
);

CREATE INDEX idx_mfg_vendor_products_item   ON vendor_products(item_name);
CREATE INDEX idx_mfg_vendor_products_vendor ON vendor_products(vendor_id);

INSERT INTO vendors (vendor_name, contact_person, email, phone, city, state, rating) VALUES
    ('SKF India Ltd',           'Anand Krishnan',   'anand@skfindia.com',       '9811223344', 'Pune',       'Maharashtra', 4.80),
    ('Bosch India',             'Ritu Sharma',      'ritu@boschindia.com',      '9811223345', 'Bangalore',  'Karnataka',   4.75),
    ('Siemens India',           'Sanjay Kulkarni',  'sanjay@siemens.co.in',    '9811223346', 'Mumbai',     'Maharashtra', 4.70),
    ('ABB India',               'Preethi Rao',      'preethi@abb.co.in',       '9811223347', 'Bangalore',  'Karnataka',   4.65),
    ('Havells India',           'Mohit Gupta',      'mohit@havells.com',       '9811223348', 'Noida',      'Uttar Pradesh',4.55),
    ('Polycab India',           'Geeta Nair',       'geeta@polycab.com',       '9811223349', 'Daman',      'Dadra & NH',  4.50),
    ('Hindalco Industries',     'Vikash Tiwari',    'vikash@hindalco.com',     '9811223350', 'Mumbai',     'Maharashtra', 4.60),
    ('Tata Metaliks',           'Swati Jha',        'swati@tatametaliks.com',  '9811223351', 'Kharagpur',  'West Bengal', 4.45),
    ('NBC Bearings',            'Ramesh Patil',     'ramesh@nbcbearings.com',  '9811223352', 'Jaipur',     'Rajasthan',   4.40),
    ('Kirloskar Electric',      'Divya Menon',      'divya@kirloskar.com',     '9811223353', 'Bangalore',  'Karnataka',   4.35);

INSERT INTO vendor_products (vendor_id, item_name, unit_price, lead_time_days, min_order_qty, availability) VALUES
    -- SKF India
    (1, 'Bearings (SKF 6205)',         285.00,  3,  10, 'In Stock'),
    (1, 'Bearings (6202 Deep Groove)', 210.00,  3,  10, 'In Stock'),
    (1, 'Bearings (Taper Roller)',     720.00,  5,   5, 'In Stock'),
    -- Bosch India
    (2, 'Electric Motors (1HP)',      5200.00,  7,   2, 'In Stock'),
    (2, 'Solenoid Valves (24V DC)',   1750.00,  5,   5, 'In Stock'),
    (2, 'Drill Bits (HSS Set)',        420.00,  4,   5, 'In Stock'),
    -- Siemens India
    (3, 'Electric Motors (5HP)',     17500.00,  7,   1, 'In Stock'),
    (3, 'Electric Motors (10HP)',    30500.00,  10,  1, 'In Stock'),
    (3, 'Solenoid Valves (24V DC)',   1700.00,  4,   5, 'In Stock'),
    -- ABB India
    (4, 'Electric Motors (5HP)',     17800.00,  6,   1, 'In Stock'),
    (4, 'Electric Motors (10HP)',    31000.00,  8,   1, 'In Stock'),
    (4, 'Pneumatic Cylinders (50mm)', 2100.00,  5,   2, 'In Stock'),
    -- Havells India
    (5, 'Copper Wire (1mm)',          660.00,  3,  50, 'In Stock'),
    (5, 'Copper Wire (2.5mm)',        760.00,  3,  50, 'In Stock'),
    (5, 'Copper Wire (4mm)',          870.00,  3,  25, 'In Stock'),
    -- Polycab India
    (6, 'Copper Wire (1mm)',          650.00,  4,  50, 'In Stock'),
    (6, 'Copper Wire (2.5mm)',        750.00,  4,  50, 'In Stock'),
    (6, 'Copper Wire (4mm)',          860.00,  4,  25, 'In Stock'),
    -- Hindalco Industries
    (7, 'Aluminium Sheet (2mm)',     2700.00,  5,   5, 'In Stock'),
    (7, 'Aluminium Sheet (3mm)',     3400.00,  5,   5, 'In Stock'),
    -- Tata Metaliks
    (8, 'Stainless Steel Sheet (2mm)', 4000.00, 6,  3, 'In Stock'),
    (8, 'Aluminium Sheet (2mm)',      2750.00,  5,   5, 'In Stock'),
    -- NBC Bearings
    (9, 'Bearings (SKF 6205)',         290.00,  4,  10, 'In Stock'),
    (9, 'Bearings (6202 Deep Groove)', 215.00,  4,  10, 'In Stock'),
    (9, 'V-Belts (A-Type)',            145.00,  3,  10, 'In Stock'),
    -- Kirloskar Electric
    (10, 'Electric Motors (1HP)',     5100.00,  6,   2, 'In Stock'),
    (10, 'Electric Motors (5HP)',    17200.00,  8,   1, 'In Stock');
