// IT Admin Controller
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const User = require('../models/userModel');
const crypto = require('crypto');
const { createOtp } = require('../util/otp');

function maskPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9+]/g, '');
  if (digits.length <= 4) return '****';
  return digits.substring(0, 4) + '******' + digits.substring(digits.length - 2);
}

exports.getITAdminDeclarations = async (req, res) => {
  try {
    const role = (req.admin && (req.admin.normalizedRole || req.admin.role)) || '';
    // Only IT and Super admins can use IT module endpoints
    if (!['it','it_admin','super','super_admin'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    let departmentFilter = '';
    let params = [];
    // IT and Super can view all departments; no filter. Any other roles would be blocked above.
    const [declarations] = await pool.query(`
      SELECT 
        d.id, d.user_id, d.declaration_date, d.status, d.declaration_type, d.correction_message,
        u.first_name, u.other_names, u.surname, u.payroll_number, u.email, u.department
      FROM declarations d
      JOIN users u ON d.user_id = u.id
      WHERE 1=1 ${departmentFilter}
      ORDER BY d.declaration_date DESC
    `, params);

    // For each declaration, fetch spouses and children
    const declarationIds = declarations.map(d => d.id);
    let spouses = [];
    let children = [];
    if (declarationIds.length > 0) {
      [spouses] = await pool.query(`SELECT * FROM spouses WHERE declaration_id IN (?)`, [declarationIds]);
      [children] = await pool.query(`SELECT * FROM children WHERE declaration_id IN (?)`, [declarationIds]);
    }

    // Attach spouses and children to each declaration
    const data = declarations.map(declaration => ({
      ...declaration,
      spouses: spouses.filter(s => s.declaration_id === declaration.id),
      children: children.filter(c => c.declaration_id === declaration.id)
    }));

    return res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get IT admin declarations error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error while fetching IT admin declarations',
      error: error.message 
    });
  }
};

exports.createAdminUser = async (req, res) => {
  try {
    const {
      username,
      password,
      role: rawRole,
      department,
      sub_department = null,
      first_name,
      surname,
      other_names = null,
      email = null
    } = req.body;

    // Dynamic department config (DB-backed with cache; fallback to static enums)
    const { getDepartmentConfig } = require('../util/departmentsCache');
    const { departments: ALLOWED_DEPARTMENTS, subDepartmentMap: SUB_DEPARTMENT_MAP } = await getDepartmentConfig();

    // Role normalization (front-end may send short forms)
    const roleMap = {
      hr: 'hr_admin',
      it: 'it_admin',
      super: 'super_admin'
    };
    let role = rawRole;
    if (roleMap[role]) role = roleMap[role];

  const allowedRoles = ['super_admin', 'hr_admin', 'it_admin'];

    if (!username || !password || !role || !first_name || !surname) {
      return res.status(400).json({ message: 'Username, password, role, first_name and surname are required.' });
    }
    if (role !== 'super_admin' && department && SUB_DEPARTMENT_MAP[department]) {
      const subs = SUB_DEPARTMENT_MAP[department];
      if (subs.length > 1 && !sub_department) {
        return res.status(400).json({ message: 'Sub Department is required for the selected department.' });
      }
      if (sub_department && !subs.includes(sub_department)) {
        return res.status(400).json({ message: 'Invalid sub_department for the specified department.' });
      }
    }
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role supplied.' });
    }

    // Enforce department for non-super roles & validate department value
    if (role !== 'super_admin') {
      if (!department) {
        return res.status(400).json({ message: 'Department is required for non-super admin roles.' });
      }
      if (!ALLOWED_DEPARTMENTS.includes(department)) {
        return res.status(400).json({ message: 'Invalid department.' });
      }
    }

    // Check if username exists
    const [existing] = await pool.query('SELECT id FROM admin_users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Username already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Attempt inserts with progressive fallback (modern -> legacy surname=last_name -> no department)
    const insertAttempts = [
      {
        sql: 'INSERT INTO admin_users (username, password, role, department, sub_department, first_name, surname, other_names, email, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)',
        params: [username, hashedPassword, role, role === 'super_admin' ? null : department, role === 'super_admin' ? null : sub_department, first_name, surname, other_names, email]
      },
      {
        // legacy last_name
        sql: 'INSERT INTO admin_users (username, password, role, department, first_name, last_name, other_names, email, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)',
        params: [username, hashedPassword, role, role === 'super_admin' ? null : department, first_name, surname, other_names, email]
      },
      {
        // extreme fallback no department, last_name only
        sql: 'INSERT INTO admin_users (username, password, role, first_name, last_login, created_at, updated_at, last_name, is_active) VALUES (?, ?, ?, ?, NULL, NOW(), NOW(), ?, TRUE)',
        params: [username, hashedPassword, role, first_name, surname]
      }
    ];

    let inserted = false;
    let newAdminId = null;
    for (let i = 0; i < insertAttempts.length; i++) {
      const attempt = insertAttempts[i];
      try {
        const [result] = await pool.query(attempt.sql, attempt.params);
        inserted = true;
        newAdminId = result.insertId || null;
        break;
      } catch (err) {
        if (!(err && err.code === 'ER_BAD_FIELD_ERROR') || i === insertAttempts.length - 1) {
          if (!inserted) {
            console.error('Create admin user insert failed (attempt', i, '):', err.message);
          }
          if (i === insertAttempts.length - 1) {
            throw err;
          }
          // else fall through to next attempt
        }
      }
    }

    // Audit log (best effort)
    if (inserted && newAdminId) {
      try {
        await pool.query(
          'INSERT INTO admin_creation_audit (admin_id, created_by_admin_id, creator_role, ip_address, new_admin_username, new_admin_role, new_admin_department, new_admin_sub_department, new_admin_first_name, new_admin_surname) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            newAdminId,
            (req.admin && req.admin.adminId) || null,
            (req.admin && req.admin.role) || null,
            req.ip || req.headers['x-forwarded-for'] || null,
            username,
            role,
            role === 'super_admin' ? null : department,
            role === 'super_admin' ? null : sub_department,
            first_name,
            surname
          ]
        );
      } catch (auditErr) {
        console.warn('Admin creation audit insert failed:', auditErr.message);
      }
    }

    return res.json({ success: true, message: 'Admin user created successfully.', admin_id: newAdminId });
  } catch (error) {
    console.error('Create admin user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while creating admin user',
      error: error.message
    });
  }
};

