// Standardized error response helper
// errorCode pattern: DOMAIN_REASON (UPPER_SNAKE)
function errorResponse(res, status, { message, code, details }) {
  return res.status(status).json({ success: false, code, message, details });
}

module.exports = { errorResponse };
