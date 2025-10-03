const express = require('express');
const { saveDraft, getDraft, getAllDrafts, pruneObsoleteDrafts,
	saveUserFormDraftV2, getUserFormDraftV2, deleteUserFormDraftV2,
	saveDeclarationSectionDraftV2, getDeclarationSectionDraftV2, deleteDeclarationSectionDraftV2 } = require('../controllers/draftController');
const { verifyToken } = require('../middleware/authMiddleware');
const { body, param, query } = require('express-validator');
const { handleValidation } = require('../middleware/requestValidators');
const router = express.Router();

// Deprecation notice middleware for legacy draft endpoints
router.use((req, res, next) => {
	res.setHeader('Deprecation', 'true');
	res.setHeader('Sunset', 'Wed, 01 Jan 2026 00:00:00 GMT');
	res.setHeader('Link', '</api/progress>; rel="successor-version"');
	res.setHeader('Warning', '299 - "Draft endpoints are deprecated; migrate to /api/progress"');
	next();
});

router.post('/', verifyToken, [
	body('draft_key').optional().isString().isLength({max:100}),
	body('data').exists()
], handleValidation, saveDraft);
router.get('/', verifyToken, [
	query('draft_key').optional().isString().isLength({max:100})
], handleValidation, getDraft);
router.get('/all', verifyToken, [
	query('page').optional().isInt({min:1,max:200}).toInt(),
	query('limit').optional().isInt({min:1,max:200}).toInt()
], handleValidation, getAllDrafts);
router.delete('/prune', verifyToken, pruneObsoleteDrafts);

// New V2 generic draft endpoints (not deprecated) leveraging dedicated tables
router.post('/v2/forms', verifyToken, [
	body('formType').isString().isLength({min:1,max:60}),
	body('draft_data').exists()
], handleValidation, saveUserFormDraftV2);
router.get('/v2/forms/:formType', verifyToken, [
	param('formType').isString().isLength({min:1,max:60})
], handleValidation, getUserFormDraftV2);
router.delete('/v2/forms/:formType', verifyToken, [
	param('formType').isString().isLength({min:1,max:60})
], handleValidation, deleteUserFormDraftV2);

router.post('/v2/declarations/:declarationId/sections', verifyToken, [
	param('declarationId').isInt({min:1}).toInt(),
	body('section_key').isString().isLength({min:1,max:80}),
	body('draft_data').exists()
], handleValidation, saveDeclarationSectionDraftV2);
router.get('/v2/declarations/:declarationId/sections/:sectionKey', verifyToken, [
	param('declarationId').isInt({min:1}).toInt(),
	param('sectionKey').isString().isLength({min:1,max:80})
], handleValidation, getDeclarationSectionDraftV2);
router.delete('/v2/declarations/:declarationId/sections/:sectionKey', verifyToken, [
	param('declarationId').isInt({min:1}).toInt(),
	param('sectionKey').isString().isLength({min:1,max:80})
], handleValidation, deleteDeclarationSectionDraftV2);

module.exports = router;
