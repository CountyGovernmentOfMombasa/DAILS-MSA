const db = require('../config/db');

// Insert a new consent log
async function logConsent({ fullName, nationalId, designation, signed }) {
  const [result] = await db.execute(
    `INSERT INTO consent_logs (full_name, national_id, designation, signed) VALUES (?, ?, ?, ?)`,
    [fullName, nationalId, designation, signed]
  );
  return result.insertId;
}

module.exports = {
  logConsent,
};
