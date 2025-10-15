const {
  getBiennialWindowForYear,
  upsertBiennialWindow,
  listBiennialWindows,
  addEditOverride,
  listOverrides,
  deactivateOverride
} = require('../models/windowSettingsModel');
const { logWindowAudit, listWindowAudit } = require('../models/windowAuditModel');

exports.listWindows = async (req, res) => {
  try {
    const rows = await listBiennialWindows();
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list windows', error: e.message });
  }
};

exports.upsertWindow = async (req, res) => {
  try {
    const { year = null, start_date, end_date, active = true, notes = null } = req.body || {};
    const beforeList = await listBiennialWindows();
    const id = await upsertBiennialWindow({ year, start_date, end_date, active, notes });
    const data = await listBiennialWindows();
    try { await logWindowAudit({ action: 'UPSERT_WINDOW', actor_admin_id: req.admin?.adminId || null, target: 'window', target_id: id, before: beforeList, after: data }); } catch {}
    res.json({ success: true, id, data });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.listOverrides = async (req, res) => {
  try {
    const { type = 'biennial_edit', active = undefined } = req.query || {};
    const rows = await listOverrides({ type, active: active === undefined ? null : (active === 'true') });
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list overrides', error: e.message });
  }
};

exports.createOverride = async (req, res) => {
  try {
    const { type = 'biennial_edit', user_id = null, declaration_id = null, allow_from = null, allow_until = null, allow = true, reason = null } = req.body || {};
    const created_by_admin_id = req.admin?.adminId || null;
    const id = await addEditOverride({ type, user_id, declaration_id, allow_from, allow_until, allow, reason, created_by_admin_id });
    try { await logWindowAudit({ action: 'CREATE_OVERRIDE', actor_admin_id: created_by_admin_id, target: 'override', target_id: id, before: null, after: { type, user_id, declaration_id, allow_from, allow_until, allow, reason } }); } catch {}
    res.json({ success: true, id });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.deactivateOverride = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await deactivateOverride(id);
    try { await logWindowAudit({ action: 'DEACTIVATE_OVERRIDE', actor_admin_id: req.admin?.adminId || null, target: 'override', target_id: id, before: { id }, after: { id, active: 0 } }); } catch {}
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.listAudit = async (req, res) => {
  try {
    const rows = await listWindowAudit();
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list window audit', error: e.message });
  }
};
