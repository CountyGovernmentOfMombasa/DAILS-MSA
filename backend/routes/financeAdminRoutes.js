const express = require('express');
const router = express.Router();
const financeAdminController = require('../controllers/financeAdminController');
const { verifyAdminToken } = require('../middleware/adminMiddleware');

// Get all declarations for Finance admin
router.get('/declarations', verifyAdminToken, financeAdminController.getFinanceAdminDeclarations);

module.exports = router;
