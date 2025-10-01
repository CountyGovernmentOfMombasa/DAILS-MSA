-- Migration: Add security rate limit and lockout columns
ALTER TABLE users
  ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0 AFTER password_reset_expires_at,
  ADD COLUMN lock_until DATETIME NULL AFTER failed_login_attempts,
  ADD COLUMN otp_request_count INT NOT NULL DEFAULT 0 AFTER lock_until,
  ADD COLUMN otp_request_window_start DATETIME NULL AFTER otp_request_count,
  ADD COLUMN reset_otp_request_count INT NOT NULL DEFAULT 0 AFTER otp_request_window_start,
  ADD COLUMN reset_otp_request_window_start DATETIME NULL AFTER reset_otp_request_count;

CREATE INDEX idx_users_lock_until ON users(lock_until);
