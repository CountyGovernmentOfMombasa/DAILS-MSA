// Utility to fetch and (lightly) cache the current user record by ID.
// Provides a simple in-memory TTL cache to reduce repetitive lookups within short bursts.
// NOTE: This is process-local; in a multi-instance / clustered deployment, consider a shared cache.

const pool = require('../config/db');

const CACHE_TTL_MS = 60 * 1000; // 1 minute
const cache = new Map(); // id -> { user, expires }

async function getCurrentUser(id, { refresh = false } = {}) {
  if (!id) return null;
  if (!refresh) {
    const entry = cache.get(id);
    if (entry && entry.expires > Date.now()) {
      return entry.user; // May be null if previously not found
    }
  }
  try {
    const [rows] = await pool.query(
      'SELECT id, national_id, payroll_number, first_name, other_names, surname, email, phone_number, department, designation, birthdate, place_of_birth, marital_status FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    const user = rows[0] || null;
    cache.set(id, { user, expires: Date.now() + CACHE_TTL_MS });
    return user;
  } catch (e) {
    console.error('getCurrentUser DB error:', e.message);
    return null;
  }
}

module.exports = getCurrentUser;
