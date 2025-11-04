function getContactNumber() {
  const num = process.env.WITNESS_CONTACT_NUMBER || '0793992115';
  return num.trim();
}

function getSlaHours() {
  const raw = process.env.WITNESS_SLA_HOURS || '24';
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 24;
}

// Build the SMS body for notifying a witness
function buildWitnessSmsBody(fullName) {
  const contact = getContactNumber();
  const hours = getSlaHours();
  const displayName = (fullName && String(fullName).trim()) || 'an employee';
  return `You have been selected as a witness by ${displayName} in their DIALs (Declaration of Income, Assets and Liabilities). If you don't accept this, call the number ${contact} within the next ${hours} hrs`;
}

module.exports = { buildWitnessSmsBody };
