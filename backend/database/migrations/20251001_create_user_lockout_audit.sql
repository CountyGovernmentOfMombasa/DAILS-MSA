-- Audit table for user account lockouts and unlocks
CREATE TABLE IF NOT EXISTS user_lockout_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  event_type ENUM('LOCK','UNLOCK','CLEAR') NOT NULL,
  reason VARCHAR(100) NULL,
  failed_attempts INT NULL,
  lock_until DATETIME NULL,
  performed_by_admin_id INT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_lockout_user (user_id),
  INDEX idx_lockout_event (event_type)
);
