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
        .optional({ checkFalsy: true })
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
    body('nationalId')
        .notEmpty()
        .withMessage('National ID is required'),
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

// Validation for declaration submission (aligned with current controller expectations)
exports.validateDeclaration = [
    body('marital_status')
        .notEmpty().withMessage('marital_status required')
        .isIn(['single','married','divorced','widowed','separated'])
        .withMessage('Invalid marital_status'),
    // If married, require at least one spouse entry in the spouses array
    body('spouses')
        .custom((value, { req }) => {
            if ((req.body?.marital_status || '').toLowerCase() !== 'married') return true;
            const arr = value;
            if (!Array.isArray(arr) || arr.length === 0) return false;
            // Ensure at least one spouse has a name field populated
            const hasNamedSpouse = arr.some(s => {
                if (!s || typeof s !== 'object') return false;
                const full = (s.full_name || '').trim();
                const fn = (s.first_name || '').trim();
                const sn = (s.surname || '').trim();
                const on = (s.other_names || '').trim();
                return !!(full || fn || sn || on);
            });
            return hasNamedSpouse;
        })
        .withMessage('At least one spouse must be provided with a name when marital_status is married'),
    body('declaration_type')
        .notEmpty().withMessage('declaration_type required')
        .isString().trim().isLength({ max: 20 }),
    body('declaration_date')
        .optional({ nullable: true })
        .custom(v=>{ if(!v) return true; if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return true; if(/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return true; throw new Error('declaration_date must be YYYY-MM-DD or DD/MM/YYYY'); }),
    body('biennial_income')
        .optional()
        .custom(v=>{ if(Array.isArray(v)) return v.length<=200; if(typeof v==='string') return v.length<=5000; return false; })
        .withMessage('biennial_income invalid format/size'),
    body('assets').optional().custom(v=>{ if(Array.isArray(v)) return v.length<=500; if(typeof v==='string') return v.length<=5000; return false; }).withMessage('assets invalid'),
    body('liabilities').optional().custom(v=>{ if(Array.isArray(v)) return v.length<=500; if(typeof v==='string') return v.length<=5000; return false; }).withMessage('liabilities invalid'),
    body('other_financial_info').optional().isLength({ max: 5000 }).withMessage('other_financial_info too long'),
    body('period_start_date').optional().isISO8601().withMessage('period_start_date must be ISO date'),
    body('period_end_date').optional().isISO8601().withMessage('period_end_date must be ISO date')
];
