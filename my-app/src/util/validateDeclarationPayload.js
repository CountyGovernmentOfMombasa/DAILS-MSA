// Validates a declaration submission payload before sending to backend.
// Returns { valid: boolean, errors: string[] }.
// Currently enforces: declaration_type must be in allowed set if present.
import { normalizeDeclarationType } from './normalizeDeclarationType';

const ALLOWED_TYPES = ['First', 'Biennial', 'Final'];

export function validateDeclarationPayload(payload) {
  const errors = [];
  if (!payload) {
    return { valid: false, errors: ['No payload supplied'] };
  }
  const normalized = normalizeDeclarationType(payload.declaration_type || '');
  if (!normalized || !ALLOWED_TYPES.includes(normalized)) {
    errors.push('Invalid declaration_type. Allowed: First, Biennial, Final.');
  }
  // Required core dates
  if (!payload.declaration_date) errors.push('Declaration date is required.');
  if (!payload.period_start_date) errors.push('Period start date is required.');
  if (!payload.period_end_date) errors.push('Period end date is required.');
  // Biennial window rule (client mirror) if type is Biennial and dates parse
  if (normalized === 'Biennial' && payload.declaration_date) {
    const d = new Date(payload.declaration_date);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const inWindow = year >= 2025 && year % 2 === 1 && ((month === 11 && day >= 1) || (month === 12 && day <= 31));
      if (!inWindow) errors.push('Biennial declaration only allowed Nov 1 - Dec 31 of an odd year starting 2025.');
    }
  }
  return { valid: errors.length === 0, errors, normalizedType: normalized };
}

export default validateDeclarationPayload;
