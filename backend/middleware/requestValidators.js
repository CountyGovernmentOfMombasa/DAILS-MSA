// Centralized reusable request validators & error handler
// Uses express-validator to enforce consistent constraints across routes
// Only light-weight synchronous validation here (no DB). Heavier semantic validation stays in controllers.

const { query, body, param, validationResult } = require('express-validator');

// Reusable fragments
const pagination = [
  query('page').optional().isInt({ min: 1, max: 100000 }).toInt().withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 500 }).toInt().withMessage('limit must be between 1 and 500')
];

const searchOptional = [
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('search too long (max 100 chars)')
];

const dateRange = [
  query('from').optional().isISO8601().withMessage('from must be ISO date (YYYY-MM-DD)'),
  query('to').optional().isISO8601().withMessage('to must be ISO date (YYYY-MM-DD)'),
  // Custom logical check: from <= to if both exist
  (req, res, next) => {
    const { from, to } = req.query;
    if (from && to && new Date(from) > new Date(to)) {
      const { errorResponse } = require('./errorResponse');
      return errorResponse(res, 400, { message: 'Validation failed', code: 'VALIDATION_FAILED', details: [{ field:'from', message:'from must be before or equal to to', value: from, location:'query', code:'VALIDATION_FROM' }] });
    }
    return next();
  }
];

const sortDir = query('sortDir').optional().isIn(['asc', 'desc']).withMessage('Invalid sortDir');

// Admin user listing validators
const adminUserList = [
  ...pagination,
  ...searchOptional,
  query('emailFilter').optional().isIn(['all', 'with-email', 'without-email']).withMessage('Invalid emailFilter'),
  query('sortBy').optional().isIn(['payroll_number','surname','first_name','department','email','national_id','birthdate']).withMessage('Invalid sortBy'),
  sortDir
];

// Status audit (shared pattern)
const statusAudit = [
  ...pagination,
  ...dateRange,
  query('status').optional().isIn(['pending','approved','rejected']).withMessage('Invalid status'),
  query('admin').optional().isString().trim().isLength({ max: 60 }).withMessage('admin filter too long'),
  query('declarationId').optional().isInt({ min: 1 }).toInt()
];

// Update user email
const updateUserEmailBody = [
  param('userId').isInt({ min: 1 }).withMessage('userId must be integer'),
  body('email').isEmail().withMessage('Invalid email').normalizeEmail()
];

