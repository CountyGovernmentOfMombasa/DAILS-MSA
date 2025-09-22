const express = require('express');
const router = express.Router();
const hrAdminController = require('../controllers/hrAdminController');
const { verifyAdminToken } = require('../middleware/adminMiddleware');

// Get all declarations for HR admin (no financial data)
router.get('/declarations', verifyAdminToken, hrAdminController.getHRAdminDeclarations);

module.exports = router;
