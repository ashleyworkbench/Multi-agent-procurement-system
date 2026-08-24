-- =============================================================
-- OCR PROCUREMENT DATABASE
-- Engine: PostgreSQL
-- Purpose: Agent 1 output store. Procurement requests extracted
--          from OCR documents. Exposed via OCR Service API only.
--          Agents NEVER access this DB directly.
-- =============================================================

\c postgres;

DROP DATABASE IF EXISTS ocr_procurement_db;
CREATE DATABASE ocr_procurement_db;

\c ocr_procurement_db;

-- -------------------------------------------------------
-- Table: procurement_requests
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurement_requests (
    id                   SERIAL         PRIMARY KEY,
    requester_name       VARCHAR(255)   NOT NULL,
    address              VARCHAR(500),
    phone_number         VARCHAR(50),
    total_estimated_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    created_at           TIMESTAMP      NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- Table: procurement_request_items
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS procurement_request_items (
    id             SERIAL         PRIMARY KEY,
    request_id     INTEGER        NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
    description    VARCHAR(500)   NOT NULL,
    quantity       INTEGER        NOT NULL DEFAULT 1,
    estimated_cost NUMERIC(15, 2) NOT NULL DEFAULT 0.00
);

CREATE INDEX idx_items_request_id ON procurement_request_items(request_id);

-- -------------------------------------------------------
-- Table: document_processing (Agent 1 upload tracking)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_processing (
    id                  SERIAL        PRIMARY KEY,
    filename            VARCHAR(255)  NOT NULL,
    file_path           VARCHAR(500)  NOT NULL DEFAULT '',
    minio_status        VARCHAR(50)   NOT NULL DEFAULT 'pending',
    minio_object_name   VARCHAR(500),
    status              VARCHAR(50)   NOT NULL DEFAULT 'queued',
    ocr_status          VARCHAR(50)   NOT NULL DEFAULT 'pending',
    docling_status      VARCHAR(50)   NOT NULL DEFAULT 'pending',
    gemini_status       VARCHAR(50)   NOT NULL DEFAULT 'pending',
    ocr_text            TEXT,
    structured_data     JSONB,
    request_id          INTEGER       REFERENCES procurement_requests(id),
    error_message       TEXT,
    created_at          TIMESTAMP     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- Sample Data: Simulated OCR-extracted procurement requests
-- -------------------------------------------------------
INSERT INTO procurement_requests (requester_name, total_estimated_cost, created_at) VALUES
    ('Rajesh Kumar',   125000.00, NOW() - INTERVAL '2 days'),
    ('Priya Sharma',    87500.00, NOW() - INTERVAL '1 day'),
    ('Amit Verma',     210000.00, NOW() - INTERVAL '3 hours'),
    ('Sunita Patel',    45000.00, NOW() - INTERVAL '30 minutes');

INSERT INTO procurement_request_items (request_id, description, quantity, estimated_cost) VALUES
    (1, 'Cement (50kg bags)',    200,  40000.00),
    (1, 'Steel Bars (12mm)',     100,  55000.00),
    (1, 'Sand (river)',           50,  30000.00),
    (2, 'Paracetamol 500mg',    5000,  25000.00),
    (2, 'Ibuprofen 400mg',      3000,  37500.00),
    (2, 'Amoxicillin 250mg',    2000,  25000.00),
    (3, 'Bearings (SKF 6205)',   500,  75000.00),
    (3, 'Copper Wire (1mm)',     200,  60000.00),
    (3, 'Aluminium Sheet',       100,  75000.00),
    (4, 'Resistors (10K Ohm)', 10000,  15000.00),
    (4, 'Capacitors (100uF)',   5000,  20000.00),
    (4, 'Microcontrollers',      100,  10000.00);
