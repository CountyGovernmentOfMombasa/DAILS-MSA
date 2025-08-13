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

router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);
router.put('/change-password', verifyToken, validatePasswordChange, authController.changePassword);
router.get('/me', verifyToken, authController.getMe);

module.exports = router;
