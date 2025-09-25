const Draft = require('../models/draftModel');
const Declaration = require('../models/declarationModel');

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
