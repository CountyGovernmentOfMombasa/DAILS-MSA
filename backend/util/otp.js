// OTP utility module centralizing creation & basic validation helpers
// Returns { code, expires } where code is 6-digit string and expires is Date object
// ahead by default. Default TTL is 6 hours (configurable via OTP_TTL_MINUTES env).

function createOtp(ttlMinutes = parseInt(process.env.OTP_TTL_MINUTES || '360', 10)) {
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
