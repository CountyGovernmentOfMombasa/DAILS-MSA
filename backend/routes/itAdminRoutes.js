const express = require('express');
const router = express.Router();
const itAdminController = require('../controllers/itAdminController');
const { verifyAdminToken } = require('../middleware/adminMiddleware');

// Get all declarations for IT admin (no financial data)
router.get('/declarations', verifyAdminToken, itAdminController.getITAdminDeclarations);

// Create new admin user
router.post('/create-admin', verifyAdminToken, itAdminController.createAdminUser);

module.exports = router;
