-- MIGRATION: Change annual_income columns to JSON/TEXT for details+amount support

ALTER TABLE declarations 
  MODIFY annual_income TEXT;

ALTER TABLE spouses 
  MODIFY annual_income TEXT;

ALTER TABLE children 
  MODIFY annual_income TEXT;

-- If your MySQL version supports JSON, you can use JSON instead of TEXT:
-- ALTER TABLE declarations MODIFY annual_income JSON;
-- ALTER TABLE spouses MODIFY annual_income JSON;
-- ALTER TABLE children MODIFY annual_income JSON;
