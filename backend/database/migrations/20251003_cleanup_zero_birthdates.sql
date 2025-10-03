-- One-time cleanup: convert invalid zero dates to NULL for consistency with new API behavior
-- Safe to run multiple times (idempotent)
UPDATE users SET birthdate = NULL WHERE birthdate = '0000-00-00';
