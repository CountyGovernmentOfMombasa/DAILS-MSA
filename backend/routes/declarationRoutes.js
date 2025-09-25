const express = require('express');
const { submitDeclaration, getDeclarations, requestEdit, getAllEditRequests } = require('../controllers/declarationController');
const { verifyToken } = require('../middleware/authMiddleware');
const upload = require('../middleware/fileUpload');
const { validateDeclaration } = require('../middleware/validation');
const router = express.Router();
const { getDeclarationById, getDeclarationFinancialUnified, updateUnifiedFinancial } = require('../controllers/declarationController');

// --- Declaration Submission ---
// Biennial lock check middleware
const adminRoutes = require('./adminRoutes');
let biennialLocked = false;
try {
	biennialLocked = require('./adminRoutes').biennialLocked;
} catch {}

// Admin: View all edit requests
router.get('/edit-requests/all', verifyToken, getAllEditRequests);

router.post('/', verifyToken, validateDeclaration, async (req, res, next) => {
	// Block biennial declaration if locked
	if (req.body.declaration_type === 'biennial') {
		// Use the same biennialLocked variable as adminRoutes
		if (typeof require.cache[require.resolve('./adminRoutes')].exports.biennialLocked !== 'undefined') {
			biennialLocked = require.cache[require.resolve('./adminRoutes')].exports.biennialLocked;
		}
		if (biennialLocked) {
			return res.status(403).json({ success: false, message: 'Biennial Declaration is currently locked by the administrator.' });
		}
	}
	next();
}, submitDeclaration); // Submit a new declaration

// --- Declaration Retrieval ---
router.get('/', verifyToken, getDeclarations); // Get all declarations for user

// Single declaration (with embedded unified financial)
router.get('/:id', verifyToken, getDeclarationById);
// Unified financial data only (read)
router.get('/:id/financial-unified', verifyToken, getDeclarationFinancialUnified);
// Unified financial batch update (write)
router.put('/:id/financial-unified', verifyToken, updateUnifiedFinancial);


// Update a declaration (edit)
const { updateDeclaration } = require('../controllers/declarationController');
router.put('/:id', verifyToken, updateDeclaration);

// Record an edit request for a declaration
router.post('/:id/edit-request', verifyToken, requestEdit);

// (Duplicate route removed)

// Upload declaration document
router.post('/:declarationId/upload-document', verifyToken, upload.single('document'), async (req, res) => {
	try {
		const declarationId = req.params.declarationId;
		// Only allow user to upload for their own declaration (add logic as needed)
		if (!req.file) {
			return res.status(400).json({ message: 'No file uploaded' });
		}
		// Save file path to database
		const db = require('../config/db');
		await db.execute('UPDATE declarations SET document_path = ? WHERE id = ?', [req.file.path, declarationId]);

		// Send notification email
		const sendEmail = require('../util/sendEmail');
		// Fetch user email (example query, adjust as needed)
		const [rows] = await db.execute('SELECT u.email, u.first_name FROM users u JOIN declarations d ON u.id = d.user_id WHERE d.id = ?', [declarationId]);
		if (rows.length > 0) {
			const docHtml = `<!DOCTYPE html><html><body style=\"font-family: Arial, sans-serif; background: #f7f7f7; padding: 20px;\"><div style=\"max-width: 500px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #eee; padding: 24px;\"><h2 style=\"color: #2a7ae2;\">Document Uploaded Successfully</h2><p>Dear <strong>${rows[0].first_name}</strong>,</p><p>Your declaration document has been uploaded and is now securely stored in your WDP account.</p><p>If you did not perform this action, please contact support immediately.</p><p style=\"margin-top: 24px;\">Best regards,<br><strong>WDP Team</strong></p><hr><small style=\"color: #888;\">This is an automated message. Please do not reply.</small></div></body></html>`;
			await sendEmail({
				to: rows[0].email,
				subject: 'Your Declaration Document Was Uploaded',
				text: `Hello ${rows[0].first_name},\nYour document has been uploaded successfully!`,
				html: docHtml
			});
		}
		res.json({ success: true, filePath: req.file.path });
	} catch (error) {
		console.error('Error uploading declaration document:', error);
		res.status(500).json({ message: 'Server error during file upload' });
	}
});

module.exports = router;