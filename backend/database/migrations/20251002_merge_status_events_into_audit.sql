-- Migration: Merge declaration_status_events into declaration_status_audit and add composite index
-- 1. Add snapshot columns to audit table (ignore errors if already exist)
ALTER TABLE declaration_status_audit ADD COLUMN user_full_name VARCHAR(255) NULL AFTER admin_id;
ALTER TABLE declaration_status_audit ADD COLUMN national_id VARCHAR(100) NULL AFTER user_full_name;
-- 2. Composite index to speed status/time queries
CREATE INDEX idx_decl_status_audit_status_changed ON declaration_status_audit (new_status, changed_at);
-- (Optional) If you want to migrate existing rows from declaration_status_events into audit, you can craft an INSERT ... SELECT here.
-- We leave data as-is because audit already contains historical approvals/rejections.
-- 3. (Optional) You may drop declaration_status_events after confirming no consumers:
 DROP TABLE IF EXISTS declaration_status_events;