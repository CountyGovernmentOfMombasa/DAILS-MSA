// Frontend mirror of backend normalizeDeclarationType utility.
// Accepts various casings / partial spellings and maps to canonical values.
// Returns one of: 'First', 'Biennial', 'Final' or original input if not matched (caller should still validate).
export function normalizeDeclarationType(input) {
  if (!input) return '';
  const lower = String(input).trim().toLowerCase();
  if (lower.startsWith('bien')) return 'Biennial';
  if (lower === 'first') return 'First';
  if (lower === 'final') return 'Final';
  return input;
}
export default normalizeDeclarationType;
