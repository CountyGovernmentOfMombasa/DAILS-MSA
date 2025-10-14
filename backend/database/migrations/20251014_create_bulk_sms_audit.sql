-- Create audit table for bulk SMS sends
CREATE TABLE IF NOT EXISTS bulk_sms_audit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  initiated_by_admin_id BIGINT NULL,
  admin_username VARCHAR(255) NULL,
  admin_role VARCHAR(64) NULL,
  api_path VARCHAR(128) NOT NULL,
  ip_address VARCHAR(128) NULL,
  departments_json JSON NULL,
  status_filter ENUM('pending','approved','rejected') NULL,
  include_no_declaration TINYINT(1) NOT NULL DEFAULT 0,
  user_ids_count INT NOT NULL DEFAULT 0,
  message_length INT NOT NULL,
  message_sha256 CHAR(64) NOT NULL,
  total_recipients INT NOT NULL,
  sent_ok INT NOT NULL,
  chunks INT NOT NULL,
  failed_chunks INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;