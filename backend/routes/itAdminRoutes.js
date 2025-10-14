const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const smsLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false });
const itAdminController = require('../controllers/itAdminController');
const rateLimit = require('express-rate-limit');
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
// IT/Super Bulk SMS endpoint (shares controller with admin for consistency)
const adminController = require('../controllers/adminController');
router.post('/bulk-sms', verifyAdminToken, smsLimiter, adminController.sendBulkSMS);
router.get('/bulk-sms/audit', verifyAdminToken, adminController.listBulkSmsAudit);
router.get('/user-creation-audit/export/pdf', verifyAdminToken, itAdminController.exportUserCreationAuditPdf);

// Admin creation audit
router.get('/admin-creation-audit', verifyAdminToken, itAdminController.getAdminCreationAudit);
router.get('/admin-creation-audit/export/csv', verifyAdminToken, itAdminController.exportAdminCreationAuditCsv);
router.get('/admin-creation-audit/export/pdf', verifyAdminToken, itAdminController.exportAdminCreationAuditPdf);

// Reveal or regenerate a user's first-time login OTP (support scenario)
// Dedicated stricter rate limit for OTP reveal to mitigate brute force/enumeration
const otpRevealLimiter = rateLimit({
	windowMs: 10 * 60 * 1000, // 10 minutes
	max: parseInt(process.env.OTP_REVEAL_MAX || '30',10),
	standardHeaders: true,
	legacyHeaders: false,
	message: { success:false, message: 'Too many OTP actions, please slow down.' },
	keyGenerator: (req) => `${req.ip}:${req.admin?.id || 'anon'}`
});
router.post('/users/:userId/reveal-otp', verifyAdminToken, otpRevealLimiter, itAdminController.revealUserOtp);
router.get('/otp-disclosure-audit', verifyAdminToken, itAdminController.getOtpDisclosureAudit);

module.exports = router;
