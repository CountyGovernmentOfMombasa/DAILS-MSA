// OTP utility module centralizing creation & basic validation helpers
// Returns { code, expires } where code is 6-digit string and expires is Date object 10 minutes ahead by default.

function createOtp(ttlMinutes = 10) {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + ttlMinutes * 60 * 1000);
  return { code, expires };
}

function isOtpExpired(expiresAt) {
  if (!expiresAt) return true;
  const exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return Date.now() > exp.getTime();
}

module.exports = { createOtp, isOtpExpired };
