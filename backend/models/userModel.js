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

// Database operations
const User = {
  // Create new user
  async create(userData) {
    const bcrypt = require('bcryptjs');
    const {
      payroll_number,
      birthdate,
      password,
      first_name,
      other_names,
      surname,
      email,
      place_of_birth = null,
      postal_address = null,
      physical_address = null,
      designation = null,
      department = null,
      employment_nature = 'permanent' // default
    } = userData;

    // Validate employment_nature
    const allowedEmployment = ['permanent', 'temporary', 'contract', 'casual'];
    const validEmploymentNature = allowedEmployment.includes(employment_nature) ? employment_nature : 'permanent';

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (
        payroll_number,
        birthdate,
        password,
        first_name,
        other_names,
        surname,
        email,
        password_changed,
        place_of_birth,
        postal_address,
        physical_address,
        designation,
        department,
        employment_nature
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payroll_number,
        formatBirthdate(birthdate),
        hashedPassword,
        first_name,
        other_names,
        surname,
        email,
        0, // password_changed default to 0
        place_of_birth,
        postal_address,
        physical_address,
        designation,
        department,
        validEmploymentNature
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
        other_names, 
        surname, 
        email, 
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
