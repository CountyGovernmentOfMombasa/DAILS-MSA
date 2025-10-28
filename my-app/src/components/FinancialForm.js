import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Container, Row, Col, Card, Form, Button, Table, ProgressBar, Nav, Toast, ToastContainer } from 'react-bootstrap';
import { getDeclarationById } from '../api';
import { toISODate } from '../util/date';
import { DeclarationSessionProvider, useDeclarationSession, useDebouncedPatch } from '../context/DeclarationSessionContext';
import { getEditContext, appendDeclarationIdToPath, clearEditContext, removeDeclarationIdFromPath } from '../utilis/editContext';
import { saveProgress, deriveUserKey, scheduleServerSync } from '../utilis/persistProgress';

const FinancialFormInner = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(0);
  const { model, savingState } = useDeclarationSession();
  const { userData, spouses = [], children = [], declarationDate, periodStart, periodEnd, declaration_date, period_start, period_end } = location.state || {};
  const displayDeclarationDate = declarationDate || userData?.declarationDate || userData?.declaration_date || declaration_date || '';
  const displayPeriodStart = periodStart || userData?.periodStart || userData?.period_start || period_start || '';
  const displayPeriodEnd = periodEnd || userData?.periodEnd || userData?.period_end || period_end || '';
  const [periodInfo, setPeriodInfo] = useState({
    declaration_date: displayDeclarationDate || '',
    period_start: displayPeriodStart || '',
    period_end: displayPeriodEnd || ''
  });

  useEffect(() => {
    if (periodInfo.declaration_date && periodInfo.period_start && periodInfo.period_end) return; // already have values
    try {
      const stored = sessionStorage.getItem('declarationPeriod');
      if (stored) {
        const parsed = JSON.parse(stored);
        setPeriodInfo(prev => ({
          declaration_date: prev.declaration_date || parsed.declaration_date || parsed.declarationDate || '',
          period_start: prev.period_start || parsed.period_start || parsed.periodStart || '',
          period_end: prev.period_end || parsed.period_end || parsed.periodEnd || ''
        }));
      }
    } catch (e) {
    }
    // we intentionally run only once on mount to attempt recovery
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPeriodInfo(prev => ({
      declaration_date: displayDeclarationDate || prev.declaration_date,
      period_start: displayPeriodStart || prev.period_start,
      period_end: displayPeriodEnd || prev.period_end
    }));
  }, [displayDeclarationDate, displayPeriodStart, displayPeriodEnd]);

  const hasMeaningfulName = (p) => {
    if (!p || typeof p !== 'object') return false;
    const fields = ['first_name','firstName','other_names','surname'];
    return fields.some(f => typeof p[f] === 'string' && p[f].trim().length > 0);
  };
  const validSpouses = React.useMemo(
    () => (Array.isArray(spouses) ? spouses.filter(hasMeaningfulName) : []),
    [spouses]
  );
  const validChildren = React.useMemo(
    () => (Array.isArray(children) ? children.filter(hasMeaningfulName) : []),
    [children]
  );

  // Guard: if marital status is married and there are no named spouses, redirect back to spouse form
  useEffect(() => {
    const marital = (model?.profile?.marital_status || userData?.marital_status || '').toLowerCase();
    if (marital === 'married' && validSpouses.length === 0) {
      const ctx = getEditContext({ locationState: location.state, locationSearch: location.search });
      const backPath = appendDeclarationIdToPath('/spouse-form', ctx.declarationId);
      navigate(backPath, { state: { ...location.state, error: 'You selected Married. Please add at least one spouse before proceeding to Financial Information.' }, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.profile?.marital_status, userData?.marital_status, validSpouses.length]);

  const [allFinancialData, setAllFinancialData] = useState(() => {
    if (location.state && Array.isArray(location.state.allFinancialData) && location.state.allFinancialData.length > 0) {
      return location.state.allFinancialData;
    }
    return [];
  });
  
   useEffect(() => {
    if (!allFinancialData.length) return;
    const { declaration_date, period_start, period_end } = periodInfo;
    if (!declaration_date && !period_start && !period_end) return; // nothing to propagate
    let anyChanged = false;
    const updated = allFinancialData.map(entry => {
      const d = entry.data || {};
      const newData = { ...d };
      let changed = false;
      if (declaration_date && !d.declaration_date) { newData.declaration_date = declaration_date; changed = true; }
      if (period_start && !d.period_start_date) { newData.period_start_date = period_start; changed = true; }
      if (period_end && !d.period_end_date) { newData.period_end_date = period_end; changed = true; }
      if (changed) { anyChanged = true; return { ...entry, data: newData }; }
      return entry;
    });
    if (anyChanged) setAllFinancialData(updated);
  }, [periodInfo, allFinancialData]);

  const fetchedByIdRef = useRef(false);

  useEffect(() => {
    const { declarationId } = getEditContext({ locationState: location.state, locationSearch: location.search });
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
      if (location.state?.fromReview && Array.isArray(allFinancialData) && allFinancialData.length > 0) {
      return; 
    }
    if (model) {
      if (Array.isArray(model.financial?.members) && model.financial.members.length) {
        const transformed = model.financial.members.map(fd => ({
          type: fd.member_type,
          name: fd.member_name,
          data: {
            declaration_date: fd.data?.declaration_date || fd.declaration_date || '',
            period_start_date: fd.data?.period_start_date || fd.period_start_date || '',
            period_end_date: fd.data?.period_end_date || fd.period_end_date || '',
            biennial_income: fd.data?.biennial_income || fd.biennial_income || [],
            assets: fd.data?.assets || fd.assets || [],
            liabilities: fd.data?.liabilities || fd.liabilities || [],
            other_financial_info: fd.data?.other_financial_info || fd.other_financial_info || ''
          }
        }));
        if (transformed.length) setAllFinancialData(transformed);
      }
      return; 
    }
    if (declarationId && !fetchedByIdRef.current && !model) {
      fetchedByIdRef.current = true;
      (async () => {
        try {
          const res = await getDeclarationById(declarationId, `Bearer ${token}`);
          const decl = res?.data?.declaration;
          if (decl) {
            
            const safeParse = (val, fallback = []) => {
              if (Array.isArray(val)) return val;
              if (typeof val === 'string') {
                try { const json = JSON.parse(val); return Array.isArray(json) ? json : fallback; } catch { return fallback; }
              }
              return fallback;
            };
            const built = [];
              if (built.length === 0) {
              const rootIncome = safeParse(decl.biennial_income, [{ type: '', description: '', value: '' }]);
              const rootAssets = safeParse(decl.assets, [{ type: '', description: '', value: '' }]);
              const rootLiabilities = safeParse(decl.liabilities, [{ type: '', description: '', value: '' }]);
              const sanitizeDate = d => (d === '0000-00-00' ? '' : d);
              built.push({
                type: 'user',
                name: `${decl.first_name || ''} ${decl.other_names || ''} ${decl.surname || ''}`.trim(),
                data: {
                  declaration_date: sanitizeDate(displayDeclarationDate),
                  period_start_date: sanitizeDate(displayPeriodStart),
                  period_end_date: sanitizeDate(displayPeriodEnd),
                  biennial_income: rootIncome,
                  assets: rootAssets,
                  liabilities: rootLiabilities,
                  other_financial_info: decl.other_financial_info || ''
                }
              });
            
              if (Array.isArray(decl.spouses)) {
                decl.spouses.forEach(s => {
                  built.push({
                    type: 'spouse',
                    name: s.full_name || `${s.first_name||''} ${s.surname||''}`.trim(),
                    data: { declaration_date: sanitizeDate(displayDeclarationDate), period_start_date: sanitizeDate(displayPeriodStart), period_end_date: sanitizeDate(displayPeriodEnd), biennial_income: [{ type:'', description:'', value:'' }], assets: [{ type:'', description:'', value:'' }], liabilities: [{ type:'', description:'', value:'' }], other_financial_info: '' }
                  });
                });
              }
              if (Array.isArray(decl.children)) {
                decl.children.forEach(c => {
                  built.push({
                    type: 'child',
                    name: c.full_name || `${c.first_name||''} ${c.surname||''}`.trim(),
                    data: { declaration_date: sanitizeDate(displayDeclarationDate), period_start_date: sanitizeDate(displayPeriodStart), period_end_date: sanitizeDate(displayPeriodEnd), biennial_income: [{ type:'', description:'', value:'' }], assets: [{ type:'', description:'', value:'' }], liabilities: [{ type:'', description:'', value:'' }], other_financial_info: '' }
                  });
                });
              }
            }
            
            if (built.length === 0 && Array.isArray(decl.financial_unified) && decl.financial_unified.length > 0) {
              const mappedUnified = decl.financial_unified.map(u => ({
                type: u.member_type,
                name: u.member_name,
                data: {
                  declaration_date: u.data.declaration_date || displayDeclarationDate,
                  period_start_date: u.data.period_start_date || displayPeriodStart,
                  period_end_date: u.data.period_end_date || displayPeriodEnd,
                  biennial_income: (Array.isArray(u.data.biennial_income) && u.data.biennial_income.length) ? u.data.biennial_income : [{ type: '', description: '', value: '' }],
                  assets: (Array.isArray(u.data.assets) && u.data.assets.length) ? u.data.assets : [{ type: '', description: '', value: '' }],
                  liabilities: (Array.isArray(u.data.liabilities) && u.data.liabilities.length) ? u.data.liabilities : [{ type: '', description: '', value: '' }],
                  other_financial_info: u.data.other_financial_info || ''
                }
              }));
              setAllFinancialData(mappedUnified);
            } else {
              setAllFinancialData(built);
            }
            return; 
          }
        } catch (e) {
          console.error('Failed to load declaration financials by id:', e);
        }
      })();
      return;
    }
    if (location.state && Array.isArray(location.state.allFinancialData) && location.state.allFinancialData.length > 0) {
      return;
    }
    setAllFinancialData(ensureAllMembers([]));

    function normalizeName(type, name, fallbackIndex) {
      const norm = (name || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return norm || `${type}_${fallbackIndex}`;
    }
    function ensureAllMembers(existingData) {
      const result = [];
      function findByTypeAndName(type, name, fallbackIndex) {
        const normName = normalizeName(type, name, fallbackIndex);
        return existingData.find(
          (d, i) => d.type === type && normalizeName(type, d.name, i) === normName
        );
      }
      const userNameRaw = `${typeof userData?.first_name === 'string' ? userData.first_name.trim() : ''} ${typeof userData?.other_names === 'string' ? userData.other_names.trim() : ''} ${typeof userData?.surname === 'string' ? userData.surname.trim() : ''}`.trim();
      let userEntry = findByTypeAndName('user', userNameRaw, 0);
      if (!userEntry) {
        userEntry = {
          type: 'user',
          name: userNameRaw,
          data: {
            declaration_date: declarationDate,
            period_start_date: periodStart,
            period_end_date: periodEnd,
            biennial_income: [{ type: '', description: '', value: '' }],
            assets: [{ type: '', description: '', value: '' }],
            liabilities: [{ type: '', description: '', value: '' }],
            other_financial_info: ''
          }
        };
      }
      result.push(userEntry);
      
      validSpouses.forEach((spouse, idx) => {
        const spouseNameRaw = `${typeof spouse.first_name === 'string' ? spouse.first_name.trim() : ''} ${typeof spouse.other_names === 'string' ? spouse.other_names.trim() : ''} ${typeof spouse.surname === 'string' ? spouse.surname.trim() : ''}`.trim();
        let spouseEntry = findByTypeAndName('spouse', spouseNameRaw, idx);
        if (!spouseEntry) {
          spouseEntry = {
            type: 'spouse',
            name: spouseNameRaw,
            data: {
              declaration_date: declarationDate,
              period_start_date: periodStart,
              period_end_date: periodEnd,
              biennial_income: [{ type: '', description: '', value: '' }],
              assets: [{ type: '', description: '', value: '' }],
              liabilities: [{ type: '', description: '', value: '' }],
              other_financial_info: ''
            }
          };
        }
        result.push(spouseEntry);
      });
      
      validChildren.forEach((child, idx) => {
        const childNameRaw = `${typeof child.first_name === 'string' ? child.first_name.trim() : ''} ${typeof child.other_names === 'string' ? child.other_names.trim() : ''} ${typeof child.surname === 'string' ? child.surname.trim() : ''}`.trim();
        let childEntry = findByTypeAndName('child', childNameRaw, idx);
        if (!childEntry) {
          childEntry = {
            type: 'child',
            name: childNameRaw,
            data: {
              declaration_date: declarationDate,
              period_start_date: periodStart,
              period_end_date: periodEnd,
              biennial_income: [{ type: '', description: '', value: '' }],
              assets: [{ type: '', description: '', value: '' }],
              liabilities: [{ type: '', description: '', value: '' }],
              other_financial_info: ''
            }
          };
        }
        result.push(childEntry);
      });
      return result;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveTimeout = useRef();
  const lastSaved = useRef(0);
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    if (token && allFinancialData.length > 0) {
      const now = Date.now();
      const timeSinceLastSave = now - lastSaved.current;
      if (timeSinceLastSave > 3000) {
        const key = deriveUserKey(userData || {});
        saveProgress({
          lastStep: 'financial',
          stateSnapshot: { allFinancialData, userData, spouses: validSpouses, children: validChildren, declarationDate: periodInfo.declaration_date, periodStart: periodInfo.period_start, periodEnd: periodInfo.period_end }
        }, key);
        scheduleServerSync(key, token);
        lastSaved.current = now;
      } else {
        saveTimeout.current = setTimeout(() => {
          const key = deriveUserKey(userData || {});
          saveProgress({
            lastStep: 'financial',
            stateSnapshot: { allFinancialData, userData, spouses: validSpouses, children: validChildren, declarationDate: periodInfo.declaration_date, periodStart: periodInfo.period_start, periodEnd: periodInfo.period_end }
          }, key);
          scheduleServerSync(key, token);
          lastSaved.current = Date.now();
        }, 3000 - timeSinceLastSave);
      }
    }
    return () => clearTimeout(saveTimeout.current);
  }, [allFinancialData, userData, validSpouses, validChildren, periodInfo.declaration_date, periodInfo.period_start, periodInfo.period_end]);

 const handleChange = (e) => {
  const idx = getAllFinancialDataIndex(activeTab);
  if (idx === -1) return;
  const updatedData = [...allFinancialData];
  updatedData[idx] = {
    ...updatedData[idx],
    data: {
      ...updatedData[idx].data,
      [e.target.name]: e.target.value
    }
  };
  setAllFinancialData(updatedData);
};


const handleTableChange = (section, index, field, value) => {
  const idx = getAllFinancialDataIndex(activeTab);
  if (idx === -1) return;
  const updatedData = [...allFinancialData];
  const updatedSection = [...updatedData[idx].data[section]];
  updatedSection[index][field] = value;
  updatedData[idx] = {
    ...updatedData[idx],
    data: {
      ...updatedData[idx].data,
      [section]: updatedSection
    }
  };
  setAllFinancialData(updatedData);
};

const { declarationId: editingDeclarationId } = getEditContext({ locationState: location.state, locationSearch: location.search });
const [baselineSerialized, setBaselineSerialized] = useState('');
const [toast, setToast] = useState({ show: false, variant: 'success', message: '' });
const stableSerialize = React.useCallback((data) => {
  if (!Array.isArray(data)) return '[]';
  function normalizeItem(item) {
    if (!item || typeof item !== 'object') return {};
    const out = {};
    Object.keys(item).sort().forEach(k => {
      if (typeof item[k] !== 'function') out[k] = item[k] ?? '';
    });
    return out;
  }
  const clone = data.map(d => ({
    type: d.type || '',
    name: (d.name || '').trim(),
    data: {
      declaration_date: d.data?.declaration_date || '',
      period_start_date: d.data?.period_start_date || '',
      period_end_date: d.data?.period_end_date || '',
      biennial_income: (d.data?.biennial_income || []).map(normalizeItem),
      assets: (d.data?.assets || []).map(normalizeItem),
      liabilities: (d.data?.liabilities || []).map(normalizeItem),
      other_financial_info: d.data?.other_financial_info || ''
    }
  }));
  clone.sort((a,b) => (a.type+a.name).localeCompare(b.type+b.name));
  return JSON.stringify(clone);
}, []);

useEffect(() => {
  if (editingDeclarationId && allFinancialData.length > 0 && !baselineSerialized) {
    setBaselineSerialized(stableSerialize(allFinancialData));
  }
}, [editingDeclarationId, allFinancialData, baselineSerialized, stableSerialize]);

const currentSerialized = stableSerialize(allFinancialData);

useDebouncedPatch(
  [currentSerialized, editingDeclarationId, model?.id],
  () => {
    if (!editingDeclarationId || !model?.id) return null;
    if (!baselineSerialized) return null;
    if (currentSerialized === baselineSerialized) return null;
    const root = allFinancialData.find(m => m.type === 'user');
    const spousesPayload = allFinancialData.filter(m => m.type === 'spouse').map(m => ({
      first_name: (m.name || '').split(' ')[0] || '',
      other_names: '',
      surname: (m.name || '').split(' ').slice(-1)[0] || '',
      biennial_income: m.data?.biennial_income || [],
      assets: m.data?.assets || [],
      liabilities: m.data?.liabilities || [],
      other_financial_info: m.data?.other_financial_info || ''
    }));
    const childrenPayload = allFinancialData.filter(m => m.type === 'child').map(m => ({
      first_name: (m.name || '').split(' ')[0] || '',
      other_names: '',
      surname: (m.name || '').split(' ').slice(-1)[0] || '',
      biennial_income: m.data?.biennial_income || [],
      assets: m.data?.assets || [],
      liabilities: m.data?.liabilities || [],
      other_financial_info: m.data?.other_financial_info || ''
    }));
    return {
      biennial_income: root?.data?.biennial_income || [],
      assets: root?.data?.assets || [],
      liabilities: root?.data?.liabilities || [],
      other_financial_info: root?.data?.other_financial_info || '',
      spouses: spousesPayload,
      children: childrenPayload
    };
  },
  1200
);
useEffect(() => {
  if (savingState?.mode === 'PATCH' && savingState?.last && editingDeclarationId && model?.id) {
    const ser = stableSerialize(allFinancialData);
    setBaselineSerialized(ser);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [savingState?.last]);

const addTableRow = (section) => {
  const idx = getAllFinancialDataIndex(activeTab);
  if (idx === -1 || !allFinancialData[idx] || !allFinancialData[idx].data || !Array.isArray(allFinancialData[idx].data[section])) {
    return;
  }
  const updatedData = [...allFinancialData];
  updatedData[idx] = {
    ...updatedData[idx],
    data: {
      ...updatedData[idx].data,
      [section]: [
        ...updatedData[idx].data[section],
        { type: '', description: '', value: '' }
      ]
    }
  };
  setAllFinancialData(updatedData);
};

const removeTableRow = (section, index) => {
  const idx = getAllFinancialDataIndex(activeTab);
  if (idx === -1 || allFinancialData[idx].data[section].length <= 1) return;
  const updatedData = [...allFinancialData];
  updatedData[idx] = {
    ...updatedData[idx],
    data: {
      ...updatedData[idx].data,
      [section]: updatedData[idx].data[section].filter((_, i) => i !== index)
    }
  };
  setAllFinancialData(updatedData);
};

// ---- Liabilities validation helpers (outside of renderTableSection to avoid hook misuse) ----
const requiresLiabilityFreeText = (type) => !['Short-Term Liabilities (Current)', 'Long-Term Liabilities (Non-Current)'].includes(type || '');
const liabilityDescriptionPlaceholder = (type) => {
  switch (type) {
    case 'Outstanding School Fees':
      return 'e.g. Institution';
    case 'Friendly Loans':
      return 'e.g. Lender name';
    case 'Sacco Loan':
    case 'Sacco Loans':
      return 'e.g. Sacco name';
    case 'Bank Loan':
    case 'Bank Loans':
      return 'e.g. Bank name';
    case 'Vehicle Loan':
    case 'Vehicle Loans':
      return 'e.g. Financier and vehicle reg no.';
    case 'Mortgage Loans':
      return 'e.g. Lender and Plot ref no.';
    case 'Student Loans':
      return 'e.g. Lender (e.g., HELB)';
    case 'Imprest Due':
      return 'e.g. Reference';
    case 'Salary Advance':
      return 'e.g. Month/year';
    case 'Outstanding Dowry':
      return 'e.g. Party owed and details';
    case 'Loan From Chama':
      return 'e.g. Chama name';
    case 'Mobile Loan':
      return 'e.g. Provider (e.g., M‑Shwari)';
    case 'Financial Obligations':
      return 'e.g. Guarantees, commitments';
    case 'Other':
      return 'Describe liability';
    default:
      return 'Enter description';
  }
};
const computeLiabilityErrors = (rows) => {
  const errs = {};
  (rows || []).forEach((row, idx) => {
    const t = (row.type || '').trim();
    if (t === 'Nil') return; // skip validation for nil row
    const desc = (row.description || '').trim();
    if (!t && (desc || row.value)) { errs[idx] = 'Select a liability type.'; return; }
    if (!t) return;
    if (requiresLiabilityFreeText(t)) {
      if (!desc) errs[idx] = 'Description required.';
    } else {
      if (!desc) errs[idx] = 'Select a description.';
      else if (desc === 'Other' && !(row.liability_other_description || '').trim()) {
        errs[idx] = 'Provide details for "Other".';
      }
    }
    if (row.value && isNaN(parseFloat(row.value))) {
      errs[idx] = errs[idx] ? errs[idx] + ' Value must be numeric.' : 'Value must be numeric.';
    }
  });
  return errs;
};

// ---- Asset validation (Land size required) ----
const computeAssetErrors = (rows) => {
  const errs = {};
  (rows || []).forEach((row, idx) => {
    // Require size for any land-type asset (e.g., Land, Ancestral Land, Acquired Land)
    if ((row.type || '').toLowerCase().includes('land')) {
      if (!(row.size || '').toString().trim()) {
        errs[idx] = 'Size is required for Land.';
      }
    }
  });
  return errs;
};

// ---- Section completeness helpers ----
const hasValue = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const isNilRow = (r) => (r?.type === 'Nil' && r?.description === 'Nil');
const isSectionFilledArray = React.useCallback((rows, section) => {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  // Single Nil row counts as filled
  if (rows.length === 1 && isNilRow(rows[0])) return true;
  return rows.some(r => {
    if (isNilRow(r)) return true;
    switch (section) {
      case 'biennial_income':
        return hasValue(r.type) || hasValue(r.description) || hasValue(r.value);
      case 'assets':
        return (
          hasValue(r.type) || hasValue(r.description) || hasValue(r.value) ||
          hasValue(r.make) || hasValue(r.model) || hasValue(r.licence_no) ||
          hasValue(r.title_deed) || hasValue(r.location) || hasValue(r.size) ||
          hasValue(r.asset_other_type) || hasValue(r.size_unit)
        );
      case 'liabilities':
        return hasValue(r.type) || hasValue(r.description) || hasValue(r.value) || hasValue(r.liability_other_description);
      default:
        return false;
    }
  });
}, []);

// ---- Asset description placeholder helper ----
const assetDescriptionPlaceholder = (type) => {
  switch (type) {
    case 'Stock Shares':
      return 'e.g. Company';
    case 'Sacco Shares':
      return 'e.g. Sacco name';
    case 'Household Goods':
      return 'e.g. Electronics, furniture';
    case 'Personal Items':
      return 'e.g. Collectibles, Phones, Computers';
    case 'Jewelry':
      return 'e.g. Type and carat';
    case 'Cash At Hand':
      return 'e.g. Cash held as of statement date';
    case 'Cash At Bank':
      return 'e.g. Bank name';
    case 'Financial Obligations Owed':
      return 'e.g. Party owing and nature of obligation';
    case 'Other':
      return 'Describe asset';
    default:
      return 'Enter description';
  }
};

// ---- Income description placeholder helper ----
const incomeDescriptionPlaceholder = (type) => {
  switch (type) {
    case 'Salary':
      return 'e.g. Gross annual/biennial salary';
    case 'Rent':
      return 'e.g. Gross annual/biennial rent';
    case 'Sale of Crops':
      return 'e.g. Crop type and harvest period';
    case 'Sale of Livestock and their Products':
      return 'e.g. Livestock/product type and period';
    case 'Interest on Bank Deposits':
      return 'e.g. Bank name';
    case 'Dividends from Saccos':
      return 'e.g. Sacco name';
    case 'Dividends from Stock':
      return 'e.g. Company name';
    case 'Dowry':
      return 'e.g. From whom and occasion';
    case 'Transportation Income (Matatus, Taxis, Boda Boda etc.)':
      return 'e.g. Vehicle info';
    case 'Insurance Bonuses':
      return 'e.g. Policy and provider';
    case 'Cash Gifts':
      return 'e.g. From whom and occasion';
    case 'Royalties':
      return 'e.g. Work and period';
    case 'Damages provided by court.':
      return 'e.g. Case reference and date';
    case 'Content Creation':
      return 'e.g. Platform and period';
    case 'Other':
      return 'Describe income';
    default:
      return 'Enter description';
  }
};

  const renderTableSection = (title, section, currency = 'Ksh', additionalNote = '') => {
    const currentData = filteredFinancialData[activeTab]?.data || {};
    // Asset type options
    const assetTypeOptions = [
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
    ];
    const incomeTypeOptions = [
      'Salary',
      'Rent',
      'Sale of Crops',
      'Sale of Livestock and their Products',
      'Interest on Bank Deposits',
      'Dividends from Saccos',
      'Dividends from Stock',
      'Dowry',
      'Transportation Income (Matatus, Taxis, Boda Boda etc.)',
      'Insurance Bonuses',
      'Cash Gifts',
      'Royalties',
      'Damages provided by court.',
      'Content Creation',
      'Other',
    ];
    // Liabilities type and description options
    const liabilitiesTypeOptions = [
      'Outstanding School Fees',
      'Friendly Loans',
      'Sacco Loan',
      'Bank Loan',
      'Vehicle Loan',
      'Mortgage Loans',
      'Student Loans',
      'Imprest Due',
      'Salary Advance',
      'Outstanding Dowry',
      'Loan From Chama',
      'Mobile Loan',
      'Other',
    ];
    // Description options are no longer grouped; free text is used for all liability types
    const liabilitiesDescriptionOptions = {};

  const liabilityErrors = section === 'liabilities' ? computeLiabilityErrors(currentData.liabilities || []) : {};
  const assetErrors = section === 'assets' ? computeAssetErrors(currentData.assets || []) : {};
    const isNil = Array.isArray(currentData[section]) && currentData[section].length === 1 && currentData[section][0].type === 'Nil' && currentData[section][0].description === 'Nil';

    const toggleNilSection = () => {
      const idx = getAllFinancialDataIndex(activeTab);
      if (idx === -1) return;
      const updatedData = [...allFinancialData];
      if (isNil) {
        // revert to empty default row
        updatedData[idx] = {
          ...updatedData[idx],
          data: { ...updatedData[idx].data, [section]: [{ type: '', description: '', value: '' }] }
        };
      } else {
        updatedData[idx] = {
          ...updatedData[idx],
          data: { ...updatedData[idx].data, [section]: [{ type: 'Nil', description: 'Nil', value: '' }] }
        };
      }
      setAllFinancialData(updatedData);
    };
    return (
      <Card className="mb-4">
        <Card.Header className={`text-white ${
          section === 'biennial_income' ? 'bg-info' : 
          section === 'assets' ? 'bg-success' : 'bg-warning text-dark'
        }`}>
          <h5 className="mb-0">{title}</h5>
          {additionalNote && <small className="d-block mt-1">{additionalNote}</small>}
        </Card.Header>
        <Card.Body>
          <p className="text-muted small mb-2" style={{maxWidth:'760px'}}>
            Use the <strong>Declare Nil</strong> checkbox if you have nothing to report in this section. This locks the inputs and records a Nil entry. Uncheck to add data.
          </p>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <Form.Check
              type="checkbox"
              id={`nil-checkbox-${section}-${activeTab}`}
              label="Declare Nil"
              checked={isNil}
              onChange={toggleNilSection}
            />
            {isNil && <span className="text-muted small">This section marked as Nil; uncheck to provide entries.</span>}
          </div>
          <Table responsive className="mb-3">
            <thead className="table-light">
              <tr>
                <th style={{ width: '20%' }}>Type</th>
                <th style={{ width: '40%' }}>Description</th>
                <th style={{ width: '20%' }}>Approximate Value ({currency})</th>
                <th style={{ width: '20%' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {(currentData[section] || []).map((item, index) => {
                  if (section === 'biennial_income') {
                  return (
                    <tr key={index}>
                      <td>
                        {isNil ? (
                          <Form.Control disabled value="Nil" style={{ borderRadius: '8px' }} />
                        ) : (
                          <>
                            <Form.Select
                              id={`financial-type-biennial_income-${index}`}
                              name="type"
                              value={item.type || ''}
                              onChange={e => handleTableChange('biennial_income', index, 'type', e.target.value)}
                              style={{ borderRadius: '8px' }}
                              disabled={isNil}
                            >
                              <option value="">Select Type</option>
                              {incomeTypeOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </Form.Select>
                            {item.type === 'Other' && (
                              <Form.Control
                                className="mt-2"
                                type="text"
                                placeholder="Specify income type"
                                value={item.income_other_type || ''}
                                onChange={e => handleTableChange('biennial_income', index, 'income_other_type', e.target.value)}
                                style={{ borderRadius: '8px' }}
                              />
                            )}
                          </>
                        )}
                      </td>
                      <td>
                        <Form.Control
                          id={`financial-description-biennial_income-${index}`}
                          autoComplete="off"
                          type="text"
                          name="description"
                          value={item.description}
                          onChange={e => handleTableChange('biennial_income', index, 'description', e.target.value)}
                          placeholder={incomeDescriptionPlaceholder(item.type)}
                          style={{ borderRadius: '8px' }}
                          disabled={isNil}
                        />
                      </td>
                      <td>
                        <Form.Control
                          id={`financial-amount-biennial_income-${index}`}
                          type="number"
                          autoComplete="off"
                          value={item.value}
                          onChange={e => handleTableChange('biennial_income', index, 'value', e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          style={{ borderRadius: '8px' }}
                          disabled={isNil}
                        />
                      </td>
                      <td>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => removeTableRow('biennial_income', index)}
                          disabled={(currentData[section] || []).length === 1 || isNil}
                          style={{ borderRadius: '8px' }}
                        >
                          <i className="fas fa-trash"></i>
                        </Button>
                      </td>
                    </tr>
                  );
                }
                  if (section === 'assets') {
                    const type = item.type || '';
                    const isLandType = type === 'Ancestral Land' || type === 'Acquired Land';
                    const isBuildingType = type === 'Building' || type === 'Houses';
                    const isVehicleType = type === 'Vehicles' || type === 'Transportation Vehicles';
                  return (
                    <tr key={index}>
                      <td>
                        <Form.Select
                          id={`financial-type-assets-${index}`}
                          name="type"
                          value={type}
                          onChange={e => handleTableChange('assets', index, 'type', e.target.value)}
                          style={{ borderRadius: '8px' }}
                          disabled={isNil}
                        >
                          <option value="">Select Type</option>
                          {assetTypeOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </Form.Select>
                        {/* For 'Other', show extra asset type field */}
                        {type === 'Other' && (
                          <Form.Control
                            className="mt-2"
                            type="text"
                            placeholder="Specify asset type"
                            value={item.asset_other_type || ''}
                            onChange={e => handleTableChange('assets', index, 'asset_other_type', e.target.value)}
                            style={{ borderRadius: '8px' }}
                          />
                        )}
                      </td>
                      <td>
                          {/* Conditional fields as requested for Land, Building/Houses, Vehicles/Transportation Vehicles */}
                          {isNil ? (
                          <Form.Control disabled value="Nil" style={{ borderRadius: '8px' }} />
                          ) : isVehicleType ? (
                          <div className="d-flex flex-column gap-2">
                            <Form.Control
                              className="mb-1"
                              type="text"
                                placeholder="Make"
                              value={item.make || ''}
                              onChange={e => handleTableChange('assets', index, 'make', e.target.value)}
                              style={{ borderRadius: '8px' }}
                            />
                            <Form.Control
                              className="mb-1"
                              type="text"
                              placeholder="Model"
                              value={item.model || ''}
                              onChange={e => handleTableChange('assets', index, 'model', e.target.value)}
                              style={{ borderRadius: '8px' }}
                            />
                            <Form.Control
                              className="mb-1"
                              type="text"
                                placeholder="Registration No."
                              value={item.licence_no || ''}
                              onChange={e => handleTableChange('assets', index, 'licence_no', e.target.value)}
                              style={{ borderRadius: '8px' }}
                            />
                          </div>
                          ) : isLandType ? (
                          <div className="d-flex flex-column gap-2">
                            <Form.Control
                              className="mb-1"
                              type="text"
                              placeholder="Title Deed"
                              value={item.title_deed || ''}
                              onChange={e => handleTableChange('assets', index, 'title_deed', e.target.value)}
                              style={{ borderRadius: '8px' }}
                            />
                            <Form.Control
                              className="mb-1"
                              type="text"
                              placeholder="Location"
                              value={item.location || ''}
                              onChange={e => handleTableChange('assets', index, 'location', e.target.value)}
                              style={{ borderRadius: '8px' }}
                            />
                            <div className="d-flex gap-2">
                              <Form.Control
                                className="mb-1"
                                type="text"
                                placeholder="Size"
                                value={item.size || ''}
                                onChange={e => handleTableChange('assets', index, 'size', e.target.value)}
                                style={{ borderRadius: '8px', flex: '1 1 auto' }}
                                isInvalid={!!assetErrors[index]}
                              />
                              <Form.Select
                                className="mb-1"
                                value={item.size_unit || ''}
                                onChange={e => handleTableChange('assets', index, 'size_unit', e.target.value)}
                                style={{ borderRadius: '8px', maxWidth: '130px' }}
                              >
                                <option value="">Unit</option>
                                <option value="acre">Acre(s)</option>
                                <option value="hectare">Hectare(s)</option>
                                <option value="sqm">Sq M</option>
                                <option value="sqft">Sq Ft</option>
                              </Form.Select>
                            </div>
                            {assetErrors[index] && (
                              <div className="invalid-feedback d-block small mt-0">{assetErrors[index]}</div>
                            )}
                          </div>
                          ) : isBuildingType ? (
                          <div className="d-flex flex-column gap-2">
                            <Form.Control
                              className="mb-1"
                              type="text"
                              placeholder="Location"
                              value={item.location || ''}
                              onChange={e => handleTableChange('assets', index, 'location', e.target.value)}
                              style={{ borderRadius: '8px' }}
                            />
                            <Form.Control
                              className="mb-1"
                              type="text"
                                placeholder="Plot No."
                              value={item.title_deed || ''}
                              onChange={e => handleTableChange('assets', index, 'title_deed', e.target.value)}
                              style={{ borderRadius: '8px' }}
                            />
                          </div>
                        ) : (
                          <Form.Control
                            id={`financial-description-assets-${index}`}
                            autoComplete="off"
                            type="text"
                            name="description"
                            value={item.description}
                            onChange={e => handleTableChange('assets', index, 'description', e.target.value)}
                              placeholder={assetDescriptionPlaceholder(type)}
                            style={{ borderRadius: '8px' }}
                            disabled={isNil}
                          />
                        )}
                      </td>
                      <td>
                        <Form.Control
                          id={`financial-amount-assets-${index}`}
                          type="number"
                          autoComplete="off"
                          value={item.value}
                          onChange={e => handleTableChange('assets', index, 'value', e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          style={{ borderRadius: '8px' }}
                          disabled={isNil}
                        />
                      </td>
                      <td>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => removeTableRow('assets', index)}
                          disabled={(currentData[section] || []).length === 1 || isNil}
                          style={{ borderRadius: '8px' }}
                        >
                          <i className="fas fa-trash"></i>
                        </Button>
                      </td>
                    </tr>
                  );
                }
                if (section === 'liabilities') {
                  return (
                    <tr key={index}>
                      <td>
                        <Form.Select
                          id={`financial-type-liabilities-${index}`}
                          name="type"
                          value={item.type || ''}
                          onChange={e => handleTableChange('liabilities', index, 'type', e.target.value)}
                          style={{ borderRadius: '8px' }}
                          isInvalid={!!liabilityErrors[index] && !(item.type || '').trim()}
                          disabled={isNil}
                        >
                          <option value="">Select Type</option>
                          {liabilitiesTypeOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </Form.Select>
                      </td>
                      <td>
                        {/* For grouped liability categories show select; for specific loan/obligation types show a free text description box */}
                        {isNil ? (
                          <Form.Control disabled value="Nil" style={{ borderRadius: '8px' }} />
                        ) : ['Short-Term Liabilities (Current)', 'Long-Term Liabilities (Non-Current)'].includes(item.type) ? (
                          <>
                            <Form.Select
                              id={`financial-description-liabilities-${index}`}
                              name="description"
                              value={item.description || ''}
                              onChange={e => handleTableChange('liabilities', index, 'description', e.target.value)}
                              style={{ borderRadius: '8px' }}
                              isInvalid={!!liabilityErrors[index] && !requiresLiabilityFreeText(item.type)}
                              disabled={isNil}
                            >
                              <option value="">Select Description</option>
                              {(liabilitiesDescriptionOptions[item.type] || ['Other']).map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </Form.Select>
                            {item.description === 'Other' && (
                              <Form.Control
                                className="mt-2"
                                type="text"
                                placeholder="Specify liability description"
                                value={item.liability_other_description || ''}
                                onChange={e => handleTableChange('liabilities', index, 'liability_other_description', e.target.value)}
                                style={{ borderRadius: '8px' }}
                                isInvalid={!!liabilityErrors[index] && (item.description === 'Other') && !(item.liability_other_description || '').trim()}
                                disabled={isNil}
                              />
                            )}
                          </>
                        ) : (
                          <Form.Control
                            id={`financial-description-liabilities-free-${index}`}
                            type="text"
                            placeholder={liabilityDescriptionPlaceholder(item.type)}
                            value={item.description || ''}
                            onChange={e => handleTableChange('liabilities', index, 'description', e.target.value)}
                            style={{ borderRadius: '8px' }}
                            isInvalid={!!liabilityErrors[index] && requiresLiabilityFreeText(item.type)}
                            disabled={isNil}
                          />
                        )}
                        {liabilityErrors[index] && (
                          <div className="invalid-feedback d-block small mt-1">
                            {liabilityErrors[index]}
                          </div>
                        )}
                      </td>
                      <td>
                        <Form.Control
                          id={`financial-amount-liabilities-${index}`}
                          type="number"
                          autoComplete="off"
                          value={item.value}
                          onChange={e => handleTableChange('liabilities', index, 'value', e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          style={{ borderRadius: '8px' }}
                          disabled={isNil}
                        />
                      </td>
                      <td>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => removeTableRow('liabilities', index)}
                          disabled={(currentData[section] || []).length === 1 || isNil}
                          style={{ borderRadius: '8px' }}
                        >
                          <i className="fas fa-trash"></i>
                        </Button>
                      </td>
                    </tr>
                  );
                }
              return null;
              })}
            </tbody>
          </Table>
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => addTableRow(section)}
            style={{ borderRadius: '8px' }}
            disabled={isNil}
          >
            <i className="fas fa-plus"></i> Add Row
          </Button>
        </Card.Body>
      </Card>
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!allMembersComplete) {
      setToast({ show: true, variant: 'warning', message: 'Please complete Income, Assets, and Liabilities for each person (or declare Nil) to proceed.' });
      return;
    }
    const formattedFinancialData = allFinancialData.map(fd => ({
      ...fd,
      data: {
        ...fd.data,
        declaration_date: toISODate(fd.data?.declaration_date),
        period_start_date: toISODate(fd.data?.period_start_date),
        period_end_date: toISODate(fd.data?.period_end_date)
      }
    }));
    const token = localStorage.getItem('token');
    if (token) {
      const key = deriveUserKey(userData || {});
      saveProgress({
        lastStep: 'review',
        stateSnapshot: { allFinancialData: formattedFinancialData, userData, spouses: validSpouses, children: validChildren, declarationDate: periodInfo.declaration_date, periodStart: periodInfo.period_start, periodEnd: periodInfo.period_end }
      }, key);
      scheduleServerSync(key, token);
    }
    const ctx = getEditContext({ locationState: location.state, locationSearch: location.search });
    const reviewPath = appendDeclarationIdToPath('/review', ctx.declarationId);
    navigate(reviewPath, { 
      state: { 
        userData, 
        spouses, 
        children, 
        allFinancialData: formattedFinancialData
      } 
    });
  };

 const handleNextPerson = () => {
  if (activeTab < filteredFinancialData.length - 1) {
    setActiveTab(activeTab + 1);
  }
};

  const hasSpouse = validSpouses.length > 0 || allFinancialData.some(m => m.type === 'spouse');
  const hasChild = validChildren.length > 0 || allFinancialData.some(m => m.type === 'child');
  const filteredFinancialData = (() => {
    const firstUserIndex = allFinancialData.findIndex(m => m.type === 'user');
    if (firstUserIndex === -1) return [];
    const spouseNameSet = new Set(
      (validSpouses || []).map(s => `${s.first_name||s.firstName||''} ${(s.other_names||'')}`.trim().toLowerCase() + ` ${(s.surname||'')}`.trim().toLowerCase())
    );
    const childNameSet = new Set(
      (validChildren || []).map(c => `${c.first_name||c.firstName||''} ${(c.other_names||'')}`.trim().toLowerCase() + ` ${(c.surname||'')}`.trim().toLowerCase())
    );
    const out = [];
    allFinancialData.forEach((member, idx) => {
      let m = member;
      if (member.type === 'user' && idx !== firstUserIndex) {
        const normName = (member.name || '').replace(/\s+/g,' ').trim().toLowerCase();
        if (spouseNameSet.has(normName)) {
          m = { ...member, type: 'spouse' };
        } else if (childNameSet.has(normName)) {
          m = { ...member, type: 'child' };
        } else {
          return;
        }
      }
      if (m.type === 'spouse') {
        if (!hasSpouse || validSpouses.length === 0) return;
      }
      if (m.type === 'child') {
        if (!hasChild || validChildren.length === 0) return;
      }
      out.push(m);
    });
    return out;
  })();

  function getAllFinancialDataIndex(filteredIndex) {
    if (!filteredFinancialData[filteredIndex]) return -1;
    const { type, name } = filteredFinancialData[filteredIndex];
    function normalizeName(type, name, fallbackIndex) {
      const norm = (name || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return norm || `${type}_${fallbackIndex}`;
    }
    const normName = normalizeName(type, name, filteredIndex);
    return allFinancialData.findIndex((m, i) => m.type === type && normalizeName(type, m.name, i) === normName);
  }

  const currentFinancialData = filteredFinancialData[activeTab]?.data || {};
  useEffect(() => {
    if ((!periodInfo.declaration_date || !periodInfo.period_start || !periodInfo.period_end) && allFinancialData.length > 0) {
      const first = allFinancialData[0]?.data || {};
      setPeriodInfo(prev => ({
        declaration_date: prev.declaration_date || first.declaration_date || first.declarationDate || '',
        period_start: prev.period_start || first.period_start_date || first.periodStartDate || '',
        period_end: prev.period_end || first.period_end_date || first.periodEndDate || ''
      }));
    }
  }, [allFinancialData, periodInfo.declaration_date, periodInfo.period_start, periodInfo.period_end]);

  const displayMembers = React.useMemo(() => {
    const buildName = (obj) => {
      if (!obj) return '';
      const parts = [obj.first_name || obj.firstName, obj.other_names, obj.surname].filter(p => typeof p === 'string' && p.trim());
      return parts.join(' ').trim();
    };
    const userName = buildName(userData);
    const spouseNames = (Array.isArray(validSpouses) ? validSpouses : []).map(buildName);
    const childNames = (Array.isArray(validChildren) ? validChildren : []).map(buildName);
    let spouseIdx = 0; let childIdx = 0;
    return filteredFinancialData.map(m => {
      if (m.type === 'user') {
        return { ...m, displayName: userName || (typeof m.name === 'string' && m.name.trim()) || 'You' };
      }
      if (m.type === 'spouse') {
        const name = (typeof m.name === 'string' && m.name.trim()) || spouseNames[spouseIdx] || `Spouse ${spouseIdx + 1}`;
        spouseIdx++;
        return { ...m, displayName: name };
      }
      if (m.type === 'child') {
        const name = (typeof m.name === 'string' && m.name.trim()) || childNames[childIdx] || `Child ${childIdx + 1}`;
        childIdx++;
        return { ...m, displayName: name };
      }
      return { ...m, displayName: (typeof m.name === 'string' && m.name.trim()) || 'Member' };
    });
  }, [filteredFinancialData, userData, validSpouses, validChildren]);

  // Determine if all members have completed entries (each section either Nil or has content)
  const allMembersComplete = React.useMemo(() => {
    if (!Array.isArray(filteredFinancialData) || filteredFinancialData.length === 0) return false;
    return filteredFinancialData.every(member => {
      const d = member?.data || {};
      const incomeOk = isSectionFilledArray(d.biennial_income, 'biennial_income');
      const assetsOk = isSectionFilledArray(d.assets, 'assets');
      const liabilitiesOk = isSectionFilledArray(d.liabilities, 'liabilities');
      return incomeOk && assetsOk && liabilitiesOk;
    });
  }, [filteredFinancialData, isSectionFilledArray]);

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #e3f2fd 0%, #e8f5e8 100%)' }} 
         className="py-5">
      <Container>
        <ToastContainer
          className="position-fixed bottom-0 start-50 translate-middle-x p-3"
          style={{ zIndex: 1060 }}
        >
          <Toast
            bg={toast.variant === 'warning' ? 'warning' : toast.variant === 'success' ? 'success' : undefined}
            show={!!toast.show}
            onClose={() => setToast(t => ({ ...t, show: false }))}
            delay={4000}
            autohide
          >
            <Toast.Body className={toast.variant === 'warning' ? '' : ''}>
              {toast.message}
            </Toast.Body>
          </Toast>
        </ToastContainer>
        {editingDeclarationId && (
          <div className="d-flex justify-content-end mb-2 small">
            {savingState?.busy ? (
              <span className="badge bg-warning text-dark">Saving financial...</span>
            ) : savingState?.last ? (
              <span className="badge bg-success">Saved {savingState.mode} at {savingState.last.toLocaleTimeString()}</span>
            ) : null}
          </div>
        )}
        {getEditContext({ locationState: location.state, locationSearch: location.search }).declarationId && (
          <div className="alert alert-info mb-3 d-flex justify-content-between align-items-start" role="alert" style={{ borderRadius: '10px' }}>
            <div>
              <strong>Editing existing declaration</strong>
              {(() => { const ctx = getEditContext({ locationState: location.state, locationSearch: location.search }); return ctx.declarationId ? (<> — ID: <code>{ctx.declarationId}</code></>) : null; })()}
              {(() => { const ctx = getEditContext({ locationState: location.state, locationSearch: location.search }); return ctx.editInfo?.reason ? (<><br />Reason: <em>{ctx.editInfo.reason}</em></>) : null; })()}
            </div>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => {
                  const ctx = getEditContext({ locationState: location.state, locationSearch: location.search });
                  const reviewPath = appendDeclarationIdToPath('/review', ctx.declarationId);
                  navigate(reviewPath, { state: { ...location.state, allFinancialData } });
                }}
              >
                <i className="fas fa-eye me-1"></i>
                View declaration
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => {
                  clearEditContext();
                  const clean = removeDeclarationIdFromPath(window.location.pathname + window.location.search);
                  navigate(clean, { replace: true, state: { ...location.state, declarationId: undefined, editInfo: undefined } });
                }}
              >
                <i className="fas fa-times me-1"></i>
                Clear edit context
              </button>
            </div>
          </div>
        )}
        <Row className="justify-content-center">
          <Col lg={10}>
            <Card className="shadow-lg border-0">
              <Card.Body className="p-5">
                <div className="text-center mb-4">
                  <div className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                       style={{ width: '80px', height: '80px', 
                               background: 'linear-gradient(45deg, var(--primary-blue), var(--secondary-green))' }}>
                    <i className="fas fa-chart-line text-white" style={{ fontSize: '2rem' }}></i>
                  </div>
                  <h2 className="fw-bold text-dark mb-2">Financial Information</h2>
                  <p className="text-muted">Step 3 of 4</p>
                  <ProgressBar now={75} className="mb-4" style={{ height: '8px' }} />
                </div>

                {/* Navigation Tabs for Family Members */}
                <Nav variant="pills" className="justify-content-center mb-4">
                  {displayMembers.map((member, index) => (
                    <Nav.Item key={index}>
                      <Nav.Link
                        active={activeTab === index}
                        onClick={() => setActiveTab(index)}
                        style={{ 
                          borderRadius: '12px',
                          margin: '0 4px',
                          background: activeTab === index ? 'var(--primary-blue)' : 'transparent',
                          color: activeTab === index ? 'white' : 'var(--primary-blue)',
                          border: activeTab === index ? 'none' : '1px solid var(--primary-blue)'
                        }}
                      >
                        {member.displayName}{member.type === 'user' && ' (You)'}
                      </Nav.Link>
                    </Nav.Item>
                  ))}
                </Nav>

                <div className="text-center mb-4">
                  <h4 className="text-primary">
                    Financial Declaration for: {displayMembers[activeTab]?.displayName || 'Unknown'}
                    {displayMembers[activeTab]?.type === 'user' && ' (You)'}
                  </h4>
                  <small className="text-muted">
                    Form {activeTab + 1} of {filteredFinancialData.length}
                  </small>
                </div>

                <Form onSubmit={handleSubmit}>
                 {/* Declaration Period Display */}
                  <Card className="border-0 bg-light mb-4">
                    <Card.Header className={`text-white bg-dark`}>
                      <h5 className="mb-0">A. Declaration Period</h5>
                    </Card.Header>
                    <Card.Body>
                      <Row>
                        <Col md={4} className="mb-2">
                          <strong>Date of Submission:</strong><br />
                          <span>{periodInfo.declaration_date || '-'}</span>
                        </Col>
                        <Col md={4} className="mb-2">
                          <strong>Period Start Date:</strong><br />
                          <span>{periodInfo.period_start || '-'}</span>
                        </Col>
                        <Col md={4} className="mb-2">
                          <strong>Period End Date:</strong><br />
                          <span>{periodInfo.period_end || '-'}</span>
                        </Col>
                      </Row>
                    </Card.Body>
                  </Card>

                  {/* Section B: Annual Income */}
                  {renderTableSection(
                    'B. Income Statement',
                    'biennial_income',
                    'Ksh',
                    'Including but not limited to; salary, emoluments and income from investments. The period is the two years starting from 1st of November of the previous declaration year to the 31st Of October of the current declaration year. For an initial declaration, the period is the one year ending on the statement date.'
                  )}

                  {/* Section C: Assets */}
                  {renderTableSection('C. Assets', 'assets', 'Ksh', 'Including but not limited to; land, building, vehicles, investments and financial obligations owed to the person for whom the statement is made as of the statemnt date. Kindly include Location and registration details/ numbers of the asset where applicable. Include assets that are within and outside the country.')}

                  {/* Section D: Liabilities */}
                  {renderTableSection('D. Liabilities', 'liabilities', 'Ksh', 'Including but not limited to; bank loans, sacco loans , vehicles loans and financial obligations owed as of the statemnt date.')}

                  {/* Section E: Other Information */}
                  <Card className="mb-4">
                    <Card.Header className="bg-secondary text-white">
                      <h5 className="mb-0">E. Other Information that may be useful or relevant</h5>
                    </Card.Header>
                    <Card.Body>
                      <Form.Group className="mb-3">
                        <Form.Label htmlFor="financial-additional-info" className="fw-semibold">Additional Information</Form.Label>
                        <Form.Control
                          id="financial-additional-info"
                          autoComplete="off"
                          as="textarea"
                          rows={4}
                          name="other_financial_info"
                          value={currentFinancialData.other_financial_info || ''}
                          onChange={handleChange}
                          placeholder="Enter any additional financial information that may be relevant to your declaration..."
                          className="py-3"
                          style={{ borderRadius: '12px' }}
                        />
                      </Form.Group>
                    </Card.Body>
                  </Card>

                  <div className="d-flex justify-content-between pt-3">
                    <div>
                      <Button
                        variant="outline-secondary"
                        onClick={() => {
                          const ctx = getEditContext({ locationState: location.state, locationSearch: location.search });
                          const backPath = appendDeclarationIdToPath('/spouse-form', ctx.declarationId);
                          navigate(backPath, { state: { ...location.state } });
                        }}
                        className="px-4 py-3 me-2"
                        style={{ borderRadius: '12px' }}
                      >
                        <i className="fas fa-arrow-left me-2"></i>
                        Back
                      </Button>
                      {location.state?.fromReview && (
                        <Button
                          variant="outline-primary"
                          onClick={() => {
                            const ctx = getEditContext({ locationState: location.state, locationSearch: location.search });
                            const reviewPath = appendDeclarationIdToPath('/review', ctx.declarationId);
                            navigate(reviewPath, { state: { ...location.state, allFinancialData } });
                          }}
                          className="px-4 py-3"
                          style={{ borderRadius: '12px' }}
                        >
                          <i className="fas fa-list me-2"></i>
                          Back to Review
                        </Button>
                      )}
                    </div>
                    <div>
                      {activeTab < filteredFinancialData.length - 1 ? (
                        <Button
                          type="button"
                          onClick={handleNextPerson}
                          className="px-5 py-3 fw-semibold me-2"
                          style={{ 
                            borderRadius: '12px',
                            background: 'linear-gradient(45deg, var(--secondary-green), #28a745)',
                            border: 'none',
                            color: 'white'
                          }}
                        >
                          <i className="fas fa-arrow-right me-2"></i>
                          Next Person
                        </Button>
                      ) : null}
                      <Button
                        type="submit"
                        className="px-5 py-3 fw-semibold"
                        style={{ 
                          borderRadius: '12px',
                          background: 'linear-gradient(45deg, var(--primary-blue), #0056b3)',
                          border: 'none'
                        }}
                      >
                        <i className="fas fa-eye me-2"></i>
                        Review & Submit
                      </Button>
                    </div>
                  </div>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

const FinancialForm = () => {
  const { declarationId } = getEditContext({ locationState: null, locationSearch: window.location.search });
  return (
    <DeclarationSessionProvider declarationId={declarationId}>
      <FinancialFormInner />
    </DeclarationSessionProvider>
  );
};

export default FinancialForm;