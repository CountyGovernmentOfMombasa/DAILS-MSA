-- SQL for declaration_edit_requests table
CREATE TABLE IF NOT EXISTS declaration_edit_requests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  declarationId INT NOT NULL,
  userId INT NOT NULL,
  reason TEXT NOT NULL,
  requestedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (declarationId) REFERENCES declarations(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
