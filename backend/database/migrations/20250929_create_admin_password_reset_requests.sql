CREATE TABLE IF NOT EXISTS admin_password_reset_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  username VARCHAR(50) NOT NULL,
  status ENUM('pending','approved','rejected','completed') DEFAULT 'pending',
  resolution_notes VARCHAR(255) NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  resolved_by_admin_id INT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  UNIQUE KEY uniq_admin_pending (admin_id, status),
  CONSTRAINT fk_aprr_admin FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_aprr_resolver FOREIGN KEY (resolved_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
