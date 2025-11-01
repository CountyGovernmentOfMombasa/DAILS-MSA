// Deprecated: Finance Admin module has been removed.
// This placeholder remains to avoid import errors in older builds.
const express = require('express');
const router = express.Router();

router.all('*', (_req, res) => {
	res.status(410).json({ success: false, message: 'Finance Admin module removed' });
});

module.exports = router;
