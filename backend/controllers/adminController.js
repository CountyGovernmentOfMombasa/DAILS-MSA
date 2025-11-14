// Approve or reject a declaration
exports.updateDeclarationStatus = async (req, res) => {
  try {
    const { declarationId } = req.params;
    const { status, correction_message } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }
    // Fetch current status & last correction message for comparison / audit
    const [currentRows] = await pool.query(
      "SELECT status, correction_message FROM declarations WHERE id = ?",
      [declarationId]
    );
    if (!currentRows.length) {
      return res
        .status(404)
        .json({ success: false, message: "Declaration not found" });
    }
    const prevStatus = currentRows[0].status || "pending";
    const prevCorrection = currentRows[0].correction_message || null;
    if (
      prevStatus === status &&
      (status === "approved" ||
        (status === "rejected" &&
          (prevCorrection || "") === (correction_message || "")))
    ) {
      return res.status(200).json({
        success: false,
        message: "No change: identical status already set.",
      });
    }
    const Declaration = require("../models/declarationModel");
    await Declaration.updateStatus(
      declarationId,
      status,
      correction_message || null
    );

    // (Removed declaration_checked legacy flag update)

    // Insert unified audit record with snapshot fields
    try {
      const [userRows] = await pool.query(
        "SELECT u.national_id, u.first_name, u.other_names, u.surname FROM declarations d JOIN users u ON d.user_id = u.id WHERE d.id = ? LIMIT 1",
        [declarationId]
      );
      let nationalId = null,
        fullName = null;
      if (userRows.length) {
        nationalId = userRows[0].national_id || null;
        fullName =
          [userRows[0].first_name, userRows[0].other_names, userRows[0].surname]
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim() || null;
      }
      await pool.query(
        `INSERT INTO declaration_status_audit (declaration_id, admin_id, user_full_name, national_id, previous_status, new_status, previous_correction_message, new_correction_message)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          declarationId,
          (req.admin && req.admin.adminId) || null,
          fullName,
          nationalId,
          prevStatus,
          status,
          prevCorrection,
          correction_message || null,
        ]
      );
    } catch (auditErr) {
      console.error(
        "Audit insert failed (declaration_status_audit):",
        auditErr.message
      );
    }

    // Notify user by email and SMS
    {
      const [rows] = await pool.query(
        "SELECT u.email, u.first_name, u.phone_number FROM declarations d JOIN users u ON d.user_id = u.id WHERE d.id = ?",
        [declarationId]
      );
      if (rows.length > 0) {
        const sendEmail = require("../util/sendEmail");
        const sendSMS = require("../util/sendSMS");
        const firstName = rows[0].first_name;
        if (status === "rejected") {
          await sendEmail({
            to: rows[0].email,
            subject: "Declaration of Income, Assets and Liabilities Rejected",
            text: `Dear ${firstName},\n\nYour Declaration of Income, Assets and Liabilities was rejected. Please correct the following: ${
              correction_message || ""
            }`,
            html: `<p>Dear ${firstName},</p><p>Your <b>Declaration of Income, Assets and Liabilities</b> was <b>rejected</b>.</p><p>Please correct the following:</p><p>${
              correction_message || ""
            }</p>`,
          });
          if (rows[0].phone_number) {
            try {
              await sendSMS({
                to: rows[0].phone_number,
                body: "Your declaration was rejected. Please check the portal for details.",
                type: "sms",
              });
            } catch {}
          }
        } else if (status === "approved") {
          await sendEmail({
            to: rows[0].email,
            subject: "Declaration of Income, Assets and Liabilities Approved",
            text: `Dear ${firstName},\n\nYour Declaration of Income, Assets and Liabilities has been approved.`,
            html: `<p>Dear ${firstName},</p><p>Your <b>Declaration of Income, Assets and Liabilities</b> has been <b>approved</b>.</p>`,
          });
          if (rows[0].phone_number) {
            try {
              await sendSMS({
                to: rows[0].phone_number,
                body: "Your declaration has been approved.",
                type: "sms",
              });
            } catch {}
          }
        }
      }
    }
    return res.json({ success: true, message: `Declaration ${status}` });
  } catch (error) {
    console.error("Update declaration status error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error updating declaration status",
      error: error.message,
    });
  }
};

// GET /api/admin/declarations/:declarationId/status-audit  (super + dept admins)
exports.getDeclarationStatusAudit = async (req, res) => {
  try {
    const { declarationId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 25), 200);
    const offset = (page - 1) * limit;
    const filters = [];
    let where = "WHERE a.declaration_id = ?";
    const params = [declarationId];
    if (
      req.query.status &&
      ["pending", "approved", "rejected"].includes(req.query.status)
    ) {
      where += " AND a.new_status = ?";
      params.push(req.query.status);
      filters.push(`status=${req.query.status}`);
    }
    if (req.query.admin) {
      where += " AND LOWER(au.username) LIKE ?";
      params.push("%" + req.query.admin.toLowerCase() + "%");
      filters.push(`admin~${req.query.admin}`);
    }
    if (req.query.from) {
      where += " AND a.changed_at >= ?";
      params.push(req.query.from);
      filters.push(`from=${req.query.from}`);
    }
    if (req.query.to) {
      where += " AND a.changed_at <= ?";
      params.push(req.query.to);
      filters.push(`to=${req.query.to}`);
    }
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM declaration_status_audit a LEFT JOIN admin_users au ON a.admin_id = au.id ${where}`,
      params
    );
    const total = countRows[0]?.cnt || 0;
    const [rows] = await pool.query(
      `SELECT a.id, a.declaration_id, a.admin_id, au.username AS admin_username, a.previous_status, a.new_status,
              a.previous_correction_message, a.new_correction_message, a.changed_at
         FROM declaration_status_audit a
         LEFT JOIN admin_users au ON a.admin_id = au.id
        ${where}
        ORDER BY a.changed_at DESC, a.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return res.json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      filters,
      data: rows,
    });
  } catch (err) {
    console.error("Fetch declaration status audit error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching audit logs",
      error: err.message,
    });
  }
};

// GET /api/admin/declarations/:declarationId/previous-corrections
exports.getDeclarationPreviousCorrections = async (req, res) => {
  try {
    const { declarationId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 10), 100);
    const offset = (page - 1) * limit;
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM declaration_status_audit WHERE declaration_id = ? AND new_correction_message IS NOT NULL AND new_correction_message <> ''`,
      [declarationId]
    );
    const total = countRows[0]?.cnt || 0;
    const [rows] = await pool.query(
      `SELECT new_correction_message AS correction_message, new_status AS status, changed_at
         FROM declaration_status_audit
        WHERE declaration_id = ? AND new_correction_message IS NOT NULL AND new_correction_message <> ''
        ORDER BY changed_at DESC, id DESC
        LIMIT ? OFFSET ?`,
      [declarationId, limit, offset]
    );
    return res.json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      data: rows,
    });
  } catch (err) {
    console.error("Fetch previous corrections error:", err);
    res.status(500).json({
      success: false,
      message: "Server error fetching previous corrections",
      error: err.message,
    });
  }
};

// GET /api/admin/declarations/status-audit  (global list with filters)
exports.listAllDeclarationStatusAudits = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 200);
    const offset = (page - 1) * limit;
    let where = "WHERE 1=1";
    const params = [];
    const filters = {};
    if (req.query.declarationId && !isNaN(parseInt(req.query.declarationId))) {
      where += " AND a.declaration_id = ?";
      params.push(parseInt(req.query.declarationId));
      filters.declarationId = parseInt(req.query.declarationId);
    }
    if (
      req.query.status &&
      ["pending", "approved", "rejected"].includes(req.query.status)
    ) {
      where += " AND a.new_status = ?";
      params.push(req.query.status);
      filters.status = req.query.status;
    }
    if (req.query.admin) {
      where += " AND LOWER(au.username) LIKE ?";
      params.push("%" + req.query.admin.toLowerCase() + "%");
      filters.admin = req.query.admin;
    }
    if (req.query.from) {
      where += " AND a.changed_at >= ?";
      params.push(req.query.from);
      filters.from = req.query.from;
    }
    if (req.query.to) {
      where += " AND a.changed_at <= ?";
      params.push(req.query.to);
      filters.to = req.query.to;
    }
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM declaration_status_audit a LEFT JOIN admin_users au ON a.admin_id = au.id ${where}`,
      params
    );
    const total = countRows[0]?.cnt || 0;
    const [rows] = await pool.query(
      `SELECT a.id, a.declaration_id, a.admin_id, au.username AS admin_username, a.previous_status, a.new_status,
              a.previous_correction_message, a.new_correction_message, a.changed_at
         FROM declaration_status_audit a
         LEFT JOIN admin_users au ON a.admin_id = au.id
        ${where}
        ORDER BY a.changed_at DESC, a.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return res.json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      filters,
      data: rows,
    });
  } catch (err) {
    console.error("Global status audit list error:", err);
    res.status(500).json({
      success: false,
      message: "Server error listing status audits",
      error: err.message,
    });
  }
};
const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const AdminUser = require("../models/AdminUser");
const PDFDocument = require("pdfkit");
const sendSMSUtil = require("../util/sendSMS");
const { isValidPhone, normalizePhone } = require("../util/phone");

