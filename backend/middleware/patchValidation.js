// Lightweight field-level validation for PATCH /declarations/:id
// Only validates fields that are actually present in the payload.
module.exports = function patchValidation(req, res, next) {
  const b = req.body || {};
  // marital_status (if present) must be non-empty string
  if (Object.prototype.hasOwnProperty.call(b,'marital_status')) {
    if (typeof b.marital_status !== 'string' || !b.marital_status.trim()) {
      return res.status(400).json({ success:false, message:'marital_status must be a non-empty string' });
    }
  }
  // witness phone basic pattern (if present)
  if (Object.prototype.hasOwnProperty.call(b,'witness_phone')) {
    if (b.witness_phone && !/^\+?\d{7,15}$/.test(String(b.witness_phone))) {
      return res.status(400).json({ success:false, message:'witness_phone must be 7-15 digits (optional leading +)' });
    }
  }
  // financial_declarations deprecated – ignore silently
  next();
}
