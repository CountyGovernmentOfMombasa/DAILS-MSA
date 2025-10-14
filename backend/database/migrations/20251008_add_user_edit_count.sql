-- Migration: Add user_edit_count column to declarations to enforce single user edit after submission
ALTER TABLE declarations
  ADD COLUMN user_edit_count INT NOT NULL DEFAULT 0 AFTER correction_message;
