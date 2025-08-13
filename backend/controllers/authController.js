const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const User = require('../models/userModel');
const { validationResult } = require('express-validator');

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { payroll_number, birthdate, first_name, last_name, email, phone } = req.body;

  try {
    // Check if user exists
    const exists = await User.exists(payroll_number, email);
    if (exists) {
      return res.status(400).json({ 
        message: 'User already exists with this payroll number or email' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(birthdate, 10);
    
    // Create user
    const userId = await User.create({
      payroll_number,
      birthdate,
      password: hashedPassword,
      first_name,
      last_name,
      email,
      phone
    });

    // Generate JWT
    const token = jwt.sign(
      { id: userId }, 
      process.env.JWT_SECRET, 
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: userId,
        payroll_number,
        first_name,
        last_name,
        email
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: 'Server error during registration',
      error: error.message 
    });
  }
};

// Helper function to convert DD/MM/YYYY to YYYY-MM-DD
const convertDateFormat = (ddmmyyyy) => {
  if (!ddmmyyyy) return null;
  const [day, month, year] = ddmmyyyy.split('/');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
// Update the database query to format the date as string
exports.login = async (req, res) => {
  try {
    const { payrollNumber, birthdate } = req.body;

    console.log('Login attempt:', { payrollNumber, birthdate });

    // Find user by payroll number and format birthdate as string
    const [users] = await pool.query(
      'SELECT id, payroll_number, first_name, last_name, email, phone, DATE_FORMAT(birthdate, "%Y-%m-%d") as birthdate, password, password_changed FROM users WHERE payroll_number = ?',
      [payrollNumber]
    );

    if (users.length === 0) {
      console.log('User not found with payroll number:', payrollNumber);
      return res.status(401).json({ 
        message: 'Invalid credentials' 
      });
    }

    const user = users[0];
    console.log('Found user:', {
      id: user.id,
      payroll_number: user.payroll_number,
      birthdate: user.birthdate,
      password_changed: user.password_changed
    });

    // Convert the input date format (DD/MM/YYYY) to database format (YYYY-MM-DD)
    const convertedBirthdate = convertDateFormat(birthdate);
    
    console.log('Date comparison:', {
      input: birthdate,
      converted: convertedBirthdate,
      database: user.birthdate,
      match: convertedBirthdate === user.birthdate
    });
    
    // Compare the converted date with the database birthdate
    if (convertedBirthdate !== user.birthdate) {
      console.log('Birthdate mismatch!');
      return res.status(401).json({ 
        message: 'Invalid credentials' 
      });
    }

    // Rest of the function remains the same...
    console.log('Birthdate match! Checking password_changed status...');

    if (!user.password_changed) {
      const changePasswordToken = jwt.sign(
        { id: user.id, changePassword: true },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );
      
      return res.json({
        changePasswordRequired: true,
        token: changePasswordToken,
        message: 'Please set a new password'
      });
    }
    
    const token = jwt.sign(
      { id: user.id }, 
      process.env.JWT_SECRET, 
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        payroll_number: user.payroll_number,
        first_name: user.first_name,
        last_name: user.last_name
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Server error during login',
      error: error.message 
    });
  }
};

// @desc    Change password (for first-time users)
// @route   PUT /api/auth/change-password
// @access  Private (with change password token)
exports.changePassword = async (req, res) => {
  const { newPassword } = req.body;
  const userId = req.user.id;

  try {
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update user password and mark as changed
    await pool.query(
      'UPDATE users SET password = ?, password_changed = TRUE WHERE id = ?',
      [hashedPassword, userId]
    );

    // Generate new token for normal access
    const token = jwt.sign(
      { id: userId }, 
      process.env.JWT_SECRET, 
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      token,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ 
      message: 'Server error during password change',
      error: error.message 
    });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT 
        id, 
        payroll_number, 
        first_name, 
        last_name, 
        email, 
        phone,
        DATE_FORMAT(birthdate, '%d/%m/%Y') as birthdate 
       FROM users 
       WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ 
        message: 'User not found' 
      });
    }

    res.json(users[0]);
    
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ 
      message: 'Server error while fetching profile',
      error: error.message 
    });
  }
};
