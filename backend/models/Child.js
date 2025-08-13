const pool = require('../config/db');
class Child {
  static async create(declaration_id, full_name, birthdate, school) {
    await pool.query(
      'INSERT INTO children (declaration_id, full_name, birthdate, school) VALUES (?, ?, ?, ?)',
      [declaration_id, full_name, birthdate, school]
    );
  }
  static async findByDeclarationId(declaration_id) {
    const [rows] = await pool.query('SELECT * FROM children WHERE declaration_id = ?', [declaration_id]);
    return rows;
  }
}
module.exports = Child;