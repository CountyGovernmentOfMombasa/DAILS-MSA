-- Migration: Add admin_creation_audit table
CREATE TABLE IF NOT EXISTS admin_creation_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  created_by_admin_id INT NULL,
  creator_role VARCHAR(50),
  ip_address VARCHAR(45),
  new_admin_username VARCHAR(100),
  new_admin_role VARCHAR(50),
  new_admin_department VARCHAR(255),
  new_admin_first_name VARCHAR(100),
  new_admin_surname VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (admin_id),
  INDEX (created_by_admin_id)
);