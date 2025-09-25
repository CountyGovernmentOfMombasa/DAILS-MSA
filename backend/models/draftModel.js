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
  ,
  async getAllDrafts(userId) {
    const [rows] = await pool.query(
      `SELECT 
         id, 
         user_id, 
         form_type, 
         JSON_UNQUOTE(JSON_EXTRACT(data, '$.declarationId')) AS declaration_id,
         updated_at 
       FROM drafts 
       WHERE user_id = ? 
       ORDER BY updated_at DESC`,
      [userId]
    );
    return rows || [];
  },

  async deleteByIds(userId, ids) {
    if (!ids || ids.length === 0) return 0;
    const [result] = await pool.query(
      `DELETE FROM drafts WHERE user_id = ? AND id IN (${ids.map(()=>'?').join(',')})`,
      [userId, ...ids]
    );
    return result.affectedRows || 0;
  },

  async deleteByDeclarationIds(userId, declarationIds) {
    if (!declarationIds || declarationIds.length === 0) return 0;
    const [result] = await pool.query(
      `DELETE FROM drafts 
       WHERE user_id = ? 
         AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.declarationId')) IN (${declarationIds.map(()=>'?').join(',')})`,
      [userId, ...declarationIds]
    );
    return result.affectedRows || 0;
  }
};

module.exports = Draft;
