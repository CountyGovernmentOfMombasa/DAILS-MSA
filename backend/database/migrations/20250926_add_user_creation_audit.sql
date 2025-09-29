-- Migration: Add user_creation_audit table
CREATE TABLE IF NOT EXISTS user_creation_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  created_by_admin_id INT NULL,
  admin_role VARCHAR(50),
  ip_address VARCHAR(45),
  user_national_id VARCHAR(100),
  user_email VARCHAR(255),
  user_department VARCHAR(255),
  user_employment_nature VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id),
  INDEX (created_by_admin_id)
);
