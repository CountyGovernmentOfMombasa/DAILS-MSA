-- NOTE: This migration assumes MySQL 8+. MySQL does NOT support partial indexes with WHERE.
-- 1. Add user_id column if missing
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS user_id INT NULL AFTER id;

-- 2. Null out any user_id values that don't point to an existing users.id (prevents FK failure)
UPDATE admin_users au
LEFT JOIN users u ON au.user_id = u.id
SET au.user_id = NULL
WHERE au.user_id IS NOT NULL AND u.id IS NULL;

-- 3. Deduplicate: ensure only one admin row keeps each user_id (keep the lowest id, others set to NULL)
UPDATE admin_users a
JOIN (
  SELECT id FROM admin_users WHERE user_id IS NOT NULL AND id NOT IN (
    SELECT MIN(id) FROM admin_users WHERE user_id IS NOT NULL GROUP BY user_id
  )
) dup ON a.id = dup.id
SET a.user_id = NULL;

-- 4. Add a unique index over user_id (allows multiple NULLs; enforces uniqueness for non-null)
ALTER TABLE admin_users ADD UNIQUE INDEX uniq_admin_users_user_id (user_id);

-- 5. Add foreign key (ignore error if already exists)
ALTER TABLE admin_users
  ADD CONSTRAINT fk_admin_users_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
