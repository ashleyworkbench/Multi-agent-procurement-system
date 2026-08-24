-- =============================================================
-- ELECTRONICS INDUSTRY DATABASES
-- Engine: MySQL 8.0
-- Databases: electronics_inventory_db, electronics_vendor_db
-- API Key: ELECTRONICS_KEY
-- NOTE: MySQL syntax
-- =============================================================

-- -------------------------------------------------------
-- ELECTRONICS INVENTORY DATABASE
-- -------------------------------------------------------
CREATE DATABASE IF NOT EXISTS electronics_inventory_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE electronics_inventory_db;

CREATE TABLE IF NOT EXISTS inventory_items (
    id                 INT            AUTO_INCREMENT PRIMARY KEY,
    name               VARCHAR(255)   NOT NULL,
    category           VARCHAR(100)   NOT NULL,
    unit               VARCHAR(50)    NOT NULL,
    quantity_in_stock  INT            NOT NULL DEFAULT 0,
    unit_price         DECIMAL(15, 2) NOT NULL,
    reorder_level      INT            NOT NULL DEFAULT 100,
    part_number        VARCHAR(100),
    manufacturer       VARCHAR(100),
    datasheet_url      VARCHAR(500),
    warehouse_location VARCHAR(100),
    last_updated       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_item_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_elec_inv_name        ON inventory_items(name);
CREATE INDEX idx_elec_inv_category    ON inventory_items(category);
CREATE INDEX idx_elec_inv_part_number ON inventory_items(part_number);

INSERT INTO inventory_items
    (name, category, unit, quantity_in_stock, unit_price, reorder_level, part_number, manufacturer, warehouse_location)
VALUES
    ('Resistors (10K Ohm)',           'Passive Components',    'Piece',  100000,    1.50, 10000, 'CFR-25JB-52-10K',   'Yageo',           'Bin A1'),
    ('Resistors (1K Ohm)',            'Passive Components',    'Piece',   80000,    1.50, 10000, 'CFR-25JB-52-1K',    'Yageo',           'Bin A1'),
    ('Resistors (100 Ohm)',           'Passive Components',    'Piece',   60000,    1.50,  8000, 'CFR-25JB-52-100R',  'Yageo',           'Bin A2'),
    ('Capacitors (100uF)',            'Passive Components',    'Piece',   50000,    4.00,  5000, 'ECA-1HM101',        'Panasonic',       'Bin B1'),
    ('Capacitors (10uF)',             'Passive Components',    'Piece',   60000,    2.50,  5000, 'ECA-1HM100',        'Panasonic',       'Bin B1'),
    ('Capacitors (1000uF)',           'Passive Components',    'Piece',   30000,    8.00,  3000, 'ECA-1HM102',        'Panasonic',       'Bin B2'),
    ('Inductors (10uH)',              'Passive Components',    'Piece',   25000,    6.00,  2000, 'SRR1260-100Y',      'Bourns',          'Bin B3'),
    ('LED (Red 5mm)',                 'Optoelectronics',       'Piece',  200000,    0.80, 20000, 'HLMP-EG08-Y2000',   'Broadcom',        'Bin C1'),
    ('LED (Green 5mm)',               'Optoelectronics',       'Piece',  180000,    0.80, 20000, 'HLMP-EG3C-Y2000',   'Broadcom',        'Bin C1'),
    ('7-Segment Display',             'Optoelectronics',       'Piece',   10000,   12.00,  1000, 'SA56-11EWA',        'Kingbright',      'Bin C2'),
    ('Arduino Uno R3',               'Microcontrollers',      'Piece',    1500,  650.00,   100, 'A000066',           'Arduino',         'Rack D1'),
    ('ESP32 Dev Module',             'Microcontrollers',      'Piece',    2000,  420.00,   150, 'ESP32-DEVKITC-32E', 'Espressif',       'Rack D1'),
    ('Raspberry Pi 4 (4GB)',         'Single Board Computers','Piece',     500, 4500.00,    50, 'SC0194',            'Raspberry Pi',    'Rack D2'),
    ('STM32F103C8 (Blue Pill)',       'Microcontrollers',      'Piece',    3000,  180.00,   200, 'STM32F103C8T6',     'STMicroelectronics','Rack D1'),
    ('Temperature Sensor (DS18B20)', 'Sensors',               'Piece',    5000,   95.00,   500, 'DS18B20',           'Maxim Integrated','Rack E1'),
    ('Humidity Sensor (DHT22)',       'Sensors',               'Piece',    3000,  150.00,   300, 'DHT22',             'AOSONG',          'Rack E1'),
    ('IR Sensor Module',             'Sensors',               'Piece',    4000,   45.00,   400, 'TCRT5000',          'Vishay',          'Rack E2'),
    ('Ultrasonic Sensor (HC-SR04)',  'Sensors',               'Piece',    6000,   60.00,   600, 'HC-SR04',           'Generic',         'Rack E2'),
    ('MOSFET (IRF540N)',             'Transistors',           'Piece',   20000,   18.00,  2000, 'IRF540N',           'Infineon',        'Bin F1'),
    ('NPN Transistor (BC547)',       'Transistors',           'Piece',   50000,    2.50,  5000, 'BC547',             'ON Semi',         'Bin F1'),
    ('Op-Amp (LM741)',               'ICs',                   'Piece',   15000,   12.00,  1500, 'LM741CN',           'Texas Instruments','Bin F2'),
    ('Timer IC (NE555)',             'ICs',                   'Piece',   20000,    8.00,  2000, 'NE555P',            'Texas Instruments','Bin F2'),
    ('Voltage Regulator (7805)',     'Power Components',      'Piece',   12000,   15.00,  1200, 'L7805CV',           'STMicroelectronics','Bin G1'),
    ('Buck Converter (LM2596)',      'Power Components',      'Piece',    8000,   35.00,   800, 'LM2596S-ADJ',       'Texas Instruments','Bin G1'),
    ('PCB Breadboard (830 tie)',     'Prototyping',           'Piece',    2000,   85.00,   200, 'BB-830',            'Generic',         'Rack H1');


-- -------------------------------------------------------
-- ELECTRONICS VENDOR DATABASE
-- -------------------------------------------------------
CREATE DATABASE IF NOT EXISTS electronics_vendor_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE electronics_vendor_db;

CREATE TABLE IF NOT EXISTS vendors (
    id             INT            AUTO_INCREMENT PRIMARY KEY,
    vendor_name    VARCHAR(255)   NOT NULL,
    contact_person VARCHAR(255),
    email          VARCHAR(255),
    phone          VARCHAR(20),
    city           VARCHAR(100),
    country        VARCHAR(100)   DEFAULT 'India',
    rating         DECIMAL(3, 2)  NOT NULL DEFAULT 3.00,
    is_active      TINYINT(1)     NOT NULL DEFAULT 1,
    created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_vendor_name (vendor_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS vendor_products (
    id             INT            AUTO_INCREMENT PRIMARY KEY,
    vendor_id      INT            NOT NULL,
    item_name      VARCHAR(255)   NOT NULL,
    unit_price     DECIMAL(15, 2) NOT NULL,
    lead_time_days INT            NOT NULL DEFAULT 7,
    min_order_qty  INT            NOT NULL DEFAULT 10,
    availability   VARCHAR(50)    NOT NULL DEFAULT 'In Stock',
    FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_elec_vp_item   ON vendor_products(item_name);
CREATE INDEX idx_elec_vp_vendor ON vendor_products(vendor_id);

INSERT INTO vendors (vendor_name, contact_person, email, phone, city, country, rating) VALUES
    ('Mouser Electronics',     'David Chen',       'david@mouser.com',         '+1-817-804-3888', 'Mansfield',   'USA',          4.85),
    ('DigiKey',                'Sarah Johnson',    'sarah@digikey.com',        '+1-218-681-6674', 'Thief River Falls', 'USA',   4.80),
    ('Arrow Electronics',      'Michael Brooks',   'michael@arrow.com',        '+1-631-847-2000', 'Englewood',   'USA',          4.70),
    ('RS Components',          'James Wilson',     'james@rscomponents.com',   '+44-1536-201201', 'Corby',       'UK',           4.65),
    ('Robu India',             'Rohit Sharma',     'rohit@robu.in',            '9512345678',      'Mumbai',      'India',        4.75),
    ('Electronicscomp.in',     'Priya Verma',      'priya@electronicscomp.in', '9512345679',      'Pune',        'India',        4.55),
    ('Rhydo Technologies',     'Arun Kumar',       'arun@rhydo.com',           '9512345680',      'Bengaluru',   'India',        4.45),
    ('Evelta Electronics',     'Sneha Patil',      'sneha@evelta.com',         '9512345681',      'Mumbai',      'India',        4.40),
    ('LCSC Electronics',       'Wei Zhang',        'wei@lcsc.com',             '+86-755-8374-5488','Shenzhen',  'China',         4.60),
    ('Element14 India',        'Aditya Kapoor',    'aditya@element14.com',     '9512345682',      'Bengaluru',  'India',         4.50);

INSERT INTO vendor_products (vendor_id, item_name, unit_price, lead_time_days, min_order_qty, availability) VALUES
    -- Mouser Electronics
    (1, 'Resistors (10K Ohm)',            1.40,   7,  100, 'In Stock'),
    (1, 'Capacitors (100uF)',             3.80,   7,   50, 'In Stock'),
    (1, 'MOSFET (IRF540N)',              17.50,   7,   10, 'In Stock'),
    (1, 'Op-Amp (LM741)',               11.50,   7,   10, 'In Stock'),
    (1, 'Temperature Sensor (DS18B20)', 90.00,   7,   20, 'In Stock'),
    -- DigiKey
    (2, 'Resistors (10K Ohm)',            1.45,   5,  100, 'In Stock'),
    (2, 'Capacitors (100uF)',             3.90,   5,   50, 'In Stock'),
    (2, 'Arduino Uno R3',               620.00,   5,    5, 'In Stock'),
    (2, 'NPN Transistor (BC547)',         2.30,   5,  100, 'In Stock'),
    (2, 'Timer IC (NE555)',               7.50,   5,   25, 'In Stock'),
    -- Arrow Electronics
    (3, 'ESP32 Dev Module',             400.00,   7,   10, 'In Stock'),
    (3, 'STM32F103C8 (Blue Pill)',      170.00,   7,   20, 'In Stock'),
    (3, 'Voltage Regulator (7805)',      14.50,   5,   20, 'In Stock'),
    (3, 'Buck Converter (LM2596)',       33.00,   6,   10, 'In Stock'),
    -- RS Components
    (4, 'Raspberry Pi 4 (4GB)',        4300.00,  10,    2, 'In Stock'),
    (4, 'Temperature Sensor (DS18B20)', 92.00,   8,   10, 'In Stock'),
    (4, 'Humidity Sensor (DHT22)',     145.00,   8,   10, 'In Stock'),
    -- Robu India
    (5, 'Arduino Uno R3',              640.00,   3,    5, 'In Stock'),
    (5, 'ESP32 Dev Module',            410.00,   3,   10, 'In Stock'),
    (5, 'Ultrasonic Sensor (HC-SR04)',  58.00,   2,   20, 'In Stock'),
    (5, 'IR Sensor Module',             43.00,   2,   20, 'In Stock'),
    (5, 'Humidity Sensor (DHT22)',     145.00,   3,   10, 'In Stock'),
    (5, 'PCB Breadboard (830 tie)',     80.00,   2,   10, 'In Stock'),
    -- Electronicscomp.in
    (6, 'Resistors (10K Ohm)',           1.30,   4,  500, 'In Stock'),
    (6, 'Capacitors (100uF)',            3.70,   4,  200, 'In Stock'),
    (6, 'LED (Red 5mm)',                 0.75,   3,  500, 'In Stock'),
    (6, 'LED (Green 5mm)',               0.75,   3,  500, 'In Stock'),
    (6, 'NPN Transistor (BC547)',        2.20,   3,  200, 'In Stock'),
    -- Rhydo Technologies
    (7, 'STM32F103C8 (Blue Pill)',      175.00,   5,   10, 'In Stock'),
    (7, 'Temperature Sensor (DS18B20)', 88.00,   4,   20, 'In Stock'),
    (7, 'MOSFET (IRF540N)',             17.00,   4,   20, 'In Stock'),
    -- Evelta Electronics
    (8, 'Arduino Uno R3',              635.00,   4,    5, 'In Stock'),
    (8, 'Raspberry Pi 4 (4GB)',       4350.00,  12,    2, 'Limited Stock'),
    (8, 'Ultrasonic Sensor (HC-SR04)',  57.00,   3,   20, 'In Stock'),
    -- LCSC Electronics
    (9, 'Resistors (10K Ohm)',           1.20,  14,  1000, 'In Stock'),
    (9, 'Capacitors (100uF)',            3.50,  14,   500, 'In Stock'),
    (9, 'Inductors (10uH)',              5.50,  14,   200, 'In Stock'),
    (9, 'Timer IC (NE555)',              7.20,  14,   100, 'In Stock'),
    (9, 'Voltage Regulator (7805)',     13.50,  14,   100, 'In Stock'),
    -- Element14 India
    (10, 'Raspberry Pi 4 (4GB)',      4400.00,   7,    2, 'In Stock'),
    (10, 'Arduino Uno R3',             660.00,   5,    5, 'In Stock'),
    (10, 'ESP32 Dev Module',           430.00,   5,   10, 'In Stock'),
    (10, 'Buck Converter (LM2596)',     34.00,   6,   10, 'In Stock');

-- -------------------------------------------------------
-- GRANTS
-- -------------------------------------------------------
GRANT ALL PRIVILEGES ON electronics_inventory_db.* TO 'procurement_admin'@'%';
GRANT ALL PRIVILEGES ON electronics_vendor_db.*    TO 'procurement_admin'@'%';
FLUSH PRIVILEGES;
