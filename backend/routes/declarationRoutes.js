const express = require('express');
const { submitDeclaration, getDeclarations, requestEdit, getAllEditRequests } = require('../controllers/declarationController');
const { verifyToken } = require('../middleware/authMiddleware');
const upload = require('../middleware/fileUpload');
const { validateDeclaration } = require('../middleware/validation');
const router = express.Router();
const { getDeclarationById, downloadDeclarationPDF, patchDeclaration } = require('../controllers/declarationController');
const { enforceFinancialTypes } = require('../middleware/financialValidation');
const { param } = require('express-validator');
const { handleValidation, listQuery } = require('../middleware/requestValidators');
const patchValidation = require('../middleware/patchValidation');

// --- Declaration Submission ---
// Biennial lock check middleware – normalize type before checking
const adminRoutes = require('./adminRoutes');
const normalizeDeclarationType = require('../util/normalizeDeclarationType');
let biennialLocked = false;
try {
  biennialLocked = require('./adminRoutes').biennialLocked;
} catch {}

// Admin / IT Admin: View all edit requests
const { verifyAdminToken } = require('../middleware/adminMiddleware');
// Legacy path (user token) retained if needed for future; restrict new simpler path to admin tokens
router.get('/edit-requests/all', verifyAdminToken, getAllEditRequests);
router.get('/edit-requests', verifyAdminToken, getAllEditRequests);

router.post('/', verifyToken, validateDeclaration, handleValidation, enforceFinancialTypes, async (req, res, next) => {
	// Normalize early so downstream logic & lock check share canonical form
	if (req.body && req.body.declaration_type) {
		req.body.declaration_type = normalizeDeclarationType(req.body.declaration_type);
	}
	if (req.body.declaration_type === 'Biennial') {
		// Refresh lock flag from cached adminRoutes export if present
		try {
			if (typeof require.cache[require.resolve('./adminRoutes')].exports.biennialLocked !== 'undefined') {
				biennialLocked = require.cache[require.resolve('./adminRoutes')].exports.biennialLocked;
			}
		} catch {}
		if (biennialLocked) {
			return res.status(403).json({ success: false, message: 'Biennial Declaration is currently locked by the administrator.' });
		}
	}
	next();
}, submitDeclaration); // Submit a new declaration

// --- Declaration Retrieval ---
router.get('/', verifyToken, listQuery({ limitMax: 200 }), getDeclarations); // Get all declarations for user

// Single declaration (with embedded unified financial)
router.get('/:id', verifyToken, param('id').isInt({min:1}), handleValidation, getDeclarationById);
// On-demand PDF download
router.get('/:id/download-pdf', verifyToken, param('id').isInt({min:1}), handleValidation, downloadDeclarationPDF);


// Update a declaration (edit)
const { updateDeclaration } = require('../controllers/declarationController');
router.put('/:id', verifyToken, param('id').isInt({min:1}), handleValidation, enforceFinancialTypes, updateDeclaration);
// Partial update (diff-based)
router.patch('/:id', verifyToken, param('id').isInt({min:1}), handleValidation, patchValidation, enforceFinancialTypes, patchDeclaration);

// Record an edit request for a declaration
router.post('/:id/edit-request', verifyToken, param('id').isInt({min:1}), handleValidation, requestEdit);

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
			const docHtml = `<!DOCTYPE html><html><body style=\"font-family: Arial, sans-serif; background: #f7f7f7; padding: 20px;\"><div style=\"max-width: 500px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #eee; padding: 24px;\"><h2 style=\"color: #2a7ae2;\">Document Uploaded Successfully</h2><p>Dear <strong>${rows[0].first_name}</strong>,</p><p>Your declaration document has been uploaded and is now securely stored in your WDP account.</p><p><strong>The password for the attached PDF is Your National ID number.</strong></p><p>If you did not perform this action, please contact support immediately.</p><p style=\"margin-top: 24px;\">Best regards,<br><strong>WDP Team</strong></p><hr><small style=\"color: #888;\">This is an automated message. Please do not reply.</small></div></body></html>`;
			await sendEmail({
				to: rows[0].email,
				subject: 'Your Declaration Document Was Uploaded',
				text: `Hello ${rows[0].first_name},\nYour document has been uploaded successfully!\n\nThe password for the attached PDF is Your National ID number.`,
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