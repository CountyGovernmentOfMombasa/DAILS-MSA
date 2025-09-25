const settingsLocksController = require('../controllers/settingsLocksController');
const consentLogAdminController = require('../controllers/consentLogAdminController');
const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const adminController = require('../controllers/adminController');
const declarationController = require('../controllers/declarationController');
const { 
  adminLogin, 
  verifyAdmin, 
  getAllUsers, 
  updateUserEmail, 
  bulkUpdateEmails,
  getAllAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  changeAdminPassword
} = adminController;
const { verifyAdminToken } = require('../middleware/adminMiddleware');
const upload = require('../middleware/fileUpload');

// --- Declaration Locks Management ---
router.get('/declaration-locks', verifyAdminToken, settingsController.getDeclarationLocks);
router.put('/declaration-locks', verifyAdminToken, settingsController.setDeclarationLock);

// Settings Locks Management
router.get('/settings/locks', verifyAdminToken, settingsLocksController.getAllLocks);
router.post('/settings/locks', verifyAdminToken, settingsLocksController.setLocks);

// Consent Logs (Admin)
router.get('/consent-logs', verifyAdminToken, consentLogAdminController.getConsentLogs);

// --- Admin Authentication ---
router.post('/login', adminLogin); // Login (no auth required)

// --- Admin Verification ---
router.get('/verify', verifyAdminToken, verifyAdmin); // Verify admin (auth required)

// --- Declaration Management ---
// Use declarationController.getAllDeclarations to ensure all user fields are included in admin export
router.get('/declarations', verifyAdminToken, declarationController.getAllDeclarations); // Get all declarations (auth required)
router.get('/declarations/:id', verifyAdminToken, declarationController.getAdminDeclarationById); // Get single declaration details with relations
router.put('/declarations/:declarationId/status', verifyAdminToken, adminController.updateDeclarationStatus); // Approve/reject declaration

// --- User Management ---
router.get('/users', verifyAdminToken, getAllUsers); // Get all users
router.put('/users/:userId/email', verifyAdminToken, updateUserEmail); // Update user email
router.put('/users/bulk-email', verifyAdminToken, bulkUpdateEmails); // Bulk update emails

// --- Admin Management ---
router.get('/admins', verifyAdminToken, getAllAdmins); // Get all admins
router.post('/admins', verifyAdminToken, createAdmin); // Create admin
router.put('/admins/:adminId', verifyAdminToken, updateAdmin); // Update admin
router.delete('/admins/:adminId', verifyAdminToken, deleteAdmin); // Delete admin
router.put('/change-password', verifyAdminToken, changeAdminPassword); // Change admin password

// --- Utility / Diagnostics ---
router.post('/test-email', verifyAdminToken, adminController.sendTestEmail); // Send test email (optional ?to=address)

// Upload admin signature
router.post('/admins/:adminId/upload-signature', verifyAdminToken, upload.single('signature'), async (req, res) => {
  try {
    const adminId = req.params.adminId;
    // Only allow admin to upload their own signature
    if (req.admin.adminId !== parseInt(adminId)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
  // Save file path to database
  const pool = require('../config/db');
  await pool.execute('UPDATE admin_users SET signature_path = ? WHERE id = ?', [req.file.path, adminId]);
  res.json({ success: true, filePath: req.file.path });
  } catch (error) {
    console.error('Error uploading admin signature:', error);
    res.status(500).json({ message: 'Server error during file upload' });
  }
});

module.exports = router;