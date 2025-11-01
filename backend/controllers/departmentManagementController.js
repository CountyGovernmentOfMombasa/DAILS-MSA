const pool = require('../config/db');

// Ensure only super admin (role super_admin or normalized super) can manage
function requireSuper(req, res) {
  if (!req.admin || (!['super','super_admin'].includes(req.admin.role) && req.admin.normalizedRole !== 'super')) {
    res.status(403).json({ success:false, message:'Super admin access required'});
    return false;
  }
  return true;
}

exports.list = async (req, res) => {
  try {
  if (!requireSuper(req,res)) return;
    const [deps] = await pool.query('SELECT id, name, created_at, updated_at FROM departments ORDER BY name');
    const [subs] = await pool.query('SELECT id, department_id, name FROM sub_departments ORDER BY name');
    const map = deps.map(d => ({ ...d, sub_departments: subs.filter(s => s.department_id === d.id) }));
    res.json({ success:true, data: map });
  } catch (e) {
    res.status(500).json({ success:false, message:'Error listing departments', error:e.message });
  }
};

exports.createDepartment = async (req, res) => {
  try {
  if (!requireSuper(req,res)) return;
    const { name, sub_departments = [] } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success:false, message:'Name required'});
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.query('INSERT INTO departments (name) VALUES (?)', [name.trim()]);
      const depId = r.insertId;
      for (const sd of sub_departments) {
        if (sd && sd.trim()) {
          await conn.query('INSERT INTO sub_departments (department_id, name) VALUES (?,?)',[depId, sd.trim()]);
        }
      }
      await conn.commit();
      res.json({ success:true, id: depId });
    } catch (e) {
      await conn.rollback();
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ success:false, message:'Department already exists' });
      throw e;
    } finally { conn.release(); }
  } catch (e) {
    res.status(500).json({ success:false, message:'Error creating department', error:e.message });
  }
};

exports.renameDepartment = async (req, res) => {
  try {
  if (!requireSuper(req,res)) return;
    const { id } = req.params;
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success:false, message:'Name required'});
    const [existing] = await pool.query('SELECT id,name FROM departments WHERE id=?',[id]);
    if (!existing.length) return res.status(404).json({ success:false, message:'Not found'});
    await pool.query('UPDATE departments SET name=? WHERE id=?',[name.trim(), id]);
    // Update users/admin_users referencing old name
    await pool.query('UPDATE users SET department=? WHERE department=?',[name.trim(), existing[0].name]);
    await pool.query('UPDATE admin_users SET department=? WHERE department=?',[name.trim(), existing[0].name]);
    res.json({ success:true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ success:false, message:'Department with that name exists'});
    res.status(500).json({ success:false, message:'Error renaming department', error:e.message });
  }
};

exports.deleteDepartment = async (req,res) => {
  try {
  if (!requireSuper(req,res)) return;
    const { id } = req.params;
    const { reassign_to = null } = req.body || {};
    const [rows] = await pool.query('SELECT id,name FROM departments WHERE id=?',[id]);
    if (!rows.length) return res.status(404).json({ success:false, message:'Not found'});
    const name = rows[0].name;
    if (reassign_to) {
      // Ensure target exists
      const [t] = await pool.query('SELECT name FROM departments WHERE id=?',[reassign_to]);
      if (!t.length) return res.status(400).json({ success:false, message:'Invalid reassign_to'});
      const targetName = t[0].name;
      await pool.query('UPDATE users SET department=? WHERE department=?',[targetName, name]);
      await pool.query('UPDATE admin_users SET department=? WHERE department=?',[targetName, name]);
    } else {
      // Safety check: block if in use
      const [[uCount]] = await pool.query('SELECT COUNT(*) AS c FROM users WHERE department=?',[name]);
      const [[aCount]] = await pool.query('SELECT COUNT(*) AS c FROM admin_users WHERE department=?',[name]);
      if (uCount.c > 0 || aCount.c > 0) return res.status(400).json({ success:false, message:'Department in use; provide reassign_to to move users/admins.'});
    }
    await pool.query('DELETE FROM departments WHERE id=?',[id]);
    res.json({ success:true });
  } catch (e) {
    res.status(500).json({ success:false, message:'Error deleting department', error:e.message });
  }
};

exports.addSubDepartment = async (req,res) => {
  try {
  if (!requireSuper(req,res)) return;
    const { id } = req.params; // department id
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success:false, message:'Name required'});
    await pool.query('INSERT INTO sub_departments (department_id,name) VALUES (?,?)',[id, name.trim()]);
    res.json({ success:true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ success:false, message:'Sub department already exists'});
    res.status(500).json({ success:false, message:'Error adding sub department', error:e.message });
  }
};

exports.renameSubDepartment = async (req,res) => {
  try {
  if (!requireSuper(req,res)) return;
    const { subId } = req.params;
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success:false, message:'Name required'});
    const [existing] = await pool.query('SELECT sd.id, sd.name, d.name AS dept_name FROM sub_departments sd JOIN departments d ON sd.department_id=d.id WHERE sd.id=?',[subId]);
    if (!existing.length) return res.status(404).json({ success:false, message:'Not found'});
    await pool.query('UPDATE sub_departments SET name=? WHERE id=?',[name.trim(), subId]);
    // Update users/admin_users referencing old sub department
    await pool.query('UPDATE users SET sub_department=? WHERE sub_department=?',[name.trim(), existing[0].name]);
    await pool.query('UPDATE admin_users SET sub_department=? WHERE sub_department=?',[name.trim(), existing[0].name]);
    res.json({ success:true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ success:false, message:'Duplicate name in department'});
    res.status(500).json({ success:false, message:'Error renaming sub department', error:e.message });
  }
};

exports.deleteSubDepartment = async (req,res) => {
  try {
    if (!requireSuper(req,res)) return;
    const { subId } = req.params;
    const { reassign_to = null } = req.body || {};
    const [existing] = await pool.query('SELECT id,name FROM sub_departments WHERE id=?',[subId]);
    if (!existing.length) return res.status(404).json({ success:false, message:'Not found'});
    const name = existing[0].name;
    if (reassign_to) {
      const [target] = await pool.query('SELECT name FROM sub_departments WHERE id=?',[reassign_to]);
      if (!target.length) return res.status(400).json({ success:false, message:'Invalid sub_department reassign target'});
      const targetName = target[0].name;
      await pool.query('UPDATE users SET sub_department=? WHERE sub_department=?',[targetName, name]);
      await pool.query('UPDATE admin_users SET sub_department=? WHERE sub_department=?',[targetName, name]);
    } else {
      const [[uCount]] = await pool.query('SELECT COUNT(*) AS c FROM users WHERE sub_department=?',[name]);
      const [[aCount]] = await pool.query('SELECT COUNT(*) AS c FROM admin_users WHERE sub_department=?',[name]);
      if (uCount.c > 0 || aCount.c > 0) return res.status(400).json({ success:false, message:'Sub department in use; provide reassign_to to move records.'});
    }
    await pool.query('DELETE FROM sub_departments WHERE id=?',[subId]);
    res.json({ success:true });
  } catch (e) {
    res.status(500).json({ success:false, message:'Error deleting sub department', error:e.message });
  }
};
