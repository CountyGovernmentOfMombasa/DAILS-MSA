-- Migration: Update sub-departments to match latest naming (2025-10-13)
-- Purpose: Align DB values with backend/frontend enums
-- Note: Run this against the primary application database.

-- 1) Update users table (primary source of department/sub_department)
UPDATE users
SET sub_department = 'Clinical Services'
WHERE department = 'Department of Health' AND sub_department = 'Medical Services';

UPDATE users
SET sub_department = 'Public Health and Disease Prevention'
WHERE department = 'Department of Health' AND sub_department = 'Public Health';

UPDATE users
SET sub_department = 'Coast General Teaching and Referral Hospital (CGTRH)'
WHERE department = 'Department of Health' AND sub_department = 'Coast General Teaching and Referral Hospital';

-- 2) Cooperatives expansion/renames on users
UPDATE users
SET sub_department = 'Mombasa Water Supply & Sanitation Company Limited (MOWASSCO)'
WHERE department = 'Cooperatives' AND sub_department = 'MOWASSCO';

UPDATE users
SET sub_department = 'Mombasa Investment Cooporation (MIC)'
WHERE department = 'Cooperatives' AND sub_department = 'MIC';

-- 3) Apply the same renames for admin users if any
UPDATE admin_users
SET sub_department = 'Clinical Services'
WHERE department = 'Department of Health' AND sub_department = 'Medical Services';

UPDATE admin_users
SET sub_department = 'Public Health and Disease Prevention'
WHERE department = 'Department of Health' AND sub_department = 'Public Health';

UPDATE admin_users
SET sub_department = 'Coast General Teaching and Referral Hospital (CGTRH)'
WHERE department = 'Department of Health' AND sub_department = 'Coast General Teaching and Referral Hospital';

UPDATE admin_users
SET sub_department = 'Mombasa Water Supply & Sanitation Company Limited (MOWASSCO)'
WHERE department = 'Cooperatives' AND sub_department = 'MOWASSCO';

UPDATE admin_users
SET sub_department = 'Mombasa Investment Cooporation (MIC)'
WHERE department = 'Cooperatives' AND sub_department = 'MIC';

-- 4) Update lookup tables (if present): sub_departments under departments
--    Renames for Department of Health
UPDATE sub_departments sd
JOIN departments d ON d.id = sd.department_id
SET sd.name = 'Clinical Services'
WHERE d.name = 'Department of Health' AND sd.name = 'Medical Services';

UPDATE sub_departments sd
JOIN departments d ON d.id = sd.department_id
SET sd.name = 'Public Health and Disease Prevention'
WHERE d.name = 'Department of Health' AND sd.name = 'Public Health';

UPDATE sub_departments sd
JOIN departments d ON d.id = sd.department_id
SET sd.name = 'Coast General Teaching and Referral Hospital (CGTRH)'
WHERE d.name = 'Department of Health' AND sd.name = 'Coast General Teaching and Referral Hospital';

--    Renames and additions for Cooperatives
UPDATE sub_departments sd
JOIN departments d ON d.id = sd.department_id
SET sd.name = 'Mombasa Water Supply & Sanitation Company Limited (MOWASSCO)'
WHERE d.name = 'Cooperatives' AND sd.name = 'MOWASSCO';

UPDATE sub_departments sd
JOIN departments d ON d.id = sd.department_id
SET sd.name = 'Mombasa Investment Cooporation (MIC)'
WHERE d.name = 'Cooperatives' AND sd.name = 'MIC';

INSERT IGNORE INTO sub_departments (department_id, name)
SELECT d.id, 'Elimu Schemes' FROM departments d WHERE d.name = 'Cooperatives';

INSERT IGNORE INTO sub_departments (department_id, name)
SELECT d.id, 'Ardi Fund' FROM departments d WHERE d.name = 'Cooperatives';
