-- Migration: Create consent_logs table for consent form submissions
CREATE TABLE IF NOT EXISTS consent_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    national_id VARCHAR(100) NOT NULL,
    designation VARCHAR(255) NOT NULL,
    signed BOOLEAN NOT NULL,
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);