// --- Helper: normalize department similar to frontend logic ---
function normalizeDepartment(name) {
  return (name || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Canonical departments (dynamic DB-backed; fallback to static list if cache load fails)
let CANONICAL_DEPARTMENTS = [
  "Executive",
  "Department of Public Service Administration, Youth, Gender and Sports",
  "Department of Blue Economy, Cooperatives, Agriculture and Livestock",
  "Department of Environment and Water",
  "Department of Transport, Infrastructure and Governance",
  "Department of Climate Change, Energy and Natural Resources",
  "Department of Lands, Urban Planning, Housing and Serikali Mtaani",
  "Department of Education and Vocational Training",
  "Department of Finance, Economic Planning and Digital Transformation",
  "Department of Health",
  "Department of Trade, Tourism and Culture",
  "Mombasa County Public Service Board",
  "Cooperatives",
];
const { getDepartmentConfig } = require("../util/departmentsCache");
async function refreshCanonicalDepartments() {
  try {
    const { departments } = await getDepartmentConfig();
    if (departments && departments.length) {
      CANONICAL_DEPARTMENTS = departments.slice();
    }
  } catch (e) {
    /* ignore, fallback to static */
  }
  canonicalIndex.clear();
  CANONICAL_DEPARTMENTS.forEach((c) =>
    canonicalIndex.set(normalizeDepartment(c), c)
  );
}
const canonicalIndex = new Map();
refreshCanonicalDepartments();

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
    let departmentFilter = "";
    let params = [];
    // Scope only HR admins to their department; IT and Super can view all
    if (
      req.admin &&
      req.admin.department &&
      (req.admin.normalizedRole === "hr" || req.admin.role === "hr_admin")
    ) {
      departmentFilter = "AND u.department = ?";
      params.push(req.admin.department);
    }
    const [rows] = await pool.query(
      `
      SELECT d.id, d.user_id, d.submitted_at, d.declaration_date, u.department, u.payroll_number, u.email
      FROM declarations d
      JOIN users u ON d.user_id = u.id
      WHERE 1=1 ${departmentFilter}
    `,
      params
    );

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
    CANONICAL_DEPARTMENTS.forEach((c) => {
      resultCounts[c] = 0;
    });
    let unknown = 0;
    for (const { dept } of employeeMap.values()) {
      if (dept) resultCounts[dept] += 1;
      else unknown += 1;
    }
    const totalUnique = employeeMap.size;
    const payload = {
      totalUniqueEmployeesWithDeclarations: totalUnique,
      counts: resultCounts,
      unknown,
      generatedAt: new Date().toISOString(),
    };
    return res.json({ success: true, data: payload });
  } catch (error) {
    console.error("getDepartmentDeclarationStats error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error generating department stats",
    });
  }
};

exports.getAllDeclarations = async (req, res) => {
  try {
    let departmentFilter = "";
    let params = [];
    // Scope only HR admins
    if (
      req.admin &&
      req.admin.department &&
      (req.admin.normalizedRole === "hr" || req.admin.role === "hr_admin")
    ) {
      departmentFilter = "AND u.department = ?";
      params.push(req.admin.department);
    }
    const [declarations] = await pool.query(
      `
      SELECT 
        d.*,
        u.first_name,
        u.other_names,
        u.surname,
        u.payroll_number,
        u.email,
        u.department,
        u.national_id,
        u.designation,
  /* First approval timestamp & approving admin from unified audit table */
  (SELECT a.changed_at FROM declaration_status_audit a WHERE a.declaration_id = d.id AND a.new_status = 'approved' ORDER BY a.changed_at ASC, a.id ASC LIMIT 1) AS approved_at,
  /* The original subquery referenced a non-existent column a.admin_username. We now LEFT JOIN admin_users to fetch username. */
  (SELECT COALESCE(NULLIF(TRIM(au.username), ''), au.username)
     FROM declaration_status_audit a
     LEFT JOIN admin_users au ON a.admin_id = au.id
    WHERE a.declaration_id = d.id AND a.new_status = 'approved'
    ORDER BY a.changed_at ASC, a.id ASC
    LIMIT 1) AS approved_admin_name
      FROM declarations d
      JOIN users u ON d.user_id = u.id
      WHERE 1=1 ${departmentFilter}
      ORDER BY d.declaration_date DESC
    `,
      params
    );

    // For each declaration, fetch spouses and children
    const declarationIds = declarations.map((d) => d.id);
    let spouses = [];
    let children = [];
    if (declarationIds.length > 0) {
      [spouses] = await pool.query(
        `SELECT * FROM spouses WHERE declaration_id IN (?)`,
        [declarationIds]
      );
      [children] = await pool.query(
        `SELECT * FROM children WHERE declaration_id IN (?)`,
        [declarationIds]
      );
    }

    // Attach spouses and children to each declaration
    const data = declarations.map((declaration) => ({
      ...declaration,
      spouses: spouses.filter((s) => s.declaration_id === declaration.id),
      children: children.filter((c) => c.declaration_id === declaration.id),
    }));

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Get all declarations error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching all declarations",
      error: error.message,
    });
  }
};

