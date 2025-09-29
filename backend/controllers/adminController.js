// Approve or reject a declaration
exports.updateDeclarationStatus = async (req, res) => {
  try {
    const { declarationId } = req.params;
    const { status, correction_message } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const Declaration = require('../models/declarationModel');
    await Declaration.updateStatus(declarationId, status, correction_message || null);

    // Notify user by email and SMS
    {
      const [rows] = await pool.query(
        'SELECT u.email, u.first_name, u.phone_number FROM declarations d JOIN users u ON d.user_id = u.id WHERE d.id = ?',
        [declarationId]
      );
      if (rows.length > 0) {
        const sendEmail = require('../util/sendEmail');
        const sendSMS = require('../util/sendSMS');
        const firstName = rows[0].first_name;
        if (status === 'rejected') {
          await sendEmail({
            to: rows[0].email,
            subject: 'Declaration Rejected',
            text: `Dear ${firstName},\n\nYour declaration was rejected. Please correct the following: ${correction_message || ''}`,
            html: `<p>Dear ${firstName},</p><p>Your declaration was <b>rejected</b>.</p><p>Please correct the following:</p><p>${correction_message || ''}</p>`
          });
          if (rows[0].phone_number) {
            try { await sendSMS({ to: rows[0].phone_number, body: 'Your declaration was rejected. Please check the portal for details.' }); } catch {}
          }
        } else if (status === 'approved') {
          await sendEmail({
            to: rows[0].email,
            subject: 'Declaration Approved',
            text: `Dear ${firstName},\n\nYour declaration has been approved.`,
            html: `<p>Dear ${firstName},</p><p>Your declaration has been <b>approved</b>.</p>`
          });
          if (rows[0].phone_number) {
            try { await sendSMS({ to: rows[0].phone_number, body: 'Your declaration has been approved.' }); } catch {}
          }
        }
      }
    }
    return res.json({ success: true, message: `Declaration ${status}` });
  } catch (error) {
    console.error('Update declaration status error:', error);
    return res.status(500).json({ success: false, message: 'Server error updating declaration status', error: error.message });
  }
};
const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AdminUser = require('../models/AdminUser'); 
const PDFDocument = require('pdfkit');

// --- Helper: normalize department similar to frontend logic ---
function normalizeDepartment(name) {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Canonical departments (must stay in sync with frontend DepartmentOverview)
const CANONICAL_DEPARTMENTS = [
  'Department of Transport, Infrastructure and Governance',
  'Department of Trade, Tourism and Culture',
  'Department of Education and Vocational Training',
  'Department of Environment and Water',
  'Department of Lands, Urban Planning, Housing and Serikali Mtaani',
  'Department of Health',
  'Department of Public Service Administration, Youth, Gender and Sports',
  'Department of Finance, Economic Planning and Digital Transformation',
  'Department of Blue Economy, Cooperatives, Agriculture and Livestock',
  'Department of Climate Change, Energy and Natural Resources'
];

const canonicalIndex = new Map();
CANONICAL_DEPARTMENTS.forEach(c => canonicalIndex.set(normalizeDepartment(c), c));

function mapToCanonical(raw) {
  const norm = normalizeDepartment(raw);
  if (!norm) return null;
  if (canonicalIndex.has(norm)) return canonicalIndex.get(norm);
  for (const [nCanon, canon] of canonicalIndex.entries()) {
    if (nCanon.includes(norm) || norm.includes(nCanon)) return canon;
  }
  return null;
}

// GET /api/admin/reports/departments
// Returns unique employee declaration counts by canonical department plus unknown bucket.
exports.getDepartmentDeclarationStats = async (req, res) => {
  try {
    // Scope declarations by admin department if not super
    let departmentFilter = '';
    let params = [];
    if (req.admin && req.admin.department && !['super','super_admin'].includes(req.admin.role) && req.admin.normalizedRole !== 'super') {
      departmentFilter = 'AND u.department = ?';
      params.push(req.admin.department);
    }
    const [rows] = await pool.query(`
      SELECT d.id, d.user_id, d.submitted_at, d.declaration_date, u.department, u.payroll_number, u.email
      FROM declarations d
      JOIN users u ON d.user_id = u.id
      WHERE 1=1 ${departmentFilter}
    `, params);

    // Build unique employee map (choose latest declaration for dept resolution)
    const employeeMap = new Map(); // key -> { dept, ts }
    const parseDatePriority = (r) => {
      const dateStr = r.submitted_at || r.declaration_date;
      if (!dateStr) return 0;
      // Try known formats; MySQL DATETIME or DD/MM/YYYY
      if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) {
        const [dd, mm, yyyy] = dateStr.split(/[\/\s:]/);
        return Date.parse(`${yyyy}-${mm}-${dd}`) || 0;
      }
      const t = Date.parse(dateStr);
      return isNaN(t) ? 0 : t;
    };
    for (const r of rows) {
      const key = r.user_id || r.payroll_number || r.email || `decl-${r.id}`;
      const canon = mapToCanonical(r.department);
      const ts = parseDatePriority(r);
      if (!employeeMap.has(key)) {
        employeeMap.set(key, { dept: canon, ts });
      } else {
        const prev = employeeMap.get(key);
        if (ts >= prev.ts) {
          // Prefer latest; if previous unknown and new known, or simply newer
            employeeMap.set(key, { dept: canon || prev.dept, ts });
        }
      }
    }

    const resultCounts = {};
    CANONICAL_DEPARTMENTS.forEach(c => { resultCounts[c] = 0; });
    let unknown = 0;
    for (const { dept } of employeeMap.values()) {
      if (dept) resultCounts[dept] += 1; else unknown += 1;
    }
    const totalUnique = employeeMap.size;
    const payload = {
      totalUniqueEmployeesWithDeclarations: totalUnique,
      counts: resultCounts,
      unknown,
      generatedAt: new Date().toISOString()
    };
    return res.json({ success: true, data: payload });
  } catch (error) {
    console.error('getDepartmentDeclarationStats error:', error);
    return res.status(500).json({ success: false, message: 'Server error generating department stats' });
  }
};

