-- =============================================================
-- MYSQL GRANTS
-- Run first (00_ prefix ensures it runs before other scripts)
-- Grants procurement_admin full access to all industry databases
-- =============================================================

-- Create user if not exists (in case MySQL didn't create it from env)
CREATE USER IF NOT EXISTS 'procurement_admin'@'%' IDENTIFIED BY 'SecurePass@2024';

-- Grant access to all industry databases
GRANT ALL PRIVILEGES ON pharma_inventory_db.*     TO 'procurement_admin'@'%';
GRANT ALL PRIVILEGES ON pharma_vendor_db.*        TO 'procurement_admin'@'%';
GRANT ALL PRIVILEGES ON electronics_inventory_db.* TO 'procurement_admin'@'%';
GRANT ALL PRIVILEGES ON electronics_vendor_db.*   TO 'procurement_admin'@'%';

FLUSH PRIVILEGES;