// Create a regular (non-admin) user via protected admin route
// Password strategy: initial password set to the user's birthdate (same approach as public register logic)
// Front-end first-login flow relies on password_changed flag; default value 0 is set in model create.
exports.createRegularUser = async (req, res) => {
  try {
    const {
      national_id,
      payroll_number = null,
      birthdate,
      first_name,
      surname,
      other_names = '',
      email,
      place_of_birth = null,
      postal_address = null,
      physical_address = null,
      designation = null,
      department = null,
      sub_department = null,
      nature_of_employment = null,
      marital_status = null,
      phone_number = null
    } = req.body;

    // Basic validation
    const missing = [];
    if (!national_id) missing.push('national_id');
    if (!first_name) missing.push('first_name');
    if (!surname) missing.push('surname');
    if (!email) missing.push('email');
    if (!birthdate) missing.push('birthdate');
    if (missing.length) {
      return res.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` });
    }

    // Duplicate checks (national_id/email first)
    const exists = await User.existsByNationalIdOrEmail(national_id, email);
    if (exists) {
      return res.status(409).json({ message: 'User already exists with this National ID or email.' });
    }
    // Phone uniqueness check (shared util)
    const { isValidPhone, normalizePhone } = require('../util/phone');
    let normalizedPhone = phone_number;
    if (phone_number) {
      if (!isValidPhone(phone_number)) {
        return res.status(400).json({ success:false, code:'INVALID_PHONE_FORMAT', field:'phone_number', message: 'Invalid phone_number format. Use 7-15 digits, optional leading +' });
      }
      normalizedPhone = normalizePhone(phone_number);
      const phoneInUse = await User.existsByPhone(normalizedPhone);
      if (phoneInUse) {
        return res.status(409).json({ success:false, code:'PHONE_IN_USE', field:'phone_number', message: 'Phone number already in use by another user.' });
      }
    }

  // Standardized initial password policy: fixed default that triggers forced change on first login flow.
  // Align with login flow expecting default 'Change@001'.
  const INITIAL_DEFAULT_PASSWORD = 'Change@001';
      if (department && !sub_department) {
        return res.status(400).json({ success: false, message: 'sub_department is required when department is provided.' });
      }
      const userId = await User.create({
      national_id,
      payroll_number,
      birthdate,
      password: INITIAL_DEFAULT_PASSWORD,
      first_name,
      surname,
      other_names,
      email,
      place_of_birth,
      postal_address,
      physical_address,
      designation,
      department,
      sub_department,
      nature_of_employment,
      marital_status,
      phone_number: normalizedPhone
    });

    // Audit log
    try {
      await pool.query(
        'INSERT INTO user_creation_audit (user_id, created_by_admin_id, admin_role, ip_address, user_national_id, user_email, user_department, user_sub_department, user_employment_nature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          userId,
          (req.admin && req.admin.adminId) || null,
          (req.admin && req.admin.role) || null,
          req.ip || req.headers['x-forwarded-for'] || null,
          national_id,
          email,
          department,
          sub_department || null,
          nature_of_employment
        ]
      );
    } catch (logErr) {
      console.warn('User creation audit insert failed:', logErr.message);
    }

    return res.status(201).json({ success: true, message: 'User created successfully.', userId, defaultPassword: INITIAL_DEFAULT_PASSWORD });
  } catch (error) {
    console.error('Create regular user error (admin route):', error);
    // Graceful duplicate phone fallback if race condition triggers DB unique index error
    if (error && error.code === 'ER_DUP_ENTRY' && /phone_number/.test(error.message)) {
      return res.status(409).json({ success: false, code:'PHONE_IN_USE', field:'phone_number', message: 'Phone number already in use by another user.' });
    }
    return res.status(500).json({ success: false, message: 'Server error while creating user', error: error.message });
  }
};

// Retrieve user creation audit log entries (IT / Super admins)
exports.getUserCreationAudit = async (req, res) => {
  try {
    const role = (req.admin && (req.admin.role || req.admin.normalizedRole)) || '';
    if (!['it','super','it_admin','super_admin'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Insufficient role to view user creation audit.' });
    }
    const {
      page = 1,
      limit = 50,
      adminId,
      userId,
      nationalId,
      department,
  employmentNature,
  sub_department,
      from,
      to,
      search = '',
      sortBy = 'created_at',
      sortDir = 'desc'
    } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 50, 500);
    const offset = (pageNum - 1) * limitNum;
    const conditions = [];
    const params = [];
    if (adminId) { conditions.push('uca.created_by_admin_id = ?'); params.push(adminId); }
    if (userId) { conditions.push('uca.user_id = ?'); params.push(userId); }
    if (nationalId) { conditions.push('uca.user_national_id = ?'); params.push(nationalId); }
    if (department) { conditions.push('uca.user_department = ?'); params.push(department); }
  if (employmentNature) { conditions.push('uca.user_employment_nature = ?'); params.push(employmentNature); }
  if (sub_department) { conditions.push('uca.user_sub_department = ?'); params.push(sub_department); }
    if (from) { conditions.push('uca.created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('uca.created_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search && search.trim()) {
      const term = '%' + search.toLowerCase().trim() + '%';
  conditions.push(`(LOWER(uca.user_email) LIKE ? OR LOWER(uca.user_national_id) LIKE ? OR LOWER(uca.user_department) LIKE ? OR LOWER(uca.user_sub_department) LIKE ?)`);
  params.push(term, term, term, term);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const sortable = new Set(['created_at','user_id','created_by_admin_id','user_email','user_department','user_sub_department']);
    const orderColumn = sortable.has(sortBy) ? sortBy : 'created_at';
    const direction = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM user_creation_audit uca ${whereClause}`, params);
    const total = countRows[0]?.total || 0;
    const [rows] = await pool.query(
  `SELECT id, user_id, created_by_admin_id, admin_role, ip_address, user_national_id, user_email, user_department, user_sub_department, user_employment_nature, created_at
       FROM user_creation_audit uca
       ${whereClause}
       ORDER BY ${orderColumn === 'user_id' ? 'uca.user_id' : orderColumn === 'created_by_admin_id' ? 'uca.created_by_admin_id' : 'uca.' + orderColumn} ${direction}, uca.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    return res.json({ success: true, data: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
  } catch (error) {
    console.error('Get user creation audit error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching audit log', error: error.message });
  }
};

// Retrieve admin creation audit log entries (IT / Super admins)
exports.getAdminCreationAudit = async (req, res) => {
  try {
    const role = (req.admin && (req.admin.role || req.admin.normalizedRole)) || '';
    if (!['it','it_admin','super','super_admin'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Insufficient role to view admin creation audit.' });
    }
    const {
      page = 1,
      limit = 50,
      createdByAdminId,
      adminId,
      newRole,
      department,
      sub_department,
      from,
      to,
      search = '',
      sortBy = 'created_at',
      sortDir = 'desc'
    } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 50, 500);
    const offset = (pageNum - 1) * limitNum;
    const conditions = [];
    const params = [];
    if (createdByAdminId) { conditions.push('aca.created_by_admin_id = ?'); params.push(createdByAdminId); }
    if (adminId) { conditions.push('aca.admin_id = ?'); params.push(adminId); }
    if (newRole) { conditions.push('aca.new_admin_role = ?'); params.push(newRole); }
  if (department) { conditions.push('aca.new_admin_department = ?'); params.push(department); }
  if (sub_department) { conditions.push('aca.new_admin_sub_department = ?'); params.push(sub_department); }
    if (from) { conditions.push('aca.created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('aca.created_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search && search.trim()) {
      const term = '%' + search.toLowerCase().trim() + '%';
  conditions.push('(LOWER(aca.new_admin_username) LIKE ? OR LOWER(aca.new_admin_role) LIKE ? OR LOWER(aca.new_admin_department) LIKE ? OR LOWER(aca.new_admin_sub_department) LIKE ? OR LOWER(aca.new_admin_first_name) LIKE ? OR LOWER(aca.new_admin_surname) LIKE ?)');
  params.push(term, term, term, term, term, term);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const sortable = new Set(['created_at','admin_id','created_by_admin_id','new_admin_role','new_admin_department','new_admin_sub_department','new_admin_username']);
    const column = sortable.has(sortBy) ? sortBy : 'created_at';
    const direction = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM admin_creation_audit aca ${whereClause}`, params);
    const total = countRows[0]?.total || 0;
    const [rows] = await pool.query(
  `SELECT id, admin_id, created_by_admin_id, creator_role, ip_address, new_admin_username, new_admin_role, new_admin_department, new_admin_sub_department, new_admin_first_name, new_admin_surname, created_at
       FROM admin_creation_audit aca
       ${whereClause}
       ORDER BY aca.${column} ${direction}, aca.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    return res.json({ success: true, data: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
  } catch (error) {
    console.error('Get admin creation audit error:', error);
    return res.status(500).json({ success: false, message: 'Server error fetching admin audit log', error: error.message });
  }
};

// Export admin creation audit as CSV
exports.exportAdminCreationAuditCsv = async (req, res) => {
  try {
  const role = (req.admin && (req.admin.role || req.admin.normalizedRole)) || '';
  if (!['it','it_admin','super','super_admin'].includes(role)) return res.status(403).json({ success: false, message: 'Forbidden' });
  const { from, to, department, createdByAdminId, newRole, sub_department, search = '' } = req.query;
    const conditions = [];
    const params = [];
    if (createdByAdminId) { conditions.push('aca.created_by_admin_id = ?'); params.push(createdByAdminId); }
  if (department) { conditions.push('aca.new_admin_department = ?'); params.push(department); }
  if (sub_department) { conditions.push('aca.new_admin_sub_department = ?'); params.push(sub_department); }
    if (newRole) { conditions.push('aca.new_admin_role = ?'); params.push(newRole); }
    if (from) { conditions.push('aca.created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('aca.created_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search && search.trim()) {
      const term = '%' + search.toLowerCase().trim() + '%';
  conditions.push('(LOWER(aca.new_admin_username) LIKE ? OR LOWER(aca.new_admin_role) LIKE ? OR LOWER(aca.new_admin_department) LIKE ? OR LOWER(aca.new_admin_sub_department) LIKE ? OR LOWER(aca.new_admin_first_name) LIKE ? OR LOWER(aca.new_admin_surname) LIKE ?)');
  params.push(term, term, term, term, term, term);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.query(
  `SELECT id, admin_id, created_by_admin_id, creator_role, ip_address, new_admin_username, new_admin_role, new_admin_department, new_admin_sub_department, new_admin_first_name, new_admin_surname, created_at
       FROM admin_creation_audit aca
       ${whereClause}
       ORDER BY aca.created_at DESC
       LIMIT 10000`,
      params
    );
  const header = ['id','admin_id','created_by_admin_id','creator_role','ip_address','new_admin_username','new_admin_role','new_admin_department','new_admin_sub_department','new_admin_first_name','new_admin_surname','created_at'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(header.map(k => {
        const v = r[k];
        if (v === null || v === undefined) return '';
        const s = String(v).replace(/"/g,'""');
        return /[",\n]/.test(s) ? '"' + s + '"' : s;
      }).join(','));
    }
    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="admin_creation_audit.csv"');
    return res.send(csv);
  } catch (error) {
    console.error('Export admin creation audit CSV error:', error);
    return res.status(500).json({ success: false, message: 'Server error exporting CSV' });
  }
};

// Export admin creation audit as PDF
exports.exportAdminCreationAuditPdf = async (req, res) => {
  try {
  const role = (req.admin && (req.admin.role || req.admin.normalizedRole)) || '';
  if (!['it','it_admin','super','super_admin'].includes(role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const PDFDocument = require('pdfkit');
  const { from, to, department, createdByAdminId, newRole, sub_department, search = '' } = req.query;
    const conditions = [];
    const params = [];
    if (createdByAdminId) { conditions.push('aca.created_by_admin_id = ?'); params.push(createdByAdminId); }
  if (department) { conditions.push('aca.new_admin_department = ?'); params.push(department); }
  if (sub_department) { conditions.push('aca.new_admin_sub_department = ?'); params.push(sub_department); }
    if (newRole) { conditions.push('aca.new_admin_role = ?'); params.push(newRole); }
    if (from) { conditions.push('aca.created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('aca.created_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search && search.trim()) {
      const term = '%' + search.toLowerCase().trim() + '%';
  conditions.push('(LOWER(aca.new_admin_username) LIKE ? OR LOWER(aca.new_admin_role) LIKE ? OR LOWER(aca.new_admin_department) LIKE ? OR LOWER(aca.new_admin_sub_department) LIKE ? OR LOWER(aca.new_admin_first_name) LIKE ? OR LOWER(aca.new_admin_surname) LIKE ?)');
  params.push(term, term, term, term, term, term);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.query(
  `SELECT id, admin_id, created_by_admin_id, creator_role, ip_address, new_admin_username, new_admin_role, new_admin_department, new_admin_sub_department, new_admin_first_name, new_admin_surname, created_at
       FROM admin_creation_audit aca
       ${whereClause}
       ORDER BY aca.created_at DESC
       LIMIT 5000`,
      params
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="admin_creation_audit.pdf"');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);
    doc.fontSize(16).text('Admin Creation Audit Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`);
    if (department) doc.text(`Department: ${department}`);
    if (from || to) doc.text(`Range: ${from || '...'} to ${to || '...'}`);
    if (search) doc.text(`Search: ${search}`);
    doc.moveDown(0.5);
  const headers = ['Created At','Admin ID','Username','Role','Dept','Sub Dept','First Name','Surname','By Admin','Creator Role'];
    doc.fontSize(9).text(headers.join(' | '));
    doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();
    rows.forEach(r => {
      const line = [
        (r.created_at instanceof Date ? r.created_at.toISOString().replace('T',' ').substring(0,19) : r.created_at),
        r.admin_id,
        r.new_admin_username || '',
        r.new_admin_role || '',
  r.new_admin_department || '',
  r.new_admin_sub_department || '',
        r.new_admin_first_name || '',
        r.new_admin_surname || '',
        r.created_by_admin_id || '',
        r.creator_role || ''
      ].join(' | ');
      doc.text(line);
    });
    doc.end();
  } catch (error) {
    console.error('Export admin creation audit PDF error:', error);
    return res.status(500).json({ success: false, message: 'Server error exporting PDF' });
  }
};

