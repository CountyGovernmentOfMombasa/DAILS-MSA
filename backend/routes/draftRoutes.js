const express = require('express');
const { saveDraft, getDraft, getAllDrafts, pruneObsoleteDrafts,
	saveUserFormDraftV2, getUserFormDraftV2, deleteUserFormDraftV2,
	saveDeclarationSectionDraftV2, getDeclarationSectionDraftV2, deleteDeclarationSectionDraftV2 } = require('../controllers/draftController');
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

// New V2 generic draft endpoints (not deprecated) leveraging dedicated tables
router.post('/v2/forms', verifyToken, saveUserFormDraftV2);
router.get('/v2/forms/:formType', verifyToken, getUserFormDraftV2);
router.delete('/v2/forms/:formType', verifyToken, deleteUserFormDraftV2);

router.post('/v2/declarations/:declarationId/sections', verifyToken, saveDeclarationSectionDraftV2);
router.get('/v2/declarations/:declarationId/sections/:sectionKey', verifyToken, getDeclarationSectionDraftV2);
router.delete('/v2/declarations/:declarationId/sections/:sectionKey', verifyToken, deleteDeclarationSectionDraftV2);

module.exports = router;
