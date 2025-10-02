-- Migration: Create OTP disclosure audit table
-- Tracks IT/Super admin viewing or regenerating first-time login OTPs for users.
-- Stores only a hash of the OTP plus its last two digits for post-event traceability.

CREATE TABLE IF NOT EXISTS otp_disclosure_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  admin_id INT NULL,
  admin_role VARCHAR(50) NULL,
  admin_department VARCHAR(255) NULL,
  admin_sub_department VARCHAR(255) NULL,
  action ENUM('VIEW','REGENERATE') NOT NULL,
  reason VARCHAR(500) NOT NULL,
  hashed_otp CHAR(64) NOT NULL,
  otp_last2 CHAR(2) NOT NULL,
  generated TINYINT(1) NOT NULL DEFAULT 0,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL,
  INDEX idx_otp_disclosure_user (user_id),
  INDEX idx_otp_disclosure_admin (admin_id),
  INDEX idx_otp_disclosure_created (created_at)
);
