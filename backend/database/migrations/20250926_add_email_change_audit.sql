-- Migration: Add email_change_audit table
-- Date: 2025-09-26

CREATE TABLE IF NOT EXISTS email_change_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  old_email VARCHAR(255) NULL,
  new_email VARCHAR(255) NOT NULL,
  changed_by_admin_id BIGINT UNSIGNED NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_email_change_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_email_change_admin FOREIGN KEY (changed_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL,
  INDEX idx_email_change_user (user_id),
  INDEX idx_email_change_admin (changed_by_admin_id),
  INDEX idx_email_change_changed_at (changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
