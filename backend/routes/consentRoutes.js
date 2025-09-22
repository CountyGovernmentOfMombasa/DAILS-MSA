const express = require('express');
const router = express.Router();
const consentController = require('../controllers/consentController');

// POST /api/consent
router.post('/consent', consentController.submitConsent);

module.exports = router;
