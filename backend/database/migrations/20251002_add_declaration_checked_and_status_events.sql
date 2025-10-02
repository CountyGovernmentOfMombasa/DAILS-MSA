-- Migration: Add declaration_checked column & declaration_status_events table
-- Run this after existing schema is applied.

-- 1. Add declaration_checked flag if not exists
ALTER TABLE declarations
  ADD COLUMN IF NOT EXISTS declaration_checked TINYINT(1) NOT NULL DEFAULT 0 AFTER status;

-- 2. Create simplified status events table capturing approval/rejection snapshots
CREATE TABLE IF NOT EXISTS declaration_status_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  declaration_id INT NOT NULL,
  user_id INT NOT NULL,
  national_id VARCHAR(100) NULL,
  user_full_name VARCHAR(255) NULL,
  status ENUM('pending','approved','rejected') NOT NULL,
  admin_id INT NULL,
  admin_name VARCHAR(255) NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (declaration_id) REFERENCES declarations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE SET NULL,
  INDEX idx_decl_status_events_decl (declaration_id),
  INDEX idx_decl_status_events_admin (admin_id),
  INDEX idx_decl_status_events_status (status)
);