// User profile update (only certain fields allowed) - reuses similar rules to updateMe but requires param userId
const userProfileUpdate = [
  param('userId').isInt({ min: 1 }).withMessage('userId must be integer'),
  body('email').optional().isEmail().withMessage('Invalid email').normalizeEmail(),
  body('full_name').optional().isString().trim().isLength({ min: 2, max: 150 }).matches(/^[A-Za-z\-'\s]+$/).withMessage('full_name invalid characters'),
  body('address').optional().isString().trim().isLength({ max: 300 }).withMessage('address too long'),
  handleValidation
];

const userDelete = [
  param('userId').isInt({ min:1 }).withMessage('userId must be integer'),
  handleValidation
];

// Bulk email update
const bulkEmail = [
  body('userIds').isArray({ min: 1, max: 500 }).withMessage('userIds must be array 1..500'),
  body('userIds.*').isInt({ min: 1 }).withMessage('Each userId must be positive integer'),
  body('emailTemplate')
    .isString().withMessage('emailTemplate required')
    .isLength({ min: 5, max: 120 }).withMessage('emailTemplate length 5-120')
    .matches(/@/).withMessage('emailTemplate must include @ domain'),
];

// Admin login
const adminLogin = [
  body('username').isString().trim().isLength({ min: 3, max: 60 }).withMessage('Invalid username'),
  body('password').isString().isLength({ min: 8 }).withMessage('Password min length 8')
];

// Update own profile (/auth/me)
const updateMe = [
  body('first_name').optional().isString().trim().isLength({ min: 2, max: 100 }).matches(/^[A-Za-z'\-\s]+$/).withMessage('Invalid first_name'),
  body('other_names').optional().isString().trim().isLength({ min: 2, max: 100 }).matches(/^[A-Za-z'\-\s]+$/).withMessage('Invalid other_names'),
  body('surname').optional().isString().trim().isLength({ min: 2, max: 100 }).matches(/^[A-Za-z'\-\s]+$/).withMessage('Invalid surname'),
  body('email').optional().isEmail().withMessage('Invalid email').normalizeEmail(),
  body('payroll_number').optional().isString().trim().isLength({ min: 3, max: 50 }),
  body('designation').optional().isString().trim().isLength({ max: 120 }),
  body('department').optional().isString().trim().isLength({ max: 180 }),
  body('sub_department').optional().isString().trim().isLength({ max: 180 }),
  body('nature_of_employment').optional().isString().trim().isLength({ max: 120 }),
  body('phone_number').optional().matches(/^\+?[0-9]{7,15}$/).withMessage('Invalid phone_number format'),
  body('place_of_birth').optional().isString().trim().isLength({ max: 150 }).withMessage('place_of_birth too long'),
  body('postal_address').optional().isString().trim().isLength({ max: 300 }).withMessage('postal_address too long'),
  body('physical_address').optional().isString().trim().isLength({ max: 300 }).withMessage('physical_address too long'),
  body('birthdate').optional().custom(v => {
    // Accept YYYY-MM-DD or DD/MM/YYYY
    if (!v) return true;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return true;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return true;
    throw new Error('birthdate must be YYYY-MM-DD or DD/MM/YYYY');
  }),
  body('marital_status')
    .optional()
    .customSanitizer(v => typeof v === 'string' ? v.toLowerCase().trim() : v)
    .isIn(['single','married','divorced','widowed','separated'])
    .withMessage('Invalid marital_status'),
];

// Declaration status update
const declarationStatusUpdate = [
  param('declarationId').isInt({ min: 1 }).withMessage('Invalid declarationId'),
  body('status').isIn(['approved','rejected']).withMessage('status must be approved or rejected'),
  body('correction_message').optional().isString().isLength({ max: 2000 }).withMessage('correction_message too long')
];

// Generic simple body helpers
const requireBodyField = (field, chain) => [ chain.withMessage(`${field} invalid`) ];

// Consent submission validator
const consentSubmit = [
  body('full_name').isString().isLength({ min:2, max:150 }).withMessage('full_name length 2-150'),
  body('national_id').isString().isLength({ min:4, max:30 }).withMessage('national_id length 4-30'),
  body('designation').optional().isString().isLength({ max:120 }).withMessage('designation too long'),
  body('signed').isBoolean().withMessage('signed must be boolean'),
  handleValidation
];

// Generic validator terminator
const { errorResponse } = require('./errorResponse');
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map(e => {
      const fieldName = e.path || e.param || 'field';
      return {
        field: fieldName,
        message: e.msg,
        value: e.value,
        location: e.location,
        code: `VALIDATION_${fieldName.toUpperCase()}`
      };
    });
    return errorResponse(res, 400, { message: 'Validation failed', code: 'VALIDATION_FAILED', details });
  }
  return next();
}

// Generic list query validator builder to avoid duplicate inline arrays in routes
// Options:
//  - includeDepartment: adds optional department filter
//  - pageMax / limitMax: override default maximums for page & limit
//  - extra: array of additional express-validator chains
function listQuery(options = {}) {
  const { includeDepartment = false, pageMax = 500, limitMax = 500, extra = [], sortKeys = [] } = options;
  const pageLimit = [
    query('page').optional().isInt({ min: 1, max: pageMax }).toInt().withMessage(`page must be between 1 and ${pageMax}`),
    query('limit').optional().isInt({ min: 1, max: limitMax }).toInt().withMessage(`limit must be between 1 and ${limitMax}`)
  ];
  const department = includeDepartment
    ? [query('department').optional().isString().trim().isLength({ max: 100 }).withMessage('department too long')]
    : [];
  const sorters = sortKeys.length ? [
    query('sortBy').optional().isIn(sortKeys).withMessage('Invalid sortBy'),
    query('sortDir').optional().isIn(['asc','desc']).withMessage('Invalid sortDir')
  ] : [];
  return [
    ...pageLimit,
    ...searchOptional, // includes trimming & max length enforcement
    ...department,
    ...sorters,
    ...extra,
    handleValidation
  ];
}

module.exports = {
  pagination,
  searchOptional,
  dateRange,
  adminUserList,
  statusAudit,
  updateUserEmailBody,
  bulkEmail,
  adminLogin,
  updateMe,
  declarationStatusUpdate,
  consentSubmit,
  userProfileUpdate,
  userDelete,
  listQuery,
  handleValidation
};
