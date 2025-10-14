-- NOTE: Initial attempt used BIGINT UNSIGNED but referenced columns are INT in users/admin_users -> caused errno 150 (FK mismatch).
-- Safe re-run: drop if partially created (previous attempt failed so table likely absent).
DROP TABLE IF EXISTS admin_user_link_audit;

CREATE TABLE admin_user_link_audit (
  id INT NOT NULL AUTO_INCREMENT,
  admin_id INT NOT NULL,
  user_id INT NOT NULL,
  linked_via ENUM('user_id','national_id') NOT NULL,
  national_id_snapshot VARCHAR(64) NULL,
  department_snapshot VARCHAR(255) NULL,
  created_by_admin_id INT NULL,
  creator_role VARCHAR(64) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(512) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_admin_user_link_admin (admin_id),
  INDEX idx_admin_user_link_user (user_id),
  CONSTRAINT fk_admin_user_link_admin FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_admin_user_link_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- (Optional future enhancement) Add FK for created_by_admin_id if desired:
-- ALTER TABLE admin_user_link_audit ADD CONSTRAINT fk_admin_user_link_created_by FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL;