-- Idempotent migration to ensure phone uniqueness and tracking columns exist without throwing errors.
-- Use this if re-running earlier migration caused duplicate column or index errors.
-- Safe to run multiple times.

SET @db := DATABASE();

-- Add tracking columns if they do not exist (MySQL 8.0+ supports IF NOT EXISTS)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_last_changed_at DATETIME NULL AFTER phone_number,
  ADD COLUMN IF NOT EXISTS phone_change_count INT NULL AFTER phone_last_changed_at;

-- Conditionally add unique index on phone_number if missing
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = @db AND table_name = 'users' AND index_name = 'idx_users_phone'
);
SET @ddl := IF(@idx_exists = 0, 'ALTER TABLE users ADD UNIQUE INDEX idx_users_phone (phone_number)', 'SELECT "idx_users_phone already exists"');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Initialize counter where null
UPDATE users SET phone_change_count = 0 WHERE phone_change_count IS NULL;

-- Verification (optional): uncomment to see current structure
-- SHOW COLUMNS FROM users LIKE 'phone_last_changed_at';
-- SHOW INDEX FROM users WHERE Key_name = 'idx_users_phone';
