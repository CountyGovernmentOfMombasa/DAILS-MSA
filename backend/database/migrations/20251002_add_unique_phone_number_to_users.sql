-- Migration: Enforce unique phone numbers for users (one person per phone number)
-- Note: Multiple NULL values are permitted by MySQL unique indexes.
-- If this migration fails, check for duplicate non-null phone numbers:
--   SELECT phone_number, COUNT(*) c FROM users WHERE phone_number IS NOT NULL GROUP BY phone_number HAVING c > 1;
-- Resolve duplicates before re-running.

ALTER TABLE users
  ADD UNIQUE INDEX idx_users_phone (phone_number),
  ADD COLUMN phone_last_changed_at DATETIME NULL AFTER phone_number,
  ADD COLUMN phone_change_count INT NULL AFTER phone_last_changed_at;

UPDATE users SET phone_change_count = 0 WHERE phone_change_count IS NULL;
