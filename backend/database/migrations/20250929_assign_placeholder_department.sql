-- Migration: Assign placeholder department to non-super admins lacking one
-- Date: 2025-09-29
-- Purpose: After enforcing department scoping for all non-super admins, backfill any NULL or empty department values.

UPDATE admin_users
SET department = 'Department of Finance, Economic Planning and Digital Transformation'
WHERE (department IS NULL OR department = 'UNASSIGNED-DEPT')
  AND role <> 'super_admin';

-- You may later manually update 'UNASSIGNED-DEPT' to a real department per admin.
