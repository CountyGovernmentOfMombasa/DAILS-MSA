const express = require('express');
const router = express.Router();
const financeAdminController = require('../controllers/financeAdminController');
const { verifyAdminToken } = require('../middleware/adminMiddleware');
const { listQuery } = require('../middleware/requestValidators');
// Finance admin declarations list validation (page, limit, search)
const validate = listQuery();

// Get all declarations for Finance admin
router.get('/declarations', verifyAdminToken, validate, financeAdminController.getFinanceAdminDeclarations);

module.exports = router;
