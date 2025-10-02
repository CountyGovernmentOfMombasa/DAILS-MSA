-- Migration: add last_activity & refresh token support plus form draft tables
ALTER TABLE users 
  ADD COLUMN last_activity TIMESTAMP NULL DEFAULT NULL AFTER updated_at,
  ADD COLUMN refresh_token_hash VARCHAR(255) NULL AFTER last_activity;

ALTER TABLE admin_users 
  ADD COLUMN last_activity TIMESTAMP NULL DEFAULT NULL AFTER last_login,
  ADD COLUMN refresh_token_hash VARCHAR(255) NULL AFTER last_activity;

-- Generic per-form draft tables (user side) to persist partially completed forms
CREATE TABLE IF NOT EXISTS user_form_drafts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  form_type VARCHAR(100) NOT NULL,
  draft_data JSON NULL,
  last_saved TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_form (user_id, form_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Declaration specific supplemental draft table (optional granular sections)
CREATE TABLE IF NOT EXISTS declaration_section_drafts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  declaration_id INT NOT NULL,
  section_key VARCHAR(100) NOT NULL,
  draft_data JSON NULL,
  last_saved TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_decl_section (declaration_id, section_key),
  FOREIGN KEY (declaration_id) REFERENCES declarations(id) ON DELETE CASCADE
);

-- Simple helper view for stale users (inactive beyond configured minutes; adjust threshold when querying)
CREATE OR REPLACE VIEW v_inactive_users AS
  SELECT id, national_id, last_activity FROM users WHERE last_activity IS NOT NULL;
