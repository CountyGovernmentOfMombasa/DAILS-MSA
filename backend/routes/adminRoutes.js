const express = require('express');
const { 
  getAllDeclarations, 
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
} = require('../controllers/adminController');
const adminAuth = require('../middleware/adminMiddleware');
const upload = require('../middleware/fileUpload');

const router = express.Router();


// --- Admin Authentication ---
router.post('/login', adminLogin); // Login (no auth required)

// --- Admin Verification ---
router.get('/verify', adminAuth, verifyAdmin); // Verify admin (auth required)

// --- Declaration Management ---
router.get('/declarations', adminAuth, getAllDeclarations); // Get all declarations (auth required)

// --- User Management ---
router.get('/users', adminAuth, getAllUsers); // Get all users
router.put('/users/:userId/email', adminAuth, updateUserEmail); // Update user email
router.put('/users/bulk-email', adminAuth, bulkUpdateEmails); // Bulk update emails

// --- Admin Management ---
router.get('/admins', adminAuth, getAllAdmins); // Get all admins
router.post('/admins', adminAuth, createAdmin); // Create admin
router.put('/admins/:adminId', adminAuth, updateAdmin); // Update admin
router.delete('/admins/:adminId', adminAuth, deleteAdmin); // Delete admin
router.put('/change-password', adminAuth, changeAdminPassword); // Change admin password

// Upload admin signature
router.post('/admins/:adminId/upload-signature', adminAuth, upload.single('signature'), async (req, res) => {
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

// Biennial Declaration Lock (in-memory for demo; use DB for production)
let biennialLocked = false;
router.biennialLocked = biennialLocked;

// Get biennial lock status
router.get('/biennial-lock', adminAuth, (req, res) => {
  res.json({ locked: biennialLocked });
});

// Set biennial lock status
router.post('/biennial-lock', adminAuth, (req, res) => {
  biennialLocked = !!req.body.locked;
  router.biennialLocked = biennialLocked;
  res.json({ locked: biennialLocked });
});

module.exports = router;