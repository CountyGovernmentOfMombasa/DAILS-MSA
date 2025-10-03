const express = require('express');
const router = express.Router();
const hrAdminController = require('../controllers/hrAdminController');
const { verifyAdminToken } = require('../middleware/adminMiddleware');
const { listQuery } = require('../middleware/requestValidators');
// HR admin declarations list validation (adds department filter)
const validateList = listQuery({ includeDepartment: true });

// Get all declarations for HR admin (no financial data)
router.get('/declarations', verifyAdminToken, validateList, hrAdminController.getHRAdminDeclarations);

module.exports = router;