// Export user creation audit as CSV
exports.exportUserCreationAuditCsv = async (req, res) => {
  try {
  const role = (req.admin && (req.admin.role || req.admin.normalizedRole)) || '';
  if (!['it','super','it_admin','super_admin'].includes(role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    // Reuse filtering logic by calling getUserCreationAudit internals (duplicated minimal subset)
  const { from, to, department, adminId, employmentNature, sub_department, search = '' } = req.query;
    const conditions = [];
    const params = [];
    if (adminId) { conditions.push('uca.created_by_admin_id = ?'); params.push(adminId); }
  if (department) { conditions.push('uca.user_department = ?'); params.push(department); }
  if (sub_department) { conditions.push('uca.user_sub_department = ?'); params.push(sub_department); }
    if (employmentNature) { conditions.push('uca.user_employment_nature = ?'); params.push(employmentNature); }
    if (from) { conditions.push('uca.created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('uca.created_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search && search.trim()) {
      const term = '%' + search.toLowerCase().trim() + '%';
  conditions.push('(LOWER(uca.user_email) LIKE ? OR LOWER(uca.user_national_id) LIKE ? OR LOWER(uca.user_department) LIKE ? OR LOWER(uca.user_sub_department) LIKE ?)');
  params.push(term, term, term, term);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.query(`
  SELECT id, user_id, created_by_admin_id, admin_role, ip_address, user_national_id, user_email, user_department, user_sub_department, user_employment_nature, created_at
      FROM user_creation_audit uca
      ${whereClause}
      ORDER BY uca.created_at DESC
      LIMIT 10000
    `, params);
  const header = ['id','user_id','created_by_admin_id','admin_role','ip_address','user_national_id','user_email','user_department','user_sub_department','user_employment_nature','created_at'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(header.map(k => {
        const v = r[k];
        if (v === null || v === undefined) return '';
        const s = String(v).replace(/"/g,'""');
        return /[",\n]/.test(s) ? `"${s}`.replace(/$/,'"') : s;
      }).join(','));
    }
    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="user_creation_audit.csv"');
    return res.send(csv);
  } catch (error) {
    console.error('Export user creation audit CSV error:', error);
    return res.status(500).json({ success: false, message: 'Server error exporting CSV' });
  }
};

// Export user creation audit as PDF (simple list)
exports.exportUserCreationAuditPdf = async (req, res) => {
  try {
  const role = (req.admin && (req.admin.role || req.admin.normalizedRole)) || '';
  if (!['it','super','it_admin','super_admin'].includes(role)) return res.status(403).json({ success: false, message: 'Forbidden' });
    const PDFDocument = require('pdfkit');
  const { from, to, department, adminId, employmentNature, sub_department, search = '' } = req.query;
    const conditions = [];
    const params = [];
    if (adminId) { conditions.push('uca.created_by_admin_id = ?'); params.push(adminId); }
  if (department) { conditions.push('uca.user_department = ?'); params.push(department); }
  if (sub_department) { conditions.push('uca.user_sub_department = ?'); params.push(sub_department); }
    if (employmentNature) { conditions.push('uca.user_employment_nature = ?'); params.push(employmentNature); }
    if (from) { conditions.push('uca.created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('uca.created_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search && search.trim()) {
      const term = '%' + search.toLowerCase().trim() + '%';
  conditions.push('(LOWER(uca.user_email) LIKE ? OR LOWER(uca.user_national_id) LIKE ? OR LOWER(uca.user_department) LIKE ? OR LOWER(uca.user_sub_department) LIKE ?)');
  params.push(term, term, term, term);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.query(`
  SELECT id, user_id, created_by_admin_id, admin_role, ip_address, user_national_id, user_email, user_department, user_sub_department, user_employment_nature, created_at
      FROM user_creation_audit uca
      ${whereClause}
      ORDER BY uca.created_at DESC
      LIMIT 5000
    `, params);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="user_creation_audit.pdf"');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);
    doc.fontSize(16).text('User Creation Audit Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`);
    if (department) doc.text(`Department: ${department}`);
    if (from || to) doc.text(`Range: ${from || '...'} to ${to || '...'}`);
    if (search) doc.text(`Search: ${search}`);
    doc.moveDown(0.5);
  const headers = ['Created At','User ID','National ID','Email','Dept','Sub Dept','Emp Nature','By Admin','Role'];
    doc.fontSize(9).text(headers.join(' | '));
    doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();
    rows.forEach(r => {
      const line = [
        (r.created_at instanceof Date ? r.created_at.toISOString().replace('T',' ').substring(0,19) : r.created_at),
        r.user_id,
        r.user_national_id || '',
        r.user_email || '',
  r.user_department || '',
  r.user_sub_department || '',
        r.user_employment_nature || '',
        r.created_by_admin_id || '',
        r.admin_role || ''
      ].map(v => (v || '').toString().replace(/\s+/g,' '));
      doc.moveDown(0.2);
      doc.fontSize(8).text(line.join(' | '));
    });
    doc.end();
  } catch (error) {
    console.error('Export user creation audit PDF error:', error);
    return res.status(500).json({ success: false, message: 'Server error exporting PDF' });
  }
};

// === OTP Reveal / Regeneration for First-Time Login Assistance ===
// Allows IT / Super admins (and only within their department scope if constrained) to reveal
// an active first-time login OTP for a user who cannot access their phone. Optionally regenerates
// a new OTP (subject to the same rate limiting counters used during login flows).
// Route: POST /api/it-admin/users/:userId/reveal-otp  { reason: string, regenerate?: boolean, forceResendSms?: boolean }
// Security considerations:
//  - Requires admin token (handled by middleware)
//  - Role restricted to it_admin or super_admin
//  - Department scoped: non-super admins may only access users in their own department (and, if present, sub_department must match when admin has sub_department assigned)
//  - Mandatory reason captured & audited
//  - OTP not returned if user already changed password (flow no longer relevant)
//  - Optional regeneration respects existing otp_request_count hourly window (max 3)
//  - Audit table: otp_disclosure_audit (hashed_otp stores sha256 of code; only last 2 digits echoed masked for record integrity)
exports.revealUserOtp = async (req, res) => {
  try {
    const adminCtx = req.admin || {};
    const role = (adminCtx.role || adminCtx.normalizedRole || '').toLowerCase();
    if (!['it_admin','super_admin','it','super'].includes(role)) {
      return res.status(403).json({ success:false, message: 'Insufficient role to reveal OTP.' });
    }
    const userId = parseInt(req.params.userId, 10);
    if (!userId || userId <= 0) {
      return res.status(400).json({ success:false, message: 'Invalid userId parameter.' });
    }
  const { reason, regenerate = false, forceResendSms = false } = req.body || {};
    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({ success:false, message: 'A meaningful reason (min 5 chars) is required.' });
    }

    // Fetch user minimal fields needed
    const [rows] = await pool.query(`SELECT id, department, sub_department, otp_code, otp_expires_at, password_changed, phone_number, otp_request_count, otp_request_window_start FROM users WHERE id = ?`, [userId]);
    if (!rows.length) return res.status(404).json({ success:false, message: 'User not found.' });
    const user = rows[0];

    if (user.password_changed) {
      return res.status(400).json({ success:false, message: 'User has already changed password; OTP flow no longer applicable.' });
    }

    // Department scope enforcement for non-super roles
    const adminDept = adminCtx.department || null;
    const adminSub = adminCtx.sub_department || null;
    if (role !== 'super_admin' && role !== 'super') {
      if (adminDept && user.department && adminDept !== user.department) {
        return res.status(403).json({ success:false, message: 'Cannot access user outside your department.' });
      }
      if (adminSub && user.sub_department && adminSub !== user.sub_department) {
        return res.status(403).json({ success:false, message: 'Cannot access user outside your sub-department.' });
      }
    }

    let activeCode = user.otp_code || null;
    let expiry = user.otp_expires_at ? new Date(user.otp_expires_at) : null;
    const now = new Date();
    const hasActive = activeCode && expiry && now < expiry;

    // Rate limit counters reuse (same semantics as authController)
    let otp_request_count = user.otp_request_count || 0;
    let windowStart = user.otp_request_window_start ? new Date(user.otp_request_window_start) : null;
    const windowExpired = !windowStart || (now - windowStart) > 60*60*1000; // >1h

  let generated = false;
  let smsSent = false;
    if (regenerate || !hasActive) {
      // If no active code and regenerate not requested explicitly, we still generate fresh for support scenario
      const wantGenerate = regenerate || !hasActive;
      if (wantGenerate) {
        if (windowExpired) {
          otp_request_count = 0; // reset
        }
        if (otp_request_count >= 3) {
          return res.status(429).json({ success:false, message: 'OTP request limit reached (hourly). Try later.' });
        }
        const { code, expires } = createOtp();
        activeCode = code;
        expiry = expires;
        otp_request_count += 1;
        generated = true;
        if (windowExpired) {
          await pool.query(`UPDATE users SET otp_code = ?, otp_expires_at = ?, otp_request_count = ?, otp_request_window_start = NOW() WHERE id = ?`, [activeCode, expiry, otp_request_count, userId]);
        } else {
          await pool.query(`UPDATE users SET otp_code = ?, otp_expires_at = ?, otp_request_count = ? WHERE id = ?`, [activeCode, expiry, otp_request_count, userId]);
        }
        // Attempt SMS delivery (best effort)
        if (user.phone_number) {
          try {
            const sendSMS = require('../util/sendSMS');
            await sendSMS({ to: user.phone_number, body: `Your WDP one-time code is ${activeCode}. It expires in 6 hours.` });
            smsSent = true;
          } catch (e) {
            console.warn('Failed to send OTP SMS (IT reveal regenerate):', e.message);
          }
        }
      }
    }

    // Force resend SMS if requested and we did not generate a new OTP
    if (!generated && forceResendSms) {
      if (!activeCode || !expiry || now >= expiry) {
        return res.status(400).json({ success:false, message: 'No active OTP to resend. Use regenerate=true.' });
      }
      if (user.phone_number) {
        try {
          const sendSMS = require('../util/sendSMS');
          await sendSMS({ to: user.phone_number, body: `Your WDP one-time code is ${activeCode}. It expires in 6 hours.` });
          smsSent = true;
        } catch (e) {
          console.warn('Failed to re-send existing OTP SMS:', e.message);
        }
      }
    }
    
    if (!activeCode || !expiry || now >= expiry) {
      return res.status(404).json({ success:false, message: 'No active OTP. Set regenerate=true to create one.' });
    }

    // (Moved existence check above audit section)

    // Audit (best effort) - hash OTP so we do not store plaintext; also keep last2 for traceability
    let alertNeeded = false;
    try {
      const hash = crypto.createHash('sha256').update(String(activeCode)).digest('hex');
      // NOTE: Column list has 12 columns; ensure placeholders match (12)
      const { logOtpDisclosure } = require('../util/auditLogger');
      await logOtpDisclosure({
        userId,
        adminId: adminCtx.adminId,
        adminRole: adminCtx.role,
        adminDept,
        adminSubDept: adminSub,
        action: generated ? 'REGENERATE' : 'VIEW',
        reason,
        hash,
        last2: String(activeCode).slice(-2),
        generated,
        ip: req.ip,
        ua: req.headers['user-agent']
      });
      // Simple threshold alerting: if more than X disclosures by same admin in rolling window
      const MAX_WINDOW = 60 * 60 * 1000; // 1h
      const ADMIN_THRESHOLD = parseInt(process.env.OTP_DISCLOSURE_ADMIN_THRESHOLD || '10',10); // default 10
      const GLOBAL_THRESHOLD = parseInt(process.env.OTP_DISCLOSURE_GLOBAL_THRESHOLD || '100',10); // default 100
      const [recentAdmin] = await pool.query(`SELECT COUNT(*) AS c FROM otp_disclosure_audit WHERE admin_id = ? AND created_at >= (NOW() - INTERVAL 1 HOUR)`, [adminCtx.adminId || 0]);
      const [recentGlobal] = await pool.query(`SELECT COUNT(*) AS c FROM otp_disclosure_audit WHERE created_at >= (NOW() - INTERVAL 1 HOUR)`);
      if ((recentAdmin[0]?.c || 0) > ADMIN_THRESHOLD || (recentGlobal[0]?.c || 0) > GLOBAL_THRESHOLD) {
        alertNeeded = true;
      }
    } catch (auditErr) {
      console.warn('OTP disclosure audit insert failed:', auditErr.message);
    }

    if (alertNeeded) {
      // Fire-and-forget email alert (rate-limited by env thresholds; further throttling could be added)
      try {
        const sendEmail = require('../util/sendEmail');
        await sendEmail({
          to: process.env.SECURITY_ALERT_EMAIL || process.env.MAIL_FROM_ADDR || process.env.MAIL_USERNAME,
          subject: 'High OTP Disclosure Volume Alert',
          text: `Potential unusual OTP disclosure activity detected by admin ${adminCtx.adminId}. Please review the otp_disclosure_audit table.`,
          html: `<p><strong>Alert:</strong> Potential unusual OTP disclosure activity.</p><p>Admin: ${adminCtx.adminId}<br/>Role: ${adminCtx.role}<br/>Time: ${new Date().toISOString()}</p><p>Review the <code>otp_disclosure_audit</code> table for details.</p>`
        });
      } catch (e) {
        console.warn('Failed to send OTP disclosure alert email:', e.message);
      }
    }

    return res.json({
      success: true,
      userId,
      otp: activeCode,
      expiresAt: expiry.toISOString(),
      generated,
      maskedPhone: maskPhone(user.phone_number),
      smsSent,
  note: 'OTP is valid for 6 hours. Provide directly to the verified user; do not store or transmit insecurely.'
    });
  } catch (error) {
    console.error('Reveal OTP error:', error);
    return res.status(500).json({ success:false, message: 'Server error revealing OTP', error: error.message });
  }
};

// View OTP disclosure audit with pagination & filtering
// GET /api/it-admin/otp-disclosure-audit?adminId=&userId=&from=&to=&action=&page=&limit=&search=
exports.getOtpDisclosureAudit = async (req, res) => {
  try {
    const adminCtx = req.admin || {};
    const role = (adminCtx.role || adminCtx.normalizedRole || '').toLowerCase();
    if (!['it_admin','super_admin','it','super'].includes(role)) {
      return res.status(403).json({ success:false, message: 'Forbidden' });
    }
    const {
      adminId,
      userId,
      action,
      from,
      to,
      search = '',
      page = 1,
      limit = 50
    } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * limitNum;
    const conditions = [];
    const params = [];
    if (adminId) { conditions.push('oda.admin_id = ?'); params.push(adminId); }
    if (userId) { conditions.push('oda.user_id = ?'); params.push(userId); }
    if (action) { conditions.push('oda.action = ?'); params.push(action); }
    if (from) { conditions.push('oda.created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('oda.created_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search) {
      const term = '%' + search.toLowerCase().trim() + '%';
      conditions.push('(LOWER(oda.reason) LIKE ? OR LOWER(oda.admin_role) LIKE ? OR LOWER(oda.admin_department) LIKE ? OR LOWER(oda.admin_sub_department) LIKE ?)');
      params.push(term, term, term, term);
    }
    // Department scoping for non-super roles
    if (role !== 'super_admin' && role !== 'super') {
      if (adminCtx.department) {
        conditions.push('(oda.admin_department = ? OR oda.admin_department IS NULL)');
        params.push(adminCtx.department);
      }
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM otp_disclosure_audit oda ${whereClause}`, params);
    const total = countRows[0]?.total || 0;
    const [rows] = await pool.query(`
      SELECT id, user_id, admin_id, admin_role, admin_department, admin_sub_department, action, reason, otp_last2, generated, ip_address, user_agent, created_at
      FROM otp_disclosure_audit oda
      ${whereClause}
      ORDER BY oda.created_at DESC, oda.id DESC
      LIMIT ? OFFSET ?
    `, [...params, limitNum, offset]);
    return res.json({ success:true, data: rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
  } catch (error) {
    console.error('Get OTP disclosure audit error:', error);
    return res.status(500).json({ success:false, message: 'Server error fetching OTP disclosure audit', error: error.message });
  }
};
