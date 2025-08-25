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

  // Destructure all possible fields
  const {
    payroll_number,
    birthdate,
    first_name,
    last_name,
    email,
    phone,
    place_of_birth,
    postal_address,
    physical_address,
    designation,
    department,
    employment_nature
  } = req.body;

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
    const validEmploymentNature = employment_nature || '';

    // Create user
    const userId = await User.create({
      payroll_number,
      birthdate,
      password: hashedPassword,
      first_name,
      last_name,
      email,
      phone,
      place_of_birth,
      postal_address,
      physical_address,
      designation,
      department,
      employment_nature: validEmploymentNature
    });

    // Send notification email
    const sendEmail = require('../util/sendEmail');
    const registrationHtml = `<!DOCTYPE html><html><body style=\"font-family: Arial, sans-serif; background: #f7f7f7; padding: 20px;\"><div style=\"max-width: 500px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #eee; padding: 24px;\"><h2 style=\"color: #2a7ae2;\">Welcome to WDP!</h2><p>Dear <strong>${first_name}</strong>,</p><p>Your registration was successful. You can now securely submit your financial declarations and manage your profile online.</p><p style=\"margin-top: 24px;\">Best regards,<br><strong>WDP Team</strong></p><hr><small style=\"color: #888;\">This is an automated message. Please do not reply.</small></div></body></html>`;
    await sendEmail({
      to: email,
      subject: 'Welcome to WDP Employee Declaration Portal',
      text: `Hello ${first_name},\nYour registration was successful!`,
      html: registrationHtml
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
    // Increment password_changed by 1
    await pool.query(
      'UPDATE users SET password = ?, password_changed = password_changed + 1 WHERE id = ?',
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
    console.error('Change password error:', error);
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

// @desc    Check if user has changed password
// @route   POST /api/auth/check-password-status
// @access  Public
exports.checkPasswordStatus = async (req, res) => {
  try {
    const { payrollNumber, birthdate } = req.body;
    if (!payrollNumber || !birthdate) {
      return res.status(400).json({ message: 'Payroll number and birthdate are required.' });
    }
    // Convert birthdate to YYYY-MM-DD
    const convertDateFormat = (ddmmyyyy) => {
      if (!ddmmyyyy) return null;
      const [day, month, year] = ddmmyyyy.split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    };
    const formattedBirthdate = convertDateFormat(birthdate);
    const [users] = await pool.query(
      'SELECT password_changed, birthdate FROM users WHERE payroll_number = ?',
      [payrollNumber]
    );
    if (users.length === 0) {
      return res.json({ password_changed: false });
    }
    const user = users[0];
    if (user.birthdate !== formattedBirthdate) {
      return res.json({ password_changed: false });
    }
    // Check if password_changed > 0
    return res.json({ password_changed: user.password_changed > 0 });
  } catch (error) {
    console.error('Check password status error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