exports.getAllDeclarations = async (req, res) => {
  try {
    let departmentFilter = '';
    let params = [];
    if (req.admin && req.admin.department && !['super','super_admin'].includes(req.admin.role) && req.admin.normalizedRole !== 'super') {
      departmentFilter = 'AND u.department = ?';
      params.push(req.admin.department);
    }
    const [declarations] = await pool.query(`
      SELECT 
        d.*,
        u.first_name,
        u.other_names,
        u.surname,
        u.payroll_number,
        u.email,
        u.department
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
    console.error('Get all declarations error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error while fetching all declarations',
      error: error.message 
    });
  }
};

exports.adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Find admin user in database
    const admin = await AdminUser.findByUsername(username);
    
    if (!admin) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await admin.verifyPassword(password);
    
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }


    // Map DB roles to frontend roles
    if (admin.role === 'hr_admin') {
      admin.role = 'hr';
    } else if (admin.role === 'it_admin') {
      admin.role = 'it';
    } else if (admin.role === 'finance_admin') {
      admin.role = 'finance';
    } else if (admin.role === 'super_admin') {
      admin.role = 'super';
    } else {
      admin.role = 'super';
    }

    // Enforce that any non-super admin must have a department assigned
    if (admin.role !== 'super' && !admin.department) {
      return res.status(403).json({ 
        message: 'Department assignment required. Contact a super admin.',
        departmentMissing: true
      });
    }

    // Generate admin token (include department for scoping)
    const adminToken = jwt.sign(
      {
        adminId: admin.id,
        username: admin.username,
        role: admin.role,
        department: admin.department || null,
        isAdmin: true
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      message: 'Admin login successful',
      adminToken,
      admin: admin.toJSON()
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.verifyAdmin = async (req, res) => {
  try {
    // Get fresh admin data from database
    const admin = await AdminUser.findById(req.admin.adminId);
    
    if (!admin) {
      return res.status(401).json({ message: 'Admin not found' });
    }

    res.json({
      message: 'Admin verified',
      admin: {
        ...admin.toJSON(),
        // Provide mapped role consistent with login response
        role: admin.role === 'hr_admin' ? 'hr' : admin.role === 'it_admin' ? 'it' : admin.role === 'finance_admin' ? 'finance' : 'super'
      }
    });
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
  const { page = 1, limit = 50, emailFilter = 'all', search = '', sortBy = 'payroll_number', sortDir = 'asc' } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 50, 500); // cap to prevent abuse
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    // Email filter conditions
    if (emailFilter === 'with-email') {
      conditions.push("email IS NOT NULL AND email != ''");
    } else if (emailFilter === 'without-email') {
      conditions.push("(email IS NULL OR email = '')");
    }

    // Department scoping: all non-super admins only see their department
    if (req.admin && req.admin.department && !['super','super_admin'].includes(req.admin.role) && req.admin.normalizedRole !== 'super') {
      conditions.push('department = ?');
      params.push(req.admin.department);
    }

    // Search (case-insensitive)
    if (search && search.trim().length > 0) {
      const term = `%${search.toLowerCase().trim()}%`;
      conditions.push(`(
        LOWER(first_name) LIKE ? OR 
        LOWER(other_names) LIKE ? OR 
        LOWER(surname) LIKE ? OR 
        LOWER(email) LIKE ? OR 
        payroll_number LIKE ? OR 
        national_id LIKE ?
      )`);
      // add six params for the placeholders
      params.push(term, term, term, term, `%${search.trim()}%`, `%${search.trim()}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count (filtered)
    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM users ${whereClause}`, params);
    const total = countResult[0]?.total || 0;

    // Stats (filtered, independent of pagination)
    const [statsRows] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END) as withEmail,
        SUM(CASE WHEN email IS NULL OR email = '' THEN 1 ELSE 0 END) as withoutEmail
      FROM users
      ${whereClause}
    `, params);
    const stats = statsRows?.[0] || { total: 0, withEmail: 0, withoutEmail: 0 };

    // Whitelist sortable columns
    const sortable = new Set(['payroll_number','surname','first_name','department','email','national_id','birthdate']);
    const orderColumn = sortable.has(sortBy) ? sortBy : 'payroll_number';
    const direction = String(sortDir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // Data page
    const [users] = await pool.query(`
      SELECT 
        id, 
        payroll_number, 
        first_name, 
        other_names, 
        surname, 
        email, 
        department, 
        birthdate, 
        national_id,
        (
          SELECT COUNT(*) FROM declarations d WHERE d.user_id = users.id
        ) AS declaration_count
      FROM users
      ${whereClause}
      ORDER BY ${orderColumn} ${direction}, id ASC
      LIMIT ? OFFSET ?
    `, [...params, limitNum, offset]);

    res.json({
      users,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      stats: {
        total: stats.total || 0,
        withEmail: stats.withEmail || 0,
        withoutEmail: stats.withoutEmail || 0
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Server error while fetching users' });
  }
};

exports.updateUserEmail = async (req, res) => {
  try {
    const { userId } = req.params;
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: 'Email is required' });
    }

    const trimmed = email.trim();
    // Reject placeholder-like or templated inputs containing braces
    if (/[{}\s]/.test(trimmed) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return res.status(400).json({ message: 'Email appears to be a placeholder or malformed.' });
    }

    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(trimmed)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    const normalized = trimmed.toLowerCase();

    // Fetch old email first
    const [existingRows] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const oldEmail = existingRows[0].email || null;

    const [result] = await pool.query(
      'UPDATE users SET email = ? WHERE id = ?',
      [normalized, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Audit log
    try {
      await pool.query(
        'INSERT INTO email_change_audit (user_id, old_email, new_email, changed_by_admin_id) VALUES (?, ?, ?, ?)',
        [userId, oldEmail, normalized, (req.admin && req.admin.adminId) || null]
      );
    } catch (logErr) {
      console.warn('Email audit log insert failed:', logErr.message);
    }

    res.json({ message: 'Email updated successfully' });

  } catch (error) {
    console.error('Update user email error:', error);
    res.status(500).json({ message: 'Server error while updating email' });
  }
};

exports.bulkUpdateEmails = async (req, res) => {
  try {
    const { userIds, emailTemplate } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'User IDs array is required' });
    }

    if (!emailTemplate) {
      return res.status(400).json({ message: 'Email template is required' });
    }

    let updated = 0;

    for (const userId of userIds) {
      // Get user data for template replacement
      const [userResult] = await pool.query(
        'SELECT first_name, other_names,surname, payroll_number FROM users WHERE id = ?',
        [userId]
      );

      if (userResult.length > 0) {
        const user = userResult[0];
        const safeFirst = (user.first_name || '').toLowerCase();
        const safeOther = (user.other_names || '').toLowerCase();
        const safeSurname = (user.surname || '').toLowerCase();
        let email = emailTemplate
          .replace(/{first_name}/gi, safeFirst)
          .replace(/{other_names}/gi, safeOther)
          .replace(/{surname}/gi, safeSurname)
          .replace(/{payroll}/gi, user.payroll_number);

        email = email.replace(/\s+/g, '.'); // collapse spaces into dots
        const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
        if (!emailRegex.test(email)) {
          // Skip invalid generated email silently; could collect skipped list
          continue;
        }

        // Fetch old email
        const [oldRows] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
        const oldEmail = oldRows.length ? oldRows[0].email : null;
        const [upd] = await pool.query(
          'UPDATE users SET email = ? WHERE id = ?',
          [email.toLowerCase(), userId]
        );
        if (upd.affectedRows > 0) {
          updated++;
          try {
            await pool.query(
              'INSERT INTO email_change_audit (user_id, old_email, new_email, changed_by_admin_id) VALUES (?, ?, ?, ?)',
              [userId, oldEmail, email.toLowerCase(), (req.admin && req.admin.adminId) || null]
            );
          } catch (e) {
            console.warn('Bulk email audit log failed:', e.message);
          }
        }
      }
    }

    res.json({ 
      message: `Successfully updated ${updated} email addresses`,
      updated 
    });

  } catch (error) {
    console.error('Bulk update emails error:', error);
    res.status(500).json({ message: 'Server error while updating emails' });
  }
};

