
const pool = require('../config/db');
const { getDepartmentConfig } = require('../util/departmentsCache');

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
      nature_of_employment = null,
      sub_department = null,
      phone_number = null
    } = userData;

    // Validate nature_of_employment
  const allowedEmployment = ['Permanent', 'Contract', 'Temporary'];
    const validNatureOfEmployment = allowedEmployment.includes(nature_of_employment) ? nature_of_employment : null;

    // Validate department & sub-department (now mandatory pair: if department provided must have valid sub_department; if sub_department given determines department)
    let validDepartment = null;
    let validSubDepartment = null;
    const { departments: DEPARTMENTS, subDepartmentMap: SUB_DEPARTMENT_MAP } = await getDepartmentConfig();
    if (sub_department) {
      const found = Object.entries(SUB_DEPARTMENT_MAP).find(([, subs]) => subs.includes(sub_department));
      if (found) { validDepartment = found[0]; validSubDepartment = sub_department; }
    } else if (department) {
      if (DEPARTMENTS.includes(department)) {
        const allowedSubs = SUB_DEPARTMENT_MAP[department] || [];
        if (allowedSubs.length === 1) { validDepartment = department; validSubDepartment = allowedSubs[0]; }
        else throw new Error('sub_department is required for the selected department');
      }
    }
    if (department && validDepartment && department !== validDepartment) {
      // Provided department inconsistent with derived one
      throw new Error('Provided department does not match sub_department hierarchy');
    }
    if ((department || sub_department) && (!validDepartment || !validSubDepartment)) {
      throw new Error('Invalid department / sub_department combination');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (
        payroll_number,
        surname,
        first_name,
        other_names,
        email,
        phone_number,
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
        sub_department,
        nature_of_employment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payroll_number,
        surname,
        first_name,
        other_names,
        email,
        phone_number,
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
  validSubDepartment,
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
  },

  // Check if phone number already exists (ignores null/empty)
  async existsByPhone(phone_number) {
    if (!phone_number) return false;
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE phone_number = ?',
      [phone_number]
    );
    return rows.length > 0;
  },

  async existsByPhoneExcludingId(phone_number, excludeId) {
    if (!phone_number) return false;
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE phone_number = ? AND id <> ?',
      [phone_number, excludeId]
    );
    return rows.length > 0;
  }
};

module.exports = User;