exports.adminLogin = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }

    // Find admin user in database
    const admin = await AdminUser.findByUsername(username);

    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Verify password
    const isValidPassword = await admin.verifyPassword(password);

    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Map DB roles to frontend roles (finance removed)
    if (admin.role === "hr_admin") admin.role = "hr";
    else if (admin.role === "it_admin") admin.role = "it";
    else if (admin.role === "super_admin") admin.role = "super";
    else admin.role = "super";

    // Enforce that any non-super admin must have a department assigned
    if (admin.role !== "super" && !admin.department) {
      return res.status(403).json({
        message: "Department assignment required. Contact a super admin.",
        departmentMissing: true,
      });
    }

    // New short-lived access + refresh token model for admins
    const crypto = require("crypto");
    const pool = require("../config/db");
    const accessTtl = process.env.ADMIN_ACCESS_TOKEN_EXPIRES_IN || "30m";
    const rawRefresh = crypto.randomBytes(48).toString("hex");
    const refreshToken = `${admin.id}.${rawRefresh}`;
    const refreshHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    await pool.query(
      "UPDATE admin_users SET refresh_token_hash = ?, last_activity = NOW(), last_login = NOW() WHERE id = ?",
      [refreshHash, admin.id]
    );
    const adminToken = jwt.sign(
      {
        adminId: admin.id,
        username: admin.username,
        role: admin.role,
        department: admin.department || null,
        sub_department: admin.sub_department || null,
        isAdmin: true,
      },
      process.env.JWT_SECRET,
      { expiresIn: accessTtl }
    );
    res.json({
      message: "Admin login successful",
      adminToken,
      refreshToken,
      accessTtl,
      admin: admin.toJSON(),
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.verifyAdmin = async (req, res) => {
  try {
    // Get fresh admin data from database
    const admin = await AdminUser.findById(req.admin.adminId);

    if (!admin) {
      return res.status(401).json({ message: "Admin not found" });
    }

    res.json({
      message: "Admin verified",
      admin: {
        ...admin.toJSON(),
        // Provide mapped role consistent with login response
        role:
          admin.role === "hr_admin"
            ? "hr"
            : admin.role === "it_admin"
            ? "it"
            : "super",
      },
    });
  } catch (error) {
    console.error("Admin verification error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      emailFilter = "all",
      search = "",
      sortBy = "payroll_number",
      sortDir = "asc",
    } = req.query;
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 50, 500); // cap to prevent abuse
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    // Email filter conditions
    if (emailFilter === "with-email") {
      conditions.push("email IS NOT NULL AND email != ''");
    } else if (emailFilter === "without-email") {
      conditions.push("(email IS NULL OR email = '')");
    }

    // Department scoping: all non-super admins only see their department
    // Scope only HR admins to their department
    if (
      req.admin &&
      req.admin.department &&
      (req.admin.normalizedRole === "hr" || req.admin.role === "hr_admin")
    ) {
      conditions.push("department = ?");
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
      params.push(
        term,
        term,
        term,
        term,
        `%${search.trim()}%`,
        `%${search.trim()}%`
      );
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    // Count (filtered)
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM users ${whereClause}`,
      params
    );
    const total = countResult[0]?.total || 0;

    // Stats (filtered, independent of pagination)
    const [statsRows] = await pool.query(
      `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END) as withEmail,
        SUM(CASE WHEN email IS NULL OR email = '' THEN 1 ELSE 0 END) as withoutEmail
      FROM users
      ${whereClause}
    `,
      params
    );
    const stats = statsRows?.[0] || { total: 0, withEmail: 0, withoutEmail: 0 };

    // Whitelist sortable columns
    const sortable = new Set([
      "payroll_number",
      "surname",
      "first_name",
      "department",
      "email",
      "national_id",
      "birthdate",
    ]);
    const orderColumn = sortable.has(sortBy) ? sortBy : "payroll_number";
    const direction = String(sortDir).toLowerCase() === "desc" ? "DESC" : "ASC";

    // Data page
    const [users] = await pool.query(
      `
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
    `,
      [...params, limitNum, offset]
    );

    res.json({
      users,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      stats: {
        total: stats.total || 0,
        withEmail: stats.withEmail || 0,
        withoutEmail: stats.withoutEmail || 0,
      },
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({ message: "Server error while fetching users" });
  }
};

exports.updateUserEmail = async (req, res) => {
  try {
    const { userId } = req.params;
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "Email is required" });
    }

    const trimmed = email.trim();
    // Reject placeholder-like or templated inputs containing braces
    if (/[{}\s]/.test(trimmed) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return res
        .status(400)
        .json({ message: "Email appears to be a placeholder or malformed." });
    }

    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(trimmed)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const normalized = trimmed.toLowerCase();

    // Fetch old email first
    const [existingRows] = await pool.query(
      "SELECT email FROM users WHERE id = ?",
      [userId]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const oldEmail = existingRows[0].email || null;

    const [result] = await pool.query(
      "UPDATE users SET email = ? WHERE id = ?",
      [normalized, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Audit log
    try {
      await pool.query(
        "INSERT INTO email_change_audit (user_id, old_email, new_email, changed_by_admin_id) VALUES (?, ?, ?, ?)",
        [userId, oldEmail, normalized, (req.admin && req.admin.adminId) || null]
      );
    } catch (logErr) {
      console.warn("Email audit log insert failed:", logErr.message);
    }

    res.json({ message: "Email updated successfully" });
  } catch (error) {
    console.error("Update user email error:", error);
    res.status(500).json({ message: "Server error while updating email" });
  }
};

exports.bulkUpdateEmails = async (req, res) => {
  try {
    const { userIds, emailTemplate } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "User IDs array is required" });
    }

    if (!emailTemplate) {
      return res.status(400).json({ message: "Email template is required" });
    }

    let updated = 0;

    for (const userId of userIds) {
      // Get user data for template replacement
      const [userResult] = await pool.query(
        "SELECT first_name, other_names,surname, payroll_number FROM users WHERE id = ?",
        [userId]
      );

      if (userResult.length > 0) {
        const user = userResult[0];
        const safeFirst = (user.first_name || "").toLowerCase();
        const safeOther = (user.other_names || "").toLowerCase();
        const safeSurname = (user.surname || "").toLowerCase();
        let email = emailTemplate
          .replace(/{first_name}/gi, safeFirst)
          .replace(/{other_names}/gi, safeOther)
          .replace(/{surname}/gi, safeSurname)
          .replace(/{payroll}/gi, user.payroll_number);

        email = email.replace(/\s+/g, "."); // collapse spaces into dots
        const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
        if (!emailRegex.test(email)) {
          // Skip invalid generated email silently; could collect skipped list
          continue;
        }

        // Fetch old email
        const [oldRows] = await pool.query(
          "SELECT email FROM users WHERE id = ?",
          [userId]
        );
        const oldEmail = oldRows.length ? oldRows[0].email : null;
        const [upd] = await pool.query(
          "UPDATE users SET email = ? WHERE id = ?",
          [email.toLowerCase(), userId]
        );
        if (upd.affectedRows > 0) {
          updated++;
          try {
            await pool.query(
              "INSERT INTO email_change_audit (user_id, old_email, new_email, changed_by_admin_id) VALUES (?, ?, ?, ?)",
              [
                userId,
                oldEmail,
                email.toLowerCase(),
                (req.admin && req.admin.adminId) || null,
              ]
            );
          } catch (e) {
            console.warn("Bulk email audit log failed:", e.message);
          }
        }
      }
    }

    res.json({
      message: `Successfully updated ${updated} email addresses`,
      updated,
    });
  } catch (error) {
    console.error("Bulk update emails error:", error);
    res.status(500).json({ message: "Server error while updating emails" });
  }
};

// Admin management functions
exports.getAllAdmins = async (req, res) => {
  try {
    const admins = await AdminUser.getAllActive();
    res.json({
      success: true,
      data: admins,
    });
  } catch (error) {
    console.error("Get all admins error:", error);
    res.status(500).json({ message: "Server error while fetching admins" });
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
      if (err && err.code === "ER_BAD_FIELD_ERROR") {
        // Legacy schema fallback (last_name instead of surname, no other_names)
        const [legacyRows] = await pool.query(
          `SELECT id, username, role, email, department, first_name, last_name AS surname, created_at
           FROM admin_users
           WHERE is_active = TRUE
             AND role <> 'super_admin'
             AND (department IS NULL OR department = '' OR department = 'UNASSIGNED-DEPT')
           ORDER BY created_at DESC`
        );
        return res.json({
          success: true,
          count: legacyRows.length,
          data: legacyRows,
        });
      }
      throw err;
    }
  } catch (error) {
    console.error("Get admins missing department error:", error);
    res.status(500).json({
      message: "Server error while fetching admins missing department",
    });
  }
};

exports.createAdmin = async (req, res) => {
  try {
    const {
      username,
      password,
      email,
      role,
      first_name,
      other_names = null,
      surname,
      department,
      sub_department,
      userId,
      nationalId,
      linkExistingUser = false,
    } = req.body;
    if (!username) {
      return res.status(400).json({ message: "Username is required." });
    }
    const allowedRoles = ["super_admin", "hr_admin", "it_admin"];
    const safeRole = role && allowedRoles.includes(role) ? role : "hr_admin";

    let finalFirst = first_name;
    let finalSurname = surname;
    let finalEmail = email;
    let finalDept = department;
    let finalSubDept = sub_department;
    let linkedUserId = null;

    // Optional linking to existing user record (by userId or nationalId)
    if (linkExistingUser) {
      let urows = [];
      if (userId) {
        [urows] = await pool.query(
          "SELECT id, first_name, other_names, surname, email, department, sub_department, national_id FROM users WHERE id = ?",
          [userId]
        );
      } else if (nationalId) {
        [urows] = await pool.query(
          "SELECT id, first_name, other_names, surname, email, department, sub_department, national_id FROM users WHERE national_id = ?",
          [nationalId]
        );
      } else {
        return res.status(400).json({
          message: "Provide userId or nationalId when linkExistingUser=true.",
        });
      }
      if (!urows.length) {
        return res
          .status(400)
          .json({ message: "User not found for provided identifier." });
      }
      const u = urows[0];
      linkedUserId = u.id;
      // Prevent duplicate admin linkage to same user
      const existingAdminForUser = await AdminUser.findByUserId(linkedUserId);
      if (existingAdminForUser) {
        return res
          .status(400)
          .json({ message: "This user already has a linked admin account." });
      }
      if (!finalFirst) finalFirst = u.first_name || "";
      if (!finalSurname) finalSurname = u.surname || "";
      if (!finalEmail) finalEmail = u.email || null;
      if (!finalDept && safeRole !== "super_admin")
        finalDept = u.department || null;
      if (!finalSubDept && safeRole !== "super_admin")
        finalSubDept = u.sub_department || null;
    }

    if (!finalFirst || !finalSurname) {
      return res.status(400).json({
        message:
          "First name and surname are required (either provided or derived from linked user).",
      });
    }

    if (safeRole !== "super_admin" && !finalDept) {
      return res
        .status(400)
        .json({ message: "Department is required for non-super admin roles." });
    }

    // Derive a password if omitted (non-linked) so bcrypt hashing in model succeeds; linked admins reuse user authentication so password can be placeholder.
    let finalPassword = password;
    if (!finalPassword) {
      if (linkedUserId) {
        // Provide a random placeholder; not used for login (elevation flow uses user creds)
        finalPassword =
          require("crypto").randomBytes(16).toString("hex") + "Aa1!";
      } else {
        // Non-linked: must have password
        return res.status(400).json({
          message: "Password required when not linking to an existing user.",
        });
      }
    }

    const adminData = {
      username,
      password: finalPassword,
      email: finalEmail,
      role: safeRole,
      department: safeRole === "super_admin" ? null : finalDept,
      sub_department: safeRole === "super_admin" ? null : finalSubDept,
      first_name: finalFirst,
      other_names,
      surname: finalSurname, // This now correctly uses the destructured surname
      created_by: req.admin.adminId,
      user_id: linkedUserId,
    };
    const newAdmin = await AdminUser.create(adminData);

    // Linkage audit (best-effort). Separate table to allow future enrichment without bloating creation audit.
    if (linkedUserId) {
      try {
        await pool.query(
          `
          INSERT INTO admin_user_link_audit (admin_id, user_id, linked_via, national_id_snapshot, department_snapshot, created_by_admin_id, creator_role, ip_address, user_agent)
          SELECT ?, u.id, ?, u.national_id, u.department, ?, ?, ?, ?
            FROM users u
           WHERE u.id = ?
           LIMIT 1
        `,
          [
            newAdmin.id,
            nationalId ? "national_id" : "user_id",
            (req.admin && req.admin.adminId) || null,
            (req.admin && req.admin.role) || null,
            req.ip || req.headers["x-forwarded-for"] || null,
            req.headers["user-agent"] || null,
            linkedUserId,
          ]
        );
      } catch (auditErr) {
        console.warn("Admin linkage audit insert failed:", auditErr.message);
      }
    }

    // Send notification email
    const sendEmail = require("../util/sendEmail");
    const displayFirst = newAdmin.first_name || first_name;
    const adminHtml = `<!DOCTYPE html><html><body style=\"font-family: Arial, sans-serif; background: #f7f7f7; padding: 20px;\"><div style=\"max-width: 500px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #eee; padding: 24px;\"><h2 style=\"color: #2a7ae2;\">WDP Admin Account Created</h2><p>Dear <strong>${displayFirst}</strong>,</p><p>Your admin account has been successfully created.${
      linkedUserId ? " It is linked to your existing user profile." : ""
    }</p><p style=\"margin-top: 24px;\">Best regards,<br><strong>WDP Team</strong></p><hr><small style=\"color: #888;\">This is an automated message. Please do not reply.</small></div></body></html>`;
    await sendEmail({
      to: finalEmail,
      subject: "Your WDP Admin Account Has Been Created",
      text: `Hello ${displayFirst},\nYour admin account has been created.${
        linkedUserId ? " It is linked to your existing user profile." : ""
      }`,
      html: adminHtml,
    });

    const resp = newAdmin.toJSON();
    resp.linked_user_id = linkedUserId;
    if (linkedUserId) {
      resp.link_method = nationalId ? "national_id" : "user_id";
    }
    res.status(201).json({
      success: true,
      message: "Admin created successfully",
      data: resp,
    });
  } catch (error) {
    console.error("Create admin error:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(400)
        .json({ message: "Username or email already exists." });
    }
    res.status(500).json({ message: "Server error while creating admin" });
  }
};

exports.updateAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { email, role, first_name, last_name, is_active } = req.body;
    // Validate role
    const allowedRoles = ["super_admin", "hr_admin", "it_admin"];
    const safeRole = role && allowedRoles.includes(role) ? role : undefined;
    // Validate required fields
    if (!first_name || !last_name) {
      return res
        .status(400)
        .json({ message: "First name and last name are required." });
    }
    const admin = await AdminUser.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    const updatedAdmin = await admin.update({
      email,
      role: safeRole,
      first_name,
      last_name,
      is_active,
    });
    res.json({
      success: true,
      message: "Admin updated successfully",
      data: updatedAdmin.toJSON(),
    });
  } catch (error) {
    console.error("Update admin error:", error);
    res.status(500).json({ message: "Server error while updating admin" });
  }
};

exports.deleteAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;

    // Prevent self-deletion
    if (parseInt(adminId) === req.admin.adminId) {
      return res
        .status(400)
        .json({ message: "Cannot delete your own account" });
    }

    const admin = await AdminUser.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    await admin.deactivate();

    res.json({
      success: true,
      message: "Admin deactivated successfully",
    });
  } catch (error) {
    console.error("Delete admin error:", error);
    res.status(500).json({ message: "Server error while deleting admin" });
  }
};