// Admin management functions
exports.getAllAdmins = async (req, res) => {
  try {
    const admins = await AdminUser.getAllActive();
    res.json({
      success: true,
      data: admins
    });
  } catch (error) {
    console.error('Get all admins error:', error);
    res.status(500).json({ message: 'Server error while fetching admins' });
  }
};

// List admins (non-super) that are missing a department or have the placeholder
exports.getAdminsMissingDepartment = async (req, res) => {
  try {
    try {
      const [rows] = await pool.query(
        `SELECT id, username, role, email, department, first_name, other_names, surname, created_at
         FROM admin_users
         WHERE is_active = TRUE
           AND role <> 'super_admin'
           AND (department IS NULL OR department = '' OR department = 'UNASSIGNED-DEPT')
         ORDER BY created_at DESC`
      );
      return res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
      if (err && err.code === 'ER_BAD_FIELD_ERROR') {
        // Legacy schema fallback (last_name instead of surname, no other_names)
        const [legacyRows] = await pool.query(
          `SELECT id, username, role, email, department, first_name, last_name AS surname, created_at
           FROM admin_users
           WHERE is_active = TRUE
             AND role <> 'super_admin'
             AND (department IS NULL OR department = '' OR department = 'UNASSIGNED-DEPT')
           ORDER BY created_at DESC`
        );
        return res.json({ success: true, count: legacyRows.length, data: legacyRows });
      }
      throw err;
    }
  } catch (error) {
    console.error('Get admins missing department error:', error);
    res.status(500).json({ message: 'Server error while fetching admins missing department' });
  }
};

