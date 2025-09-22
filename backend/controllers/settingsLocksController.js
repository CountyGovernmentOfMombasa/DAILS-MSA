// controllers/settingsLocksController.js

// In-memory lock state for demonstration (replace with DB in production)
let locks = {
  biennial_declaration_locked: false,
  first_declaration_locked: false,
  final_declaration_locked: false,
};

// GET /api/settings/locks
function getAllLocks(req, res) {
  res.json({ success: true, locks });
}

// POST /api/settings/locks
function setLocks(req, res) {
  const { biennial_declaration_locked, first_declaration_locked, final_declaration_locked } = req.body;
  if (typeof biennial_declaration_locked === 'boolean') locks.biennial_declaration_locked = biennial_declaration_locked;
  if (typeof first_declaration_locked === 'boolean') locks.first_declaration_locked = first_declaration_locked;
  if (typeof final_declaration_locked === 'boolean') locks.final_declaration_locked = final_declaration_locked;
  res.json({ success: true, locks });
}

module.exports = { getAllLocks, setLocks };
