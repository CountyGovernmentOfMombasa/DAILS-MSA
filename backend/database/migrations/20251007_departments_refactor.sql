-- Migration: Refactor departments to dynamic tables and seed initial data (2025-10-07)
-- 1. Change users.department from ENUM to VARCHAR (so future additions don't require enum alter)
ALTER TABLE users MODIFY department VARCHAR(150) NULL;

-- 2. Create departments table (if not exists)
CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. Create sub_departments table (if not exists)
CREATE TABLE IF NOT EXISTS sub_departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  department_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sub_departments_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_department_sub (department_id, name)
);

-- 4. Seed departments (idempotent inserts)
INSERT IGNORE INTO departments (name) VALUES
 ('Executive'),
 ('Department of Public Service Administration, Youth, Gender and Sports'),
 ('Department of Blue Economy, Cooperatives, Agriculture and Livestock'),
 ('Department of Environment and Water'),
 ('Department of Transport, Infrastructure and Governance'),
 ('Department of Climate Change, Energy and Natural Resources'),
 ('Department of Lands, Urban Planning, Housing and Serikali Mtaani'),
 ('Department of Education and Vocational Training'),
 ('Department of Finance, Economic Planning and Digital Transformation'),
 ('Department of Health'),
 ('Department of Trade, Tourism and Culture'),
 ('Mombasa County Public Service Board'),
 ('Cooperatives'); -- Newly added top-level department

-- 5. Seed sub-departments (idempotent). Uses INSERT IGNORE with (department_id,name) uniqueness.
-- Helper: we use subqueries to fetch the parent department_id.
INSERT IGNORE INTO sub_departments (department_id, name)
SELECT d.id, sd.name FROM (
  SELECT 'Executive' AS dept, 'Office of the Governor' AS name UNION ALL
  SELECT 'Executive','Office of the Deputy Governor' UNION ALL
  SELECT 'Executive','Office of the County Secretary' UNION ALL
  SELECT 'Executive','Office of the County Attorney' UNION ALL
  SELECT 'Department of Public Service Administration, Youth, Gender and Sports','Public Service Administration' UNION ALL
  SELECT 'Department of Public Service Administration, Youth, Gender and Sports','Youth, Gender and Sports' UNION ALL
  SELECT 'Department of Blue Economy, Cooperatives, Agriculture and Livestock','Department of Blue Economy, Cooperatives, Agriculture and Livestock' UNION ALL
  SELECT 'Department of Environment and Water','Environment and Solid Waste Management' UNION ALL
  SELECT 'Department of Environment and Water','Water and Sanitation' UNION ALL
  SELECT 'Department of Transport, Infrastructure and Governance','Transport and Infrastructure' UNION ALL
  SELECT 'Department of Transport, Infrastructure and Governance','Governance' UNION ALL
  SELECT 'Department of Climate Change, Energy and Natural Resources','Department of Climate Change, Energy and Natural Resources' UNION ALL
  SELECT 'Department of Lands, Urban Planning, Housing and Serikali Mtaani','Lands, Urban Planning and Housing' UNION ALL
  SELECT 'Department of Lands, Urban Planning, Housing and Serikali Mtaani','Serikali Mtaani' UNION ALL
  SELECT 'Department of Education and Vocational Training','Department of Education and Vocational Training' UNION ALL
  SELECT 'Department of Finance, Economic Planning and Digital Transformation','Finance and Investment' UNION ALL
  SELECT 'Department of Finance, Economic Planning and Digital Transformation','Economic Planning and Digital Transformation' UNION ALL
  SELECT 'Department of Health','Medical Services' UNION ALL
  SELECT 'Department of Health','Public Health' UNION ALL
  SELECT 'Department of Health','Coast General Teaching and Referral Hospital' UNION ALL
  SELECT 'Department of Trade, Tourism and Culture','Department of Trade, Tourism and Culture' UNION ALL
  SELECT 'Mombasa County Public Service Board','Mombasa County Public Service Board' UNION ALL
  SELECT 'Cooperatives','MOWASSCO' UNION ALL
  SELECT 'Cooperatives','MIC'
) sd
JOIN departments d ON d.name = sd.dept;

-- 6. (Optional) Backfill users/admin_users whose department string matches a seeded department exactly; nothing needed since we keep strings.
