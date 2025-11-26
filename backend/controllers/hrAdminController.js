// HR Admin Controller
const pool = require('../config/db');

exports.getHRAdminDeclarations = async (req, res) => {
  try {
    const role = (req.admin && (req.admin.normalizedRole || req.admin.role)) || '';
    // HR module is for HR admins only
    if (!['hr','hr_admin'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (!req.admin || !req.admin.department) {
      return res.status(403).json({ success: false, message: 'No department assigned to admin; contact a super admin.' });
    }
    let departmentFilter = '';
    let params = [];
    departmentFilter = 'AND u.department = ?';
    params.push(req.admin.department);
    const [declarations] = await pool.query(`
      SELECT 
        d.id,
        d.user_id,
        d.declaration_date,
        d.status,
        d.declaration_type,
        d.correction_message,
        d.signature_path,
        u.first_name,
        u.other_names,
        u.surname,
        u.payroll_number,
        u.email,
        u.department,
        u.national_id,
        u.designation,
        /* Latest admin action (legacy fields retained for compatibility) */
        (SELECT a.changed_at FROM declaration_status_audit a WHERE a.declaration_id = d.id ORDER BY a.changed_at DESC, a.id DESC LIMIT 1) AS last_status_changed_at,
        (SELECT au.username FROM declaration_status_audit a LEFT JOIN admin_users au ON a.admin_id = au.id WHERE a.declaration_id = d.id ORDER BY a.changed_at DESC, a.id DESC LIMIT 1) AS last_status_admin,
        /* First time approved (date admin approved) */
        (SELECT a.changed_at FROM declaration_status_audit a WHERE a.declaration_id = d.id AND a.new_status = 'approved' ORDER BY a.changed_at ASC, a.id ASC LIMIT 1) AS approved_at,
        (SELECT COALESCE(NULLIF(CONCAT(TRIM(COALESCE(au.first_name,'')), ' ', TRIM(COALESCE(au.surname,''))), ' '), au.username) FROM declaration_status_audit a LEFT JOIN admin_users au ON a.admin_id = au.id WHERE a.declaration_id = d.id AND a.new_status = 'approved' ORDER BY a.changed_at ASC, a.id ASC LIMIT 1) AS approved_admin_name
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
    console.error('Get HR admin declarations error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error while fetching HR admin declarations',
      error: error.message 
    });
  }
};

// Get all users within the HR admin's sub_department
exports.getHRSubDepartmentUsers = async (req, res) => {
  try {
    const role = (req.admin && (req.admin.normalizedRole || req.admin.role)) || '';
    if (!['hr','hr_admin'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (!req.admin || !req.admin.sub_department) {
      return res.status(403).json({ success: false, message: 'No sub_department assigned to admin; contact a super admin.' });
    }
    const subDepartment = req.admin.sub_department;
    // Optional department consistency check (only include users in same department if department is set)
    const params = [subDepartment];
    let departmentClause = '';
    if (req.admin.department) {
      departmentClause = ' AND u.department = ?';
      params.push(req.admin.department);
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const searchRaw = (req.query.search || '').trim();
    let where = `WHERE u.sub_department = ?${departmentClause}`;
    const qParams = [...params];
    if (searchRaw) {
      const like = `%${searchRaw}%`;
      where += ` AND (u.first_name LIKE ? OR u.other_names LIKE ? OR u.surname LIKE ? OR u.email LIKE ? OR u.payroll_number LIKE ? OR u.national_id LIKE ?)`;
      qParams.push(like, like, like, like, like, like);
    }
    // Count total
    const [countRows] = await pool.query(
      `SELECT COUNT(1) AS total FROM users u ${where}`,
      qParams
    );
    const total = (countRows && countRows[0] && countRows[0].total) ? Number(countRows[0].total) : 0;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
    const offset = (page - 1) * limit;
    const [rows] = await pool.query(
      `SELECT 
          u.id, u.payroll_number, u.first_name, u.other_names, u.surname, u.email, 
          u.designation, u.department, u.sub_department, u.nature_of_employment,
          (SELECT d.status 
             FROM declarations d 
            WHERE d.user_id = u.id 
            ORDER BY d.declaration_date DESC, d.id DESC 
            LIMIT 1) AS latest_declaration_status
       FROM users u
       ${where}
       ORDER BY u.surname ASC, u.first_name ASC
       LIMIT ? OFFSET ?`,
      [...qParams, limit, offset]
    );
    return res.json({ success: true, data: rows, page, limit, total, totalPages });
  } catch (error) {
    console.error('Get HR sub_department users error:', error);
    return res.status(500).json({ success: false, message: 'Server error while fetching users', error: error.message });
  }
};
