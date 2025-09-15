const pool = require('../config/db');

const Declaration = {
  // Create new declaration
  async create(declarationData) {
    const {
      user_id,
      department,
      marital_status,
      declaration_date,
      annual_income,
      assets,
      liabilities,
      other_financial_info,
      signature_path,
      witness_signed,
      witness_name,
      witness_address,
      declaration_type,
      status = 'pending',
      correction_message = null
    } = declarationData;

    // Store annual_income as JSON string
    const annualIncomeJson = (typeof annual_income === 'string') ? annual_income : JSON.stringify(annual_income || []);
    const assetsJson = (typeof assets === 'object') ? JSON.stringify(assets) : assets;
    const liabilitiesJson = (typeof liabilities === 'object') ? JSON.stringify(liabilities) : liabilities;

    const [result] = await pool.query(
      `INSERT INTO declarations (
        user_id,
        marital_status,
        declaration_date,
        annual_income,
        assets,
        liabilities,
        other_financial_info,
        signature_path,
        witness_signed,
        witness_name,
        witness_address,
        declaration_type,
        status,
        correction_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        marital_status,
        declaration_date,
        annualIncomeJson,
        assetsJson,
        liabilitiesJson,
        other_financial_info,
        signature_path,
        witness_signed,
        witness_name,
        witness_address,
        declaration_type,
        status,
        correction_message
      ]
    );

    // Return the full declaration including created_at and updated_at
    const [rows] = await pool.query(
      'SELECT * FROM declarations WHERE id = ?',
      [result.insertId]
    );
    return rows[0];
  },

  // Create spouse records
  async createSpouses(declarationId, spouses) {
    if (!spouses || spouses.length === 0) return;
    // Store annual_income as JSON string
    const values = spouses.map(spouse => {
      const fullName = spouse.full_name || `${spouse.first_name || ''} ${spouse.surname || ''} ${spouse.other_names || ''}`.trim();
      const incomeJson = (typeof spouse.annual_income === 'string') ? spouse.annual_income : JSON.stringify(spouse.annual_income || []);
      return [
        declarationId,
        spouse.first_name,
        spouse.other_names,
        spouse.surname,
        fullName,
        incomeJson,
        spouse.assets ? JSON.stringify(spouse.assets) : '[]',
        spouse.liabilities ? JSON.stringify(spouse.liabilities) : '[]',
        spouse.other_financial_info || ''
      ];
    });
    await pool.query(
      `INSERT INTO spouses (
        declaration_id,
        first_name,
        other_names,
        surname,
        full_name,
        annual_income,
        assets,
        liabilities,
        other_financial_info
      ) VALUES ?`,
      [values]
    );
  },

  // Create children records
  async createChildren(declarationId, children) {
    if (!children || children.length === 0) return;
    // Store annual_income as JSON string
    const values = children.map(child => {
      const fullName = child.full_name || `${child.first_name || ''} ${child.other_names || ''} ${child.surname || ''}`.trim();
      const incomeJson = (typeof child.annual_income === 'string') ? child.annual_income : JSON.stringify(child.annual_income || []);
      return [
        declarationId,
        child.first_name,
        child.other_names,
        child.surname,
        fullName,
        incomeJson,
        child.assets ? JSON.stringify(child.assets) : '[]',
        child.liabilities ? JSON.stringify(child.liabilities) : '[]',
        child.other_financial_info || ''
      ];
    });
    await pool.query(
      `INSERT INTO children (
        declaration_id,
        first_name,
        other_names,
        surname,
        full_name,
        annual_income,
        assets,
        liabilities,
        other_financial_info
      ) VALUES ?`,
      [values]
    );
  },

  // Get all declarations for user
  async findByUserId(userId) {
    const [rows] = await pool.query(
      `SELECT 
        d.id,
        d.marital_status,
        d.declaration_type,
        d.declaration_date,
        d.annual_income,
        d.assets,
        d.liabilities,
        d.other_financial_info,
        d.signature_path,
        d.status,
        d.correction_message,
        DATE_FORMAT(d.submitted_at, '%d/%m/%Y %H:%i') as submitted_at,
        (SELECT COUNT(*) FROM spouses WHERE declaration_id = d.id) as spouse_count,
        (SELECT COUNT(*) FROM children WHERE declaration_id = d.id) as children_count
       FROM declarations d
       WHERE user_id = ?
       ORDER BY d.submitted_at DESC`,
      [userId]
    );
    return rows;
  },

  // Get declaration by ID with all details
  async findByIdWithDetails(declarationId) {
    // Get declaration
    const [declarations] = await pool.query(
      `SELECT 
        d.*,
        DATE_FORMAT(d.declaration_date, '%d/%m/%Y') as formatted_declaration_date,
        DATE_FORMAT(d.submitted_at, '%d/%m/%Y %H:%i') as formatted_submitted_at,
        u.first_name,
        u.other_names,
        u.surname,
        u.payroll_number,
        u.department,
        d.status,
        d.correction_message
       FROM declarations d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = ?`,
      [declarationId]
    );

    if (declarations.length === 0) return null;

    const declaration = declarations[0];

    // Get spouses
    const [spouses] = await pool.query(
      `SELECT 
        id,
        first_name,
        other_names,
        surname,
        full_name,
        occupation
       FROM spouses
       WHERE declaration_id = ?`,
      [declarationId]
    );

    // Get children
    const [children] = await pool.query(
      `SELECT 
        id,
        first_name,
        other_names,
        surname,
        full_name
       FROM children
       WHERE declaration_id = ?`,
      [declarationId]
    );

    return {
      ...declaration,
      spouses,
      children
    };
  },

  // Get all declarations (for admin)
  async findAll() {
    const [rows] = await pool.query(
      `SELECT 
        d.id,
        d.user_id,
        CONCAT(u.first_name, ' ', u.other_names, ' ', u.surname) as user_name,
        u.payroll_number,
        u.department,
        d.marital_status,
        DATE_FORMAT(d.declaration_date, '%d/%m/%Y') as declaration_date,
        d.annual_income,
        d.assets,
        d.liabilities,
        d.status,
        d.correction_message,
        DATE_FORMAT(d.submitted_at, '%d/%m/%Y %H:%i') as submitted_at,
        (SELECT COUNT(*) FROM spouses WHERE declaration_id = d.id) as spouse_count,
        (SELECT COUNT(*) FROM children WHERE declaration_id = d.id) as children_count
       FROM declarations d
       JOIN users u ON d.user_id = u.id
       ORDER BY d.submitted_at DESC`
    );
    return rows;

  },

  // Admin: update declaration status
  async updateStatus(declarationId, status, correctionMessage = null) {
    const [result] = await pool.query(
      'UPDATE declarations SET status = ?, correction_message = ? WHERE id = ?',
      [status, correctionMessage, declarationId]
    );
    return result;
  }
};

module.exports = Declaration;