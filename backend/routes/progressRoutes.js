const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { body } = require('express-validator');
const { handleValidation } = require('../middleware/requestValidators');
const progressController = require('../controllers/progressController');

// Legacy/frontend mismatch mapping middleware: maps { userKey, progress } -> { user_key, data }
router.use((req, _res, next) => {
	if (req.method === 'POST' && req.body) {
		if (req.body.userKey && !req.body.user_key) req.body.user_key = req.body.userKey;
		if (req.body.progress && !req.body.data) req.body.data = req.body.progress;
	}
	next();
});

router.post('/', verifyToken, [
	body('user_key').isString().trim().isLength({ min:1, max:100 }).withMessage('user_key required (1-100 chars)'),
	body('data').exists().withMessage('data payload required')
], handleValidation, progressController.saveProgress);
router.get('/', verifyToken, progressController.getProgress);
router.delete('/', verifyToken, progressController.deleteProgress);

module.exports = router;