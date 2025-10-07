-- Backfill migration: normalize empty string financial JSON columns to valid JSON arrays
-- Idempotent: running multiple times is safe.

START TRANSACTION;

-- Root declaration level
UPDATE declarations SET assets='[]' WHERE (assets IS NULL OR assets = '') AND (biennial_income IS NOT NULL);
UPDATE declarations SET liabilities='[]' WHERE (liabilities IS NULL OR liabilities = '') AND (biennial_income IS NOT NULL);

-- Spouses
UPDATE spouses SET assets='[]' WHERE assets IS NULL OR assets = '';
UPDATE spouses SET liabilities='[]' WHERE liabilities IS NULL OR liabilities = '';

-- Children
UPDATE children SET assets='[]' WHERE assets IS NULL OR assets = '';
UPDATE children SET liabilities='[]' WHERE liabilities IS NULL OR liabilities = '';

COMMIT;

-- Verification (optional – comment out in production)
-- SELECT id, assets, liabilities FROM declarations ORDER BY id DESC LIMIT 10;
-- SELECT id, assets, liabilities FROM spouses ORDER BY id DESC LIMIT 10;
-- SELECT id, assets, liabilities FROM children ORDER BY id DESC LIMIT 10;
