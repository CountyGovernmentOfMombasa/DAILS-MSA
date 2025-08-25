const pool = require('../config/db');

class Spouse {
  static async create(declaration_id, first_name, last_name, full_name, occupation) {
    const [result] = await pool.query(
      'INSERT INTO spouses (declaration_id, first_name, last_name, full_name, occupation) VALUES (?, ?, ?, ?, ?)',
      [declaration_id, first_name, last_name, full_name, occupation]
    );
    // Return the inserted spouse including created_at
    const [rows] = await pool.query('SELECT * FROM spouses WHERE id = ?', [result.insertId]);
    return rows[0];
  }

  static async findByDeclarationId(declaration_id) {
    const [rows] = await pool.query('SELECT * FROM spouses WHERE declaration_id = ?', [declaration_id]);
    return rows;
  }
}
module.exports = Spouse;