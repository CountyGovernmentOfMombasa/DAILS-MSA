// controllers/settingsLocksController.js
const settingsModel = require('../models/settingsModel');

// GET /api/admin/settings/locks
async function getAllLocks(req, res) {
  try {
    const locks = await settingsModel.getDeclarationLocks();
    res.json({ success: true, locks });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching locks', error: error.message });
  }
}

// POST /api/admin/settings/locks
async function setLocks(req, res) {
  try {
    const { biennial_declaration_locked, first_declaration_locked, final_declaration_locked } = req.body || {};
    const updates = {};
    if (typeof biennial_declaration_locked === 'boolean') {
      await settingsModel.setDeclarationLock('biennial_declaration_locked', biennial_declaration_locked);
      updates.biennial_declaration_locked = biennial_declaration_locked;
    }
    if (typeof first_declaration_locked === 'boolean') {
      await settingsModel.setDeclarationLock('first_declaration_locked', first_declaration_locked);
      updates.first_declaration_locked = first_declaration_locked;
    }
    if (typeof final_declaration_locked === 'boolean') {
      await settingsModel.setDeclarationLock('final_declaration_locked', final_declaration_locked);
      updates.final_declaration_locked = final_declaration_locked;
    }
    const locks = await settingsModel.getDeclarationLocks();
    res.json({ success: true, locks, updates });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

module.exports = { getAllLocks, setLocks };
