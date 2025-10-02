const PHONE_REGEX = /^\+?\d{7,15}$/; // 7-15 digits, optional leading +

function isValidPhone(phone) {
  if (phone == null) return false;
  return PHONE_REGEX.test(String(phone).trim());
}

function normalizePhone(phone) {
  if (phone == null) return null;
  return String(phone).trim();
}

module.exports = { PHONE_REGEX, isValidPhone, normalizePhone };
