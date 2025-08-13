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

const router = express.Router();

// Admin authentication routes (no auth required)
router.post('/login', adminLogin);

// Admin verification (auth required)
router.get('/verify', adminAuth, verifyAdmin);

// Declaration management (auth required)
router.get('/declarations', adminAuth, getAllDeclarations);

// User management routes (auth required)
router.get('/users', adminAuth, getAllUsers);
router.put('/users/:userId/email', adminAuth, updateUserEmail);
router.put('/users/bulk-email', adminAuth, bulkUpdateEmails);

// Admin management routes (auth required)
router.get('/admins', adminAuth, getAllAdmins);
router.post('/admins', adminAuth, createAdmin);
router.put('/admins/:adminId', adminAuth, updateAdmin);
router.delete('/admins/:adminId', adminAuth, deleteAdmin);
router.put('/change-password', adminAuth, changeAdminPassword);

module.exports = router;