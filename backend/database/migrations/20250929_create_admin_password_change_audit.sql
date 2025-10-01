-- Migration: Create admin password change audit table
CREATE TABLE IF NOT EXISTS admin_password_change_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  changed_by_admin_id INT NULL,
  event_type ENUM('password_change') DEFAULT 'password_change',
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_apca_admin FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_apca_changed_by FOREIGN KEY (changed_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Optional index to speed up filtering by admin and date
CREATE INDEX idx_apca_admin_created_at ON admin_password_change_audit (admin_id, created_at);
