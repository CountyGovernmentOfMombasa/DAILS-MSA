// authRoutes.js
const express = require('express');
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const { 
    validateRegister, 
    validateLogin, 
    validatePasswordChange 
} = require('../middleware/validation');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// --- Registration & Login ---
router.post('/register', validateRegister, authController.register); // Register new user
router.post('/login', validateLogin, authController.login); // Login user
router.post('/resend-otp', authController.resendOtp); // Resend OTP for first-time login
router.post('/verify-otp', verifyToken, authController.verifyOtp); // Verify OTP (requires otp token)

// Forgot password (SMS-based) flow
// Rate limiters
const forgotPasswordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many password reset requests. Please try again later.' }
});
const forgotPasswordVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false
});

// Forgot password (user) flow
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword); // Request reset code via SMS
router.post('/forgot-password/verify', forgotPasswordVerifyLimiter, authController.verifyForgotPasswordCode); // Verify code & issue reset token
router.put('/forgot-password/reset', verifyToken, authController.resetForgottenPassword); // Submit new password with reset token

// --- Password Management ---
router.put('/change-password', verifyToken, validatePasswordChange, authController.changePassword); // Change password
router.post('/check-password-status', authController.checkPasswordStatus);

// --- Profile ---
router.get('/me', verifyToken, authController.getMe); // Get user profile
router.put('/me', verifyToken, authController.updateMe); // Update user profile

module.exports = router;
