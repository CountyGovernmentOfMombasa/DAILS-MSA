const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');
const { body, validationResult, param } = require('express-validator');
const upload = require('../middleware/fileUpload');
const { getFamily } = require('../controllers/userController');

// --- Validation Middleware ---
const emailValidation = [
    body('email')
        .optional({ nullable: true })
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail()
];

// --- Profile Management ---
// Family info (spouses & children) for current user
router.get('/family', verifyToken, getFamily);


// Get user profile
router.get('/profile/:userId', verifyToken, async (req, res) => {
    try {
        const userId = req.params.userId;
        // Verify user can only access their own profile or admin can access any
        if (req.user.userId !== parseInt(userId) && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const [rows] = await db.execute(
            'SELECT id, email, full_name, address, created_at FROM users WHERE id = ?',
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Update user profile
router.put('/profile/:userId', verifyToken, emailValidation, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.params.userId;
        
        // Verify user can only update their own profile or admin can update any
        if (req.user.userId !== parseInt(userId) && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }


// Upload user signature
router.post('/profile/:userId/upload-signature', verifyToken, upload.single('signature'), async (req, res) => {
    try {
        const userId = req.params.userId;
        // Verify user can only upload their own signature
        if (req.user.userId !== parseInt(userId)) {
            return res.status(403).json({ message: 'Access denied' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
    // Save file path to database
    await db.execute('UPDATE users SET signature_path = ? WHERE id = ?', [req.file.path, userId]);
    res.json({ success: true, filePath: req.file.path });
    } catch (error) {
        console.error('Error uploading signature:', error);
        res.status(500).json({ message: 'Server error during file upload' });
    }
});
    const { email, full_name, address } = req.body;

        // Check if email is already taken by another user
        if (email) {
            const [existingUser] = await db.execute(
                'SELECT id FROM users WHERE email = ? AND id != ?',
                [email, userId]
            );

            if (existingUser.length > 0) {
                return res.status(400).json({ message: 'Email already in use' });
            }
        }

        const [result] = await db.execute(
            'UPDATE users SET email = ?, full_name = ?, address = ? WHERE id = ?',
            [email, full_name, address, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Send confirmation email after successful profile update
        const sendEmail = require('../util/sendEmail');
        try {
            await sendEmail({
                to: email,
                subject: 'Profile Updated Successfully',
                text: `Hello ${full_name}, your profile has been updated successfully.`,
                html: `<p>Hello <strong>${full_name}</strong>,</p><p>Your profile has been updated successfully.</p><p>If you did not make this change, please contact support immediately.</p>`
            });
        } catch (emailError) {
            console.error('Error sending profile update email:', emailError);
            // Do not fail the request if email fails
        }
        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- User Management (Admin Only) ---
// Get all users
router.get('/', verifyToken, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const [rows] = await db.execute(
            'SELECT id, email, full_name, address, created_at FROM users ORDER BY created_at DESC'
        );

        res.json(rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete user
router.delete('/:userId', verifyToken, param('userId').isInt(), async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const userId = req.params.userId;

        const [result] = await db.execute(
            'DELETE FROM users WHERE id = ?',
            [userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;