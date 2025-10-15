// Centralized helpers to map a declaration API response into various form states
// Each function accepts the raw declaration object returned by getDeclarationById
// and returns a structure suited for the corresponding form.

export function safeParseArray(val, fallback = []) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : fallback; } catch { return fallback; }
  }
  return fallback;
}

export function mapDeclarationToUserForm(decl) {
  if (!decl || typeof decl !== 'object') return {};
  const employmentNature = decl.nature_of_employment || decl.employment_nature || '';
  return {
    surname: decl.surname || '',
    first_name: decl.first_name || '',
    other_names: decl.other_names || '',
    birthdate: decl.birthdate ? toISODate(decl.birthdate) : '',
    place_of_birth: decl.place_of_birth || '',
    marital_status: decl.marital_status || '',
    postal_address: decl.postal_address || '',
    physical_address: decl.physical_address || '',
    email: decl.email || '',
    national_id: decl.national_id || '',
    payroll_number: decl.payroll_number || '',
    designation: decl.designation || '',
    department: decl.department || '',
    employment_nature: employmentNature,
    nature_of_employment: employmentNature,
    declaration_type: decl.declaration_type || ''
  };
}

export function mapDeclarationToSpousesChildren(decl) {
  if (!decl || typeof decl !== 'object') return { spouses: [], children: [] };
  const spouses = Array.isArray(decl.spouses) ? decl.spouses.map(s => ({
    surname: s.surname || '',
    first_name: s.first_name || '',
    other_names: s.other_names || ''
  })) : [];
  const children = Array.isArray(decl.children) ? decl.children.map(c => ({
    surname: c.surname || '',
    first_name: c.first_name || '',
    other_names: c.other_names || ''
  })) : [];
  return { spouses: spouses.length ? spouses : [{ surname: '', first_name: '', other_names: '' }], children: children.length ? children : [{ surname: '', first_name: '', other_names: '' }] };
}

export function mapDeclarationToFinancial(decl) {
  if (!decl || typeof decl !== 'object') return [];
  const rootUserName = `${decl.first_name || ''} ${decl.other_names || ''} ${decl.surname || ''}`.trim();
  const rootBiennial = safeParseArray(decl.biennial_income, []);
  const rootAssets = safeParseArray(decl.assets, []);
  const rootLiabilities = safeParseArray(decl.liabilities, []);
  const rootOtherInfo = decl.other_financial_info || '';

  const hasRootFinancial = [rootBiennial, rootAssets, rootLiabilities].some(arr => Array.isArray(arr) && arr.length > 0) || !!rootOtherInfo;

  // Helper to normalize list (ensure objects w/ keys)
  const normalizeList = (arr, def) => {
    if (!Array.isArray(arr) || !arr.length) return def ? [...def] : [];
    return arr
      .filter(i => i && (i.description || i.value || i.type || i.asset_other_type || i.liability_other_description))
      .map(i => {
        const value = i.value !== undefined ? i.value : (i.amount !== undefined ? i.amount : '');
        const description = i.description || i.liability_other_description || i.asset_other_type || '';
        const type = i.type || i.member_type || i.category || '';
        return { ...i, type, description, value };
      });
  };

  const rootFinancialBlock = {
    type: 'user',
    name: rootUserName || 'User',
    data: {
      declaration_date: decl.declaration_date || '',
      period_start_date: decl.period_start_date || '',
      period_end_date: decl.period_end_date || '',
      biennial_income: normalizeList(rootBiennial, [{ type: '', description: '', value: '' }]),
      assets: normalizeList(rootAssets, [{ type: '', description: '', value: '' }]),
      liabilities: normalizeList(rootLiabilities, [{ type: '', description: '', value: '' }]),
      other_financial_info: rootOtherInfo
    },
    merged_from_root: true
  };

  // financial_declarations deprecated; use financial_unified provided by backend
  const finDecls = Array.isArray(decl.financial_unified) ? decl.financial_unified : [];
  if (!finDecls.length) {
    // Only root-level data available
    return hasRootFinancial ? [rootFinancialBlock] : [];
  }

  // Map unified financial members into consistent shape
  const mapped = finDecls.map(fd => ({
    type: fd.member_type || 'user',
    name: fd.member_name || (fd.member_type === 'user' ? (rootUserName || 'User') : ''),
    data: {
      declaration_date: fd.declaration_date || '',
      period_start_date: fd.period_start_date || '',
      period_end_date: fd.period_end_date || '',
      biennial_income: normalizeList(safeParseArray(fd.biennial_income, []), [{ type: '', description: '', value: '' }]),
      assets: normalizeList(safeParseArray(fd.assets, []), [{ type: '', description: '', value: '' }]),
      liabilities: normalizeList(safeParseArray(fd.liabilities, []), [{ type: '', description: '', value: '' }]),
      other_financial_info: fd.other_financial_info || ''
    }
  }));

  // Merge root-level into the first user record (or append if none)
  if (hasRootFinancial) {
    const userIndex = mapped.findIndex(m => m.type === 'user');
    const mergeArrays = (a = [], b = []) => {
      const key = o => `${o.type}|${o.description}|${o.value}`.toLowerCase();
      const map = new Map();
      [...a, ...b].forEach(item => { if (item && (item.description || item.value)) map.set(key(item), item); });
      return Array.from(map.values());
    };
    if (userIndex >= 0) {
      const target = mapped[userIndex];
      target.data.biennial_income = mergeArrays(rootFinancialBlock.data.biennial_income, target.data.biennial_income);
      target.data.assets = mergeArrays(rootFinancialBlock.data.assets, target.data.assets);
      target.data.liabilities = mergeArrays(rootFinancialBlock.data.liabilities, target.data.liabilities);
      if (!target.data.other_financial_info && rootFinancialBlock.data.other_financial_info) {
        target.data.other_financial_info = rootFinancialBlock.data.other_financial_info;
      }
      // Keep earliest non-empty declaration_date / period dates
      if (!target.data.declaration_date) target.data.declaration_date = rootFinancialBlock.data.declaration_date;
      if (!target.data.period_start_date) target.data.period_start_date = rootFinancialBlock.data.period_start_date;
      if (!target.data.period_end_date) target.data.period_end_date = rootFinancialBlock.data.period_end_date;
      target.merged_from_root = true;
    } else {
      mapped.unshift(rootFinancialBlock);
    }
  }
  return mapped;
}

function toISODate(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr.slice(0,10);
  const parts = dateStr.split(/[/-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
    }
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    }
  }
  const d = new Date(dateStr);
  if (!isNaN(d)) return d.toISOString().slice(0,10);
  return '';
}

const declarationMapper = {
  mapDeclarationToUserForm,
  mapDeclarationToSpousesChildren,
  mapDeclarationToFinancial,
  safeParseArray
};

export default declarationMapper;
