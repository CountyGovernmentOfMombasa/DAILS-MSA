// middleware/validateDates.js
exports.validateBirthdate = (req, res, next) => {
  const { birthdate } = req.body;
  const dateRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[012])\/(19|20)\d\d$/;
  
  if (!dateRegex.test(birthdate)) {
    return res.status(400).json({ 
      error: 'Invalid date format. Please use DD/MM/YYYY' 
    });
  }
  
  next();
};
