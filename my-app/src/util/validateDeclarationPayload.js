// Validates a declaration submission payload before sending to backend.
// Returns { valid: boolean, errors: string[] }.
// Currently enforces: declaration_type must be in allowed set if present.
import { normalizeDeclarationType } from './normalizeDeclarationType';

const ALLOWED_TYPES = ['First', 'Biennial', 'Final'];

export function validateDeclarationPayload(payload, opts = {}) {
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
      const window = opts?.window;
      if (window && window.start_date && window.end_date) {
        const start = new Date(window.start_date);
        const end = new Date(window.end_date);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
          errors.push('Invalid configured biennial window.');
        } else if (!(d >= start && d <= end)) {
          errors.push('Biennial declaration only allowed within the configured window.');
        }
      } else {
        errors.push('Biennial declarations are currently closed.');
      }
    }
  }
  return { valid: errors.length === 0, errors, normalizedType: normalized };
}

export default validateDeclarationPayload;
