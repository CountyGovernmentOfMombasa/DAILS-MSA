-- Store last N password hashes for reuse prevention.
CREATE TABLE IF NOT EXISTS user_password_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_uph_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_uph_user_created ON user_password_history (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_password_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_aph_admin FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE INDEX idx_aph_admin_created ON admin_password_history (admin_id, created_at DESC);
