CREATE TABLE IF NOT EXISTS user_password_change_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  method ENUM('first_change','manual_change','forgot_flow') DEFAULT 'manual_change',
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_upca_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE INDEX idx_upca_user_created_at ON user_password_change_audit (user_id, created_at);
