
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
      national_id = null,
      place_of_birth = null,
      marital_status = null,
      postal_address = null,
      physical_address = null,
      designation = null,
      department = null,
      nature_of_employment = null
    } = userData;

    // Validate nature_of_employment
    const allowedEmployment = ['Permanent', 'Contract', 'Temporary'];
    const validNatureOfEmployment = allowedEmployment.includes(nature_of_employment) ? nature_of_employment : null;

    // Validate department
    const allowedDepartments = [
      'Department of Transport, Infrastructure and Governance',
      'Department of Trade, Tourism and Culture',
      'Department of Education and Vocational Training',
      'Department of Environment and Water',
      'Department of Lands, Urban Planning,Housing and Serikali Mtaani',
      'Department of Health',
      'Department of Public Service Administration, Youth, Gender and Sports',
      'Department of Finance, Economic Planning and Digital Transformation',
      'Department of Blue Economy ,Cooperatives, Agriculture and Livestock',
      'Department of Climate Change,Energy and Natural Resources'
    ];
    const validDepartment = allowedDepartments.includes(department) ? department : null;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (
        payroll_number,
        surname,
        first_name,
        other_names,
        email,
        birthdate,
        password,
        password_changed,
        national_id,
        place_of_birth,
        marital_status,
        postal_address,
        physical_address,
        designation,
        department,
        nature_of_employment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payroll_number,
        surname,
        first_name,
        other_names,
        email,
        formatBirthdate(birthdate),
        hashedPassword,
        0, // password_changed default to 0
        national_id,
        place_of_birth,
        marital_status,
        postal_address,
        physical_address,
        designation,
        validDepartment,
        validNatureOfEmployment
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

  async findByNationalId(national_id) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE national_id = ?',
      [national_id]
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
        national_id,
        DATE_FORMAT(birthdate, '%d/%m/%Y') as birthdate,
        place_of_birth,
        marital_status,
        postal_address,
        physical_address,
        designation,
        department,
        nature_of_employment,
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

  // Check if national_id or email exists
  async existsByNationalIdOrEmail(national_id, email) {
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE national_id = ? OR email = ?',
      [national_id, email]
    );
    return rows.length > 0;
  }
};

module.exports = User;
