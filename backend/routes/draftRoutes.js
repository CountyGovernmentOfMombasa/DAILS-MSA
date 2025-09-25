const express = require('express');
const { saveDraft, getDraft, getAllDrafts, pruneObsoleteDrafts } = require('../controllers/draftController');
const { verifyToken } = require('../middleware/authMiddleware');
const router = express.Router();

// Deprecation notice middleware for legacy draft endpoints
router.use((req, res, next) => {
	res.setHeader('Deprecation', 'true');
	res.setHeader('Sunset', 'Wed, 01 Jan 2026 00:00:00 GMT');
	res.setHeader('Link', '</api/progress>; rel="successor-version"');
	res.setHeader('Warning', '299 - "Draft endpoints are deprecated; migrate to /api/progress"');
	next();
});

router.post('/', verifyToken, saveDraft);
router.get('/', verifyToken, getDraft);
router.get('/all', verifyToken, getAllDrafts);
router.delete('/prune', verifyToken, pruneObsoleteDrafts);

module.exports = router;
