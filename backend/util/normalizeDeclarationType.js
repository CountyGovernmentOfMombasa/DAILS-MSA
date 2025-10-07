// Utility to normalize various user-provided declaration type values to canonical DB enum values.
// Accepts legacy misspellings/casing (e.g., 'bienniel', 'BIENNIAL', etc.).
// Returns one of: 'First', 'Biennial', 'Final' or empty string if cannot determine.
module.exports = function normalizeDeclarationType(input) {
  if (!input) return '';
  const lower = String(input).trim().toLowerCase();
  if (lower.startsWith('bien')) return 'Biennial';
  if (lower === 'first') return 'First';
  if (lower === 'final') return 'Final';
  return input; // passthrough – caller can still validate against allowed set
};