exports.changeAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Current and new passwords are required" });
    }

    const admin = await AdminUser.findById(req.admin.adminId);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Verify current password
    const isValidPassword = await admin.verifyPassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Enforce password policy: min 8 chars, upper, lower, number, symbol
    const policy = {
      minLength: 8,
      upper: /[A-Z]/,
      lower: /[a-z]/,
      number: /[0-9]/,
      symbol: /[^A-Za-z0-9]/,
    };
    if (
      newPassword.length < policy.minLength ||
      !policy.upper.test(newPassword) ||
      !policy.lower.test(newPassword) ||
      !policy.number.test(newPassword) ||
      !policy.symbol.test(newPassword)
    ) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.",
      });
    }

    // Prevent reuse of the same password
    const reuse = await bcrypt.compare(newPassword, admin.password);
    if (reuse) {
      return res
        .status(400)
        .json({ message: "You cannot reuse your previous password." });
    }

    await admin.updatePassword(newPassword);
    // Audit log
    try {
      await pool.query(
        "INSERT INTO admin_password_change_audit (admin_id, changed_by_admin_id, ip_address, user_agent) VALUES (?, ?, ?, ?)",
        [
          admin.id,
          req.admin.adminId,
          req.ip || null,
          (req.headers["user-agent"] || "").substring(0, 255),
        ]
      );
    } catch (auditErr) {
      console.error(
        "Failed to write admin password change audit:",
        auditErr.message
      );
    }
    // Issue a fresh token so any stolen old token becomes less useful (best practice)
    let refreshedToken = null;
    try {
      const mappedRole =
        admin.role === "hr_admin"
          ? "hr"
          : admin.role === "it_admin"
          ? "it"
          : "super";
      refreshedToken = jwt.sign(
        {
          adminId: admin.id,
          username: admin.username,
          role: mappedRole,
          department: admin.department || null,
          sub_department: admin.sub_department || null,
          isAdmin: true,
        },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
      );
    } catch (e) {
      // Non-fatal: continue without refreshed token
    }

    res.json({
      success: true,
      message: "Password updated successfully",
      ...(refreshedToken ? { adminToken: refreshedToken } : {}),
    });
  } catch (error) {
    console.error("Change admin password error:", error);
    res.status(500).json({ message: "Server error while changing password" });
  }
};

// Send a test email to verify MAIL_* configuration. Requires admin auth.
exports.sendTestEmail = async (req, res) => {
  try {
    const sendEmail = require("../util/sendEmail");
    const to =
      req.query.to || process.env.MAIL_FROM_ADDR || process.env.MAIL_USERNAME;
    if (!to) {
      return res.status(400).json({
        success: false,
        message: "No destination email specified and no default configured.",
      });
    }
    const info = await sendEmail({
      to,
      subject: "Admin Test Email",
      text: "This is a test email confirming that the MAIL_* configuration works.",
      html: "<p><strong>Success!</strong> Your admin test email was delivered using the configured MAIL_* settings.</p>",
    });
    return res.json({
      success: true,
      message: "Test email dispatched",
      messageId: info.messageId,
      to,
    });
  } catch (error) {
    console.error("Test email send error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send test email",
      error: error.message,
    });
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
      search = "",
      sortBy = "changed_at",
      sortDir = "desc",
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 50, 500);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (userId) {
      conditions.push("eca.user_id = ?");
      params.push(userId);
    }
    if (adminId) {
      conditions.push("eca.changed_by_admin_id = ?");
      params.push(adminId);
    }
    if (department) {
      conditions.push("u.department = ?");
      params.push(department);
    }
    if (from) {
      conditions.push("eca.changed_at >= ?");
      params.push(from + " 00:00:00");
    }
    if (to) {
      conditions.push("eca.changed_at <= ?");
      params.push(to + " 23:59:59");
    }
    if (search && search.trim()) {
      const term = "%" + search.toLowerCase().trim() + "%";
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

    const whereClause = conditions.length
      ? "WHERE " + conditions.join(" AND ")
      : "";

    const sortable = new Set([
      "changed_at",
      "user_id",
      "changed_by_admin_id",
      "new_email",
      "old_email",
      "department",
    ]);
    const orderColumn = sortable.has(sortBy) ? sortBy : "changed_at";
    const direction = String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";

    // Count
    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) as total
      FROM email_change_audit eca
      JOIN users u ON eca.user_id = u.id
      LEFT JOIN admin_users au ON eca.changed_by_admin_id = au.id
      ${whereClause}
    `,
      params
    );
    const total = countRows[0]?.total || 0;

    // Data
    const [rows] = await pool.query(
      `
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
      ORDER BY ${
        orderColumn === "department"
          ? "u.department"
          : orderColumn === "user_id"
          ? "eca.user_id"
          : orderColumn === "changed_by_admin_id"
          ? "eca.changed_by_admin_id"
          : "eca." + orderColumn
      } ${direction}, eca.id DESC
      LIMIT ? OFFSET ?
    `,
      [...params, limitNum, offset]
    );

    res.json({
      success: true,
      data: rows,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error("Get email change audit error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error fetching audit log" });
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
      search = "",
      sortBy = "changed_at",
      sortDir = "desc",
    } = req.query;

    const conditions = [];
    const params = [];
    if (userId) {
      conditions.push("eca.user_id = ?");
      params.push(userId);
    }
    if (adminId) {
      conditions.push("eca.changed_by_admin_id = ?");
      params.push(adminId);
    }
    if (department) {
      conditions.push("u.department = ?");
      params.push(department);
    }
    if (from) {
      conditions.push("eca.changed_at >= ?");
      params.push(from + " 00:00:00");
    }
    if (to) {
      conditions.push("eca.changed_at <= ?");
      params.push(to + " 23:59:59");
    }
    if (search && search.trim()) {
      const term = "%" + search.toLowerCase().trim() + "%";
      conditions.push(`(
        LOWER(u.first_name) LIKE ? OR LOWER(u.other_names) LIKE ? OR LOWER(u.surname) LIKE ? OR
        LOWER(u.email) LIKE ? OR LOWER(eca.old_email) LIKE ? OR LOWER(eca.new_email) LIKE ? OR
        LOWER(au.username) LIKE ? OR u.payroll_number LIKE ? OR u.national_id LIKE ?
      )`);
      params.push(term, term, term, term, term, term, term, term, term);
    }
    const whereClause = conditions.length
      ? "WHERE " + conditions.join(" AND ")
      : "";
    const sortable = new Set([
      "changed_at",
      "user_id",
      "changed_by_admin_id",
      "new_email",
      "old_email",
      "department",
    ]);
    const orderColumn = sortable.has(sortBy) ? sortBy : "changed_at";
    const direction = String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";

    const [rows] = await pool.query(
      `
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
      ORDER BY ${
        orderColumn === "department"
          ? "u.department"
          : orderColumn === "user_id"
          ? "eca.user_id"
          : orderColumn === "changed_by_admin_id"
          ? "eca.changed_by_admin_id"
          : "eca." + orderColumn
      } ${direction}, eca.id DESC
      LIMIT 5000
    `,
      params
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="email_audit_log.pdf"'
    );

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);
    doc.fontSize(16).text("Email Change Audit Report", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`);
    if (department) doc.text(`Department: ${department}`);
    if (from || to) doc.text(`Range: ${from || "..."} to ${to || "..."}`);
    if (search) doc.text(`Search: ${search}`);
    doc.moveDown(0.5);

    const headers = [
      "When",
      "Payroll",
      "Name",
      "Dept",
      "Old Email",
      "New Email",
      "By Admin",
    ];
    doc.fontSize(9).fillColor("#000");
    doc.text(headers.join(" | "));
    doc.moveDown(0.2);
    doc.moveTo(doc.x, doc.y).lineTo(550, doc.y).stroke();

    rows.forEach((r) => {
      const name = [r.surname, r.first_name, r.other_names]
        .filter(Boolean)
        .join(" ");
      const line = [
        r.changed_at.toISOString().replace("T", " ").substring(0, 19),
        r.payroll_number || "",
        name,
        r.department || "",
        r.old_email || "",
        r.new_email || "",
        r.admin_username || "",
      ].map((v) => (v || "").toString().replace(/\s+/g, " "));
      doc.text(line.join(" | "));
    });

    doc.end();
  } catch (error) {
    console.error("Export email audit PDF error:", error);
    res.status(500).json({ success: false, message: "Failed to export PDF" });
  }
};

// Admin on-demand Declaration PDF download (super or department scoped if allowed)
// Route intention: GET /api/admin/declarations/:id/download-pdf
// This mirrors user route but allows super admin (and future: department admins if policy added) to fetch PDF
exports.adminDownloadDeclarationPDF = async (req, res) => {
  try {
    const declarationId = req.params.id;
    if (!declarationId)
      return res
        .status(400)
        .json({ success: false, message: "Missing declaration id" });
    // Only super admins for now (avoid accidental exposure). Extend later if needed.
    if (
      !req.admin ||
      (!["super", "super_admin"].includes(req.admin.role) &&
        req.admin.normalizedRole !== "super")
    ) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    const [declRows] = await pool.query(
      "SELECT d.id, d.user_id, u.national_id FROM declarations d JOIN users u ON d.user_id = u.id WHERE d.id = ? LIMIT 1",
      [declarationId]
    );
    if (!declRows.length)
      return res
        .status(404)
        .json({ success: false, message: "Declaration not found" });
    const { generateDeclarationPDF } = require("../util/pdfBuilder");
    const { buffer, base, password, encryptionApplied, passwordInstruction } =
      await generateDeclarationPDF(declarationId);
    const safeNatId = (base.national_id || "declaration")
      .toString()
      .replace(/[^A-Za-z0-9_-]/g, "_");
    const filename = `${safeNatId}_DAILs_Form.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    if (encryptionApplied && password) {
      res.setHeader("X-PDF-Password", password);
      if (passwordInstruction)
        res.setHeader("X-PDF-Password-Note", passwordInstruction);
    }
    return res.send(buffer);
  } catch (err) {
    console.error("Admin declaration PDF generation failed:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to generate PDF",
      error: err.message,
    });
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
    if (enumRows.length && enumRows[0].COLUMN_TYPE.startsWith("enum(")) {
      const columnType = enumRows[0].COLUMN_TYPE; // e.g. enum('A','B','C')
      const matches = [...columnType.matchAll(/'([^']*)'/g)];
      allDepartments = matches.map((m) => m[1]);
    }

    // 2. Get counts of existing departments in users table
    const [countRows] = await pool.query(`
      SELECT department, COUNT(*) as count
      FROM users
      WHERE department IS NOT NULL AND department != ''
      GROUP BY department
    `);
    const countMap = countRows.reduce((acc, r) => {
      acc[r.department] = r.count;
      return acc;
    }, {});

    // 3. Build response objects keeping original simple array for backward compatibility
    const departmentStats = allDepartments.map((dep) => ({
      name: dep,
      count: countMap[dep] || 0,
    }));

    res.json({
      departments: allDepartments,
      departmentStats,
    });
  } catch (error) {
    console.error("Get distinct departments error:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching departments" });
  }
};

// Get distinct designations (for dropdown filtering on frontend)
exports.getDistinctDesignations = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT designation
      FROM users
      WHERE designation IS NOT NULL AND designation != ''
      ORDER BY designation ASC
    `);
    const designations = rows.map((r) => r.designation);
    res.json({
      success: true,
      designations,
    });
  } catch (error) {
    console.error("Get distinct designations error:", error);
    res
      .status(500)
      .json({ message: "Server error while fetching designations" });
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
      sub_department = null,
      email = null,
      phone_number = null,
    } = req.body || {};

    if (
      !payroll_number ||
      !first_name ||
      !surname ||
      !national_id ||
      !department
    ) {
      return res.status(400).json({
        message:
          "payroll_number, first_name, surname, national_id and department are required",
      });
    }

    // Department scoping for HR admins only
    if (
      req.admin &&
      req.admin.department &&
      (req.admin.normalizedRole === "hr" || req.admin.role === "hr_admin")
    ) {
      if (department !== req.admin.department) {
        return res
          .status(403)
          .json({ message: "Cannot create user outside your department" });
      }
    }

    // Check duplicates
    const existingPayroll = await User.findByPayrollNumber(payroll_number);
    if (existingPayroll) {
      return res
        .status(409)
        .json({ message: "A user with that payroll number already exists" });
    }
    const existingNat = await User.findByNationalId(national_id);
    if (existingNat) {
      return res
        .status(409)
        .json({ message: "A user with that national ID already exists" });
    }

    // Generate temporary password (8 random chars + number + symbol)
    const randomPart = Math.random().toString(36).slice(-8);
    const tempPassword = randomPart + "!1";

    const { isValidPhone, normalizePhone } = require("../util/phone");
    let normalizedPhone = phone_number;
    if (phone_number) {
      if (!isValidPhone(phone_number)) {
        return res.status(400).json({
          success: false,
          code: "INVALID_PHONE_FORMAT",
          field: "phone_number",
          message:
            "Invalid phone number format. Use 7-15 digits, optional leading +",
        });
      }
      const already = await User.existsByPhone(phone_number);
      if (already) {
        return res.status(409).json({
          success: false,
          code: "PHONE_IN_USE",
          field: "phone_number",
          message: "Phone number already in use by another user.",
        });
      }
      normalizedPhone = normalizePhone(phone_number);
    }

    const userId = await User.create({
      payroll_number,
      first_name,
      surname,
      other_names,
      national_id,
      department,
      sub_department,
      email,
      phone_number: normalizedPhone,
      password: tempPassword,
    });

    res.status(201).json({
      success: true,
      user: {
        id: userId,
        payroll_number,
        first_name,
        surname,
        other_names,
        national_id,
        department,
        sub_department,
        email,
        phone_number,
      },
      temporaryPassword: tempPassword,
    });
  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({ message: "Server error while creating user" });
  }
};

