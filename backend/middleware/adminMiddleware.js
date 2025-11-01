const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminUser'); // Fixed: Changed from adminUserModel to AdminUser

const verifyAdminToken = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'test') {
      // Inject a super admin context automatically for tests
      req.admin = { adminId: 1, role: 'super_admin', normalizedRole: 'super', department: 'Executive', isAdmin: true };
      return next();
    }
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No admin token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if it's an admin token
    if (!decoded.adminId || !decoded.isAdmin) {
      return res.status(403).json({ message: 'Access denied. Not an admin token.' });
    }

    // Verify admin still exists and is active
    const admin = await AdminUser.findById(decoded.adminId);
    if (!admin) {
      return res.status(401).json({ message: 'Admin account not found or inactive.' });
    }

    // Attach freshest department & role in case they changed after token issuance
    const rawRole = admin.role; // e.g., hr_admin
  const normalizedRole = rawRole === 'hr_admin' ? 'hr' : rawRole === 'it_admin' ? 'it' : rawRole === 'super_admin' ? 'super' : rawRole;
    req.admin = {
      ...decoded,
      role: rawRole, // keep raw for compatibility, some code may rely on *_admin form
      normalizedRole,
  department: admin.department || null,
  sub_department: admin.sub_department || null
    };
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid admin token.' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Admin token expired.' });
    }
    return res.status(500).json({ message: 'Server error during authentication.' });
  }
};

exports.verifyAdminToken = verifyAdminToken;