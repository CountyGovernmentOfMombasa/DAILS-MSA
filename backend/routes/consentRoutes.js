const express = require('express');
const router = express.Router();
const consentController = require('../controllers/consentController');
const { consentSubmit } = require('../middleware/requestValidators');

// Normalize incoming camelCase fields to expected snake_case for validator compatibility
router.use((req, _res, next) => {
	if (req.method === 'POST' && req.body) {
		if (req.body.fullName && !req.body.full_name) {
			req.body.full_name = String(req.body.fullName).trim().replace(/\s+/g, ' ');
		}
		if (req.body.nationalId && !req.body.national_id) {
			req.body.national_id = String(req.body.nationalId).trim();
		}
	}
	next();
});

// POST /api/consent
router.post('/consent', consentSubmit, consentController.submitConsent);

module.exports = router;
