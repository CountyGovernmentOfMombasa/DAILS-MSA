-- Migration: Enforce NOT NULL on sub_department columns after data backfill
-- Preconditions:
--  1. All existing rows in users, admin_users, user_creation_audit, admin_creation_audit have sub_department populated (or acceptable default).
--  2. Application code already guarantees sub_department presence / derivation.
-- Rollback steps (manual):
--  ALTER TABLE <table> MODIFY COLUMN sub_department VARCHAR(255) NULL;

START TRANSACTION;

-- Safety: ensure required columns exist (idempotent if already created)
-- Requires MySQL 8.0+ for IF NOT EXISTS; if on 5.7 remove IF NOT EXISTS and run only once after checking schema.
ALTER TABLE users ADD COLUMN IF NOT EXISTS sub_department VARCHAR(255) NULL AFTER department;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS sub_department VARCHAR(255) NULL AFTER department;
ALTER TABLE user_creation_audit ADD COLUMN IF NOT EXISTS user_sub_department VARCHAR(255) NULL AFTER user_department;
ALTER TABLE admin_creation_audit ADD COLUMN IF NOT EXISTS new_admin_sub_department VARCHAR(255) NULL AFTER new_admin_department;

-- Ensure no NULLs remain (defensive) - choose first sub of department if possible, else copy department, else placeholder
UPDATE users u
LEFT JOIN (
  SELECT 'Executive' AS dept, 'Office of the Governor' AS fallback_sub UNION ALL
  SELECT 'Department of Public Service Administration, Youth, Gender and Sports','Public Service Administration' UNION ALL
  SELECT 'Department of Blue Economy, Cooperatives, Agriculture and Livestock','Department of Blue Economy, Cooperatives, Agriculture and Livestock' UNION ALL
  SELECT 'Department of Environment and Water','Environment and Solid Waste Management' UNION ALL
  SELECT 'Department of Transport, Infrastructure and Governance','Transport and Infrastructure' UNION ALL
  SELECT 'Department of Climate Change, Energy and Natural Resources','Department of Climate Change, Energy and Natural Resources' UNION ALL
  SELECT 'Department of Lands, Urban Planning, Housing and Serikali Mtaani','Lands, Urban Planning and Housing' UNION ALL
  SELECT 'Department of Education and Vocational Training','Department of Education and Vocational Training' UNION ALL
  SELECT 'Department of Finance, Economic Planning and Digital Transformation','Finance and Investment' UNION ALL
  SELECT 'Department of Health','Medical Services' UNION ALL
  SELECT 'Department of Trade, Tourism and Culture','Department of Trade, Tourism and Culture' UNION ALL
  SELECT 'Mombasa County Public Service Board','Mombasa County Public Service Board'
) f ON u.department = f.dept
SET u.sub_department = COALESCE(u.sub_department, f.fallback_sub, u.department, 'Unknown')
WHERE u.sub_department IS NULL;

-- Repeat for admin_users (if storing sub_department)
UPDATE admin_users a
LEFT JOIN (
  SELECT 'Executive' AS dept, 'Office of the Governor' AS fallback_sub UNION ALL
  SELECT 'Department of Public Service Administration, Youth, Gender and Sports','Public Service Administration' UNION ALL
  SELECT 'Department of Blue Economy, Cooperatives, Agriculture and Livestock','Department of Blue Economy, Cooperatives, Agriculture and Livestock' UNION ALL
  SELECT 'Department of Environment and Water','Environment and Solid Waste Management' UNION ALL
  SELECT 'Department of Transport, Infrastructure and Governance','Transport and Infrastructure' UNION ALL
  SELECT 'Department of Climate Change, Energy and Natural Resources','Department of Climate Change, Energy and Natural Resources' UNION ALL
  SELECT 'Department of Lands, Urban Planning, Housing and Serikali Mtaani','Lands, Urban Planning and Housing' UNION ALL
  SELECT 'Department of Education and Vocational Training','Department of Education and Vocational Training' UNION ALL
  SELECT 'Department of Finance, Economic Planning and Digital Transformation','Finance and Investment' UNION ALL
  SELECT 'Department of Health','Medical Services' UNION ALL
  SELECT 'Department of Trade, Tourism and Culture','Department of Trade, Tourism and Culture' UNION ALL
  SELECT 'Mombasa County Public Service Board','Mombasa County Public Service Board'
) f ON a.department = f.dept
SET a.sub_department = COALESCE(a.sub_department, f.fallback_sub, a.department, 'Unknown')
WHERE a.sub_department IS NULL;

-- (Audit tables may allow NULL historically; enforce only if desired)
UPDATE user_creation_audit uca
LEFT JOIN users u ON uca.user_id = u.id
SET uca.user_sub_department = COALESCE(uca.user_sub_department, u.sub_department)
WHERE uca.user_sub_department IS NULL;

UPDATE admin_creation_audit aca
LEFT JOIN admin_users a ON aca.admin_id = a.id
SET aca.new_admin_sub_department = COALESCE(aca.new_admin_sub_department, a.sub_department)
WHERE aca.new_admin_sub_department IS NULL;

-- Apply NOT NULL constraints
ALTER TABLE users MODIFY COLUMN sub_department VARCHAR(255) NOT NULL;
ALTER TABLE admin_users MODIFY COLUMN sub_department VARCHAR(255) NOT NULL;
ALTER TABLE user_creation_audit MODIFY COLUMN user_sub_department VARCHAR(255) NOT NULL;
ALTER TABLE admin_creation_audit MODIFY COLUMN new_admin_sub_department VARCHAR(255) NOT NULL;

COMMIT;
