const express = require('express');
const { submitDeclaration, getDeclarations } = require('../controllers/declarationController');
const { verifyToken } = require('../middleware/authMiddleware');
const { validateDeclaration } = require('../middleware/validation');
const router = express.Router();

router.post('/', verifyToken, validateDeclaration, submitDeclaration);
router.get('/', verifyToken, getDeclarations);

module.exports = router;