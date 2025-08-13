const pool = require('../config/db');

// Utility functions
const formatBirthdate = (birthdate) => {
  if (!birthdate) return null;
  // Accept either dd/mm/yyyy or yyyy-mm-dd
  if (birthdate.includes('/')) {
    const [day, month, year] = birthdate.split('/');
    return `${year}-${month}-${day}`;
  }
  return birthdate;
};

const formatDisplayDate = (dbDate) => {
  if (!dbDate) return null;
  const [year, month, day] = dbDate.split('-');
  return `${day}/${month}/${year}`;
};

// Database operations
const User = {
  // Create new user
  async create(userData) {
    const {
      payroll_number,
      birthdate,
      password,
      first_name,
      last_name,
      email,
      phone
    } = userData;

    const [result] = await pool.query(
      `INSERT INTO users (
        payroll_number, 
        birthdate, 
        password, 
        first_name, 
        last_name, 
        email, 
        phone,
        password_changed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payroll_number,
        formatBirthdate(birthdate),
        password,
        first_name,
        last_name,
        email,
        phone,
        false
      ]
    );

    return result.insertId;
  },

  // Find user by payroll number
  async findByPayrollNumber(payroll_number) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE payroll_number = ?',
      [payroll_number]
    );
    return rows[0];
  },

  // Find user by ID
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT 
        id, 
        payroll_number, 
        first_name, 
        last_name, 
        email, 
        phone,
        DATE_FORMAT(birthdate, '%d/%m/%Y') as birthdate,
        password_changed
       FROM users 
       WHERE id = ?`,
      [id]
    );
    return rows[0];
  },

  // Update user password
  async updatePassword(id, newPassword) {
    await pool.query(
      'UPDATE users SET password = ?, password_changed = ? WHERE id = ?',
      [newPassword, true, id]
    );
  },

  // Check if payroll number or email exists
  async exists(payroll_number, email) {
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE payroll_number = ? OR email = ?',
      [payroll_number, email]
    );
    return rows.length > 0;
  }
};

module.exports = User;
