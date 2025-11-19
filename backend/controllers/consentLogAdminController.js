const consentLogAdminModel = require('../models/consentLogAdminModel');

// GET /api/admin/consent-logs
async function getConsentLogs(req, res) {
  const startedAt = Date.now();
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 20;
  const search = req.query.search || '';
  const debug = req.query.debug === '1';
  try {
    const result = await consentLogAdminModel.getConsentLogs({ page, pageSize, search });
    const durationMs = Date.now() - startedAt;
    if (debug) {
      return res.json({ ...result, debug: { page, pageSize, search, durationMs } });
    }
    res.json(result);
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    // Capture granular diagnostics without leaking sensitive info
    const code = err.code || null;
    const msg = err.message || String(err);
    console.error('[CONSENT_LOGS][ERROR]', {
      page,
      pageSize,
      search,
      durationMs,
      code,
      message: msg,
      stack: err.stack && err.stack.split('\n').slice(0, 5).join(' | ')
    });
    res.status(500).json({ error: 'Failed to fetch consent logs.', code, durationMs });
  }
}

module.exports = {
  getConsentLogs,
};
