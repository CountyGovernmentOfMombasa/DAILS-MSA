const consentLogModel = require('../models/consentLogModel');

// POST /api/consent
async function submitConsent(req, res) {
  try {
    const { fullName, nationalId, designation, signed } = req.body;
    if (!fullName || !nationalId || !designation || typeof signed !== 'boolean') {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    await consentLogModel.logConsent({ fullName, nationalId, designation, signed });
    res.status(201).json({ message: 'Consent logged successfully.' });
  } catch (err) {
  // ...removed debug log...
    res.status(500).json({ error: 'Failed to log consent.' });
  }
}

module.exports = {
  submitConsent,
};
