// Model for application-wide settings (declaration locks)
const pool = require('../config/db');

const getDeclarationLocks = async () => {
  const [rows] = await pool.query('SELECT * FROM settings LIMIT 1');
  if (!rows.length) {
    // If no settings row exists, create one with defaults
    await pool.query('INSERT INTO settings (biennial_declaration_locked, first_declaration_locked, final_declaration_locked) VALUES (0,0,0)');
    return {
      biennial_declaration_locked: 0,
      first_declaration_locked: 0,
      final_declaration_locked: 0
    };
  }
  return rows[0];
};

const setDeclarationLock = async (type, value) => {
  const allowed = ['biennial_declaration_locked', 'first_declaration_locked', 'final_declaration_locked'];
  if (!allowed.includes(type)) throw new Error('Invalid lock type');
  await pool.query(`UPDATE settings SET ${type} = ?`, [value ? 1 : 0]);
};

module.exports = {
  getDeclarationLocks,
  setDeclarationLock
};
