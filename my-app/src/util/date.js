// Shared date normalization utilities
// Converts various incoming date string formats (DD/MM/YYYY, MM-DD-YYYY, etc.) to ISO YYYY-MM-DD.
// Returns empty string for invalid or placeholder dates.
export function toISODate(dateStr) {
  if (!dateStr) return '';
  if (dateStr === '0000-00-00') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr; // already ISO
  const parts = String(dateStr).split(/[/-]/);
  if (parts.length === 3) {
    // Detect year-first vs year-last
    if (parts[0].length === 4) {
      const [y,m,d] = parts; return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    if (parts[2].length === 4) {
      const [d,m,y] = parts; return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
  }
  const dt = new Date(dateStr);
  if (!isNaN(dt)) return dt.toISOString().slice(0,10);
  return '';
}

const dateUtils = { toISODate };
export default dateUtils;