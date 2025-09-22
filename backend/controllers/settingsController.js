// Controller for declaration locks (biennial, first, final)
const settingsModel = require('../models/settingsModel');

exports.getDeclarationLocks = async (req, res) => {
  try {
    const locks = await settingsModel.getDeclarationLocks();
    res.json({ success: true, locks });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching locks', error: error.message });
  }
};

exports.setDeclarationLock = async (req, res) => {
  try {
    const { type, value } = req.body;
    await settingsModel.setDeclarationLock(type, value);
    res.json({ success: true, message: `${type} updated`, type, value });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
