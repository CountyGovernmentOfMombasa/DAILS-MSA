-- MIGRATION: Change annual_income to biennial_income as JSON (type, description, value)

ALTER TABLE declarations 
  CHANGE annual_income biennial_income JSON;

ALTER TABLE spouses 
  CHANGE annual_income biennial_income JSON;

ALTER TABLE children 
  CHANGE annual_income biennial_income JSON;

-- If your MySQL version does not support JSON, use TEXT instead:
-- ALTER TABLE declarations CHANGE annual_income biennial_income TEXT;
-- ALTER TABLE spouses CHANGE annual_income biennial_income TEXT;
-- ALTER TABLE children CHANGE annual_income biennial_income TEXT;
