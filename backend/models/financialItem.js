const pool = require('../config/db');

class FinancialItem {
  static async create({
    financial_declaration_id,
    item_type,
    description,
    value
  }) {
    // Validate item_type
    const allowedTypes = ['income', 'asset', 'liability'];
    const validType = allowedTypes.includes(item_type?.toLowerCase()) ? item_type.toLowerCase() : 'income';

    const [result] = await pool.query(
      `INSERT INTO financial_items (
        financial_declaration_id, item_type, description, value
      ) VALUES (?, ?, ?, ?)`,
      [
        financial_declaration_id,
        validType,
        description,
        value
      ]
    );
    // Return the inserted item including created_at
    const [rows] = await pool.query('SELECT * FROM financial_items WHERE id = ?', [result.insertId]);
    return rows[0];
  }

  static async findByFinancialDeclarationId(financial_declaration_id) {
    const [rows] = await pool.query('SELECT * FROM financial_items WHERE financial_declaration_id = ?', [financial_declaration_id]);
    return rows;
  }
}

module.exports = FinancialItem;
