-- Additive Manufacturing vendor master and performance schema.
-- Safe to run against an existing manufacturing_vendor_db; no existing
-- vendor, product, PO, or database rows are dropped.
\connect manufacturing_vendor_db

CREATE TABLE IF NOT EXISTS vendor_master (
    vendor_id VARCHAR(50) PRIMARY KEY,
    company_id VARCHAR(100) NOT NULL,
    purchase_vendor_id INTEGER NOT NULL UNIQUE REFERENCES vendors(id),
    vendor_name VARCHAR(255) NOT NULL,
    city VARCHAR(100),
    state VARCHAR(100),
    supported_categories TEXT[] NOT NULL DEFAULT '{}',
    supported_products JSONB NOT NULL DEFAULT '[]'::jsonb,
    capacity JSONB NOT NULL DEFAULT '{}'::jsonb,
    active_status BOOLEAN NOT NULL DEFAULT TRUE,
    compliance_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    certifications TEXT[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE vendor_products
    ADD COLUMN IF NOT EXISTS product_category VARCHAR(100),
    ADD COLUMN IF NOT EXISTS capacity_units INTEGER;

CREATE TABLE IF NOT EXISTS vendor_performance (
    id BIGSERIAL PRIMARY KEY,
    company_id VARCHAR(100) NOT NULL,
    source_row_number INTEGER NOT NULL,
    order_id VARCHAR(100),
    order_date TEXT,
    vendor_id VARCHAR(50) NOT NULL,
    vendor_name TEXT,
    on_time_rate TEXT,
    delay_days TEXT,
    lead_time TEXT,
    defect_rate TEXT,
    return_rate TEXT,
    price_variance TEXT,
    compliance_score TEXT,
    violations TEXT,
    iso_certified TEXT,
    spend_tier TEXT,
    actual_order_outcome TEXT,
    rating TEXT,
    ground_truth_risk TEXT,
    raw_record JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, source_row_number)
);

CREATE INDEX IF NOT EXISTS idx_vendor_performance_company_vendor
    ON vendor_performance(company_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_performance_order
    ON vendor_performance(company_id, order_id);

-- Keep orphan rows visible to the API so Risk can quarantine and audit them
-- by vendor_id instead of having PostgreSQL silently prevent/log nothing.
ALTER TABLE vendor_performance
    DROP CONSTRAINT IF EXISTS vendor_performance_vendor_id_fkey;

-- These explicit ID mappings preserve the existing integer vendor IDs used
-- by Agent 4 while the performance feed uses stable V-MFG IDs. No runtime
-- matching by vendor_name is performed.
INSERT INTO vendor_master
    (vendor_id, company_id, purchase_vendor_id, vendor_name, city, state,
     supported_categories, active_status)
VALUES
    ('V-MFG-001', 'manufacturing', 1,  'SKF India Ltd',       'Pune',      'Maharashtra',   ARRAY['Mechanical Components'], TRUE),
    ('V-MFG-002', 'manufacturing', 2,  'Bosch India',         'Bangalore', 'Karnataka',     ARRAY['Electrical Equipment', 'Pneumatic Components', 'Cutting Tools'], TRUE),
    ('V-MFG-003', 'manufacturing', 3,  'Siemens India',       'Mumbai',    'Maharashtra',   ARRAY['Electrical Equipment', 'Pneumatic Components'], TRUE),
    ('V-MFG-004', 'manufacturing', 4,  'ABB India',           'Bangalore', 'Karnataka',     ARRAY['Electrical Equipment', 'Pneumatic Components'], TRUE),
    ('V-MFG-005', 'manufacturing', 7,  'Hindalco Industries', 'Mumbai',    'Maharashtra',   ARRAY['Raw Materials'], TRUE),
    ('V-MFG-006', 'manufacturing', 5,  'Havells India',       'Noida',     'Uttar Pradesh', ARRAY['Electrical Materials'], TRUE),
    ('V-MFG-007', 'manufacturing', 6,  'Polycab India',       'Daman',     'Dadra & NH',    ARRAY['Electrical Materials'], TRUE),
    ('V-MFG-008', 'manufacturing', 8,  'Tata Metaliks',       'Kharagpur', 'West Bengal',   ARRAY['Raw Materials'], TRUE),
    ('V-MFG-009', 'manufacturing', 9,  'NBC Bearings',        'Jaipur',    'Rajasthan',     ARRAY['Mechanical Components', 'Transmission Parts'], TRUE),
    ('V-MFG-010', 'manufacturing', 10, 'Kirloskar Electric',  'Bangalore', 'Karnataka',     ARRAY['Electrical Equipment'], TRUE)
ON CONFLICT (vendor_id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    purchase_vendor_id = EXCLUDED.purchase_vendor_id,
    vendor_name = EXCLUDED.vendor_name,
    city = EXCLUDED.city,
    state = EXCLUDED.state,
    supported_categories = EXCLUDED.supported_categories,
    active_status = EXCLUDED.active_status,
    updated_at = NOW();

-- Finite per-product demo capacities are explicit seed data, not derived
-- from risk or inferred from an "In Stock" flag. Replace with supplier-
-- verified limits before using this sample catalog for real purchasing.
UPDATE vendor_products AS product
SET product_category = seed.product_category,
    capacity_units = seed.capacity_units
FROM (VALUES
    (1, 'Bearings (SKF 6205)',          'Mechanical Components', 400),
    (1, 'Bearings (6202 Deep Groove)',  'Mechanical Components', 250),
    (1, 'Bearings (Taper Roller)',      'Mechanical Components', 100),
    (2, 'Electric Motors (1HP)',        'Electrical Equipment',  100),
    (2, 'Solenoid Valves (24V DC)',     'Pneumatic Components',  150),
    (2, 'Drill Bits (HSS Set)',         'Cutting Tools',         300),
    (3, 'Electric Motors (5HP)',        'Electrical Equipment',  100),
    (3, 'Electric Motors (10HP)',       'Electrical Equipment',   60),
    (3, 'Solenoid Valves (24V DC)',     'Pneumatic Components',  200),
    (4, 'Electric Motors (5HP)',        'Electrical Equipment',   80),
    (4, 'Electric Motors (10HP)',       'Electrical Equipment',   50),
    (4, 'Pneumatic Cylinders (50mm)',   'Pneumatic Components',  100),
    (5, 'Copper Wire (1mm)',            'Electrical Materials',  800),
    (5, 'Copper Wire (2.5mm)',          'Electrical Materials',  700),
    (5, 'Copper Wire (4mm)',            'Electrical Materials',  600),
    (6, 'Copper Wire (1mm)',            'Electrical Materials',  900),
    (6, 'Copper Wire (2.5mm)',          'Electrical Materials',  750),
    (6, 'Copper Wire (4mm)',            'Electrical Materials',  650),
    (7, 'Aluminium Sheet (2mm)',        'Raw Materials',         500),
    (7, 'Aluminium Sheet (3mm)',        'Raw Materials',         400),
    (8, 'Stainless Steel Sheet (2mm)', 'Raw Materials',         300),
    (8, 'Aluminium Sheet (2mm)',        'Raw Materials',         350),
    (9, 'Bearings (SKF 6205)',          'Mechanical Components', 500),
    (9, 'Bearings (6202 Deep Groove)',  'Mechanical Components', 350),
    (9, 'V-Belts (A-Type)',             'Transmission Parts',    300),
    (10, 'Electric Motors (1HP)',       'Electrical Equipment',  100),
    (10, 'Electric Motors (5HP)',       'Electrical Equipment',   60)
) AS seed(vendor_id, item_name, product_category, capacity_units)
WHERE product.vendor_id = seed.vendor_id
  AND product.item_name = seed.item_name;

UPDATE vendor_master AS master
SET supported_products = products.product_list,
    capacity = products.capacity_by_product,
    updated_at = NOW()
FROM (
    SELECT
        master.vendor_id,
        COALESCE(
            jsonb_agg(jsonb_build_object(
                'item_name', product.item_name,
                'category', product.product_category,
                'unit_price', product.unit_price,
                'lead_time_days', product.lead_time_days,
                'min_order_qty', product.min_order_qty,
                'capacity', product.capacity_units,
                'availability', product.availability
            ) ORDER BY product.item_name) FILTER (WHERE product.id IS NOT NULL),
            '[]'::jsonb
        ) AS product_list,
        COALESCE(
            jsonb_object_agg(product.item_name, product.capacity_units)
                FILTER (WHERE product.id IS NOT NULL),
            '{}'::jsonb
        ) AS capacity_by_product
    FROM vendor_master AS master
    LEFT JOIN vendor_products AS product
        ON product.vendor_id = master.purchase_vendor_id
    GROUP BY master.vendor_id
) AS products
WHERE master.vendor_id = products.vendor_id;