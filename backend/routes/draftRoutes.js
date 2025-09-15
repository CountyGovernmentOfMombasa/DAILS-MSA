const express = require('express');
const { saveDraft, getDraft } = require('../controllers/draftController');
const { verifyToken } = require('../middleware/authMiddleware');
const router = express.Router();

router.post('/', verifyToken, saveDraft);
router.get('/', verifyToken, getDraft);

module.exports = router;
