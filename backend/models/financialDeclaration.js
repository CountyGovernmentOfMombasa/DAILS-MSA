const pool = require('../config/db');

class FinancialDeclaration {
  static async create({
    declaration_id,
    member_type,
    member_name,
    declaration_date,
    period_start_date,
    period_end_date,
    other_financial_info
  }) {
    // Validate member_type
    const allowedTypes = ['user', 'spouse', 'child'];
    const validType = allowedTypes.includes(member_type?.toLowerCase()) ? member_type.toLowerCase() : 'user';

    const [result] = await pool.query(
      `INSERT INTO financial_declarations (
        declaration_id, member_type, member_name, declaration_date, period_start_date, period_end_date, other_financial_info
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        declaration_id,
        validType,
        member_name,
        declaration_date,
        period_start_date,
        period_end_date,
        other_financial_info
      ]
    );
    // Return the inserted record including created_at and updated_at
    const [rows] = await pool.query('SELECT * FROM financial_declarations WHERE id = ?', [result.insertId]);
    return rows[0];
  }

  static async findByDeclarationId(declaration_id) {
    const [rows] = await pool.query('SELECT * FROM financial_declarations WHERE declaration_id = ?', [declaration_id]);
    return rows;
  }
}

module.exports = FinancialDeclaration;
