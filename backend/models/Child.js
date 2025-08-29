const pool = require('../config/db');
class Child {
  static async create(declaration_id, first_name, other_names, surname, full_name) {
    const [result] = await pool.query(
      'INSERT INTO children (declaration_id, first_name, other_names, surname, full_name) VALUES (?, ?, ?, ?, ?)',
      [declaration_id, first_name, other_names, surname, full_name]
    );
    // Return the inserted child including created_at
    const [rows] = await pool.query('SELECT * FROM children WHERE id = ?', [result.insertId]);
    return rows[0];
  }
  static async findByDeclarationId(declaration_id) {
    const [rows] = await pool.query('SELECT * FROM children WHERE declaration_id = ?', [declaration_id]);
    return rows;
  }
}
module.exports = Child;