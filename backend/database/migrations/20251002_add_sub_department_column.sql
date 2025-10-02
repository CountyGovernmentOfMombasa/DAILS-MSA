-- Migration: Add sub_department column & optional ENUM
-- Date: 2025-10-02
-- Adjust ENUM values after confirming required sub-departments.

ALTER TABLE users
  ADD COLUMN sub_department VARCHAR(150) NULL AFTER department;

-- If you prefer ENUM (edit values then run):
-- ALTER TABLE users MODIFY COLUMN sub_department ENUM(
--   'Executive Office',
--   'Human Resources',
--   'Finance',
--   'ICT',
--   'Procurement'
-- ) NULL;

-- Audit tables or admin_users if they also need sub_department (repeat as needed):
-- ALTER TABLE admin_users ADD COLUMN sub_department VARCHAR(150) NULL AFTER department;

-- Index for filtering/reporting:
CREATE INDEX idx_users_sub_department ON users (sub_department);
