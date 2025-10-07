-- Migration: Harden otp_disclosure_audit with NOT NULL constraints & composite indexes
-- Idempotent: uses ALTERs that may fail benignly if already applied.
ALTER TABLE otp_disclosure_audit
  MODIFY admin_role VARCHAR(50) NULL,
  MODIFY admin_department VARCHAR(255) NULL,
  MODIFY admin_sub_department VARCHAR(255) NULL,
  MODIFY action ENUM('VIEW','REGENERATE') NOT NULL,
  MODIFY reason VARCHAR(500) NOT NULL,
  MODIFY hashed_otp CHAR(64) NOT NULL,
  MODIFY otp_last2 CHAR(2) NOT NULL,
  MODIFY generated TINYINT(1) NOT NULL DEFAULT 0;

-- Add composite index for frequent admin+created_at queries
CREATE INDEX idx_otp_disclosure_admin_created ON otp_disclosure_audit (admin_id, created_at);
-- Add composite index for user+created_at investigations
CREATE INDEX idx_otp_disclosure_user_created ON otp_disclosure_audit (user_id, created_at);