exports.createAdmin = async (req, res) => {
  try {
    const { username, password, email, role, first_name, other_names = null, surname: last_name, department } = req.body;
    // Validate required fields
    if (!username || !password || !first_name || !last_name) {
      return res.status(400).json({ message: 'Username, password, first name, and surname are required.' });
    }
    // Validate role
    const allowedRoles = ['super_admin', 'hr_admin', 'finance_admin', 'it_admin'];
    const safeRole = role && allowedRoles.includes(role) ? role : 'hr_admin';

    // Enforce department for any non-super role
    if (safeRole !== 'super_admin' && !department) {
      return res.status(400).json({ message: 'Department is required for non-super admin roles.' });
    }
    // Prepare admin data
    const adminData = {
      username,
      password,
      email,
      role: safeRole,
      department: safeRole === 'super_admin' ? null : department,
      first_name,
      other_names,
      surname: last_name,
      created_by: req.admin.adminId
    };
    const newAdmin = await AdminUser.create(adminData);

    // Send notification email
    const sendEmail = require('../util/sendEmail');
    const adminHtml = `<!DOCTYPE html><html><body style=\"font-family: Arial, sans-serif; background: #f7f7f7; padding: 20px;\"><div style=\"max-width: 500px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #eee; padding: 24px;\"><h2 style=\"color: #2a7ae2;\">WDP Admin Account Created</h2><p>Dear <strong>${first_name}</strong>,</p><p>Your admin account has been successfully created. You now have access to the WDP Employee Declaration Portal with administrative privileges.</p><p style=\"margin-top: 24px;\">Best regards,<br><strong>WDP Team</strong></p><hr><small style=\"color: #888;\">This is an automated message. Please do not reply.</small></div></body></html>`;
    await sendEmail({
      to: email,
      subject: 'Your WDP Admin Account Has Been Created',
      text: `Hello ${first_name},\nYour admin account has been created.`,
      html: adminHtml
    });

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: newAdmin.toJSON()
    });
  } catch (error) {
    console.error('Create admin error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Username or email already exists.' });
    }
    res.status(500).json({ message: 'Server error while creating admin' });
  }
};

