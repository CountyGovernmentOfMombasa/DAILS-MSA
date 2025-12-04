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
  // Proactively ensure table exists (idempotent, inexpensive compared to failing later)
  try {
    await ensureConsentLogsTable();
  } catch (e) {
    console.error('Failed ensuring consent_logs table before query:', e.message);
    // Continue; subsequent queries may still surface the underlying issue
  }
  const offset = (Number(page) - 1) * Number(pageSize);

  // --- New Robust Query Building ---
  const selectParts = ['SELECT id, full_name, national_id, designation, signed, submitted_at FROM consent_logs'];
  const countParts = ['SELECT COUNT(*) as count FROM consent_logs'];
  const queryParams = [];

  if (search) {
    const whereClause = `WHERE full_name LIKE ? OR national_id LIKE ? OR designation LIKE ?`;
    selectParts.push(whereClause);
    countParts.push(whereClause);
    const searchTerm = `%${search}%`;
    queryParams.push(searchTerm, searchTerm, searchTerm);
  }

  try {
    let rows, countRows;

    // Declare SQL and params here to make them accessible in the catch block
    let selectSql, selectParams;

    try {
      // Finalize and execute the SELECT query
      selectParts.push('ORDER BY submitted_at DESC LIMIT ? OFFSET ?');
      selectSql = selectParts.join(' ');
      selectParams = [...queryParams, Number(pageSize), Number(offset)];
      [rows] = await db.query(selectSql, selectParams);
    } catch (qErr) {
      console.error('[CONSENT_LOGS][QUERY_FAIL] select rows', {
        code: qErr.code,
        message: qErr.message,
        sql: selectSql || selectParts.join(' '), // Use declared variable, fallback for safety
        params: selectParams,
      });
      throw qErr;
    }
    try {
      // Finalize and execute the COUNT query
      const countSql = countParts.join(' ');
      [countRows] = await db.query(countSql, queryParams);
    } catch (cErr) {
      console.error('[CONSENT_LOGS][QUERY_FAIL] count rows', {
        code: cErr.code,
        message: cErr.message,
        sql: countParts.join(' '),
        params: queryParams
      });
      throw cErr;
    }
    const total = countRows?.[0]?.count || 0;
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
