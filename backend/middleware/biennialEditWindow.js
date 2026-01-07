// middleware/biennialEditWindow.js
// Blocks edits to Biennial declarations outside admin-configured windows (or explicit period on record)

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

// Legacy calendar checks removed – only configured windows or explicit periods apply

module.exports = async function biennialEditWindow(req, res, next) {
  try {
    const id = req.params.id;
    const userId = req.user?.id;
    if (!id || !userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    // Fetch declaration type and date
    const [rows] = await pool.query(
      'SELECT declaration_type, declaration_date, period_start_date, period_end_date FROM declarations WHERE id = ? AND user_id = ? LIMIT 1',
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

    const now = new Date();
    // Check for per-declaration/user override first
    const override = await findActiveOverride({ type: 'biennial_edit', declaration_id: Number(id), user_id: Number(userId), now });
    if (override && override.allow) {
      return next();
    }

    // Prefer explicit period window on the record if present and valid
    const pStart = parseIsoOrDmy(row.period_start_date);
    const pEnd = parseIsoOrDmy(row.period_end_date);
    if (pStart && pEnd && pEnd >= pStart) {
      if (!(now >= pStart && now <= pEnd)) {
        return res.status(403).json({ success: false, message: 'Editing Biennial declarations is only allowed within the configured declaration period.' });
      }
      return next();
    }

    // Then check global/year-specific admin-configured windows
    const yearGuessDate = parseIsoOrDmy(row.declaration_date) || now; // fallback to now for year
    const windowRow = await getBiennialWindowForYear(yearGuessDate.getFullYear());
    if (windowRow) {
      const wStart = parseIsoOrDmy(windowRow.start_date);
      const wEnd = parseIsoOrDmy(windowRow.end_date);
      if (wStart && wEnd && wEnd >= wStart) {
        if (!(now >= wStart && now <= wEnd)) {
          return res.status(403).json({ success: false, message: 'Editing Biennial declarations is only allowed within the active biennial window.' });
        }
        return next();
      }
    }
    // No configured window: deny edits by default
    return res.status(403).json({ success: false, message: 'Editing Biennial declarations is currently closed.' });
  } catch (err) {
    console.error('biennialEditWindow error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error enforcing biennial edit window' });
  }
};
