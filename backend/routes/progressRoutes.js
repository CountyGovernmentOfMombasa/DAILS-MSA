const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const progressController = require('../controllers/progressController');

router.post('/', verifyToken, progressController.saveProgress);
router.get('/', verifyToken, progressController.getProgress);

module.exports = router;