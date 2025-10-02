-- Migration: Add sub_department to admin_users, user_creation_audit, admin_creation_audit
-- Date: 2025-10-02

ALTER TABLE admin_users
  ADD COLUMN sub_department VARCHAR(150) NULL AFTER department;

ALTER TABLE user_creation_audit
  ADD COLUMN user_sub_department VARCHAR(150) NULL AFTER user_department;

ALTER TABLE admin_creation_audit
  ADD COLUMN new_admin_sub_department VARCHAR(150) NULL AFTER new_admin_department;

-- Indexes to assist filtering by sub-department
CREATE INDEX idx_admin_users_sub_department ON admin_users (sub_department);
CREATE INDEX idx_user_creation_audit_sub_department ON user_creation_audit (user_sub_department);
CREATE INDEX idx_admin_creation_audit_sub_department ON admin_creation_audit (new_admin_sub_department);
