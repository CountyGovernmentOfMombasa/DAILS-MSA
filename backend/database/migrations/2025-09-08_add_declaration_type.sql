-- MIGRATION: Add declaration_type column to declarations table

ALTER TABLE declarations 
  ADD COLUMN declaration_type VARCHAR(20) DEFAULT NULL;

-- If you want to restrict to specific types, use ENUM:
-- ALTER TABLE declarations ADD COLUMN declaration_type ENUM('first','biennial','final') DEFAULT NULL;
