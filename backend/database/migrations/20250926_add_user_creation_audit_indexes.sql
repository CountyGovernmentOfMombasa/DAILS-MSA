-- Add indexes to improve filtering performance for user_creation_audit
ALTER TABLE user_creation_audit
  ADD INDEX idx_uca_created_at (created_at),
  ADD INDEX idx_uca_created_by_admin (created_by_admin_id),
  ADD INDEX idx_uca_user_department (user_department),
  ADD INDEX idx_uca_user_email (user_email(100));