const Draft = require('../models/draftModel');
const Declaration = require('../models/declarationModel');
const pool = require('../config/db');

exports.saveDraft = async (req, res) => {
  try {
    const userId = req.user.id;
    const { formType, data } = req.body;
    if (!formType || !data) {
      return res.status(400).json({ success: false, message: 'formType and data are required' });
    }
    await Draft.saveDraft(userId, formType, data);
    res.json({ success: true });
  } catch (error) {
    console.error('Save draft error:', error);
    res.status(500).json({ success: false, message: 'Server error saving draft' });
  }
};

exports.getDraft = async (req, res) => {
  try {
    const userId = req.user.id;
    const { formType } = req.query;
    if (!formType) {
      return res.status(400).json({ success: false, message: 'formType is required' });
    }
    const draft = await Draft.getDraft(userId, formType);
    res.json({ success: true, draft });
  } catch (error) {
    console.error('Get draft error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching draft' });
  }
};

exports.getAllDrafts = async (req, res) => {
  try {
    const userId = req.user.id;
    const drafts = await Draft.getAllDrafts(userId);
    res.json({ success: true, drafts });
  } catch (error) {
    console.error('Get all drafts error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching drafts' });
  }
};

// Delete drafts that reference declarations which already exist (submitted)
exports.pruneObsoleteDrafts = async (req, res) => {
  try {
    const userId = req.user.id;
    // Get user drafts
    const drafts = await Draft.getAllDrafts(userId);
    if (!drafts.length) return res.json({ success: true, pruned: 0 });
    // Collect declaration IDs from drafts
    const draftDeclIds = drafts
      .map(d => d.declaration_id)
      .filter(id => id && !isNaN(Number(id)));
    if (!draftDeclIds.length) return res.json({ success: true, pruned: 0 });
    // Fetch existing declarations for user
    const userDecls = await Declaration.findByUserId(userId);
    const existingIds = new Set(userDecls.map(d => String(d.id)));
    const staleDeclIds = [...new Set(draftDeclIds.filter(id => existingIds.has(String(id))))];
    if (!staleDeclIds.length) return res.json({ success: true, pruned: 0 });
    const pruned = await Draft.deleteByDeclarationIds(userId, staleDeclIds);
    res.json({ success: true, pruned });
  } catch (error) {
    console.error('Prune obsolete drafts error:', error);
    res.status(500).json({ success: false, message: 'Server error pruning drafts' });
  }
};

// --- New Generic Draft Storage (user_form_drafts & declaration_section_drafts) ---
exports.saveUserFormDraftV2 = async (req, res) => {
  try {
    const userId = req.user.id;
    const { form_type, draft_data } = req.body;
    if (!form_type) return res.status(400).json({ message: 'form_type required' });
    await pool.query(`INSERT INTO user_form_drafts (user_id, form_type, draft_data)
      VALUES (?,?,?) ON DUPLICATE KEY UPDATE draft_data = VALUES(draft_data), last_saved = CURRENT_TIMESTAMP`, [userId, form_type, JSON.stringify(draft_data || null)]);
    return res.json({ success: true });
  } catch (e) {
    console.error('saveUserFormDraftV2 error:', e.message);
    return res.status(500).json({ message: 'Server error', error: e.message });
  }
};

exports.getUserFormDraftV2 = async (req, res) => {
  try {
    const userId = req.user.id;
    const { formType } = req.params;
    const [rows] = await pool.query('SELECT form_type, draft_data, last_saved FROM user_form_drafts WHERE user_id = ? AND form_type = ? LIMIT 1', [userId, formType]);
    if (!rows.length) return res.status(404).json({ message: 'Draft not found' });
    return res.json({ success: true, draft: rows[0] });
  } catch (e) {
    console.error('getUserFormDraftV2 error:', e.message);
    return res.status(500).json({ message: 'Server error', error: e.message });
  }
};

exports.deleteUserFormDraftV2 = async (req, res) => {
  try {
    const userId = req.user.id;
    const { formType } = req.params;
    await pool.query('DELETE FROM user_form_drafts WHERE user_id = ? AND form_type = ?', [userId, formType]);
    return res.json({ success: true });
  } catch (e) {
    console.error('deleteUserFormDraftV2 error:', e.message);
    return res.status(500).json({ message: 'Server error', error: e.message });
  }
};

exports.saveDeclarationSectionDraftV2 = async (req, res) => {
  try {
    const userId = req.user.id; // could be used for ownership checks later
    const { declarationId } = req.params;
    const { section_key, draft_data } = req.body;
    if (!section_key) return res.status(400).json({ message: 'section_key required' });
    await pool.query(`INSERT INTO declaration_section_drafts (declaration_id, section_key, draft_data)
      VALUES (?,?,?) ON DUPLICATE KEY UPDATE draft_data = VALUES(draft_data), last_saved = CURRENT_TIMESTAMP`, [declarationId, section_key, JSON.stringify(draft_data || null)]);
    return res.json({ success: true });
  } catch (e) {
    console.error('saveDeclarationSectionDraftV2 error:', e.message);
    return res.status(500).json({ message: 'Server error', error: e.message });
  }
};

exports.getDeclarationSectionDraftV2 = async (req, res) => {
  try {
    const { declarationId, sectionKey } = req.params;
    const [rows] = await pool.query('SELECT section_key, draft_data, last_saved FROM declaration_section_drafts WHERE declaration_id = ? AND section_key = ? LIMIT 1', [declarationId, sectionKey]);
    if (!rows.length) return res.status(404).json({ message: 'Draft not found' });
    return res.json({ success: true, draft: rows[0] });
  } catch (e) {
    console.error('getDeclarationSectionDraftV2 error:', e.message);
    return res.status(500).json({ message: 'Server error', error: e.message });
  }
};

exports.deleteDeclarationSectionDraftV2 = async (req, res) => {
  try {
    const { declarationId, sectionKey } = req.params;
    await pool.query('DELETE FROM declaration_section_drafts WHERE declaration_id = ? AND section_key = ?', [declarationId, sectionKey]);
    return res.json({ success: true });
  } catch (e) {
    console.error('deleteDeclarationSectionDraftV2 error:', e.message);
    return res.status(500).json({ message: 'Server error', error: e.message });
  }
};
