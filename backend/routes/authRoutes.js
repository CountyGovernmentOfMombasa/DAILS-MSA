// authRoutes.js
const express = require('express');
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const { 
    validateRegister, 
    validateLogin, 
    validatePasswordChange 
} = require('../middleware/validation');
const router = express.Router();

// --- Registration & Login ---
router.post('/register', validateRegister, authController.register); // Register new user
router.post('/login', validateLogin, authController.login); // Login user

// --- Password Management ---
router.put('/change-password', verifyToken, validatePasswordChange, authController.changePassword); // Change password
router.post('/check-password-status', authController.checkPasswordStatus);

// --- Profile ---
router.get('/me', verifyToken, authController.getMe); // Get user profile

module.exports = router;
