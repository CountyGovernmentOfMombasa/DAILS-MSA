-- Migration: create declaration_patch_audit table for partial update audit logging
-- Run order: after existing declaration / financial audit tables

CREATE TABLE IF NOT EXISTS declaration_patch_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  declaration_id INT NOT NULL,
  user_id INT NOT NULL,
  changed_scalar_fields JSON NULL,
  replaced_collections JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dpa_declaration (declaration_id),
  INDEX idx_dpa_user (user_id),
  CONSTRAINT fk_dpa_declaration FOREIGN KEY (declaration_id) REFERENCES declarations(id) ON DELETE CASCADE,
  CONSTRAINT fk_dpa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
