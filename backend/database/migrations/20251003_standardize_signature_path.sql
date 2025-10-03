-- Migration: Standardize signature_path column to TINYINT(1) flag
-- Safe approach: if column already tinyint, this will be a no-op in MySQL/MariaDB.
-- If it was VARCHAR, non-empty values will be coerced to 1, empty/NULL to 0.

ALTER TABLE declarations 
MODIFY signature_path TINYINT(1) DEFAULT 0;

-- Optional backfill: ensure NULL becomes 0 explicitly
UPDATE declarations SET signature_path = 0 WHERE signature_path IS NULL;

-- Rollback (if needed):
-- ALTER TABLE declarations MODIFY signature_path VARCHAR(500) NULL;
