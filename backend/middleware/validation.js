const { body } = require('express-validator');

// Validation for user registration
exports.validateRegister = [
    body('payroll_number')
        .notEmpty()
        .withMessage('Payroll number is required')
        .isLength({ min: 3, max: 50 })
        .withMessage('Payroll number must be between 3 and 50 characters'),
    
    body('first_name')
        .notEmpty()
        .withMessage('First name is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('First name must be between 2 and 100 characters')
        .isAlpha('en-US', { ignore: ' ' })
        .withMessage('First name must contain only letters'),

    body('other_names')
        .notEmpty()
        .withMessage('Other names are required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Other names must be between 2 and 100 characters')
        .isAlpha('en-US', { ignore: ' ' })
        .withMessage('Other names must contain only letters'),

    body('surname')
    .notEmpty()
        .withMessage('Surname is required')
        .isLength({ min: 2, max: 100 })
        .withMessage('Surname must be between 2 and 100 characters')
        .isAlpha('en-US', { ignore: ' ' })
        .withMessage('Surname must contain only letters'),

    body('email')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),
    
    
    body('birthdate')
        .notEmpty()
        .withMessage('Birthdate is required')
        .matches(/^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[012])\/(19|20)\d\d$/)
        .withMessage('Birthdate must be in DD/MM/YYYY format')
];

// Validation for user login
exports.validateLogin = [
    body('payroll_number')
        .notEmpty()
        .withMessage('Payroll number is required'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
];

// Validation for password change
exports.validatePasswordChange = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
    
    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('New password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
];

// Validation for declaration submission
exports.validateDeclaration = [
    body('marital_status')
        .isIn(['single', 'married', 'divorced', 'widowed', 'separated'])
        .withMessage('Invalid marital status'),
    
    body('declaration_date')
        .isISO8601()
        .withMessage('Invalid declaration date format'),
    
    body('annual_income')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Annual income must be a positive number'),
    
    body('assets')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Assets description must be less than 1000 characters'),
    
    body('liabilities')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Liabilities description must be less than 1000 characters'),
    
    body('other_financial_info')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Other financial info must be less than 1000 characters')
];