exports.updateAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { email, role, first_name, last_name, is_active } = req.body;
    // Validate role
    const allowedRoles = ['super_admin', 'hr_admin', 'finance_admin'];
    const safeRole = role && allowedRoles.includes(role) ? role : undefined;
    // Validate required fields
    if (!first_name || !last_name) {
      return res.status(400).json({ message: 'First name and last name are required.' });
    }
    const admin = await AdminUser.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    const updatedAdmin = await admin.update({
      email,
      role: safeRole,
      first_name,
      last_name,
      is_active
    });
    res.json({
      success: true,
      message: 'Admin updated successfully',
      data: updatedAdmin.toJSON()
    });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({ message: 'Server error while updating admin' });
  }
};

exports.deleteAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;

    // Prevent self-deletion
    if (parseInt(adminId) === req.admin.adminId) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const admin = await AdminUser.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    await admin.deactivate();

    res.json({
      success: true,
      message: 'Admin deactivated successfully'
    });

  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({ message: 'Server error while deleting admin' });
  }
};

exports.changeAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required' });
    }

    const admin = await AdminUser.findById(req.admin.adminId);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Verify current password
    const isValidPassword = await admin.verifyPassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    await admin.updatePassword(newPassword);

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Change admin password error:', error);
    res.status(500).json({ message: 'Server error while changing password' });
  }
};

// Send a test email to verify MAIL_* configuration. Requires admin auth.
exports.sendTestEmail = async (req, res) => {
  try {
    const sendEmail = require('../util/sendEmail');
    const to = req.query.to || process.env.MAIL_FROM_ADDR || process.env.MAIL_USERNAME;
    if (!to) {
      return res.status(400).json({ success: false, message: 'No destination email specified and no default configured.' });
    }
    const info = await sendEmail({
      to,
      subject: 'Admin Test Email',
      text: 'This is a test email confirming that the MAIL_* configuration works.',
      html: '<p><strong>Success!</strong> Your admin test email was delivered using the configured MAIL_* settings.</p>'
    });
    return res.json({ success: true, message: 'Test email dispatched', messageId: info.messageId, to });
  } catch (error) {
    console.error('Test email send error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send test email', error: error.message });
  }
};

