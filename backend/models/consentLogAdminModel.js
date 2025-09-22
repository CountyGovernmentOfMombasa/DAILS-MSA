const db = require('../config/db');

// Fetch consent logs with pagination and optional search
async function getConsentLogs({ page = 1, pageSize = 20, search = '' }) {
  const offset = (page - 1) * pageSize;
  let where = '';
  let params = [];
  if (search) {
    where = `WHERE full_name LIKE ? OR national_id LIKE ? OR designation LIKE ?`;
    params = [`%${search}%`, `%${search}%`, `%${search}%`];
  }
  const [rows] = await db.execute(
    `SELECT id, full_name, national_id, designation, signed, submitted_at FROM consent_logs ${where} ORDER BY submitted_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const [[{ count }]] = await db.execute(
    `SELECT COUNT(*) as count FROM consent_logs ${where}`,
    params
  );
  return { logs: rows, total: count };
}

module.exports = {
  getConsentLogs,
};
