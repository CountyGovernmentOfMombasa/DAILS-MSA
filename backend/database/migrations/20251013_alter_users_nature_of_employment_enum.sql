-- Alter users.nature_of_employment to drop 'Temporary' from the ENUM
-- Safe approach: ensure any existing 'Temporary' values are remapped or nulled before altering the ENUM.

-- 1) Remap existing 'Temporary' values to 'Contract' (or NULL). Choose 'Contract' as closest alternative; change to NULL if preferred.
UPDATE users SET nature_of_employment = 'Contract' WHERE nature_of_employment = 'Temporary';

-- 2) Alter ENUM to remove 'Temporary'
ALTER TABLE users MODIFY COLUMN nature_of_employment ENUM('Permanent','Contract','Casual') NULL;