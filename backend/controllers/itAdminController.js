// IT Admin Controller
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const User = require('../models/userModel');

exports.getITAdminDeclarations = async (req, res) => {
  try {
    let departmentFilter = '';
    let params = [];
    if (req.admin && req.admin.department) {
      departmentFilter = 'AND u.department = ?';
      params.push(req.admin.department);
    }
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
      first_name,
      surname,
      other_names = null,
      email = null
    } = req.body;

    // Allowed departments (must match front-end list exactly)
    const ALLOWED_DEPARTMENTS = [
      'Department of Transport, Infrastructure and Governance',
      'Department of Trade, Tourism and Culture',
      'Department of Education and Vocational Training',
      'Department of Environment and Water',
      'Department of Lands, Urban Planning,Housing and Serikali Mtaani',
      'Department of Health',
      'Department of Public Service Administration, Youth, Gender and Sports',
      'Department of Finance, Economic Planning and Digital Transformation',
      'Department of Blue Economy ,Cooperatives, Agriculture and Livestock',
      'Department of Climate Change,Energy and Natural Resources'
    ];

    // Role normalization (front-end may send short forms)
    const roleMap = {
      hr: 'hr_admin',
      it: 'it_admin',
      super: 'super_admin',
      finance: 'finance_admin'
    };
    let role = rawRole;
    if (roleMap[role]) role = roleMap[role];

    const allowedRoles = ['super_admin', 'hr_admin', 'finance_admin', 'it_admin'];

    if (!username || !password || !role || !first_name || !surname) {
      return res.status(400).json({ message: 'Username, password, role, first_name and surname are required.' });
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
        sql: 'INSERT INTO admin_users (username, password, role, department, first_name, surname, other_names, email, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)',
        params: [username, hashedPassword, role, role === 'super_admin' ? null : department, first_name, surname, other_names, email]
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
          'INSERT INTO admin_creation_audit (admin_id, created_by_admin_id, creator_role, ip_address, new_admin_username, new_admin_role, new_admin_department, new_admin_first_name, new_admin_surname) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            newAdminId,
            (req.admin && req.admin.adminId) || null,
            (req.admin && req.admin.role) || null,
            req.ip || req.headers['x-forwarded-for'] || null,
            username,
            role,
            role === 'super_admin' ? null : department,
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

    // Duplicate check
    const exists = await User.existsByNationalIdOrEmail(national_id, email);
    if (exists) {
      return res.status(409).json({ message: 'User already exists with this National ID or email.' });
    }

  // Standardized initial password policy: fixed default that triggers forced change on first login flow.
  // Align with login flow expecting default 'Change@001'.
  const INITIAL_DEFAULT_PASSWORD = 'Change@001';
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
      nature_of_employment,
      marital_status,
      phone_number
    });

    // Audit log
    try {
      await pool.query(
        'INSERT INTO user_creation_audit (user_id, created_by_admin_id, admin_role, ip_address, user_national_id, user_email, user_department, user_employment_nature) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          userId,
          (req.admin && req.admin.adminId) || null,
          (req.admin && req.admin.role) || null,
          req.ip || req.headers['x-forwarded-for'] || null,
          national_id,
          email,
          department,
          nature_of_employment
        ]
      );
    } catch (logErr) {
      console.warn('User creation audit insert failed:', logErr.message);
    }

    return res.status(201).json({ success: true, message: 'User created successfully.', userId, defaultPassword: INITIAL_DEFAULT_PASSWORD });
  } catch (error) {
    console.error('Create regular user error (admin route):', error);
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
    if (from) { conditions.push('uca.created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('uca.created_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search && search.trim()) {
      const term = '%' + search.toLowerCase().trim() + '%';
      conditions.push(`(LOWER(uca.user_email) LIKE ? OR LOWER(uca.user_national_id) LIKE ? OR LOWER(uca.user_department) LIKE ?)`);
      params.push(term, term, term);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const sortable = new Set(['created_at','user_id','created_by_admin_id','user_email','user_department']);
    const orderColumn = sortable.has(sortBy) ? sortBy : 'created_at';
    const direction = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM user_creation_audit uca ${whereClause}`, params);
    const total = countRows[0]?.total || 0;
    const [rows] = await pool.query(
      `SELECT id, user_id, created_by_admin_id, admin_role, ip_address, user_national_id, user_email, user_department, user_employment_nature, created_at
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
    if (from) { conditions.push('aca.created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('aca.created_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search && search.trim()) {
      const term = '%' + search.toLowerCase().trim() + '%';
      conditions.push('(LOWER(aca.new_admin_username) LIKE ? OR LOWER(aca.new_admin_role) LIKE ? OR LOWER(aca.new_admin_department) LIKE ? OR LOWER(aca.new_admin_first_name) LIKE ? OR LOWER(aca.new_admin_surname) LIKE ?)');
      params.push(term, term, term, term, term);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const sortable = new Set(['created_at','admin_id','created_by_admin_id','new_admin_role','new_admin_department','new_admin_username']);
    const column = sortable.has(sortBy) ? sortBy : 'created_at';
    const direction = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const [countRows] = await pool.query(`SELECT COUNT(*) as total FROM admin_creation_audit aca ${whereClause}`, params);
    const total = countRows[0]?.total || 0;
    const [rows] = await pool.query(
      `SELECT id, admin_id, created_by_admin_id, creator_role, ip_address, new_admin_username, new_admin_role, new_admin_department, new_admin_first_name, new_admin_surname, created_at
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
    const { from, to, department, createdByAdminId, newRole, search = '' } = req.query;
    const conditions = [];
    const params = [];
    if (createdByAdminId) { conditions.push('aca.created_by_admin_id = ?'); params.push(createdByAdminId); }
    if (department) { conditions.push('aca.new_admin_department = ?'); params.push(department); }
    if (newRole) { conditions.push('aca.new_admin_role = ?'); params.push(newRole); }
    if (from) { conditions.push('aca.created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('aca.created_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search && search.trim()) {
      const term = '%' + search.toLowerCase().trim() + '%';
      conditions.push('(LOWER(aca.new_admin_username) LIKE ? OR LOWER(aca.new_admin_role) LIKE ? OR LOWER(aca.new_admin_department) LIKE ? OR LOWER(aca.new_admin_first_name) LIKE ? OR LOWER(aca.new_admin_surname) LIKE ?)');
      params.push(term, term, term, term, term);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.query(
      `SELECT id, admin_id, created_by_admin_id, creator_role, ip_address, new_admin_username, new_admin_role, new_admin_department, new_admin_first_name, new_admin_surname, created_at
       FROM admin_creation_audit aca
       ${whereClause}
       ORDER BY aca.created_at DESC
       LIMIT 10000`,
      params
    );
    const header = ['id','admin_id','created_by_admin_id','creator_role','ip_address','new_admin_username','new_admin_role','new_admin_department','new_admin_first_name','new_admin_surname','created_at'];
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
    const { from, to, department, createdByAdminId, newRole, search = '' } = req.query;
    const conditions = [];
    const params = [];
    if (createdByAdminId) { conditions.push('aca.created_by_admin_id = ?'); params.push(createdByAdminId); }
    if (department) { conditions.push('aca.new_admin_department = ?'); params.push(department); }
    if (newRole) { conditions.push('aca.new_admin_role = ?'); params.push(newRole); }
    if (from) { conditions.push('aca.created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('aca.created_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search && search.trim()) {
      const term = '%' + search.toLowerCase().trim() + '%';
      conditions.push('(LOWER(aca.new_admin_username) LIKE ? OR LOWER(aca.new_admin_role) LIKE ? OR LOWER(aca.new_admin_department) LIKE ? OR LOWER(aca.new_admin_first_name) LIKE ? OR LOWER(aca.new_admin_surname) LIKE ?)');
      params.push(term, term, term, term, term);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.query(
      `SELECT id, admin_id, created_by_admin_id, creator_role, ip_address, new_admin_username, new_admin_role, new_admin_department, new_admin_first_name, new_admin_surname, created_at
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
    const headers = ['Created At','Admin ID','Username','Role','Dept','First Name','Surname','By Admin','Creator Role'];
    doc.fontSize(9).text(headers.join(' | '));
    doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();
    rows.forEach(r => {
      const line = [
        (r.created_at instanceof Date ? r.created_at.toISOString().replace('T',' ').substring(0,19) : r.created_at),
        r.admin_id,
        r.new_admin_username || '',
        r.new_admin_role || '',
        r.new_admin_department || '',
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
    const { from, to, department, adminId, employmentNature, search = '' } = req.query;
    const conditions = [];
    const params = [];
    if (adminId) { conditions.push('uca.created_by_admin_id = ?'); params.push(adminId); }
    if (department) { conditions.push('uca.user_department = ?'); params.push(department); }
    if (employmentNature) { conditions.push('uca.user_employment_nature = ?'); params.push(employmentNature); }
    if (from) { conditions.push('uca.created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('uca.created_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search && search.trim()) {
      const term = '%' + search.toLowerCase().trim() + '%';
      conditions.push('(LOWER(uca.user_email) LIKE ? OR LOWER(uca.user_national_id) LIKE ? OR LOWER(uca.user_department) LIKE ?)');
      params.push(term, term, term);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.query(`
      SELECT id, user_id, created_by_admin_id, admin_role, ip_address, user_national_id, user_email, user_department, user_employment_nature, created_at
      FROM user_creation_audit uca
      ${whereClause}
      ORDER BY uca.created_at DESC
      LIMIT 10000
    `, params);
    const header = ['id','user_id','created_by_admin_id','admin_role','ip_address','user_national_id','user_email','user_department','user_employment_nature','created_at'];
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
    const { from, to, department, adminId, employmentNature, search = '' } = req.query;
    const conditions = [];
    const params = [];
    if (adminId) { conditions.push('uca.created_by_admin_id = ?'); params.push(adminId); }
    if (department) { conditions.push('uca.user_department = ?'); params.push(department); }
    if (employmentNature) { conditions.push('uca.user_employment_nature = ?'); params.push(employmentNature); }
    if (from) { conditions.push('uca.created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('uca.created_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search && search.trim()) {
      const term = '%' + search.toLowerCase().trim() + '%';
      conditions.push('(LOWER(uca.user_email) LIKE ? OR LOWER(uca.user_national_id) LIKE ? OR LOWER(uca.user_department) LIKE ?)');
      params.push(term, term, term);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [rows] = await pool.query(`
      SELECT id, user_id, created_by_admin_id, admin_role, ip_address, user_national_id, user_email, user_department, user_employment_nature, created_at
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
    const headers = ['Created At','User ID','National ID','Email','Dept','Emp Nature','By Admin','Role'];
    doc.fontSize(9).text(headers.join(' | '));
    doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();
    rows.forEach(r => {
      const line = [
        (r.created_at instanceof Date ? r.created_at.toISOString().replace('T',' ').substring(0,19) : r.created_at),
        r.user_id,
        r.user_national_id || '',
        r.user_email || '',
        r.user_department || '',
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
