const express = require('express');
const router = express.Router();
const itAdminController = require('../controllers/itAdminController');
const { verifyAdminToken } = require('../middleware/adminMiddleware');

// Get all declarations for IT admin (no financial data)
router.get('/declarations', verifyAdminToken, itAdminController.getITAdminDeclarations);

// Create new admin user
router.post('/create-admin', verifyAdminToken, itAdminController.createAdminUser);

// Create regular user (protected)
router.post('/create-user', verifyAdminToken, itAdminController.createRegularUser);

// User creation audit
router.get('/user-creation-audit', verifyAdminToken, itAdminController.getUserCreationAudit);
router.get('/user-creation-audit/export/csv', verifyAdminToken, itAdminController.exportUserCreationAuditCsv);
router.get('/user-creation-audit/export/pdf', verifyAdminToken, itAdminController.exportUserCreationAuditPdf);

// Admin creation audit
router.get('/admin-creation-audit', verifyAdminToken, itAdminController.getAdminCreationAudit);
router.get('/admin-creation-audit/export/csv', verifyAdminToken, itAdminController.exportAdminCreationAuditCsv);
router.get('/admin-creation-audit/export/pdf', verifyAdminToken, itAdminController.exportAdminCreationAuditPdf);

module.exports = router;
