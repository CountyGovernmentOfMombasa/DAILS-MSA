const pool = require('../config/db');

class Spouse {
  static async create(declaration_id, full_name, birthdate, occupation, employer, annual_income) {
    await pool.query(
      'INSERT INTO spouses (declaration_id, full_name, birthdate, occupation, employer, annual_income) VALUES (?, ?, ?, ?, ?, ?)',
      [declaration_id, full_name, birthdate, occupation, employer, annual_income]
    );
  }

  static async findByDeclarationId(declaration_id) {
    const [rows] = await pool.query('SELECT * FROM spouses WHERE declaration_id = ?', [declaration_id]);
    return rows;
  }
}
module.exports = Spouse;