// Delete a user (admin). Non-super admins can only delete within their department.
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res.status(400).json({ message: "userId param required" });

    const [rows] = await pool.query(
      "SELECT id, department FROM users WHERE id = ?",
      [userId]
    );
    if (!rows.length)
      return res.status(404).json({ message: "User not found" });
    const target = rows[0];

    if (
      req.admin &&
      req.admin.department &&
      (req.admin.normalizedRole === "hr" || req.admin.role === "hr_admin")
    ) {
      if (target.department !== req.admin.department) {
        return res
          .status(403)
          .json({ message: "Cannot delete user outside your department" });
      }
    }

    // Optional: prevent deletion if user has declarations
    const [decls] = await pool.query(
      "SELECT id FROM declarations WHERE user_id = ? LIMIT 1",
      [userId]
    );
    if (decls.length) {
      return res
        .status(400)
        .json({ message: "Cannot delete user with existing declarations" });
    }

    const [result] = await pool.query("DELETE FROM users WHERE id = ?", [
      userId,
    ]);
    if (result.affectedRows === 0)
      return res
        .status(404)
        .json({ message: "User not found (already deleted)" });
    res.json({ success: true, message: "User deleted" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ message: "Server error while deleting user" });
  }
};

// Department user declaration status for IT / HR admins
// GET /api/admin/department/users-status[?search=][&department=] (department param only honored for super admins, others locked to their own)
exports.getDepartmentUserDeclarationStatus = async (req, res) => {
  try {
    // Accept roles: hr_admin or it_admin (raw) or normalized hr, it. Super admin optional (can pass department)
    const role =
      (req.admin && (req.admin.role || req.admin.normalizedRole)) || "";
    const allowed = [
      "hr",
      "hr_admin",
      "it",
      "it_admin",
      "super",
      "super_admin",
    ];
    if (!allowed.includes(role)) {
      return res
        .status(403)
        .json({ success: false, message: "Forbidden: role not allowed." });
    }
    let department = req.query.department || null;
    // Department scoping rules:
    // - HR admins: forced to their own department
    // - IT and Super admins: can query any department (must provide ?department)
    const isSuper = ["super", "super_admin"].includes(role);
    const isIT = ["it", "it_admin"].includes(role);
    const isHR = ["hr", "hr_admin"].includes(role);
    if (isHR) {
      department = req.admin.department || null;
    }
    if (!department) {
      return res
        .status(400)
        .json({ success: false, message: "Department is required." });
    }
    // Parameter parsing
    const search = (req.query.search || "").trim().toLowerCase();
    const statusFilter = (req.query.status || "").toLowerCase(); // approved|rejected|pending|none
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = (page - 1) * limit;
    const sortBy = (req.query.sortBy || "first_name").toLowerCase();
    const sortDir =
      String(req.query.sortDir || "asc").toLowerCase() === "desc"
        ? "DESC"
        : "ASC";

    // Introspect users table columns to safely build surname & national id expressions
    const [userCols] = await pool.query("SHOW COLUMNS FROM users");
    const colNames = userCols.map((c) => c.Field.toLowerCase());
    const hasSurname = colNames.includes("surname");
    const hasLastName = colNames.includes("last_name");
    const hasNat = colNames.includes("national_id");
    const hasIdNumber = colNames.includes("id_number");
    const hasIdNo = colNames.includes("id_no");
    let surnameExprRaw;
    if (hasSurname && hasLastName) {
      surnameExprRaw = "COALESCE(u.surname,u.last_name)";
    } else if (hasSurname) {
      surnameExprRaw = "u.surname";
    } else if (hasLastName) {
      surnameExprRaw = "u.last_name";
    } else {
      surnameExprRaw = "''"; // neither exists; provide empty string
    }
    const surnameExprSelect = `${surnameExprRaw} AS surname`;
    const surnameExprOrder = surnameExprRaw; // for ORDER BY
    const surnameExprSearch = `LOWER(${surnameExprRaw})`;

    // National ID expression (fallback through possible legacy column names)
    const natCols = [];
    if (hasNat) natCols.push("u.national_id");
    if (hasIdNumber) natCols.push("u.id_number");
    if (hasIdNo) natCols.push("u.id_no");
    let natExprRaw;
    if (natCols.length === 0) natExprRaw = "''";
    else if (natCols.length === 1) natExprRaw = natCols[0];
    else natExprRaw = `COALESCE(${natCols.join(",")})`;
    const natExprSelect = `${natExprRaw} AS national_id`;
    const natExprSearch = `LOWER(${natExprRaw})`;

    const sortableMap = {
      first_name: "u.first_name",
      surname: surnameExprOrder,
      payroll_number: "u.payroll_number",
      email: "u.email",
      latest_declaration_status: "dLatest.status",
      latest_declaration_date: "dLatest.declaration_date",
      latest_submitted_at: "dLatest.submitted_at",
      national_id: natCols[0] || natExprRaw, // allow sorting by the first available nat id column
    };
    const orderExpr = sortableMap[sortBy] || "u.first_name";

    const params = [department];
    let whereExtra = "";
    if (search) {
      const term = "%" + search + "%";
      whereExtra += ` AND (LOWER(u.first_name) LIKE ? OR LOWER(u.other_names) LIKE ? OR ${surnameExprSearch} LIKE ? OR LOWER(u.email) LIKE ? OR u.payroll_number LIKE ? OR ${natExprSearch} LIKE ?)`;
      params.push(
        term,
        term,
        term,
        term,
        "%" + (req.query.search || "").trim() + "%",
        "%" + (req.query.search || "").trim() + "%"
      );
    }
    if (statusFilter) {
      if (statusFilter === "none") {
        whereExtra += " AND dLatest.id IS NULL";
      } else if (statusFilter === "pending") {
        whereExtra +=
          " AND dLatest.id IS NOT NULL AND (dLatest.status NOT IN ('approved','rejected') OR dLatest.status IS NULL)";
      } else if (["approved", "rejected"].includes(statusFilter)) {
        whereExtra += " AND dLatest.status = ?";
        params.push(statusFilter);
      }
    }

    // Base select shared fragments
    const baseSelect = `
      FROM users u
      LEFT JOIN (
        SELECT d.* FROM declarations d
        JOIN (
          SELECT user_id, MAX(id) AS max_id
          FROM declarations
          GROUP BY user_id
        ) t ON t.max_id = d.id
      ) dLatest ON dLatest.user_id = u.id
      WHERE u.department = ? ${whereExtra}
    `;

    // Count total
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total ${baseSelect}`,
      params
    );
    const totalUsers = countRows[0]?.total || 0;

    // Aggregated summary across all filtered users
    let summary = {
      totalUsers: totalUsers,
      withDeclaration: 0,
      withoutDeclaration: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
      byType: { first: 0, biennial: 0, final: 0, none: 0 },
    };
    if (totalUsers > 0) {
      const aggSql = `SELECT 
          COUNT(*) AS totalUsers,
          SUM(CASE WHEN dLatest.id IS NOT NULL THEN 1 ELSE 0 END) AS withDeclaration,
          SUM(CASE WHEN dLatest.id IS NULL THEN 1 ELSE 0 END) AS withoutDeclaration,
          SUM(CASE WHEN dLatest.status = 'approved' THEN 1 ELSE 0 END) AS approved,
          SUM(CASE WHEN dLatest.status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
          SUM(CASE WHEN dLatest.id IS NOT NULL AND dLatest.status NOT IN ('approved','rejected') THEN 1 ELSE 0 END) AS pending,
          SUM(CASE WHEN dLatest.declaration_type LIKE 'first%' THEN 1 ELSE 0 END) AS firstType,
          SUM(CASE WHEN dLatest.declaration_type LIKE 'bien%' THEN 1 ELSE 0 END) AS biennialType,
          SUM(CASE WHEN dLatest.declaration_type LIKE 'final%' THEN 1 ELSE 0 END) AS finalType,
          SUM(CASE WHEN dLatest.id IS NULL THEN 1 ELSE 0 END) AS noneType
        ${baseSelect}`;
      try {
        const [aggRows] = await pool.query(aggSql, params);
        if (aggRows.length) {
          const a = aggRows[0];
          summary = {
            totalUsers: a.totalUsers || 0,
            withDeclaration: a.withDeclaration || 0,
            withoutDeclaration: a.withoutDeclaration || 0,
            approved: a.approved || 0,
            pending: a.pending || 0,
            rejected: a.rejected || 0,
            byType: {
              first: a.firstType || 0,
              biennial: a.biennialType || 0,
              final: a.finalType || 0,
              none: a.noneType || 0,
            },
          };
        }
      } catch (err) {
        console.warn(
          "Aggregation failed (department users status):",
          err.message
        );
      }
    }

    // Paged rows
    let rows = [];
    const pageSql = `SELECT 
        u.id,
        u.payroll_number,
    ${natExprSelect},
        u.first_name,
        u.other_names,
        ${surnameExprSelect},
        u.email,
        u.department,
        dLatest.id AS latest_declaration_id,
        dLatest.declaration_type AS latest_declaration_type,
        dLatest.status AS latest_declaration_status,
        dLatest.declaration_date AS latest_declaration_date,
        dLatest.submitted_at AS latest_submitted_at
      ${baseSelect}
      ORDER BY ${orderExpr} ${sortDir}, u.id ASC
      LIMIT ? OFFSET ?`;
    const [pageRows] = await pool.query(pageSql, [...params, limit, offset]);
    rows = pageRows;

    return res.json({
      success: true,
      page,
      limit,
      total: totalUsers,
      totalPages: Math.ceil(totalUsers / limit),
      data: {
        users: rows,
        summary,
      },
    });
  } catch (error) {
    console.error("getDepartmentUserDeclarationStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching department user statuses",
    });
  }
};

// Super Admin global metrics endpoint
// GET /api/admin/super/metrics
// Returns organization-wide aggregates (counts by declaration status, type, departments coverage, missing data indicators)
exports.getSuperAdminMetrics = async (req, res) => {
  try {
    if (
      !req.admin ||
      (!["super", "super_admin"].includes(req.admin.role) &&
        req.admin.normalizedRole !== "super")
    ) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const metrics = {
      generatedAt: new Date().toISOString(),
      users: { total: 0, withoutDepartment: 0, withoutNationalId: 0 },
      declarations: {
        total: 0,
        byStatus: {},
        byType: {},
        usersWithDeclaration: 0,
      },
      departments: { totalDistinct: 0, coveragePercent: 0 },
    };
    const pool = require("../config/db");
    // Users base stats
    const [[uStats]] = await pool.query(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN (department IS NULL OR department='') THEN 1 ELSE 0 END) AS withoutDept, SUM(CASE WHEN (national_id IS NULL OR national_id='') THEN 1 ELSE 0 END) AS withoutNat FROM users`
    );
    metrics.users.total = uStats.total || 0;
    metrics.users.withoutDepartment = uStats.withoutDept || 0;
    metrics.users.withoutNationalId = uStats.withoutNat || 0;
    // Distinct departments and coverage
    const [deptRows] = await pool.query(
      `SELECT department, COUNT(*) AS c FROM users WHERE department IS NOT NULL AND department <> '' GROUP BY department`
    );
    metrics.departments.totalDistinct = deptRows.length;
    metrics.departments.coveragePercent = metrics.users.total
      ? Math.round(
          ((metrics.users.total - metrics.users.withoutDepartment) /
            metrics.users.total) *
            100
        )
      : 0;
    // Declarations aggregates
    const [[declTotals]] = await pool.query(
      `SELECT COUNT(*) AS total FROM declarations`
    );
    metrics.declarations.total = declTotals.total || 0;
    const [declStatus] = await pool.query(
      `SELECT status, COUNT(*) AS c FROM declarations GROUP BY status`
    );
    metrics.declarations.byStatus = declStatus.reduce((acc, r) => {
      acc[r.status || "unknown"] = r.c;
      return acc;
    }, {});
    const [declType] = await pool.query(
      `SELECT declaration_type, COUNT(*) AS c FROM declarations GROUP BY declaration_type`
    );
    metrics.declarations.byType = declType.reduce((acc, r) => {
      acc[r.declaration_type || "unknown"] = r.c;
      return acc;
    }, {});
    const [[withDecl]] = await pool.query(
      `SELECT COUNT(DISTINCT user_id) AS cnt FROM declarations`
    );
    metrics.declarations.usersWithDeclaration = withDecl.cnt || 0;
    return res.json({ success: true, data: metrics });
  } catch (error) {
    console.error("getSuperAdminMetrics error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error fetching metrics" });
  }
};

