-- Migration: Add OTP fields for first-time login via SMS
ALTER TABLE users 
  ADD COLUMN otp_code VARCHAR(10) NULL AFTER password_changed,
  ADD COLUMN otp_expires_at DATETIME NULL AFTER otp_code;