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

    // Notify user if rejected
    if (status === 'rejected') {
      // Get user email
      const [rows] = await pool.query(
        'SELECT u.email, u.first_name FROM declarations d JOIN users u ON d.user_id = u.id WHERE d.id = ?',
        [declarationId]
      );
      if (rows.length > 0) {
        const sendEmail = require('../util/sendEmail');
        await sendEmail({
          to: rows[0].email,
          subject: 'Declaration Rejected',
          text: `Dear ${rows[0].first_name},\n\nYour declaration was rejected. Please correct the following: ${correction_message || ''}`,
          html: `<p>Dear ${rows[0].first_name},</p><p>Your declaration was <b>rejected</b>.</p><p>Please correct the following:</p><p>${correction_message || ''}</p>`
        });
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

exports.getAllDeclarations = async (req, res) => {
  try {
    let departmentFilter = '';
    let params = [];
    if (req.admin && req.admin.department) {
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

    // Generate admin token
    const adminToken = jwt.sign(
      {
        adminId: admin.id,
        username: admin.username,
        role: admin.role,
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
      admin: admin.toJSON()
    });
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, emailFilter = 'all' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];
    if (emailFilter === 'with-email') {
      whereClause = 'WHERE email IS NOT NULL AND email != ""';
    } else if (emailFilter === 'without-email') {
      whereClause = 'WHERE email IS NULL OR email = ""';
    }
    // Departmental admin filter (only for finance_admin)
    if (req.admin && req.admin.department && req.admin.role === 'finance') {
      whereClause += (whereClause ? ' AND ' : 'WHERE ') + 'department = ?';
      params.push(req.admin.department);
    }

    // Get total count
    const [countResult] = await pool.query(`
      SELECT COUNT(*) as total FROM users ${whereClause}
    `, params);
    const total = countResult[0].total;

    // Get users with pagination
    const [users] = await pool.query(`
      SELECT id, payroll_number, first_name, other_names, surname, email, department, birthdate, national_id
      FROM users 
      ${whereClause}
      ORDER BY payroll_number
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);

    res.json({
      users,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
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

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const [result] = await pool.query(
      'UPDATE users SET email = ? WHERE id = ?',
      [email, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
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
        let email = emailTemplate
          .replace(/{first_name}/g, user.first_name.toLowerCase())
          .replace(/{other_names}/g, user.other_names.toLowerCase())
          .replace(/{surname}/g, user.surname.toLowerCase())
          .replace(/{payroll}/g, user.payroll_number);

        await pool.query(
          'UPDATE users SET email = ? WHERE id = ?',
          [email, userId]
        );
        updated++;
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

exports.createAdmin = async (req, res) => {
  try {
    const { username, password, email, role, first_name, last_name } = req.body;
    // Validate required fields
    if (!username || !password || !first_name || !last_name) {
      return res.status(400).json({ message: 'Username, password, first name, other names, and surname are required.' });
    }
    // Validate role
    const allowedRoles = ['super_admin', 'hr_admin', 'finance_admin'];
    const safeRole = role && allowedRoles.includes(role) ? role : 'hr_admin';
    // Prepare admin data
    const adminData = {
      username,
      password,
      email,
      role: safeRole,
      first_name,
      last_name,
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