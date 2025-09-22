const consentLogAdminModel = require('../models/consentLogAdminModel');

// GET /api/admin/consent-logs
async function getConsentLogs(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const search = req.query.search || '';
    const result = await consentLogAdminModel.getConsentLogs({ page, pageSize, search });
    res.json(result);
  } catch (err) {
    console.error('Error fetching consent logs:', err);
    res.status(500).json({ error: 'Failed to fetch consent logs.' });
  }
}

module.exports = {
  getConsentLogs,
};
