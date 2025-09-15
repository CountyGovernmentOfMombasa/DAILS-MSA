const pool = require('../config/db');

const Draft = {
  async saveDraft(userId, formType, data) {
    // Upsert draft for user and formType
    const [result] = await pool.query(
      `INSERT INTO drafts (user_id, form_type, data, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()`,
      [userId, formType, JSON.stringify(data)]
    );
    return result;
  },

  async getDraft(userId, formType) {
    const [rows] = await pool.query(
      'SELECT * FROM drafts WHERE user_id = ? AND form_type = ?',
      [userId, formType]
    );
    return rows[0] || null;
  }
};

module.exports = Draft;
