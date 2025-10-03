-- Migration: Correct declaration_type enum spelling and remove legacy variant
-- Step 1: Add correct spelling alongside legacy (run if current enum lacks 'Biennial')
-- NOTE: MySQL requires full enum replacement.
ALTER TABLE declarations 
MODIFY declaration_type ENUM('First','Biennial','Bienniel','Final') DEFAULT 'Biennial';

-- Step 2: Normalize existing legacy values
UPDATE declarations SET declaration_type='Biennial' WHERE declaration_type='Bienniel';

-- Step 3: Remove legacy misspelling
ALTER TABLE declarations 
MODIFY declaration_type ENUM('First','Biennial','Final') DEFAULT 'Biennial';

-- Rollback guidance (manual):
-- ALTER TABLE declarations MODIFY declaration_type ENUM('First','Bienniel','Final') DEFAULT 'Bienniel';