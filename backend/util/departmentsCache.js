const pool = require('../config/db');
let cache = null;
let cacheTime = 0;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

async function loadFromDb() {
  try {
    const [deps] = await pool.query('SELECT id,name FROM departments ORDER BY name');
    const [subs] = await pool.query('SELECT department_id,name FROM sub_departments');
    const map = {};
    for (const d of deps) { map[d.name] = []; }
    for (const s of subs) {
      const dep = deps.find(d => d.id === s.department_id);
      if (dep) map[dep.name].push(s.name);
    }
    // Where a department has no subs, replicate department name as single sub for backwards compatibility
    for (const d of deps) { if (!map[d.name].length) map[d.name] = [d.name]; }
    return { departments: deps.map(d => d.name), subDepartmentMap: map };
  } catch (e) {
    // Fallback to static enums if DB not ready
    try {
      const { DEPARTMENTS, SUB_DEPARTMENT_MAP } = require('../models/enums');
      return { departments: DEPARTMENTS, subDepartmentMap: SUB_DEPARTMENT_MAP };
    } catch { return { departments: [], subDepartmentMap: {} }; }
  }
}

async function getDepartmentConfig(force = false) {
  const now = Date.now();
  if (!force && cache && (now - cacheTime) < TTL_MS) return cache;
  cache = await loadFromDb();
  cacheTime = now;
  return cache;
}

module.exports = { getDepartmentConfig };