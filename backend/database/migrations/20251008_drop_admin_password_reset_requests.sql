-- Migration: Drop obsolete admin password reset requests table
-- Up
DROP TABLE IF EXISTS admin_password_reset_requests;

-- Down (cannot restore data; recreates minimal structure if rollback needed)
CREATE TABLE IF NOT EXISTS admin_password_reset_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  username VARCHAR(150) NOT NULL,
  status ENUM('pending','approved','rejected','completed') DEFAULT 'pending',
  resolution_notes TEXT NULL,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  resolved_by_admin_id INT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  UNIQUE KEY uniq_admin_pending (admin_id, status),
  INDEX idx_status_requested (status, requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
