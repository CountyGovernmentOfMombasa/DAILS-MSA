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
    national_id,
    payroll_number = null,
    birthdate,
    first_name,
    surname,
    other_names,
    email,
    place_of_birth,
    postal_address,
    physical_address,
    designation,
    department,
  nature_of_employment
  } = req.body;

  try {
    // Check if user exists
    const exists = await User.existsByNationalIdOrEmail(national_id, email);
    if (exists) {
      return res.status(400).json({ 
        message: 'User already exists with this National ID or email' 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(birthdate, 10);
  const validNatureOfEmployment = nature_of_employment || '';

    // Create user
    const userId = await User.create({
      national_id,
      payroll_number,
      birthdate,
      password: hashedPassword,
      first_name,
      surname,
      other_names,
      email,
      place_of_birth,
      postal_address,
      physical_address,
      designation,
      department,
      nature_of_employment: validNatureOfEmployment
    });

    // Send notification email
    const sendEmail = require('../util/sendEmail');
  const registrationHtml = `<!DOCTYPE html><html><body style=\"font-family: Arial, sans-serif; background: #f7f7f7; padding: 20px;\"><div style=\"max-width: 500px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #eee; padding: 24px;\"><h2 style=\"color: #2a7ae2;\">Welcome to WDP!</h2><p>Dear <strong>${first_name} ${surname} ${other_names || ''}</strong>,</p><p>Your registration was successful. You can now securely submit your financial declarations and manage your profile online.</p><p style=\"margin-top: 24px;\">Best regards,<br><strong>WDP Team</strong></p><hr><small style=\"color: #888;\">This is an automated message. Please do not reply.</small></div></body></html>`;
    await sendEmail({
      to: email,
      subject: 'Welcome to CGM Wealth Declaration Portal',
  text: `Hello ${first_name} ${surname} ${other_names || ''},\nYour registration was successful!`,
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
        national_id,
        payroll_number,
        first_name,
        surname,
        other_names,
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

const sendSMS = require('../util/sendSMS');

// Generate a 6-digit OTP and expiry 10 minutes from now
function createOtp() {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  return { code, expires };
}

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
// Update the database query to format the date as string
exports.login = async (req, res) => {
  try {
    const { nationalId, password, phoneNumber } = req.body;

    // Find user by national ID
    const [users] = await pool.query(
      'SELECT id, national_id, payroll_number, first_name, other_names, surname, email, password, password_changed, phone_number FROM users WHERE national_id = ?',
      [nationalId]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = users[0];

    // If phone number is missing, require it and update
    if (!user.phone_number) {
      if (!phoneNumber) {
        return res.status(400).json({ message: 'Phone number required', requirePhone: true });
      }
      await pool.query('UPDATE users SET phone_number = ? WHERE id = ?', [phoneNumber, user.id]);
      user.phone_number = phoneNumber;
    }

    // If password hasn't been changed, trigger OTP to phone and require OTP verification
    if (!user.password_changed) {
      // Require default password for first step
      if (password !== 'Change@001') {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      // Generate and store OTP
      const { code, expires } = createOtp();
      await pool.query('UPDATE users SET otp_code = ?, otp_expires_at = ? WHERE id = ?', [code, expires, user.id]);
      // Send OTP via SMS
      try {
        await sendSMS({ to: user.phone_number, body: `Your WDP one-time code is ${code}. It expires in 10 minutes.` });
      } catch (e) {
        console.error('Failed to send OTP SMS:', e.message);
      }
      // Short-lived token to allow OTP verification
      const otpToken = jwt.sign(
        { id: user.id, otp: true },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );
      return res.json({
        otpRequired: true,
        token: otpToken,
        message: 'Enter the OTP sent to your phone to continue'
      });
    }

    // If password has been changed, check hashed password
    const bcrypt = require('bcryptjs');
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
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
        national_id: user.national_id,
        payroll_number: user.payroll_number,
        phone_number: user.phone_number,
        first_name: user.first_name,
        other_names: user.other_names,
        surname: user.surname
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

// @desc    Resend OTP for first-time login
// @route   POST /api/auth/resend-otp
// @access  Public (needs nationalId and default password)
exports.resendOtp = async (req, res) => {
  try {
    const { nationalId, password } = req.body;
    if (!nationalId || !password) {
      return res.status(400).json({ message: 'nationalId and password are required' });
    }
    const [users] = await pool.query('SELECT id, phone_number, password_changed FROM users WHERE national_id = ?', [nationalId]);
    if (!users.length) return res.status(404).json({ message: 'User not found' });
    const user = users[0];
    if (user.password_changed) {
      return res.status(400).json({ message: 'OTP not required. Please login normally.' });
    }
    if (password !== 'Change@001') {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const { code, expires } = createOtp();
    await pool.query('UPDATE users SET otp_code = ?, otp_expires_at = ? WHERE id = ?', [code, expires, user.id]);
    try {
      await sendSMS({ to: user.phone_number, body: `Your WDP one-time code is ${code}. It expires in 10 minutes.` });
    } catch (e) {
      console.error('Failed to send OTP SMS:', e.message);
    }
    return res.json({ success: true, message: 'OTP resent' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Verify OTP and require immediate password change
// @route   POST /api/auth/verify-otp
// @access  Private (token from login with otp: true)
exports.verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: 'OTP is required' });
    const userId = req.user.id;
    const [rows] = await pool.query('SELECT otp_code, otp_expires_at FROM users WHERE id = ?', [userId]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    const { otp_code, otp_expires_at } = rows[0];
    if (!otp_code || !otp_expires_at) return res.status(400).json({ message: 'No OTP generated. Please login again.' });
    const now = new Date();
    const expiry = new Date(otp_expires_at);
    if (now > expiry) return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
    if (String(otp) !== String(otp_code)) return res.status(400).json({ message: 'Invalid OTP' });
    // Clear OTP and create short-lived change-password token
    await pool.query('UPDATE users SET otp_code = NULL, otp_expires_at = NULL WHERE id = ?', [userId]);
    const changePasswordToken = jwt.sign(
      { id: userId, changePassword: true },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    return res.json({ changePasswordRequired: true, token: changePasswordToken, message: 'OTP verified. Please set a new password.' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Change password (for first-time users)
// @route   PUT /api/auth/change-password
// @access  Private (with change password token)
exports.changePassword = async (req, res) => {
  const { newPassword } = req.body;
  const userId = req.user.id;
  try {
    // Password policy: min 8 chars, upper, lower, number, symbol
    const policy = {
      minLength: 8,
      upper: /[A-Z]/,
      lower: /[a-z]/,
      number: /[0-9]/,
      symbol: /[^A-Za-z0-9]/
    };
    if (
      newPassword.length < policy.minLength ||
      !policy.upper.test(newPassword) ||
      !policy.lower.test(newPassword) ||
      !policy.number.test(newPassword) ||
      !policy.symbol.test(newPassword)
    ) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.'
      });
    }

    // Get current password hash
    const [users] = await pool.query('SELECT password FROM users WHERE id = ?', [userId]);
    if (!users.length) {
      return res.status(404).json({ message: 'User not found' });
    }
    const bcrypt = require('bcryptjs');
    const isSame = await bcrypt.compare(newPassword, users[0].password);
    if (isSame) {
      return res.status(400).json({ message: 'You cannot reuse your previous password.' });
    }

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
        other_names,
        surname,  
        email, 
        national_id,
        phone_number,
        DATE_FORMAT(birthdate, '%Y-%m-%d') as birthdate,
        place_of_birth,
        marital_status,
        postal_address,
        physical_address,
        designation,
        department,
        nature_of_employment
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

// @desc    Update user profile
// @route   PUT /api/auth/me
// @access  Private
exports.updateMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const fields = [
      'surname', 'first_name', 'other_names', 'birthdate', 'place_of_birth', 'marital_status',
      'postal_address', 'physical_address', 'email', 'payroll_number', 'designation', 'department', 'nature_of_employment', 'phone_number'
    ];
    const updates = [];
    const values = [];
    fields.forEach(field => {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (field === 'nature_of_employment') {
          console.log('Received nature_of_employment:', value);
        }
        if (field === 'nature_of_employment' && typeof value === 'string' && value.length > 0) {
          // Capitalize first letter, lowercase the rest
          value = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
        }
        updates.push(`${field} = ?`);
        values.push(value);
      }
    });
    console.log('Update values for user:', values);
    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update.' });
    }
    values.push(userId);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    // Return updated profile (same as getMe)
    const [users] = await pool.query(
      `SELECT 
        id, 
        payroll_number, 
        first_name, 
        other_names,
        surname,  
        email, 
        national_id,
        phone_number,
        DATE_FORMAT(birthdate, '%Y-%m-%d') as birthdate,
        place_of_birth,
        marital_status,
        postal_address,
        physical_address,
        designation,
        department,
        nature_of_employment
       FROM users 
       WHERE id = ?`,
      [userId]
    );
    res.json({ success: true, message: 'Profile updated successfully.', profile: users[0] });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error while updating profile', error: error.message });
  }
};

// @desc    Check if user has changed password
// @route   POST /api/auth/check-password-status
// @access  Public
exports.checkPasswordStatus = async (req, res) => {
  try {
    const { nationalId } = req.body;
    if (!nationalId) {
      return res.status(400).json({ message: 'National ID is required.' });
    }
    const [users] = await pool.query(
      'SELECT password_changed, phone_number FROM users WHERE national_id = ?',
      [nationalId]
    );
    if (users.length === 0) {
      return res.json({ password_changed: false, phone_number: null });
    }
    const user = users[0];
    return res.json({ password_changed: user.password_changed > 0, phone_number: user.phone_number });
  } catch (error) {
    console.error('Check password status error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
