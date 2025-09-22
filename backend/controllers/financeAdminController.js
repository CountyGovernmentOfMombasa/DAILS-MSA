// Finance Admin Controller
const pool = require('../config/db');

exports.getFinanceAdminDeclarations = async (req, res) => {
  try {
    let departmentFilter = '';
    let params = [];
    if (req.admin && req.admin.department) {
      departmentFilter = 'AND u.department = ?';
      params.push(req.admin.department);
    }
    const [declarations] = await pool.query(`
      SELECT 
        d.*, u.first_name, u.other_names, u.surname, u.payroll_number, u.email, u.department
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
    console.error('Get finance admin declarations error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Server error while fetching finance admin declarations',
      error: error.message 
    });
  }
};
