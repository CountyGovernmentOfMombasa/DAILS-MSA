const Declaration = require('../models/declarationModel');

// Get latest declaration's spouses and children for current user
exports.getFamily = async (req, res) => {
  try {
    const userId = req.user.id;
    // Get latest declaration for user
    const declarations = await Declaration.findByUserId(userId);
    if (!declarations || declarations.length === 0) {
      return res.json({ spouses: [], children: [] });
    }
    // Sort by declaration_date descending, get latest
    const latest = declarations.sort((a, b) => new Date(b.declaration_date) - new Date(a.declaration_date))[0];
    if (!latest || !latest.id) {
      return res.json({ spouses: [], children: [] });
    }
    // Get spouses and children for latest declaration
    const details = await Declaration.findByIdWithDetails(latest.id);
    res.json({ spouses: details.spouses || [], children: details.children || [] });
  } catch (err) {
    console.error('Error fetching family info:', err);
    res.status(500).json({ message: 'Server error fetching family info' });
  }
};
