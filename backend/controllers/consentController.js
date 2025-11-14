const consentLogModel = require("../models/consentLogModel");
const pool = require("../config/db");

// POST /api/consent
async function submitConsent(req, res) {
  try {
    // Support both snake_case & camelCase from validators / clients
    const fullName = req.body.fullName || req.body.full_name;
    const nationalId = req.body.nationalId || req.body.national_id;
    const designation = req.body.designation; // optional per validator
    const signed =
      typeof req.body.signed === "boolean"
        ? req.body.signed
        : req.body.signed === "true";
    if (!fullName || !nationalId || typeof signed !== "boolean") {
      return res
        .status(400)
        .json({ error: "Required fields: full_name, national_id, signed" });
    }
    await consentLogModel.logConsent({
      fullName,
      nationalId,
      designation,
      signed,
    });
    // Also mark the user as having consented in the main users table
    try {
      await pool.query(
        "UPDATE users SET has_consented = 1 WHERE national_id = ?",
        [nationalId]
      );
    } catch (userUpdateError) {
      console.error(
        "Failed to update has_consented flag for user:",
        userUpdateError.message
      );
    }
    res.status(201).json({ message: "Consent logged successfully." });
  } catch (err) {
    // ...removed debug log...
    res.status(500).json({ error: "Failed to log consent." });
  }
}

module.exports = {
  submitConsent,
};
