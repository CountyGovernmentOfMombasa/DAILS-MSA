ALTER TABLE users
  ADD COLUMN password_reset_code VARCHAR(12) NULL AFTER otp_expires_at,
  ADD COLUMN password_reset_expires_at DATETIME NULL AFTER password_reset_code;

-- Optional index for lookup
CREATE INDEX idx_users_password_reset ON users (password_reset_code, password_reset_expires_at);
