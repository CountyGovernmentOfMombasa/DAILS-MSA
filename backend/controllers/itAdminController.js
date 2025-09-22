// IT Admin Controller
const pool = require('../config/db');
const bcrypt = require('bcryptjs');

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
    const { username, password, role, department } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ message: 'Username, password, and role are required.' });
    }
    // Check if username exists
    const [existing] = await pool.query('SELECT id FROM admin_users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Username already exists.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO admin_users (username, password, role, department) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, role, department || null]
    );
    return res.json({ success: true, message: 'Admin user created successfully.' });
  } catch (error) {
    console.error('Create admin user error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error while creating admin user',
      error: error.message 
    });
  }
};
