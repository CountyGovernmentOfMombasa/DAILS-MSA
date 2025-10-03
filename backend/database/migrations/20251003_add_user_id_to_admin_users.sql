-- Migration: Link admin_users to users via user_id for seamless elevation
-- Date: 2025-10-03
-- Purpose:
--  1. Adds nullable user_id to admin_users.
--  2. Creates a unique index so a single user maps to at most one admin account.
--  3. Adds a foreign key with ON DELETE SET NULL (preserve admin audit trail if user removed).
--  4. Backfills user_id where emails match (idempotent pattern – safe to re-run).

ALTER TABLE admin_users
  ADD COLUMN user_id INT NULL AFTER id;

-- Unique constraint to prevent multiple admin rows pointing to same user
ALTER TABLE admin_users
  ADD UNIQUE KEY ux_admin_users_user_id (user_id);

-- Foreign key (SET NULL to avoid cascading admin deletion unintentionally)
ALTER TABLE admin_users
  ADD CONSTRAINT fk_admin_users_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Backfill using matching email (skip if already linked). Adjust if you later add national_id column to admin_users.
UPDATE admin_users au
JOIN users u ON u.email = au.email
SET au.user_id = u.id
WHERE au.user_id IS NULL AND u.email IS NOT NULL;

-- Optional: index for faster lookups by user_id (unique already covers it, so this is redundant; kept for clarity)
-- CREATE INDEX idx_admin_users_user_id ON admin_users(user_id);

-- Rollback instructions (manual):
-- ALTER TABLE admin_users DROP FOREIGN KEY fk_admin_users_user_id;
-- ALTER TABLE admin_users DROP INDEX ux_admin_users_user_id;
-- ALTER TABLE admin_users DROP COLUMN user_id;
