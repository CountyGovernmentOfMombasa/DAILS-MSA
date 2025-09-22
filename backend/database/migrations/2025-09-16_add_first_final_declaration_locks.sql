-- Migration: Add first and final declaration locks to settings table
ALTER TABLE settings 
  ADD COLUMN first_declaration_locked TINYINT(1) DEFAULT 0,
  ADD COLUMN final_declaration_locked TINYINT(1) DEFAULT 0;
