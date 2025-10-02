-- Migration: Add period dates to declarations and drop financial tables
ALTER TABLE declarations
  ADD COLUMN period_start_date DATE NULL AFTER declaration_date,
  ADD COLUMN period_end_date DATE NULL AFTER period_start_date;

DROP TABLE IF EXISTS financial_items;
DROP TABLE IF EXISTS financial_declarations;