// ---------------- Email Change Audit Retrieval ----------------
exports.getEmailChangeAudit = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      userId,
      adminId,
      department,
      from,
      to,
      search = '',
      sortBy = 'changed_at',
      sortDir = 'desc'
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 50, 500);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (userId) { conditions.push('eca.user_id = ?'); params.push(userId); }
    if (adminId) { conditions.push('eca.changed_by_admin_id = ?'); params.push(adminId); }
    if (department) { conditions.push('u.department = ?'); params.push(department); }
    if (from) { conditions.push('eca.changed_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('eca.changed_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search && search.trim()) {
      const term = '%' + search.toLowerCase().trim() + '%';
      conditions.push(`(
        LOWER(u.first_name) LIKE ? OR
        LOWER(u.other_names) LIKE ? OR
        LOWER(u.surname) LIKE ? OR
        LOWER(u.email) LIKE ? OR
        LOWER(eca.old_email) LIKE ? OR
        LOWER(eca.new_email) LIKE ? OR
        LOWER(au.username) LIKE ? OR
        u.payroll_number LIKE ? OR
        u.national_id LIKE ?
      )`);
      params.push(term, term, term, term, term, term, term, term, term);
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const sortable = new Set(['changed_at','user_id','changed_by_admin_id','new_email','old_email','department']);
    const orderColumn = sortable.has(sortBy) ? sortBy : 'changed_at';
    const direction = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Count
    const [countRows] = await pool.query(`
      SELECT COUNT(*) as total
      FROM email_change_audit eca
      JOIN users u ON eca.user_id = u.id
      LEFT JOIN admin_users au ON eca.changed_by_admin_id = au.id
      ${whereClause}
    `, params);
    const total = countRows[0]?.total || 0;

    // Data
    const [rows] = await pool.query(`
      SELECT 
        eca.id,
        eca.user_id,
        u.payroll_number,
        u.first_name,
        u.other_names,
        u.surname,
        u.department,
        eca.old_email,
        eca.new_email,
        eca.changed_by_admin_id,
        au.username AS admin_username,
        eca.changed_at
      FROM email_change_audit eca
      JOIN users u ON eca.user_id = u.id
      LEFT JOIN admin_users au ON eca.changed_by_admin_id = au.id
      ${whereClause}
      ORDER BY ${orderColumn === 'department' ? 'u.department' : orderColumn === 'user_id' ? 'eca.user_id' : orderColumn === 'changed_by_admin_id' ? 'eca.changed_by_admin_id' : 'eca.' + orderColumn} ${direction}, eca.id DESC
      LIMIT ? OFFSET ?
    `, [...params, limitNum, offset]);

    res.json({
      success: true,
      data: rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    console.error('Get email change audit error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching audit log' });
  }
};

// ---------------- PDF Export for Email Audit ----------------
exports.exportEmailChangeAuditPdf = async (req, res) => {
  try {
    // Reuse logic by calling internal function pieces (duplicate minimal query building)
    const {
      userId,
      adminId,
      department,
      from,
      to,
      search = '',
      sortBy = 'changed_at',
      sortDir = 'desc'
    } = req.query;

    const conditions = [];
    const params = [];
    if (userId) { conditions.push('eca.user_id = ?'); params.push(userId); }
    if (adminId) { conditions.push('eca.changed_by_admin_id = ?'); params.push(adminId); }
    if (department) { conditions.push('u.department = ?'); params.push(department); }
    if (from) { conditions.push('eca.changed_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { conditions.push('eca.changed_at <= ?'); params.push(to + ' 23:59:59'); }
    if (search && search.trim()) {
      const term = '%' + search.toLowerCase().trim() + '%';
      conditions.push(`(
        LOWER(u.first_name) LIKE ? OR LOWER(u.other_names) LIKE ? OR LOWER(u.surname) LIKE ? OR
        LOWER(u.email) LIKE ? OR LOWER(eca.old_email) LIKE ? OR LOWER(eca.new_email) LIKE ? OR
        LOWER(au.username) LIKE ? OR u.payroll_number LIKE ? OR u.national_id LIKE ?
      )`);
      params.push(term, term, term, term, term, term, term, term, term);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const sortable = new Set(['changed_at','user_id','changed_by_admin_id','new_email','old_email','department']);
    const orderColumn = sortable.has(sortBy) ? sortBy : 'changed_at';
    const direction = String(sortDir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const [rows] = await pool.query(`
      SELECT 
        eca.id,
        eca.user_id,
        u.payroll_number,
        u.first_name,
        u.other_names,
        u.surname,
        u.department,
        eca.old_email,
        eca.new_email,
        eca.changed_by_admin_id,
        au.username AS admin_username,
        eca.changed_at
      FROM email_change_audit eca
      JOIN users u ON eca.user_id = u.id
      LEFT JOIN admin_users au ON eca.changed_by_admin_id = au.id
      ${whereClause}
      ORDER BY ${orderColumn === 'department' ? 'u.department' : orderColumn === 'user_id' ? 'eca.user_id' : orderColumn === 'changed_by_admin_id' ? 'eca.changed_by_admin_id' : 'eca.' + orderColumn} ${direction}, eca.id DESC
      LIMIT 5000
    `, params);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="email_audit_log.pdf"');

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);
    doc.fontSize(16).text('Email Change Audit Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`);
    if (department) doc.text(`Department: ${department}`);
    if (from || to) doc.text(`Range: ${from || '...'} to ${to || '...'}`);
    if (search) doc.text(`Search: ${search}`);
    doc.moveDown(0.5);

    const headers = ['When','Payroll','Name','Dept','Old Email','New Email','By Admin'];
    doc.fontSize(9).fillColor('#000');
    doc.text(headers.join(' | '));
    doc.moveDown(0.2);
    doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();

    rows.forEach(r => {
      const name = [r.surname, r.first_name, r.other_names].filter(Boolean).join(' ');
      const line = [
        r.changed_at.toISOString().replace('T',' ').substring(0,19),
        r.payroll_number || '',
        name,
        r.department || '',
        r.old_email || '',
        r.new_email || '',
        r.admin_username || ''
      ].map(v => (v || '').toString().replace(/\s+/g,' '));
      doc.text(line.join(' | '));
    });

    doc.end();
  } catch (error) {
    console.error('Export email audit PDF error:', error);
    res.status(500).json({ success: false, message: 'Failed to export PDF' });
  }
};

// Get distinct departments (for dropdown filtering on frontend)
exports.getDistinctDepartments = async (req, res) => {
  try {
    // 1. Get full enum list from information_schema
    const [enumRows] = await pool.query(`
      SELECT COLUMN_TYPE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'department'
      LIMIT 1
    `);

    let allDepartments = [];
    if (enumRows.length && enumRows[0].COLUMN_TYPE.startsWith('enum(')) {
      const columnType = enumRows[0].COLUMN_TYPE; // e.g. enum('A','B','C')
      const matches = [...columnType.matchAll(/'([^']*)'/g)];
      allDepartments = matches.map(m => m[1]);
    }

    // 2. Get counts of existing departments in users table
    const [countRows] = await pool.query(`
      SELECT department, COUNT(*) as count
      FROM users
      WHERE department IS NOT NULL AND department != ''
      GROUP BY department
    `);
    const countMap = countRows.reduce((acc, r) => { acc[r.department] = r.count; return acc; }, {});

    // 3. Build response objects keeping original simple array for backward compatibility
    const departmentStats = allDepartments.map(dep => ({ name: dep, count: countMap[dep] || 0 }));

    res.json({ 
      departments: allDepartments, 
      departmentStats 
    });
  } catch (error) {
    console.error('Get distinct departments error:', error);
    res.status(500).json({ message: 'Server error while fetching departments' });
  }
};

// Create a new user (admin only). Non-super admins are restricted to their department.
exports.createUser = async (req, res) => {
  try {
    const {
      payroll_number,
      first_name,
      surname,
      other_names = null,
      national_id,
      department,
      email = null,
      phone_number = null
    } = req.body || {};

    if (!payroll_number || !first_name || !surname || !national_id || !department) {
      return res.status(400).json({ message: 'payroll_number, first_name, surname, national_id and department are required' });
    }

    // Department scoping for non-super admins
    if (req.admin && req.admin.department && !['super','super_admin'].includes(req.admin.role) && req.admin.normalizedRole !== 'super') {
      if (department !== req.admin.department) {
        return res.status(403).json({ message: 'Cannot create user outside your department' });
      }
    }

    // Check duplicates
    const existingPayroll = await User.findByPayrollNumber(payroll_number);
    if (existingPayroll) {
      return res.status(409).json({ message: 'A user with that payroll number already exists' });
    }
    const existingNat = await User.findByNationalId(national_id);
    if (existingNat) {
      return res.status(409).json({ message: 'A user with that national ID already exists' });
    }

    // Generate temporary password (8 random chars + number + symbol)
    const randomPart = Math.random().toString(36).slice(-8);
    const tempPassword = randomPart + '!1';

    const userId = await User.create({
      payroll_number,
      first_name,
      surname,
      other_names,
      national_id,
      department,
      email,
      phone_number,
      password: tempPassword
    });

    res.status(201).json({
      success: true,
      user: { id: userId, payroll_number, first_name, surname, other_names, national_id, department, email, phone_number },
      temporaryPassword: tempPassword
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error while creating user' });
  }
};

// Delete a user (admin). Non-super admins can only delete within their department.
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ message: 'userId param required' });

    const [rows] = await pool.query('SELECT id, department FROM users WHERE id = ?', [userId]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    const target = rows[0];

    if (req.admin && req.admin.department && !['super','super_admin'].includes(req.admin.role) && req.admin.normalizedRole !== 'super') {
      if (target.department !== req.admin.department) {
        return res.status(403).json({ message: 'Cannot delete user outside your department' });
      }
    }

    // Optional: prevent deletion if user has declarations
    const [decls] = await pool.query('SELECT id FROM declarations WHERE user_id = ? LIMIT 1', [userId]);
    if (decls.length) {
      return res.status(400).json({ message: 'Cannot delete user with existing declarations' });
    }

    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found (already deleted)' });
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error while deleting user' });
  }
};