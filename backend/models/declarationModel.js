const pool = require('../config/db');

const Declaration = {
  // Create new declaration
  async create(declarationData) {
    const {
      user_id,
      marital_status,
      declaration_date,
      annual_income,
      assets,
      liabilities,
      other_financial_info,
      signature_path
    } = declarationData;

    const [result] = await pool.query(
      `INSERT INTO declarations (
        user_id,
        marital_status,
        declaration_date,
        annual_income,
        assets,
        liabilities,
        other_financial_info,
        signature_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id,
        marital_status,
        declaration_date,
        annual_income,
        assets,
        liabilities,
        other_financial_info,
        signature_path
      ]
    );

    return result.insertId;
  },

  // Create spouse records
  async createSpouses(declarationId, spouses) {
    if (!spouses || spouses.length === 0) return;

    const values = spouses.map(spouse => [
      declarationId,
      spouse.full_name,
      spouse.birthdate,
      spouse.occupation,
      spouse.employer,
      spouse.annual_income
    ]);

    await pool.query(
      `INSERT INTO spouses (
        declaration_id,
        full_name,
        birthdate,
        occupation,
        employer,
        annual_income
      ) VALUES ?`,
      [values]
    );
  },

  // Create children records
  async createChildren(declarationId, children) {
    if (!children || children.length === 0) return;

    const values = children.map(child => [
      declarationId,
      child.full_name,
      child.birthdate,
      child.school
    ]);

    await pool.query(
      `INSERT INTO children (
        declaration_id,
        full_name,
        birthdate,
        school
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
        DATE_FORMAT(d.declaration_date, '%d/%m/%Y') as declaration_date,
        d.annual_income,
        d.assets,
        d.liabilities,
        d.other_financial_info,
        d.signature_path,
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
        u.last_name,
        u.payroll_number
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
        full_name,
        DATE_FORMAT(birthdate, '%d/%m/%Y') as birthdate,
        occupation,
        employer,
        annual_income
       FROM spouses
       WHERE declaration_id = ?`,
      [declarationId]
    );

    // Get children
    const [children] = await pool.query(
      `SELECT 
        id,
        full_name,
        DATE_FORMAT(birthdate, '%d/%m/%Y') as birthdate,
        school
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
        CONCAT(u.first_name, ' ', u.last_name) as user_name,
        u.payroll_number,
        d.marital_status,
        DATE_FORMAT(d.declaration_date, '%d/%m/%Y') as declaration_date,
        d.annual_income,
        d.assets,
        d.liabilities,
        DATE_FORMAT(d.submitted_at, '%d/%m/%Y %H:%i') as submitted_at,
        (SELECT COUNT(*) FROM spouses WHERE declaration_id = d.id) as spouse_count,
        (SELECT COUNT(*) FROM children WHERE declaration_id = d.id) as children_count
       FROM declarations d
       JOIN users u ON d.user_id = u.id
       ORDER BY d.submitted_at DESC`
    );
    return rows;
  }
};

module.exports = Declaration;