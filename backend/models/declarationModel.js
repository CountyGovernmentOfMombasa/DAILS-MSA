const pool = require('../config/db');

const Declaration = {
  // Create new declaration
  async create(declarationData) {
    const {
      user_id,
      department,
      marital_status,
      declaration_date,
      period_start_date,
      period_end_date,
      biennial_income,
      assets,
      liabilities,
      other_financial_info,
      signature_path,
      witness_signed,
      witness_name,
      witness_address,
      witness_phone,
      declaration_type,
      status = 'pending',
      correction_message = null
    } = declarationData;

  // Store biennial_income as JSON string
    const normalizeFinArray = (val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') { try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
      return [];
    };
    const biennialIncomeJson = (typeof biennial_income === 'string') ? biennial_income : JSON.stringify(normalizeFinArray(biennial_income));
    const assetsJson = JSON.stringify(normalizeFinArray(assets));
    const liabilitiesJson = JSON.stringify(normalizeFinArray(liabilities));

    const [result] = await pool.query(
      `INSERT INTO declarations (
        user_id,
        marital_status,
        declaration_date,
        period_start_date,
        period_end_date,
        biennial_income,
        assets,
        liabilities,
        other_financial_info,
        signature_path,
        witness_signed,
        witness_name,
        witness_address,
        witness_phone,
        declaration_type,
        status,
        correction_message
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        marital_status,
        declaration_date,
        period_start_date || null,
        period_end_date || null,
        biennialIncomeJson,
        assetsJson,
        liabilitiesJson,
        other_financial_info,
        signature_path,
        witness_signed,
        witness_name,
        witness_address,
        witness_phone,
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
    // Store biennial_income as JSON string
    const values = spouses.map(spouse => {
      const fullName = spouse.full_name || `${spouse.first_name || ''} ${spouse.surname || ''} ${spouse.other_names || ''}`.trim();
      const incomeJson = (typeof spouse.biennial_income === 'string') ? spouse.biennial_income : JSON.stringify(spouse.biennial_income || []);
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
        biennial_income,
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
    // Store biennial_income as JSON string
    const values = children.map(child => {
      const fullName = child.full_name || `${child.first_name || ''} ${child.other_names || ''} ${child.surname || ''}`.trim();
      const incomeJson = (typeof child.biennial_income === 'string') ? child.biennial_income : JSON.stringify(child.biennial_income || []);
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
        biennial_income,
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
  d.biennial_income,
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
        u.sub_department,
        u.phone_number,
        u.designation,
        u.national_id,
        DATE_FORMAT(u.birthdate, '%d/%m/%Y') as birthdate,
        u.email,
        u.place_of_birth,
        u.postal_address,
        u.physical_address,
        u.nature_of_employment,
        d.status,
        d.correction_message
       FROM declarations d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = ?`,
      [declarationId]
    );

    if (declarations.length === 0) return null;

    const declaration = declarations[0];

    // Get spouses (include financial fields for admin details view)
    const [spouses] = await pool.query(
      `SELECT 
        id,
        first_name,
        other_names,
        surname,
        full_name,
        biennial_income,
        assets,
        liabilities,
        other_financial_info
       FROM spouses
       WHERE declaration_id = ?`,
      [declarationId]
    );

    // Get children (include financial fields for admin details view)
    const [children] = await pool.query(
      `SELECT 
        id,
        first_name,
        other_names,
        surname,
        full_name,
        biennial_income,
        assets,
        liabilities,
        other_financial_info
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
        u.payroll_number AS payroll_number,
        u.first_name AS first_name,
        u.other_names AS other_names,
        u.surname AS surname,
        u.email AS email,
        u.phone_number AS phone_number,
        u.department AS department,
        u.sub_department AS sub_department,
        u.designation AS designation,
        u.national_id AS national_id,
        DATE_FORMAT(u.birthdate, '%Y-%m-%d') AS birthdate,
        u.place_of_birth AS place_of_birth,
        u.marital_status AS user_marital_status,
        u.postal_address AS postal_address,
        u.physical_address AS physical_address,
        u.nature_of_employment AS nature_of_employment,
        d.marital_status,
        d.declaration_type,
        DATE_FORMAT(d.declaration_date, '%Y-%m-%d') as declaration_date,
  d.biennial_income,
        d.assets,
        d.liabilities,
        d.status,
        d.correction_message,
        DATE_FORMAT(d.submitted_at, '%Y-%m-%dT%H:%i:%s.000Z') as submitted_at,
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