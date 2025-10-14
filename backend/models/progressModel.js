const pool = require('../config/db');

const Progress = {
  async upsert(userId, userKey, data) {
    const [result] = await pool.query(
      `INSERT INTO user_progress (user_id, user_key, data, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()`,
      [userId, userKey, JSON.stringify(data)]
    );
    return result;
  },
  async get(userId, userKey) {
    const [rows] = await pool.query(
      'SELECT id, user_id, user_key, data, updated_at FROM user_progress WHERE user_id = ? AND user_key = ?',
      [userId, userKey]
    );
    return rows[0] || null;
  },
  async latest(userId) {
    const [rows] = await pool.query(
      'SELECT id, user_id, user_key, data, updated_at FROM user_progress WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
      [userId]
    );
    return rows[0] || null;
  },
  async remove(userId, userKey) {
    const [result] = await pool.query(
      'DELETE FROM user_progress WHERE user_id = ? AND user_key = ? LIMIT 1',
      [userId, userKey]
    );
    return result;
  }
};

module.exports = Progress;