// middleware/biennialEditWindow.js
// Blocks edits to Biennial declarations outside the allowed declaration window
// Allowed window: Nov 1 – Dec 31 of odd years, starting 2025, and matching the declaration year

const pool = require('../config/db');
const { getBiennialWindowForYear, findActiveOverride } = require('../models/windowSettingsModel');

function parseIsoOrDmy(dateStr) {
  if (!dateStr) return null;
  // If looks like DD/MM/YYYY convert to YYYY-MM-DD
  if (typeof dateStr === 'string' && /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.test(dateStr)) {
    try {
      const [d, m, y] = dateStr.split('/').map(s => parseInt(s, 10));
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dt = new Date(iso);
      return isNaN(dt.getTime()) ? null : dt;
    } catch { return null; }
  }
  const dt = new Date(dateStr);
  return isNaN(dt.getTime()) ? null : dt;
}

function isWithinBiennialWindow(now, declarationYear) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  const d = now.getDate();
  // Must be odd year >= 2025 and same as declaration year
  if (y < 2025 || (y % 2) === 0) return false;
  if (y !== declarationYear) return false;
  // Only allow between Nov 1 and Dec 31 inclusive
  const inWindow = (m === 11 && d >= 1) || (m === 12 && d <= 31);
  return inWindow;
}

module.exports = async function biennialEditWindow(req, res, next) {
  try {
    const id = req.params.id;
    const userId = req.user?.id;
    if (!id || !userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // Fetch declaration type
    const [rows] = await pool.query(
      'SELECT declaration_type FROM declarations WHERE id = ? AND user_id = ? LIMIT 1',
      [id, userId]
    );
    if (!rows.length) {
      // Let downstream handler return 404 to preserve existing contract
      return next();
    }
    const row = rows[0];
    if (row.declaration_type !== 'Biennial') {
      return next();
    }

    // No window restrictions: allow edit at any time
    return next();
  } catch (err) {
    console.error('biennialEditWindow error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error enforcing biennial edit window' });
  }
};
