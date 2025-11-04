const db = require('../config/db');

// Internal: create consent_logs table if missing (idempotent)
async function ensureConsentLogsTable() {
  const createSql = `CREATE TABLE IF NOT EXISTS consent_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    national_id VARCHAR(100) NOT NULL,
    designation VARCHAR(255) NOT NULL,
    signed TINYINT(1) NOT NULL,
    submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`;
  await db.query(createSql);
}

// Fetch consent logs with pagination and optional search
async function getConsentLogs({ page = 1, pageSize = 20, search = '' }) {
  const offset = (Number(page) - 1) * Number(pageSize);
  let where = '';
  let params = [];
  if (search) {
    where = `WHERE full_name LIKE ? OR national_id LIKE ? OR designation LIKE ?`;
    params = [`%${search}%`, `%${search}%`, `%${search}%`];
  }

  try {
    const [rows] = await db.execute(
      `SELECT id, full_name, national_id, designation, signed, submitted_at FROM consent_logs ${where} ORDER BY submitted_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(pageSize), offset]
    );
    const [countRows] = await db.execute(
      `SELECT COUNT(*) as count FROM consent_logs ${where}`,
      params
    );
    const total = (countRows && countRows[0] && countRows[0].count) ? countRows[0].count : 0;
    return { logs: rows, total };
  } catch (err) {
    // If table is missing, create it on-the-fly and return empty result to avoid admin UI breakage
    if (err && (err.code === 'ER_NO_SUCH_TABLE' || /doesn\'t exist/i.test(err.message || ''))) {
      console.warn('consent_logs table missing. Creating it now and returning empty dataset.');
      try {
        await ensureConsentLogsTable();
        return { logs: [], total: 0 };
      } catch (createErr) {
        console.error('Failed to create consent_logs table:', createErr);
      }
    }
    throw err;
  }
}

module.exports = {
  getConsentLogs,
};
