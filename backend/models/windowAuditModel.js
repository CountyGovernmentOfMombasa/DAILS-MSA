const pool = require('../config/db');

async function logWindowAudit({ action, actor_admin_id = null, target, target_id = null, before = null, after = null }) {
  try {
    await pool.query(
      'INSERT INTO declaration_window_audit (action, actor_admin_id, target, target_id, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?)',
      [action, actor_admin_id, target, target_id, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null]
    );
    return true;
  } catch (e) {
    console.warn('logWindowAudit failed:', e.message);
    return false;
  }
}

async function listWindowAudit() {
  const [rows] = await pool.query('SELECT * FROM declaration_window_audit ORDER BY id DESC LIMIT 500');
  return rows;
}

module.exports = { logWindowAudit, listWindowAudit };
