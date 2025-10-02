-- Migration: Add 'Executive' and 'Mombasa County Public Service Board' department values where ENUMs or static constraints exist
-- Date: 2025-10-02
-- Note: If your MySQL 'users.department' column is an ENUM, you must ALTER it to include 'Executive'.
-- If it's a VARCHAR (as current schema suggests), no change needed.

-- IMPORTANT: This statement must include ALL existing enum values plus the new ones.
ALTER TABLE users MODIFY COLUMN department ENUM(
   'Executive',
    'Department of Public Service Administration, Youth, Gender and Sports',
    'Department of Blue Economy, Cooperatives, Agriculture and Livestock',
   'Department of Environment and Water',
   'Department of Transport, Infrastructure and Governance',
   'Department of Climate Change, Energy and Natural Resources',
   'Department of Lands, Urban Planning, Housing and Serikali Mtaani',
   'Department of Education and Vocational Training',
   'Department of Finance, Economic Planning and Digital Transformation',
   'Department of Health',
   'Department of Trade, Tourism and Culture',
   'Mombasa County Public Service Board'
 ) DEFAULT NULL;

-- Repeat for any other ENUM columns referencing department.

-- No data backfill required unless you want to map certain existing users to 'Executive' or 'Mombasa County Public Service Board'.
-- Example optional backfill (customize WHERE clause):
-- UPDATE users SET department = 'Mombasa County Public Service Board' WHERE payroll_number IN ('<list>');
