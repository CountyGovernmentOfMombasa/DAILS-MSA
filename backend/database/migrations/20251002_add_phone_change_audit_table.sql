CREATE TABLE IF NOT EXISTS user_phone_change_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  old_phone VARCHAR(20),
  new_phone VARCHAR(20),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  changed_by_admin_id INT NULL,
  via ENUM('self','login_capture','admin') NOT NULL DEFAULT 'self',
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_phone_audit_user (user_id),
  INDEX idx_user_phone_audit_changed (changed_at)
);