// GET /api/admin/password-change-audit?adminId=&from=&to=&page=&limit=
exports.getAdminPasswordChangeAudit = async (req, res) => {
  try {
    const { adminId, from, to, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    const conditions = [];
    const params = [];
    if (adminId) {
      conditions.push("a.admin_id = ?");
      params.push(adminId);
    }
    if (from) {
      conditions.push("a.created_at >= ?");
      params.push(from);
    }
    if (to) {
      conditions.push("a.created_at <= ?");
      params.push(to);
    }
    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM admin_password_change_audit a ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;
    const [rows] = await pool.query(
      `
      SELECT a.id, a.admin_id, au.username AS admin_username, a.changed_by_admin_id,
             au2.username AS changed_by_username, a.ip_address, a.user_agent, a.event_type, a.created_at
      FROM admin_password_change_audit a
      LEFT JOIN admin_users au ON a.admin_id = au.id
      LEFT JOIN admin_users au2 ON a.changed_by_admin_id = au2.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [...params, limitNum, offset]
    );
    res.json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: rows,
    });
  } catch (error) {
    console.error("Get admin password change audit error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching password change audit",
    });
  }
};

// @route POST /api/admin/users/:userId/clear-lockout  (super / it only)
exports.clearUserLockout = async (req, res) => {
  try {
    if (
      !req.admin ||
      !["super", "it", "super_admin", "it_admin"].includes(
        req.admin.normalizedRole
      )
    ) {
      return res.status(403).json({ message: "Access denied" });
    }
    const { userId } = req.params;
    const [rows] = await pool.query(
      "SELECT id, failed_login_attempts, lock_until FROM users WHERE id = ?",
      [userId]
    );
    if (!rows.length)
      return res.status(404).json({ message: "User not found" });
    await pool.query(
      "UPDATE users SET failed_login_attempts = 0, lock_until = NULL WHERE id = ?",
      [userId]
    );
    try {
      await pool.query(
        "INSERT INTO user_lockout_audit (user_id, event_type, reason, performed_by_admin_id, failed_attempts, ip_address, user_agent) VALUES (?,?,?,?,?,?,?)",
        [
          userId,
          "CLEAR",
          "admin_clear",
          req.admin.adminId,
          rows[0].failed_login_attempts,
          (req.ip || "").substring(0, 64),
          (req.headers["user-agent"] || "").substring(0, 255),
        ]
      );
    } catch (e) {
      console.error("Lockout audit clear insert failed", e.message);
    }
    return res.json({ success: true, message: "User lockout cleared." });
  } catch (error) {
    console.error("clearUserLockout error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// @route GET /api/admin/users/locked  (super / it only)
exports.listLockedUsers = async (req, res) => {
  try {
    if (
      !req.admin ||
      !["super", "it", "super_admin", "it_admin"].includes(
        req.admin.normalizedRole
      )
    ) {
      return res.status(403).json({ message: "Access denied" });
    }
    const limit = Math.min(parseInt(req.query.limit || "200", 10), 500);
    const { nationalId } = req.query;
    const params = [];
    let where = "lock_until IS NOT NULL AND lock_until > NOW()";
    if (nationalId) {
      where += " AND national_id = ?";
      params.push(nationalId);
    }
    const [rows] = await pool.query(
      `
      SELECT 
        id, national_id, first_name, surname, failed_login_attempts, lock_until,
        TIMESTAMPDIFF(MINUTE, NOW(), lock_until) AS minutes_remaining
      FROM users
      WHERE ${where}
      ORDER BY lock_until ASC
      LIMIT ?
    `,
      [...params, limit]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error("listLockedUsers error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// @route GET /api/admin/lockouts/audit (super / it only)
// query: page=1&pageSize=20&userId=123&eventType=LOCK|UNLOCK|CLEAR&from=ISO&to=ISO
exports.getUserLockoutAudit = async (req, res) => {
  try {
    if (
      !req.admin ||
      (!["super", "it", "super_admin", "it_admin"].includes(
        req.admin.normalizedRole
      ) &&
        !["super", "it", "super_admin", "it_admin"].includes(req.admin.role))
    ) {
      return res.status(403).json({ message: "Access denied" });
    }
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const pageSize = Math.min(
      Math.max(parseInt(req.query.pageSize || "20", 10), 1),
      100
    );
    const offset = (page - 1) * pageSize;
    const { userId, eventType, from, to, nationalId } = req.query;
    const where = [];
    const params = [];
    if (userId) {
      where.push("a.user_id = ?");
      params.push(userId);
    }
    if (nationalId) {
      where.push("u.national_id = ?");
      params.push(nationalId);
    }
    if (eventType && ["LOCK", "UNLOCK", "CLEAR"].includes(eventType)) {
      where.push("a.event_type = ?");
      params.push(eventType);
    }
    if (from) {
      where.push("a.created_at >= ?");
      params.push(new Date(from));
    }
    if (to) {
      where.push("a.created_at <= ?");
      params.push(new Date(to));
    }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
    const [rows] = await pool.query(
      `
      SELECT a.id, a.user_id, u.national_id, u.first_name, u.surname, a.event_type, a.reason, a.failed_attempts, a.lock_until, a.performed_by_admin_id,
             au.username AS performed_by_username, au.role AS performed_by_role, a.created_at
      FROM user_lockout_audit a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN admin_users au ON a.performed_by_admin_id = au.id
      ${whereSql}
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?
    `,
      [...params, pageSize, offset]
    );
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM user_lockout_audit a ${whereSql}`,
      params
    );
    return res.json({
      success: true,
      data: rows,
      page,
      pageSize,
      total: countRows[0].total,
    });
  } catch (error) {
    console.error("getUserLockoutAudit error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /api/admin/declarations/status-audit/global (filtered, paginated view over declaration_status_audit)
// (Renamed from deprecated /declarations/status-events)
exports.listGlobalDeclarationStatusAudit = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 500);
    const offset = (page - 1) * limit;
    const params = [];
    let where = "WHERE 1=1";
    if (
      req.query.status &&
      ["pending", "approved", "rejected"].includes(req.query.status)
    ) {
      where += " AND a.new_status = ?";
      params.push(req.query.status);
    }
    if (req.query.admin) {
      where += " AND LOWER(au.username) LIKE ?";
      params.push("%" + req.query.admin.toLowerCase() + "%");
    }
    if (req.query.national_id) {
      where += " AND a.national_id = ?";
      params.push(req.query.national_id);
    }
    if (req.query.from) {
      where += " AND a.changed_at >= ?";
      params.push(req.query.from);
    }
    if (req.query.to) {
      where += " AND a.changed_at <= ?";
      params.push(req.query.to);
    }
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM declaration_status_audit a LEFT JOIN admin_users au ON a.admin_id = au.id ${where}`,
      params
    );
    const total = countRows[0]?.cnt || 0;
    const [rows] = await pool.query(
      `SELECT a.id, a.declaration_id, a.user_full_name, a.national_id, a.previous_status, a.new_status AS status, a.previous_correction_message, a.new_correction_message, a.changed_at, a.admin_id, au.username AS admin_username
         FROM declaration_status_audit a
         LEFT JOIN admin_users au ON a.admin_id = au.id
        ${where}
        ORDER BY a.changed_at DESC, a.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return res.json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      data: rows,
    });
  } catch (err) {
    console.error("listGlobalDeclarationStatusAudit error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error fetching status events",
      error: err.message,
    });
  }
};

