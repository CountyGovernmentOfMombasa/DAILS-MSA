// Models for configurable declaration windows and per-user/declaration edit overrides
const pool = require('../config/db');

async function ensureTables() {
  // Create windows table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS biennial_windows (
      id INT AUTO_INCREMENT PRIMARY KEY,
      year INT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      notes VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_year (year),
      INDEX idx_active (active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Create overrides table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS declaration_edit_overrides (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(20) NOT NULL,
      user_id INT NULL,
      declaration_id INT NULL,
      allow_from DATETIME NULL,
      allow_until DATETIME NULL,
      allow TINYINT(1) NOT NULL DEFAULT 1,
      reason VARCHAR(255) NULL,
      created_by_admin_id INT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_type_active (type, active),
      INDEX idx_decl (declaration_id),
      INDEX idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Create audit table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS declaration_window_audit (
      id INT AUTO_INCREMENT PRIMARY KEY,
      action VARCHAR(50) NOT NULL,
      actor_admin_id INT NULL,
      target VARCHAR(50) NOT NULL, -- 'window' or 'override'
      target_id INT NULL,
      before_json JSON NULL,
      after_json JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function getBiennialWindowForYear(year) {
  try {
    await ensureTables();
    // Prefer year-specific active window
    const [rowsY] = await pool.query('SELECT * FROM biennial_windows WHERE active=1 AND year = ? ORDER BY id DESC LIMIT 1', [year]);
    if (rowsY.length) return rowsY[0];
    // Fallback to global (year is NULL)
    const [rowsG] = await pool.query('SELECT * FROM biennial_windows WHERE active=1 AND year IS NULL ORDER BY id DESC LIMIT 1');
    if (rowsG.length) return rowsG[0];
    return null;
  } catch (e) {
    // Table may not exist on older deployments; let caller fallback
    return null;
  }
}

async function upsertBiennialWindow({ year = null, start_date, end_date, active = true, notes = null }) {
  await ensureTables();
  if (!start_date || !end_date) throw new Error('start_date and end_date are required');
  // If year provided, try update existing active row for that year; else insert
  const [existing] = await pool.query('SELECT id FROM biennial_windows WHERE ' + (year === null ? 'year IS NULL' : 'year = ?') + ' LIMIT 1', year === null ? [] : [year]);
  if (existing.length) {
    const id = existing[0].id;
    await pool.query('UPDATE biennial_windows SET start_date=?, end_date=?, active=?, notes=? WHERE id=?', [start_date, end_date, active ? 1 : 0, notes, id]);
    return id;
  } else {
    const [ins] = await pool.query('INSERT INTO biennial_windows (year, start_date, end_date, active, notes) VALUES (?, ?, ?, ?, ?)', [year, start_date, end_date, active ? 1 : 0, notes]);
    return ins.insertId;
  }
}

async function listBiennialWindows() {
  await ensureTables();
  const [rows] = await pool.query('SELECT * FROM biennial_windows ORDER BY COALESCE(year, 9999) ASC, id DESC');
  return rows;
}

async function addEditOverride({ type, user_id = null, declaration_id = null, allow_from = null, allow_until = null, allow = true, reason = null, created_by_admin_id = null, active = true }) {
  await ensureTables();
  if (!type) throw new Error('type is required');
  const [ins] = await pool.query(
    'INSERT INTO declaration_edit_overrides (type, user_id, declaration_id, allow_from, allow_until, allow, reason, created_by_admin_id, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [type, user_id, declaration_id, allow_from, allow_until, allow ? 1 : 0, reason, created_by_admin_id, active ? 1 : 0]
  );
  return ins.insertId;
}

async function listOverrides({ type = null, active = null } = {}) {
  await ensureTables();
  const where = [];
  const params = [];
  if (type) { where.push('type = ?'); params.push(type); }
  if (active !== null) { where.push('active = ?'); params.push(active ? 1 : 0); }
  const sql = 'SELECT * FROM declaration_edit_overrides' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY id DESC';
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function deactivateOverride(id) {
  await ensureTables();
  await pool.query('UPDATE declaration_edit_overrides SET active = 0 WHERE id = ?', [id]);
}

async function findActiveOverride({ type, declaration_id, user_id, now = new Date() }) {
  try {
    await ensureTables();
  } catch {
    return null;
  }
  const where = ['type = ?', 'active = 1'];
  const params = [type];
  if (declaration_id) { where.push('declaration_id = ?'); params.push(declaration_id); }
  if (user_id) { where.push('user_id = ?'); params.push(user_id); }
  const [rows] = await pool.query('SELECT * FROM declaration_edit_overrides WHERE ' + where.join(' AND ') + ' ORDER BY id DESC', params);
  if (!rows.length) return null;
  // Determine if any row currently allows edits
  for (const r of rows) {
    if (!r.allow) continue;
    const fromOk = !r.allow_from || now >= new Date(r.allow_from);
    const untilOk = !r.allow_until || now <= new Date(r.allow_until);
    if (fromOk && untilOk) return r;
  }
  return null;
}

module.exports = {
  getBiennialWindowForYear,
  upsertBiennialWindow,
  listBiennialWindows,
  addEditOverride,
  listOverrides,
  deactivateOverride,
  findActiveOverride
};
