// Shared date normalization utilities
const APP_TIMEZONE = "Africa/Nairobi"; // EAT

// Converts various incoming date string formats (DD/MM/YYYY, MM-DD-YYYY, etc.) to ISO YYYY-MM-DD.
// Returns empty string for invalid or placeholder dates.
export function toISODate(dateStr) {
  if (!dateStr) return "";
  if (dateStr === "0000-00-00") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr; // already ISO
  const parts = String(dateStr).split(/[/-]/);
  if (parts.length === 3) {
    // Detect year-first vs year-last
    if (parts[0].length === 4) {
      const [y, m, d] = parts;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    if (parts[2].length === 4) {
      const [d, m, y] = parts;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }
  const dt = new Date(dateStr);
  if (!isNaN(dt)) return dt.toISOString().slice(0, 10);
  return "";
}

/**
 * Formats a date string or Date object into a locale-specific string using the application's target timezone (EAT).
 * @param {string | Date} dateInput The date to format.
 * @returns {string} The formatted date string, or an empty string if input is invalid.
 */
export function formatToAppTimezone(dateInput) {
  if (!dateInput) return "";
  try {
    return new Date(dateInput).toLocaleString("en-GB", {
      timeZone: APP_TIMEZONE,
    });
  } catch {
    return String(dateInput);
  }
}

const dateUtils = { toISODate, formatToAppTimezone };
export default dateUtils;
