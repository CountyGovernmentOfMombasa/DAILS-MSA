-- Migration: Add declaration/financial audit tables and fix potential AUTO_INCREMENT issues
-- Date: 2025-09-30

START TRANSACTION;

-- Ensure declarations has correct AUTO_INCREMENT (skip if already fine)
ALTER TABLE declarations MODIFY id INT NOT NULL AUTO_INCREMENT;

-- Ensure financial_declarations primary key is AUTO_INCREMENT
ALTER TABLE financial_declarations MODIFY id INT NOT NULL AUTO_INCREMENT;

-- Ensure financial_items primary key is AUTO_INCREMENT
ALTER TABLE financial_items MODIFY id INT NOT NULL AUTO_INCREMENT;

-- Create declaration audit table if it doesn't exist
CREATE TABLE IF NOT EXISTS declaration_audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  declaration_id INT NOT NULL,
  user_id INT NOT NULL,
  action ENUM('CREATE','UPDATE','DELETE') NOT NULL DEFAULT 'UPDATE',
  diff JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_decl_audit_decl (declaration_id),
  INDEX idx_decl_audit_user (user_id),
  FOREIGN KEY (declaration_id) REFERENCES declarations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Create financial audit table if it doesn't exist
CREATE TABLE IF NOT EXISTS financial_audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  declaration_id INT NOT NULL,
  user_id INT NOT NULL,
  action ENUM('REPLACE','MERGE') NOT NULL DEFAULT 'REPLACE',
  member_type VARCHAR(20),
  member_name VARCHAR(200),
  before_state JSON NULL,
  after_state JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fin_audit_decl (declaration_id),
  INDEX idx_fin_audit_user (user_id),
  FOREIGN KEY (declaration_id) REFERENCES declarations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

COMMIT;
