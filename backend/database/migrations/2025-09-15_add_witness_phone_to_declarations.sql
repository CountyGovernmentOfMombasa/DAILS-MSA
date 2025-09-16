-- Add witness_phone column to declarations table
ALTER TABLE declarations ADD COLUMN witness_phone VARCHAR(30) AFTER witness_address;