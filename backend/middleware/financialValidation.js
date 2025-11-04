// Enforce allowed types for income, assets, and liabilities across declarations, spouses, and children
// Keeps server in sync with frontend options

// Accept both legacy and UI-visible labels to avoid false rejections.
const allowedIncome = new Set([
  // Legacy/canonical
  'Salary',
  'Rent',
  'Crops',
  'Livestock and their Products',
  'Interest on Bank Deposits',
  'Dividends from Saccos',
  'Dividends from Stock',
  'Dowry',
  'Transportation Income',
  'Insurance Bonuses',
  'Cash Gifts',
  'Royalties',
  'Damages provided by court.',
  'Content Creation',
  'Other',
  // Frontend variants/synonyms
  'Rental Income',
  'Sale of Crops',
  'Sale of Livestock and their Products',
  'Transportation Income (Matatus, Taxis, Boda Boda etc.)'
]);
const allowedAssets = new Set([
  // Legacy/canonical
  'Ancestral Land',
  'Acquired Land',
  'Building',
  'Houses',
  'Vehicles',
  'Transportation Vehicles',
  'Stock Shares',
  'Sacco Shares',
  'Household Goods',
  'Personal Items',
  'Jewelry',
  'Cash At Hand',
  'Cash At Bank',
  'Financial Obligations Owed',
  'Other',
  // Frontend variants/synonyms
  'Land',
  'Corporate Shares'
]);
const allowedLiabilities = new Set([
  'Outstanding School Fees','Friendly Loans','Sacco Loan','Bank Loan','Vehicle Loan','Mortgage Loans','Student Loans','Imprest Due','Salary Advance','Outstanding Dowry','Loan From Chama','Mobile Loan','Other'
]);

function normalizeArr(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') { try { const p = JSON.parse(val); return Array.isArray(p)?p:[]; } catch { return []; } }
  return [];
}

function validateFinancialArray(arr, set, fieldName) {
  const errors = [];
  (arr||[]).forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const t = (item.type || '').trim();
    if (!t) return; // empty rows are handled elsewhere
    // Allow explicit Nil entries (type: 'Nil', description: 'Nil')
    if (t === 'Nil') return;
    if (!set.has(t)) {
      errors.push({ field: fieldName, index: idx, message: `Invalid type: ${t}` });
    }
  });
  return errors;
}

// Middleware to validate incoming declaration payload
function enforceFinancialTypes(req, res, next) {
  const details = [];
  const rootIncome = normalizeArr(req.body?.biennial_income);
  const rootAssets = normalizeArr(req.body?.assets);
  const rootLiabilities = normalizeArr(req.body?.liabilities);
  details.push(...validateFinancialArray(rootIncome, allowedIncome, 'biennial_income'));
  details.push(...validateFinancialArray(rootAssets, allowedAssets, 'assets'));
  details.push(...validateFinancialArray(rootLiabilities, allowedLiabilities, 'liabilities'));

  const spouses = Array.isArray(req.body?.spouses) ? req.body.spouses : [];
  spouses.forEach((s, si) => {
    details.push(...validateFinancialArray(normalizeArr(s?.biennial_income), allowedIncome, `spouses[${si}].biennial_income`));
    details.push(...validateFinancialArray(normalizeArr(s?.assets), allowedAssets, `spouses[${si}].assets`));
    details.push(...validateFinancialArray(normalizeArr(s?.liabilities), allowedLiabilities, `spouses[${si}].liabilities`));
  });
  const children = Array.isArray(req.body?.children) ? req.body.children : [];
  children.forEach((c, ci) => {
    details.push(...validateFinancialArray(normalizeArr(c?.biennial_income), allowedIncome, `children[${ci}].biennial_income`));
    details.push(...validateFinancialArray(normalizeArr(c?.assets), allowedAssets, `children[${ci}].assets`));
    details.push(...validateFinancialArray(normalizeArr(c?.liabilities), allowedLiabilities, `children[${ci}].liabilities`));
  });

  if (details.length) {
    return res.status(400).json({ success:false, message:'Invalid financial types detected', code:'VALIDATION_FINANCIAL_TYPES', details });
  }
  return next();
}

module.exports = { enforceFinancialTypes, allowedIncome, allowedAssets, allowedLiabilities };