// ---- Admin session management (refresh & logout) ----
exports.adminRefresh = async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken)
      return res.status(400).json({ message: "refreshToken required" });
    const parts = refreshToken.split(".");
    if (parts.length !== 2)
      return res.status(400).json({ message: "Invalid format" });
    const adminId = parseInt(parts[0], 10);
    if (!adminId) return res.status(400).json({ message: "Invalid token" });
    const crypto = require("crypto");
    const hash = (r) => crypto.createHash("sha256").update(r).digest("hex");
    const [rows] = await pool.query(
      "SELECT refresh_token_hash, last_activity FROM admin_users WHERE id = ? AND is_active = TRUE",
      [adminId]
    );
    if (!rows.length)
      return res.status(401).json({ message: "Admin not found" });
    const row = rows[0];
    if (
      !row.refresh_token_hash ||
      row.refresh_token_hash !== hash(refreshToken)
    ) {
      return res
        .status(401)
        .json({ message: "Refresh token invalid or revoked" });
    }
    const limitMin = parseInt(
      process.env.ADMIN_INACTIVITY_TIMEOUT_MINUTES ||
        process.env.INACTIVITY_TIMEOUT_MINUTES ||
        "30",
      10
    );
    if (row.last_activity && limitMin > 0) {
      if (
        Date.now() - new Date(row.last_activity).getTime() >
        limitMin * 60000
      ) {
        await pool.query(
          "UPDATE admin_users SET refresh_token_hash = NULL WHERE id = ?",
          [adminId]
        );
        return res
          .status(401)
          .json({ message: "Session expired due to inactivity" });
      }
    }
    const rotate = /^true$/i.test(process.env.REFRESH_TOKEN_ROTATION || "true");
    const accessTtl = process.env.ADMIN_ACCESS_TOKEN_EXPIRES_IN || "30m";
    let newRefreshToken = refreshToken;
    if (rotate) {
      const raw = crypto.randomBytes(48).toString("hex");
      newRefreshToken = `${adminId}.${raw}`;
      await pool.query(
        "UPDATE admin_users SET refresh_token_hash = ?, last_activity = NOW() WHERE id = ?",
        [hash(newRefreshToken), adminId]
      );
    } else {
      await pool.query(
        "UPDATE admin_users SET last_activity = NOW() WHERE id = ?",
        [adminId]
      );
    }
    // Fetch department & sub_department for refreshed payload consistency
    try {
      const [infoRows] = await pool.query(
        "SELECT department, sub_department FROM admin_users WHERE id = ?",
        [adminId]
      );
      const info = infoRows[0] || {};
      const adminToken = jwt.sign(
        {
          adminId,
          isAdmin: true,
          department: info.department || null,
          sub_department: info.sub_department || null,
        },
        process.env.JWT_SECRET,
        { expiresIn: accessTtl }
      );
      return res.json({ adminToken, refreshToken: newRefreshToken, accessTtl });
    } catch (e2) {
      const adminToken = jwt.sign(
        { adminId, isAdmin: true },
        process.env.JWT_SECRET,
        { expiresIn: accessTtl }
      );
      return res.json({ adminToken, refreshToken: newRefreshToken, accessTtl });
    }
  } catch (e) {
    console.error("adminRefresh error:", e.message);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

exports.adminLogout = async (req, res) => {
  try {
    if (!req.admin || !req.admin.adminId) return res.json({ success: true });
    await pool.query(
      "UPDATE admin_users SET refresh_token_hash = NULL WHERE id = ?",
      [req.admin.adminId]
    );
    return res.json({ success: true });
  } catch (e) {
    console.error("adminLogout error:", e.message);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

// Elevate a logged-in normal user (user token) to an admin session if linked
// @route POST /api/admin/elevate-from-user
// @access User JWT (not admin)
exports.elevateFromUser = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User context missing" });
    }
    const AdminUser = require("../models/AdminUser");
    const admin = await AdminUser.findByUserId(req.user.id);
    if (!admin) {
      return res.status(403).json({ message: "Not an admin" });
    }
    if (admin.is_active === false) {
      return res.status(403).json({ message: "Admin account inactive" });
    }
    // Map role to short form consistent with existing adminLogin behavior
    let shortRole = admin.role;
    if (shortRole === "hr_admin") shortRole = "hr";
    else if (shortRole === "it_admin") shortRole = "it";
    // finance_admin removed
    else if (shortRole === "super_admin") shortRole = "super";

    const accessTtl = process.env.ADMIN_ACCESS_TOKEN_EXPIRES_IN || "30m";
    const crypto = require("crypto");
    const rawRefresh = crypto.randomBytes(48).toString("hex");
    const refreshToken = `${admin.id}.${rawRefresh}`;
    const refreshHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    const pool = require("../config/db");
    await pool.query(
      "UPDATE admin_users SET refresh_token_hash = ?, last_activity = NOW(), last_login = NOW() WHERE id = ?",
      [refreshHash, admin.id]
    );
    const jwt = require("jsonwebtoken");
    const adminToken = jwt.sign(
      {
        adminId: admin.id,
        username: admin.username,
        role: shortRole,
        department: admin.department || null,
        sub_department: admin.sub_department || null,
        isAdmin: true,
      },
      process.env.JWT_SECRET,
      { expiresIn: accessTtl }
    );
    // Provide a normalized admin object with short role so frontend routing logic is consistent
    const adminObj = { ...admin.toJSON(), role: shortRole };
    return res.json({
      message: "Elevation successful",
      adminToken,
      refreshToken,
      accessTtl,
      admin: adminObj,
    });
  } catch (error) {
    console.error("Admin elevation error:", error);
    return res.status(500).json({ message: "Server error elevating user" });
  }
};

