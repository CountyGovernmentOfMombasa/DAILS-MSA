-- Migration: Rename sub-department label to "Youth, gender, sports and social services"
-- This updates seeded sub_departments and any stored references in users/admins/audits.

-- Update the canonical sub_departments table entry (if present)
UPDATE sub_departments
SET name = 'Youth, gender, sports and social services'
WHERE name = 'Youth, Gender and Sports';

-- Update user records referencing the old value
UPDATE users
SET sub_department = 'Youth, gender, sports and social services'
WHERE sub_department = 'Youth, Gender and Sports';

-- Update admin_users records (if any) referencing the old value
UPDATE admin_users
SET sub_department = 'Youth, gender, sports and social services'
WHERE sub_department = 'Youth, Gender and Sports';

-- Update audit tables that store sub_department snapshots
UPDATE user_creation_audit
SET user_sub_department = 'Youth, gender, sports and social services'
WHERE user_sub_department = 'Youth, Gender and Sports';

UPDATE admin_creation_audit
SET new_admin_sub_department = 'Youth, gender, sports and social services'
WHERE new_admin_sub_department = 'Youth, Gender and Sports';

UPDATE otp_disclosure_audit
SET admin_sub_department = 'Youth, gender, sports and social services'
WHERE admin_sub_department = 'Youth, Gender and Sports';
