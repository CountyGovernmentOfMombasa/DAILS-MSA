// Converts the internal declaration session model + form edits into the API payload.
// Centralizes transformation logic so components can stay lean.
//
// Types
/**
 * @typedef {Object} FinancialEntryRow
 * @property {string} type
 * @property {string} description
 * @property {string|number} [value]
 * @property {string} [make]
 * @property {string} [model]
 * @property {string} [licence_no]
 * @property {string} [title_deed]
 * @property {string} [location]
 * @property {string} [asset_other_type]
 */
/**
 * Unified financial member item constructed client-side or received from backend.
 * @typedef {Object} UnifiedFinancialMember
 * @property {string} type - 'user' | 'spouse' | 'child'
 * @property {string} name
 * @property {{
 *   declaration_date?: string,
 *   period_start_date?: string,
 *   period_end_date?: string,
 *   biennial_income?: FinancialEntryRow[],
 *   assets?: FinancialEntryRow[],
 *   liabilities?: FinancialEntryRow[],
 *   other_financial_info?: string
 * }} data
 */

import { normalizeDeclarationType } from '../util/normalizeDeclarationType';
export function modelToSubmissionPayload({ model, userData, spouses, children, financialData, witness }) {
  // New simplified transformer: backend expects root arrays + spouse/child entries directly.
  if (!model && !userData) return {};
  const baseTypeRaw = (userData?.declaration_type || model?.type || '').trim();
  const baseType = normalizeDeclarationType(baseTypeRaw);
  // Build lookups from financialData by member_type
  const byType = { user: null, spouse: [], child: [] };
  if (Array.isArray(financialData)) {
    financialData.forEach(entry => {
      if (!entry || !entry.type || !entry.data) return;
      if (entry.type === 'user' && !byType.user) byType.user = entry;
      else if (entry.type === 'spouse') byType.spouse.push(entry);
      else if (entry.type === 'child') byType.child.push(entry);
    });
  }
  const root = byType.user?.data || {};
  const payload = {
    marital_status: userData?.marital_status || model?.profile?.marital_status || '',
    declaration_type: baseType,
    declaration_date: userData?.declaration_date || root.declaration_date || '',
    period_start_date: userData?.period_start_date || root.period_start_date || '',
    period_end_date: userData?.period_end_date || root.period_end_date || '',
    biennial_income: Array.isArray(root.biennial_income) ? root.biennial_income : [],
    assets: Array.isArray(root.assets) ? root.assets : [],
    liabilities: Array.isArray(root.liabilities) ? root.liabilities : [],
    other_financial_info: root.other_financial_info || '',
    spouses: (spouses || []).map((s, idx) => {
      const fin = byType.spouse[idx]?.data || {};
      return {
        first_name: s.first_name || '',
        other_names: s.other_names || '',
        surname: s.surname || '',
        biennial_income: Array.isArray(fin.biennial_income) ? fin.biennial_income : [],
        assets: Array.isArray(fin.assets) ? fin.assets : [],
        liabilities: Array.isArray(fin.liabilities) ? fin.liabilities : [],
        other_financial_info: fin.other_financial_info || ''
      };
    }),
    children: (children || []).map((c, idx) => {
      const fin = byType.child[idx]?.data || {};
      return {
        first_name: c.first_name || '',
        other_names: c.other_names || '',
        surname: c.surname || '',
        biennial_income: Array.isArray(fin.biennial_income) ? fin.biennial_income : [],
        assets: Array.isArray(fin.assets) ? fin.assets : [],
        liabilities: Array.isArray(fin.liabilities) ? fin.liabilities : [],
        other_financial_info: fin.other_financial_info || ''
      };
    }),
    witness_signed: !!witness?.signed,
    witness_name: witness?.name || '',
    witness_address: witness?.address || '',
    witness_phone: witness?.phone || ''
  };
  return payload;
}

const submissionTransformer = { modelToSubmissionPayload };
export default submissionTransformer;
