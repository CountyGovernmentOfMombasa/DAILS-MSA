-- Create settings table for declaration locks
CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  biennial_declaration_locked TINYINT(1) DEFAULT 0,
  first_declaration_locked TINYINT(1) DEFAULT 0,
  final_declaration_locked TINYINT(1) DEFAULT 0
);

-- Insert a default row if table is empty
INSERT INTO settings (biennial_declaration_locked, first_declaration_locked, final_declaration_locked)
SELECT 0, 0, 0 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM settings);
