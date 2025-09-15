const Draft = require('../models/draftModel');

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
