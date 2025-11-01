// Deprecated: Finance Admin Controller removed.
// Any accidental invocation will receive HTTP 410 (Gone).

exports.getFinanceAdminDeclarations = async (_req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Finance admin role and endpoints have been removed.'
  });
};