// ---------------- CSV Export for Declarations (with Land size summary) ----------------
exports.exportDeclarationsCsv = async (req, res) => {
  try {
    // Optional filters: department, fromDate, toDate
    const { department, from, to } = req.query;
    const conditions = [];
    const params = [];
    if (department) {
      conditions.push("u.department = ?");
      params.push(department);
    }
    if (from) {
      conditions.push("d.declaration_date >= ?");
      params.push(from);
    }
    if (to) {
      conditions.push("d.declaration_date <= ?");
      params.push(to);
    }
    const whereClause = conditions.length
      ? "WHERE " + conditions.join(" AND ")
      : "";

    // Respect admin department scoping (HR-only limited to their department)
    if (
      req.admin &&
      (req.admin.normalizedRole === "hr" || req.admin.role === "hr_admin")
    ) {
      // If they supplied a different department filter, override to enforce their own
      if (!req.admin.department) {
        return res.status(403).json({
          success: false,
          message: "Admin has no department assigned; cannot export.",
        });
      }
      const enforced = "u.department = ?";
      if (!conditions.includes(enforced)) {
        conditions.push(enforced);
        params.push(req.admin.department);
      }
    }

    const fullWhere = conditions.length
      ? "WHERE " + conditions.join(" AND ")
      : "";
    const [rows] = await pool.query(
      `
      SELECT d.id, d.user_id, d.declaration_date, d.submitted_at, d.assets, d.other_financial_info,
             u.first_name, u.other_names, u.surname, u.department
      FROM declarations d
      JOIN users u ON d.user_id = u.id
      ${fullWhere}
      ORDER BY d.submitted_at DESC, d.id DESC
      LIMIT 5000
    `,
      params
    );

    const parseArr = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      if (typeof val === "string") {
        try {
          const j = JSON.parse(val);
          return Array.isArray(j) ? j : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    const lines = [];
    lines.push(
      [
        "Declaration ID",
        "User Name",
        "Department",
        "Submitted",
        "Asset Count",
        "Land Count",
        "Land Sizes",
        "Total Asset Value",
        "Nil Income",
        "Nil Assets",
        "Nil Liabilities",
        "Other Info Truncated",
      ].join(",")
    );
    rows.forEach((r) => {
      const assets = parseArr(r.assets);
      let assetCount = assets.length;
      let landCount = 0;
      let landSizes = [];
      let totalValue = 0;
      assets.forEach((a) => {
        const valueNum = Number(a.value);
        if (!isNaN(valueNum)) totalValue += valueNum;
        if ((a.type || "").toLowerCase().includes("land")) {
          landCount += 1;
          if (a.size)
            landSizes.push(`${a.size}${a.size_unit ? " " + a.size_unit : ""}`);
        }
      });
      // Parse income & liabilities to detect Nil
      const incomes = parseArr(r.biennial_income);
      const liabilities = parseArr(r.liabilities);
      const isNilIncome =
        incomes.length === 1 &&
        incomes[0].type === "Nil" &&
        incomes[0].description === "Nil";
      const isNilAssets =
        assets.length === 1 &&
        assets[0].type === "Nil" &&
        assets[0].description === "Nil";
      const isNilLiabilities =
        liabilities.length === 1 &&
        liabilities[0].type === "Nil" &&
        liabilities[0].description === "Nil";
      const name = [r.first_name, r.other_names, r.surname]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      const landSizesStr = landSizes.join("; ");
      const truncatedInfo = (r.other_financial_info || "")
        .replace(/\r?\n/g, " ")
        .slice(0, 120)
        .replace(/,/g, ";");
      const csvRow = [
        r.id,
        '"' + name.replace(/"/g, '""') + '"',
        '"' + (r.department || "").replace(/"/g, '""') + '"',
        r.submitted_at ? new Date(r.submitted_at).toISOString() : "",
        assetCount,
        landCount,
        '"' + landSizesStr.replace(/"/g, '""') + '"',
        totalValue,
        isNilIncome ? "Yes" : "No",
        isNilAssets ? "Yes" : "No",
        isNilLiabilities ? "Yes" : "No",
        '"' + truncatedInfo.replace(/"/g, '""') + '"',
      ].join(",");
      lines.push(csvRow);
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="declarations_export.csv"'
    );
    return res.send(lines.join("\n"));
  } catch (error) {
    console.error("Export declarations CSV error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error exporting declarations CSV",
    });
  }
};

// Lightweight lookup for a single user by nationalId (used for admin creation auto-populate)
// GET /api/admin/users/lookup?nationalId=XXXX
exports.lookupUserByNationalId = async (req, res) => {
  try {
    const { nationalId } = req.query;
    if (!nationalId || String(nationalId).trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "nationalId query parameter required (min length 3)",
      });
    }
    // Department scoping: non-super admins only allowed to see users in their department
    const params = [nationalId.trim()];
    let where = "WHERE national_id = ?";
    // HR-only scoping
    if (
      req.admin &&
      req.admin.department &&
      (req.admin.normalizedRole === "hr" || req.admin.role === "hr_admin")
    ) {
      where += " AND department = ?";
      params.push(req.admin.department);
    }
    const [rows] = await pool.query(
      `SELECT id, first_name, other_names, surname, department, sub_department, national_id FROM users ${where} LIMIT 1`,
      params
    );
    if (!rows.length) {
      return res.json({ success: true, user: null });
    }
    return res.json({ success: true, user: rows[0] });
  } catch (error) {
    console.error("lookupUserByNationalId error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error during lookup" });
  }
};

// POST /api/admin/bulk-sms and /api/it-admin/bulk-sms
// Body: { message: string, userIds?: number[], departments?: string[], status?: 'pending'|'approved'|'rejected', includeNoDeclaration?: boolean, dryRun?: boolean, maxChunkSize?: number }
// Behavior: Scope to admin department unless super. Select users with valid phone_number. Optional filters by department/status/userIds.
// Returns: { success, dryRun, totalRecipients, chunks, sent } and errors per chunk when applicable.
exports.sendBulkSMS = async (req, res) => {
  try {
    const {
      message,
      userIds = [],
      departments = [],
      status = null,
      includeNoDeclaration = false,
      dryRun = false,
      maxChunkSize = 150,
    } = req.body || {};

    // Role check: allow super, it_admin, hr_admin (finance removed). Department scoping applies only to HR.
    const role =
      (req.admin && (req.admin.normalizedRole || req.admin.role)) || "";
    const allowed = new Set([
      "super",
      "super_admin",
      "it",
      "it_admin",
      "hr",
      "hr_admin",
    ]);
    if (!allowed.has(role)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient role to send bulk SMS",
      });
    }

    // Validate message
    const msg = (message || "").toString().trim();
    if (!msg)
      return res.status(400).json({
        success: false,
        code: "EMPTY_MESSAGE",
        message: "Message is required",
      });
    if (msg.length > 480)
      return res.status(400).json({
        success: false,
        code: "MESSAGE_TOO_LONG",
        message: "Message too long (max 480 chars)",
      });

    // Build base query: users with phone_number, optionally scoped by admin department
    const params = [];
    const where = [];
    where.push('u.phone_number IS NOT NULL AND TRIM(u.phone_number) <> ""');
    // Department scoping for HR only
    if (
      req.admin &&
      req.admin.department &&
      ["hr", "hr_admin"].includes(role)
    ) {
      where.push("u.department = ?");
      params.push(req.admin.department);
    }
    // Departments filter if provided (for super/department-specific send)
    if (Array.isArray(departments) && departments.length) {
      where.push(`u.department IN (${departments.map(() => "?").join(",")})`);
      params.push(...departments);
    }
    // Status filter: join latest declaration per user
    let joinDecl = "";
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      joinDecl = `JOIN (
        SELECT d1.user_id, d1.status
        FROM declarations d1
        JOIN (
          SELECT user_id, MAX(id) AS max_id
          FROM declarations
          GROUP BY user_id
        ) m ON d1.user_id = m.user_id AND d1.id = m.max_id
      ) ld ON ld.user_id = u.id`;
      where.push("ld.status = ?");
      params.push(status);
    } else if (!includeNoDeclaration) {
      // Default: only users with at least one declaration if no explicit includeNoDeclaration
      joinDecl = "JOIN declarations d ON d.user_id = u.id";
    }
    // Explicit userIds override/augment selection
    if (Array.isArray(userIds) && userIds.length) {
      where.push(`u.id IN (${userIds.map(() => "?").join(",")})`);
      params.push(...userIds);
    }

    const sql = `SELECT DISTINCT u.id, u.phone_number, u.first_name, u.surname, u.department
                   FROM users u
                   ${joinDecl}
                  ${where.length ? "WHERE " + where.join(" AND ") : ""}`;
    const [rows] = await pool.query(sql, params);

    // Filter and normalize phones
    const recipients = [];
    for (const r of rows) {
      const p = normalizePhone(r.phone_number);
      if (isValidPhone(p)) recipients.push(p);
    }

    // Deduplicate
    const unique = Array.from(new Set(recipients));

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        totalRecipients: unique.length,
        sample: unique.slice(0, 10),
      });
    }

    // Chunk sending to avoid extremely long msisdn query param payloads at provider level
    const chunkSize = Math.max(1, Math.min(parseInt(maxChunkSize) || 150, 500));
    const chunks = [];
    for (let i = 0; i < unique.length; i += chunkSize) {
      chunks.push(unique.slice(i, i + chunkSize));
    }

    const results = [];
    for (const chunk of chunks) {
      try {
        const result = await sendSMSUtil({ to: chunk, body: msg, type: "sms" });
        results.push({ ok: true, count: chunk.length, result });
      } catch (err) {
        results.push({
          ok: false,
          count: chunk.length,
          error: err.message || String(err),
        });
      }
    }

    const sent = results
      .filter((r) => r.ok)
      .reduce((sum, r) => sum + r.count, 0);
    // Audit log insert (best effort, non-blocking on failure)
    try {
      const crypto = require("crypto");
      const sha = crypto.createHash("sha256").update(msg, "utf8").digest("hex");
      const apiPath =
        req.originalUrl || req.baseUrl + req.path || "/api/admin/bulk-sms";
      const failedChunks = results.filter((r) => !r.ok).length;
      await pool.query(
        `INSERT INTO bulk_sms_audit
          (initiated_by_admin_id, admin_username, admin_role, api_path, ip_address, departments_json, status_filter,
           include_no_declaration, user_ids_count, message_length, message_sha256, total_recipients, sent_ok, chunks, failed_chunks)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          (req.admin && req.admin.adminId) || null,
          (req.admin && req.admin.username) || null,
          (req.admin && (req.admin.normalizedRole || req.admin.role)) || null,
          apiPath,
          req.ip || req.headers["x-forwarded-for"] || null,
          JSON.stringify(Array.isArray(departments) ? departments : []),
          status || null,
          includeNoDeclaration ? 1 : 0,
          Array.isArray(userIds) ? userIds.length : 0,
          msg.length,
          sha,
          unique.length,
          sent,
          results.length,
          failedChunks,
        ]
      );
    } catch (auditErr) {
      console.warn("bulk_sms_audit insert failed:", auditErr.message);
    }

    return res.json({
      success: true,
      dryRun: false,
      totalRecipients: unique.length,
      chunks: results.length,
      sent,
      results,
    });
  } catch (error) {
    console.error("sendBulkSMS error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error sending bulk SMS",
      error: error.message,
    });
  }
};

// GET /api/admin/bulk-sms/audit or /api/it-admin/bulk-sms/audit
// Query: page, limit, adminUsername, role, from, to
exports.listBulkSmsAudit = async (req, res) => {
  try {
    const role =
      (req.admin && (req.admin.normalizedRole || req.admin.role)) || "";
    const allowed = new Set(["super", "super_admin", "it", "it_admin"]);
    if (!allowed.has(role)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient role to view bulk SMS audit.",
      });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 200);
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    if (req.query.adminUsername) {
      conditions.push("LOWER(admin_username) LIKE ?");
      params.push("%" + String(req.query.adminUsername).toLowerCase() + "%");
    }
    if (req.query.role) {
      conditions.push("(admin_role = ? OR admin_role = ?)");
      params.push(req.query.role, req.query.role.toLowerCase());
    }
    if (req.query.from) {
      conditions.push("created_at >= ?");
      params.push(req.query.from + " 00:00:00");
    }
    if (req.query.to) {
      conditions.push("created_at <= ?");
      params.push(req.query.to + " 23:59:59");
    }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM bulk_sms_audit ${where}`,
      params
    );
    const total = countRows[0]?.total || 0;
    const [rows] = await pool.query(
      `SELECT id, initiated_by_admin_id, admin_username, admin_role, api_path, ip_address,
              JSON_EXTRACT(departments_json, '$') AS departments_json,
              status_filter, include_no_declaration, user_ids_count, message_length,
              total_recipients, sent_ok, chunks, failed_chunks, created_at
         FROM bulk_sms_audit
         ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    // MySQL returns JSON as strings; normalize departments_json to array when possible
    const data = rows.map((r) => ({
      ...r,
      departments: (() => {
        try {
          return JSON.parse(r.departments_json || "[]");
        } catch {
          return [];
        }
      })(),
      departments_json: undefined,
    }));
    return res.json({
      success: true,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      data,
    });
  } catch (err) {
    console.error("listBulkSmsAudit error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error listing bulk SMS audit",
      error: err.message,
    });
  }
};
