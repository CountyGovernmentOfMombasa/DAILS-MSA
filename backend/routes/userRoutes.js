const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');
const { body, validationResult, param } = require('express-validator');

// Email validation middleware
const emailValidation = [
    body('email')
        .optional({ nullable: true })
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail()
];

// Get user profile
router.get('/profile/:userId', verifyToken, async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Verify user can only access their own profile or admin can access any
        if (req.user.userId !== parseInt(userId) && req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied' });
        }

        const [rows] = await db.execute(
            'SELECT id, email, full_name, phone, address, created_at FROM users WHERE id = ?',
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
        
        // Verify user can only update their own profile
        if (req.user.userId !== parseInt(userId)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { email, full_name, phone, address } = req.body;

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
            'UPDATE users SET email = ?, full_name = ?, phone = ?, address = ? WHERE id = ?',
            [email, full_name, phone, address, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all users (admin only)
router.get('/', verifyToken, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const [rows] = await db.execute(
            'SELECT id, email, full_name, phone, address, created_at FROM users ORDER BY created_at DESC'
        );

        res.json(rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete user (admin only)
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