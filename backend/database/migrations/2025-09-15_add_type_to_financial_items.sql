-- Add a 'type' column to the financial_items table for more detailed categorization
ALTER TABLE financial_items ADD COLUMN type VARCHAR(100) AFTER item_type;