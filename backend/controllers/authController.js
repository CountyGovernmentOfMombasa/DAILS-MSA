const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const User = require("../models/userModel");
const { validationResult } = require("express-validator");
const crypto = require("crypto");

// Helper to parse times like '30m', '7d'
function parseDuration(str, fallbackMs) {
  if (!str || typeof str !== "string") return fallbackMs;
  const m = str.match(/^(\d+)([smhd])$/i);
  if (!m) return fallbackMs;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const mult =
    unit === "s"
      ? 1000
      : unit === "m"
      ? 60000
      : unit === "h"
      ? 3600000
      : unit === "d"
      ? 86400000
      : 1;
  return n * mult;
}
const ACCESS_TTL_MS = parseDuration(
  process.env.ACCESS_TOKEN_EXPIRES_IN || "30m",
  30 * 60000
);
const REFRESH_TTL_MS = parseDuration(
  process.env.REFRESH_TOKEN_EXPIRES_IN || "14d",
  14 * 86400000
);
const INACTIVITY_LIMIT_MS =
  parseInt(process.env.INACTIVITY_TIMEOUT_MINUTES || "30", 10) * 60000; // server-side guard

function signAccess(payload, overrides = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "30m",
    ...overrides,
  });
}
function signLegacyLong(payload) {
  // existing 7d tokens still supported for transitional period
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}
function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function issueTokenPair(userId, extraClaims = {}) {
  const base = { id: userId, ...extraClaims };
  const accessToken = signAccess(base);
  const refreshRaw = crypto.randomBytes(48).toString("hex");
  const refreshToken = `${userId}.${refreshRaw}`;
  const refreshHash = hashToken(refreshToken);
  await pool.query(
    "UPDATE users SET refresh_token_hash = ?, last_activity = NOW() WHERE id = ?",
    [refreshHash, userId]
  );
  return {
    accessToken,
    refreshToken,
    accessExpiresInMs: ACCESS_TTL_MS,
    refreshExpiresInMs: REFRESH_TTL_MS,
  };
}

async function revokeRefresh(userId) {
  await pool.query("UPDATE users SET refresh_token_hash = NULL WHERE id = ?", [
    userId,
  ]);
}

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Destructure all possible fields
  const {
    national_id,
    payroll_number = null,
    birthdate,
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
  } = req.body;

  try {
    // Check if user exists
    const exists = await User.existsByNationalIdOrEmail(national_id, email);
    if (exists) {
      return res.status(400).json({
        message: "User already exists with this National ID or email",
      });
    }

    // Standardized initial password (first-time login) regardless of birthdate
    const DEFAULT_INITIAL_PASSWORD =
      process.env.DEFAULT_INITIAL_PASSWORD || "Change@001";
    const hashedPassword = await bcrypt.hash(DEFAULT_INITIAL_PASSWORD, 10);
    const validNatureOfEmployment = nature_of_employment || "";

    // Create user
    if (!sub_department && department) {
      // Prevent ambiguous registration without sub_department
      return res
        .status(400)
        .json({
          message: "sub_department is required when department is provided",
        });
    }
    const userId = await User.create({
      national_id,
      payroll_number,
      birthdate,
      password: hashedPassword,
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
      nature_of_employment: validNatureOfEmployment,
    });

    // Send notification email
    const sendEmail = require("../util/sendEmail");
    const registrationHtml = `<!DOCTYPE html><html><body style=\"font-family: Arial, sans-serif; background: #f7f7f7; padding: 20px;\"><div style=\"max-width: 500px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px #eee; padding: 24px;\"><h2 style=\"color: #2a7ae2;\">Welcome to WDP!</h2><p>Dear <strong>${first_name} ${surname} ${
      other_names || ""
    }</strong>,</p><p>Your registration was successful. You can now securely submit your financial declarations and manage your profile online.</p><p style=\"margin-top: 24px;\">Best regards,<br><strong>WDP Team</strong></p><hr><small style=\"color: #888;\">This is an automated message. Please do not reply.</small></div></body></html>`;
    await sendEmail({
      to: email,
      subject: "Welcome to CGM Wealth Declaration Portal",
      text: `Hello ${first_name} ${surname} ${
        other_names || ""
      },\nYour registration was successful!`,
      html: registrationHtml,
    });

    // Generate JWT
    const { accessToken, refreshToken, accessExpiresInMs } =
      await issueTokenPair(userId);

    res.status(201).json({
      success: true,
      token: accessToken,
      refreshToken,
      accessExpiresInMs,
      user: {
        id: userId,
        national_id,
        payroll_number,
        first_name,
        surname,
        other_names,
        email,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      message: "Server error during registration",
      error: error.message,
    });
  }
};

// Helper function to convert DD/MM/YYYY to YYYY-MM-DD
const convertDateFormat = (ddmmyyyy) => {
  if (!ddmmyyyy) return null;
  const [day, month, year] = ddmmyyyy.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

const sendSMS = require("../util/sendSMS");

// Centralized OTP utility
const { createOtp } = require("../util/otp");

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
// Update the database query to format the date as string
exports.login = async (req, res) => {
  try {
    const { nationalId, password, phoneNumber } = req.body;

    // Find user by national ID
    const [users] = await pool.query(
      `SELECT id, national_id, payroll_number, first_name, other_names, surname, email, password,
              password_changed, phone_number, failed_login_attempts, lock_until,
              otp_request_count, otp_request_window_start
         FROM users WHERE national_id = ?`,
      [nationalId]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = users[0];

    // Check lockout
    if (user.lock_until && new Date(user.lock_until) > new Date()) {
      const remainingMs = new Date(user.lock_until) - new Date();
      const remainingMin = Math.ceil(remainingMs / 60000);
      return res
        .status(423)
        .json({
          message: `Account locked. Try again in ${remainingMin} minute(s).`,
        });
    } else if (user.lock_until && new Date(user.lock_until) <= new Date()) {
      // Auto clear expired lock
      await pool.query(
        "UPDATE users SET failed_login_attempts = 0, lock_until = NULL WHERE id = ?",
        [user.id]
      );
      try {
        await pool.query(
          "INSERT INTO user_lockout_audit (user_id, event_type, reason, failed_attempts, ip_address, user_agent) VALUES (?,?,?,?,?,?)",
          [
            user.id,
            "UNLOCK",
            "auto_expire",
            user.failed_login_attempts,
            (req.ip || "").substring(0, 64),
            (req.headers["user-agent"] || "").substring(0, 255),
          ]
        );
      } catch (e) {
        console.error("Lockout audit unlock insert failed", e.message);
      }
      user.failed_login_attempts = 0;
      user.lock_until = null;
    }

    const { isValidPhone, normalizePhone } = require("../util/phone");
    if (!user.phone_number) {
      if (!phoneNumber) {
        return res
          .status(400)
          .json({
            success: false,
            requirePhone: true,
            code: "PHONE_REQUIRED",
            field: "phone_number",
            message: "Phone number required",
          });
      }
      if (!isValidPhone(phoneNumber)) {
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_PHONE_FORMAT",
            field: "phone_number",
            message:
              "Invalid phone number format. Use 7-15 digits, optional leading +",
          });
      }
      const normalized = normalizePhone(phoneNumber);
      const [dupRows] = await pool.query(
        "SELECT id FROM users WHERE phone_number = ?",
        [normalized]
      );
      if (dupRows.length) {
        return res
          .status(409)
          .json({
            success: false,
            code: "PHONE_IN_USE",
            field: "phone_number",
            message:
              "Phone number already in use. Please supply a different number.",
          });
      }
      try {
        await pool.query(
          "UPDATE users SET phone_number = ?, phone_last_changed_at = NOW(), phone_change_count = COALESCE(phone_change_count,0) + 1 WHERE id = ?",
          [normalized, user.id]
        );
        user.phone_number = normalized;
        try {
          await pool.query(
            "INSERT INTO user_phone_change_audit (user_id, old_phone, new_phone, via, ip_address, user_agent) VALUES (?,?,?,?,?,?)",
            [
              user.id,
              null,
              normalized,
              "login_capture",
              (req.ip || "").substring(0, 64),
              (req.headers["user-agent"] || "").substring(0, 255),
            ]
          );
        } catch (auditErr) {
          console.error(
            "Phone audit insert (login capture) failed:",
            auditErr.message
          );
        }
      } catch (e) {
        if (e && e.code === "ER_DUP_ENTRY") {
          return res
            .status(409)
            .json({
              success: false,
              code: "PHONE_IN_USE",
              field: "phone_number",
              message:
                "Phone number already in use. Please supply a different number.",
            });
        }
        throw e;
      }
    }

    // If password hasn't been changed, trigger OTP to phone and require OTP verification
    if (!user.password_changed) {
      // Require default password for first step
      if (password !== "Change@001") {
        // Increment failed attempts for wrong default password
        await pool.query(
          "UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?",
          [user.id]
        );
        const [[fa]] = await pool.query(
          "SELECT failed_login_attempts FROM users WHERE id = ?",
          [user.id]
        );
        if (fa.failed_login_attempts >= 5) {
          const lockUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
          await pool.query("UPDATE users SET lock_until = ? WHERE id = ?", [
            lockUntil,
            user.id,
          ]);
          try {
            await pool.query(
              "INSERT INTO user_lockout_audit (user_id, event_type, reason, failed_attempts, lock_until, ip_address, user_agent) VALUES (?,?,?,?,?,?,?)",
              [
                user.id,
                "LOCK",
                "first_time_default_fail",
                fa.failed_login_attempts,
                lockUntil,
                (req.ip || "").substring(0, 64),
                (req.headers["user-agent"] || "").substring(0, 255),
              ]
            );
          } catch (e) {
            console.error("Lockout audit insert failed", e.message);
          }
          return res
            .status(423)
            .json({
              message: "Too many failed attempts. Account locked for 1 hour.",
            });
        }
        return res.status(401).json({
          message: "First-time login requires the default password Change@001",
          code: "FIRST_TIME_DEFAULT_PASSWORD_REQUIRED",
        });
      }
      // Generate and store OTP
      const { code, expires } = createOtp();

      // Rate limit OTP requests (first-time login): max 3 per rolling 1 hour window
      let resetWindow = false;
      if (
        !user.otp_request_window_start ||
        new Date() - new Date(user.otp_request_window_start) > 60 * 60 * 1000
      ) {
        resetWindow = true;
      }
      if (resetWindow) {
        await pool.query(
          "UPDATE users SET otp_request_count = 1, otp_request_window_start = NOW() WHERE id = ?",
          [user.id]
        );
      } else {
        if (user.otp_request_count >= 3) {
          return res
            .status(429)
            .json({ message: "OTP request limit reached. Try again later." });
        }
        await pool.query(
          "UPDATE users SET otp_request_count = otp_request_count + 1 WHERE id = ?",
          [user.id]
        );
      }
      await pool.query(
        "UPDATE users SET otp_code = ?, otp_expires_at = ? WHERE id = ?",
        [code, expires, user.id]
      );
      // Send OTP via SMS
      try {
        await sendSMS({
          to: user.phone_number,
          body: `Your WDP one-time code is ${code}. It expires in 10 minutes.`,
          type: "otp",
        });
      } catch (e) {
        console.error("Failed to send OTP SMS:", e.message);
      }
      // Short-lived token to allow OTP verification
      const otpToken = jwt.sign(
        { id: user.id, otp: true },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
      );
      return res.json({
        otpRequired: true,
        token: otpToken,
        message: "Enter the OTP sent to your phone to continue",
      });
    }

    // If password has been changed, check hashed password
    const bcrypt = require("bcryptjs");
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      await pool.query(
        "UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?",
        [user.id]
      );
      const [[fa2]] = await pool.query(
        "SELECT failed_login_attempts FROM users WHERE id = ?",
        [user.id]
      );
      if (fa2.failed_login_attempts >= 5) {
        const lockUntil = new Date(Date.now() + 60 * 60 * 1000);
        await pool.query("UPDATE users SET lock_until = ? WHERE id = ?", [
          lockUntil,
          user.id,
        ]);
        try {
          await pool.query(
            "INSERT INTO user_lockout_audit (user_id, event_type, reason, failed_attempts, lock_until, ip_address, user_agent) VALUES (?,?,?,?,?,?,?)",
            [
              user.id,
              "LOCK",
              "password_mismatch",
              fa2.failed_login_attempts,
              lockUntil,
              (req.ip || "").substring(0, 64),
              (req.headers["user-agent"] || "").substring(0, 255),
            ]
          );
        } catch (e) {
          console.error("Lockout audit insert failed", e.message);
        }
        return res
          .status(423)
          .json({
            message: "Too many failed attempts. Account locked for 1 hour.",
          });
      }
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Successful login: clear failed attempts & lock
    if (user.failed_login_attempts > 0 || user.lock_until) {
      await pool.query(
        "UPDATE users SET failed_login_attempts = 0, lock_until = NULL WHERE id = ?",
        [user.id]
      );
      try {
        await pool.query(
          "INSERT INTO user_lockout_audit (user_id, event_type, reason, failed_attempts, ip_address, user_agent) VALUES (?,?,?,?,?,?)",
          [
            user.id,
            "UNLOCK",
            "successful_login",
            user.failed_login_attempts,
            (req.ip || "").substring(0, 64),
            (req.headers["user-agent"] || "").substring(0, 255),
          ]
        );
      } catch (e) {
        console.error("Lockout audit success unlock insert failed", e.message);
      }
    }

    const { accessToken, refreshToken, accessExpiresInMs } =
      await issueTokenPair(user.id);
    // Seamless admin presence check (if linked)
    let hasAdminAccess = false;
    let adminRole = null;
    try {
      const AdminUser = require("../models/AdminUser");
      const admin = await AdminUser.findByUserId(user.id);
      if (admin) {
        hasAdminAccess = true;
        adminRole = admin.role; // keep raw (e.g. hr_admin) – frontend can map
      }
    } catch (e) {
      console.warn("Admin link check failed (non-fatal):", e.message);
    }

    res.json({
      success: true,
      token: accessToken,
      refreshToken,
      accessExpiresInMs,
      hasAdminAccess,
      adminRole,
      user: {
        id: user.id,
        national_id: user.national_id,
        payroll_number: user.payroll_number,
        phone_number: user.phone_number,
        first_name: user.first_name,
        other_names: user.other_names,
        surname: user.surname,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Server error during login",
      error: error.message,
    });
  }
};

// @desc    Resend OTP for first-time login
// @route   POST /api/auth/resend-otp
// @access  Public (needs nationalId and default password)
exports.resendOtp = async (req, res) => {
  try {
    const { nationalId, password } = req.body;
    if (!nationalId || !password) {
      return res
        .status(400)
        .json({ message: "nationalId and password are required" });
    }
    const [users] = await pool.query(
      "SELECT id, phone_number, password_changed, otp_request_count, otp_request_window_start FROM users WHERE national_id = ?",
      [nationalId]
    );
    if (!users.length)
      return res.status(404).json({ message: "User not found" });
    const user = users[0];
    if (user.password_changed) {
      return res
        .status(400)
        .json({ message: "OTP not required. Please login normally." });
    }
    if (password !== "Change@001") {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    // Rate limit resend OTP (first-time login) - share same counters
    let resetWindow = false;
    if (
      !user.otp_request_window_start ||
      new Date() - new Date(user.otp_request_window_start) > 60 * 60 * 1000
    ) {
      resetWindow = true;
    }
    if (resetWindow) {
      await pool.query(
        "UPDATE users SET otp_request_count = 1, otp_request_window_start = NOW() WHERE id = ?",
        [user.id]
      );
    } else {
      if (user.otp_request_count >= 3) {
        return res
          .status(429)
          .json({ message: "OTP request limit reached. Try again later." });
      }
      await pool.query(
        "UPDATE users SET otp_request_count = otp_request_count + 1 WHERE id = ?",
        [user.id]
      );
    }
    const { code, expires } = createOtp();
    await pool.query(
      "UPDATE users SET otp_code = ?, otp_expires_at = ? WHERE id = ?",
      [code, expires, user.id]
    );
    try {
      await sendSMS({
        to: user.phone_number,
        body: `Your WDP one-time code is ${code}. It expires in 10 minutes.`,
      });
    } catch (e) {
      console.error("Failed to send OTP SMS:", e.message);
    }
    return res.json({ success: true, message: "OTP resent" });
  } catch (error) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Verify OTP and require immediate password change
// @route   POST /api/auth/verify-otp
// @access  Private (token from login with otp: true)
exports.verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: "OTP is required" });
    const userId = req.user.id;
    const [rows] = await pool.query(
      "SELECT otp_code, otp_expires_at FROM users WHERE id = ?",
      [userId]
    );
    if (!rows.length)
      return res.status(404).json({ message: "User not found" });
    const { otp_code, otp_expires_at } = rows[0];
    if (!otp_code || !otp_expires_at)
      return res
        .status(400)
        .json({ message: "No OTP generated. Please login again." });
    const now = new Date();
    const expiry = new Date(otp_expires_at);
    if (now > expiry)
      return res
        .status(400)
        .json({ message: "OTP expired. Please request a new one." });
    if (String(otp) !== String(otp_code))
      return res.status(400).json({ message: "Invalid OTP" });
    // Clear OTP and create short-lived change-password token
    await pool.query(
      "UPDATE users SET otp_code = NULL, otp_expires_at = NULL WHERE id = ?",
      [userId]
    );
    const changePasswordToken = jwt.sign(
      { id: userId, changePassword: true },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
    return res.json({
      changePasswordRequired: true,
      token: changePasswordToken,
      message: "OTP verified. Please set a new password.",
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Change password (for first-time users)
// @route   PUT /api/auth/change-password
// @access  Private (with change password token)
exports.changePassword = async (req, res) => {
  const { newPassword } = req.body || {};
  const userId = req.user && req.user.id;
  try {
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!newPassword || typeof newPassword !== "string") {
      return res.status(400).json({ message: "New password is required" });
    }
    // Enforce endpoint only for first-time change (token had changePassword claim).
    // Hydration in verifyToken moves original JWT claims under req.user.token_claims.
    const hasChangeClaim = !!(
      req.user.changePassword ||
      (req.user.token_claims && req.user.token_claims.changePassword)
    );
    if (!hasChangeClaim) {
      return res.status(403).json({ message: "Invalid change password token" });
    }
    // Password policy
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
    // Current password hash
    const [users] = await pool.query(
      "SELECT password FROM users WHERE id = ?",
      [userId]
    );
    if (!users.length)
      return res.status(404).json({ message: "User not found" });
    const bcrypt = require("bcryptjs");
    // Prevent reuse of immediate previous password
    const isSame = await bcrypt.compare(newPassword, users[0].password);
    if (isSame)
      return res
        .status(400)
        .json({ message: "You cannot reuse your previous password." });
    // Prevent reuse of recent history
    const HISTORY_LIMIT = 5;
    const [uph] = await pool.query(
      "SELECT password_hash FROM user_password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
      [userId, HISTORY_LIMIT]
    );
    for (const row of uph) {
      const matchPrev = await bcrypt.compare(newPassword, row.password_hash);
      if (matchPrev)
        return res
          .status(400)
          .json({ message: "You cannot reuse a recent password." });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password = ?, password_changed = password_changed + 1 WHERE id = ?",
      [hashedPassword, userId]
    );
    // Maintain history
    try {
      await pool.query(
        "INSERT INTO user_password_history (user_id, password_hash) VALUES (?, ?)",
        [userId, users[0].password]
      );
      await pool.query(
        "DELETE FROM user_password_history WHERE user_id = ? AND id NOT IN (SELECT id FROM (SELECT id FROM user_password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?) t)",
        [userId, userId, HISTORY_LIMIT]
      );
    } catch (e) {
      console.error("User password history maintenance failed:", e.message);
    }
    // Audit
    try {
      await pool.query(
        "INSERT INTO user_password_change_audit (user_id, method, ip_address, user_agent) VALUES (?,?,?,?)",
        [
          userId,
          "first_change",
          (req.ip || "").substring(0, 64),
          (req.headers["user-agent"] || "").substring(0, 255),
        ]
      );
    } catch (e) {
      console.error("User first change audit insert failed:", e.message);
    }
    // Issue normal session tokens
    const { accessToken, refreshToken, accessExpiresInMs } =
      await issueTokenPair(userId);
    return res.json({
      success: true,
      token: accessToken,
      refreshToken,
      accessExpiresInMs,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({
      message: "Server error during password change",
      error: error.message,
    });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT 
        id, 
        payroll_number, 
        first_name, 
        other_names,
        surname,  
        email, 
        national_id,
        phone_number,
        NULLIF(DATE_FORMAT(birthdate, '%Y-%m-%d'), '0000-00-00') as birthdate,
        place_of_birth,
        marital_status,
        postal_address,
        physical_address,
        designation,
        department,
        sub_department,
        nature_of_employment
       FROM users 
       WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }
    res.json(users[0]);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      message: "Server error while fetching profile",
      error: error.message,
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/me
// @access  Private
exports.updateMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { getDepartmentConfig } = require("../util/departmentsCache");
    const { departments: DEPARTMENTS, subDepartmentMap: SUB_DEPARTMENT_MAP } =
      await getDepartmentConfig();
    const fields = [
      "surname",
      "first_name",
      "other_names",
      "birthdate",
      "place_of_birth",
      "marital_status",
      "postal_address",
      "physical_address",
      "email",
      "payroll_number",
      "designation",
      "department",
      "sub_department",
      "nature_of_employment",
      "phone_number",
    ];
    const updates = [];
    const values = [];
    let incomingPhone = undefined;
    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (field === "nature_of_employment") {
          console.log("Received nature_of_employment:", value);
        }
        if (
          field === "nature_of_employment" &&
          typeof value === "string" &&
          value.length > 0
        ) {
          // Capitalize first letter, lowercase the rest
          value = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
        }
        if (field === "birthdate") {
          // Normalize empty or placeholder dates to NULL
          if (!value || value === "0000-00-00" || value === "1970-01-01") {
            value = null;
          }
        }
        if (field === "marital_status" && typeof value === "string") {
          value = value.toLowerCase();
        }
        if (field === "department") {
          // Basic sanity validation of department value
          if (value && !DEPARTMENTS.includes(value)) {
            return res
              .status(400)
              .json({
                success: false,
                code: "INVALID_DEPARTMENT",
                field: "department",
                message: "Invalid department supplied.",
              });
          }
          updates.push("department = ?");
          values.push(value || null);
        } else if (field === "sub_department") {
          // We'll validate below after collecting department & sub
          updates.push("sub_department = ?");
          values.push(value || null);
        } else if (field === "phone_number") {
          incomingPhone = value;
        } else {
          updates.push(`${field} = ?`);
          values.push(value);
        }
      }
    });
    // Post-collection semantic validation of department/sub_department pairing
    const bodyDept =
      req.body.department !== undefined ? req.body.department : undefined;
    const bodySub =
      req.body.sub_department !== undefined
        ? req.body.sub_department
        : undefined;
    if (bodyDept) {
      const allowedSubs = SUB_DEPARTMENT_MAP[bodyDept] || [];
      if (!bodySub) {
        return res
          .status(400)
          .json({
            success: false,
            code: "SUB_DEPARTMENT_REQUIRED",
            field: "sub_department",
            message: "Sub department is required when department is provided.",
          });
      }
      if (!allowedSubs.includes(bodySub)) {
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_SUB_DEPARTMENT",
            field: "sub_department",
            message: "Invalid sub department for selected department.",
          });
      }
    } else if (bodySub) {
      // Sub provided without department
      return res
        .status(400)
        .json({
          success: false,
          code: "DEPARTMENT_REQUIRED",
          field: "department",
          message: "Department must be set when sub department is provided.",
        });
    }
    // Phone number validation & uniqueness (handle separately to allow early errors)
    if (incomingPhone !== undefined) {
      const { isValidPhone, normalizePhone } = require("../util/phone");
      if (incomingPhone === null || incomingPhone === "") {
        updates.push("phone_number = NULL");
      } else {
        if (!isValidPhone(incomingPhone)) {
          return res
            .status(400)
            .json({
              success: false,
              code: "INVALID_PHONE_FORMAT",
              field: "phone_number",
              message:
                "Invalid phone number format. Use 7-15 digits, optional leading +",
            });
        }
        const normalized = normalizePhone(incomingPhone);
        const RATE_LIMIT_MAX = 3;
        const [hist] = await pool.query(
          "SELECT phone_change_count, phone_last_changed_at FROM users WHERE id = ?",
          [userId]
        );
        if (hist.length) {
          const rec = hist[0];
          if (rec.phone_last_changed_at) {
            const since =
              Date.now() - new Date(rec.phone_last_changed_at).getTime();
            if (
              since < 24 * 60 * 60 * 1000 &&
              rec.phone_change_count >= RATE_LIMIT_MAX
            ) {
              return res
                .status(429)
                .json({
                  success: false,
                  code: "PHONE_CHANGE_RATE_LIMIT",
                  field: "phone_number",
                  message: `Phone number can only be changed ${RATE_LIMIT_MAX} times in 24 hours.`,
                });
            }
          }
        }
        const [dup] = await pool.query(
          "SELECT id FROM users WHERE phone_number = ? AND id <> ?",
          [normalized, userId]
        );
        if (dup.length) {
          return res
            .status(409)
            .json({
              success: false,
              code: "PHONE_IN_USE",
              field: "phone_number",
              message: "Phone number already in use by another user.",
            });
        }
        updates.push("phone_number = ?");
        values.push(normalized);
        updates.push("phone_last_changed_at = NOW()");
        updates.push(
          "phone_change_count = CASE WHEN phone_last_changed_at IS NULL OR TIMESTAMPDIFF(HOUR, phone_last_changed_at, NOW()) >= 24 THEN 1 ELSE COALESCE(phone_change_count,0) + 1 END"
        );
      }
    }
    console.log("Update values for user:", values);
    if (updates.length === 0) {
      return res.status(400).json({ message: "No fields to update." });
    }
    values.push(userId);
    try {
      let oldPhone = null;
      let newPhone = null;
      let phoneChanging = false;
      if (incomingPhone !== undefined) {
        const [cur] = await pool.query(
          "SELECT phone_number FROM users WHERE id = ?",
          [userId]
        );
        oldPhone = cur[0]?.phone_number || null;
        if (incomingPhone === null || incomingPhone === "") newPhone = null;
        else newPhone = require("../util/phone").normalizePhone(incomingPhone);
        phoneChanging = oldPhone !== newPhone;
      }
      await pool.query(
        `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
        values
      );
      if (phoneChanging) {
        try {
          await pool.query(
            "INSERT INTO user_phone_change_audit (user_id, old_phone, new_phone, via, ip_address, user_agent) VALUES (?,?,?,?,?,?)",
            [
              userId,
              oldPhone,
              newPhone,
              "self",
              (req.ip || "").substring(0, 64),
              (req.headers["user-agent"] || "").substring(0, 255),
            ]
          );
        } catch (auditErr) {
          console.error("Phone change audit insert failed:", auditErr.message);
        }
      }
    } catch (e) {
      if (e && e.code === "ER_DUP_ENTRY" && /phone_number/.test(e.message)) {
        return res
          .status(409)
          .json({
            success: false,
            code: "PHONE_IN_USE",
            field: "phone_number",
            message: "Phone number already in use by another user.",
          });
      }
      throw e;
    }
    // Return updated profile (same as getMe)
    const [users] = await pool.query(
      `SELECT 
        id, 
        payroll_number, 
        first_name, 
        other_names,
        surname,  
        email, 
        national_id,
        phone_number,
        NULLIF(DATE_FORMAT(birthdate, '%Y-%m-%d'), '0000-00-00') as birthdate,
        place_of_birth,
        marital_status,
        postal_address,
        physical_address,
        designation,
        department,
        sub_department,
        nature_of_employment
       FROM users 
       WHERE id = ?`,
      [userId]
    );
    res.json({
      success: true,
      message: "Profile updated successfully.",
      profile: users[0],
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res
      .status(500)
      .json({
        message: "Server error while updating profile",
        error: error.message,
      });
  }
};

// @desc    Check if user has changed password
// @route   POST /api/auth/check-password-status
// @access  Public
exports.checkPasswordStatus = async (req, res) => {
  try {
    const { nationalId } = req.body;
    if (!nationalId) {
      return res.status(400).json({ message: "National ID is required." });
    }
    const [users] = await pool.query(
      "SELECT password_changed, phone_number FROM users WHERE national_id = ?",
      [nationalId]
    );
    if (users.length === 0) {
      return res.json({ password_changed: false, phone_number: null });
    }
    const user = users[0];
    return res.json({
      password_changed: user.password_changed > 0,
      phone_number: user.phone_number,
    });
  } catch (error) {
    console.error("Check password status error:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

// -------------------- USER FORGOT PASSWORD (SMS OTP) --------------------
// @route POST /api/auth/forgot-password (body: nationalId OR phone_number)
exports.forgotPassword = async (req, res) => {
  try {
    const { nationalId, phoneNumber } = req.body;
    if (!nationalId && !phoneNumber) {
      return res
        .status(400)
        .json({ message: "Provide nationalId or phoneNumber" });
    }
    let query = "SELECT id, phone_number, national_id FROM users WHERE ";
    const params = [];
    if (nationalId) {
      query += "national_id = ?";
      params.push(nationalId);
    } else {
      query += "phone_number = ?";
      params.push(phoneNumber);
    }
    const [rows] = await pool.query(query, params);
    if (!rows.length)
      return res.status(404).json({ message: "Account not found" });
    const user = rows[0];
    if (!user.phone_number)
      return res
        .status(400)
        .json({ message: "No phone number on record. Contact support." });
    // Rate limit forgot password code requests: max 3 per 1h window (separate counters)
    const [secRows] = await pool.query(
      "SELECT reset_otp_request_count, reset_otp_request_window_start FROM users WHERE id = ?",
      [user.id]
    );
    let rCount = secRows[0].reset_otp_request_count;
    let rStart = secRows[0].reset_otp_request_window_start;
    const now = new Date();
    if (!rStart || now - new Date(rStart) > 60 * 60 * 1000) {
      // reset window
      await pool.query(
        "UPDATE users SET reset_otp_request_count = 1, reset_otp_request_window_start = NOW() WHERE id = ?",
        [user.id]
      );
    } else {
      if (rCount >= 3) {
        return res
          .status(429)
          .json({
            message: "Reset code request limit reached. Try again later.",
          });
      }
      await pool.query(
        "UPDATE users SET reset_otp_request_count = reset_otp_request_count + 1 WHERE id = ?",
        [user.id]
      );
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query(
      "UPDATE users SET password_reset_code = ?, password_reset_expires_at = ? WHERE id = ?",
      [code, expires, user.id]
    );
    try {
      await sendSMS({
        to: user.phone_number,
        body: `Your password reset code is ${code}. It expires in 10 minutes.`,
      });
    } catch (e) {
      console.error("Failed sending reset SMS:", e.message);
    }
    return res.json({
      success: true,
      message: "Reset code sent if account exists.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

// @route POST /api/auth/forgot-password/verify (body: nationalId, code)
exports.verifyForgotPasswordCode = async (req, res) => {
  try {
    const { nationalId, code } = req.body;
    if (!nationalId || !code)
      return res.status(400).json({ message: "nationalId and code required" });
    const [rows] = await pool.query(
      "SELECT id, password_reset_code, password_reset_expires_at FROM users WHERE national_id = ?",
      [nationalId]
    );
    if (!rows.length)
      return res.status(404).json({ message: "User not found" });
    const { id, password_reset_code, password_reset_expires_at } = rows[0];
    if (!password_reset_code || !password_reset_expires_at)
      return res
        .status(400)
        .json({ message: "No active reset code. Request a new one." });
    if (String(code) !== String(password_reset_code))
      return res.status(400).json({ message: "Invalid code" });
    if (new Date() > new Date(password_reset_expires_at))
      return res.status(400).json({ message: "Code expired" });
    // Issue short-lived token to allow password reset
    const token = jwt.sign({ id, reset: true }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });
    return res.json({ success: true, token });
  } catch (error) {
    console.error("Verify forgot password code error:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

// @route PUT /api/auth/forgot-password/reset (auth with reset token)
exports.resetForgottenPassword = async (req, res) => {
  try {
    if (!req.user || !req.user.id || !req.user.reset) {
      return res.status(403).json({ message: "Invalid reset token" });
    }
    const { newPassword } = req.body;
    if (!newPassword)
      return res.status(400).json({ message: "New password required" });
    const policy = {
      min: 8,
      upper: /[A-Z]/,
      lower: /[a-z]/,
      number: /[0-9]/,
      symbol: /[^A-Za-z0-9]/,
    };
    if (
      newPassword.length < policy.min ||
      !policy.upper.test(newPassword) ||
      !policy.lower.test(newPassword) ||
      !policy.number.test(newPassword) ||
      !policy.symbol.test(newPassword)
    ) {
      return res
        .status(400)
        .json({
          message:
            "Password must be 8+ chars incl upper, lower, number, symbol.",
        });
    }
    const bcrypt = require("bcryptjs");
    const [rows] = await pool.query("SELECT password FROM users WHERE id = ?", [
      req.user.id,
    ]);
    if (!rows.length)
      return res.status(404).json({ message: "User not found" });
    const reuse = await bcrypt.compare(newPassword, rows[0].password);
    if (reuse)
      return res
        .status(400)
        .json({ message: "Cannot reuse previous password." });
    // History check
    const HISTORY_LIMIT2 = 5;
    const [uph2] = await pool.query(
      "SELECT password_hash FROM user_password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
      [req.user.id, HISTORY_LIMIT2]
    );
    for (const row of uph2) {
      const matchPrev = await bcrypt.compare(newPassword, row.password_hash);
      if (matchPrev)
        return res
          .status(400)
          .json({ message: "Cannot reuse a recent password." });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      "UPDATE users SET password = ?, password_changed = password_changed + 1, password_reset_code = NULL, password_reset_expires_at = NULL WHERE id = ?",
      [hash, req.user.id]
    );
    try {
      await pool.query(
        "INSERT INTO user_password_history (user_id, password_hash) VALUES (?, ?)",
        [req.user.id, rows[0].password]
      );
      await pool.query(
        "DELETE FROM user_password_history WHERE user_id = ? AND id NOT IN (SELECT id FROM (SELECT id FROM user_password_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?) t)",
        [req.user.id, req.user.id, HISTORY_LIMIT2]
      );
    } catch (e) {
      console.error(
        "User password history maintenance failed (forgot flow):",
        e.message
      );
    }
    try {
      await pool.query(
        "INSERT INTO user_password_change_audit (user_id, method, ip_address, user_agent) VALUES (?,?,?,?)",
        [
          req.user.id,
          "forgot_flow",
          (req.ip || "").substring(0, 64),
          (req.headers["user-agent"] || "").substring(0, 255),
        ]
      );
    } catch (e) {
      console.error("Forgot flow audit insert failed:", e.message);
    }
    const { accessToken, refreshToken, accessExpiresInMs } =
      await issueTokenPair(req.user.id);
    return res.json({
      success: true,
      token: accessToken,
      refreshToken,
      accessExpiresInMs,
      message: "Password reset successful",
    });
  } catch (error) {
    console.error("Reset forgotten password error:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

// ---- Refresh token endpoint ----
exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken || typeof refreshToken !== "string") {
      return res.status(400).json({ message: "refreshToken required" });
    }
    const parts = refreshToken.split(".");
    if (parts.length !== 2)
      return res.status(400).json({ message: "Invalid refresh token format" });
    const userId = parseInt(parts[0], 10);
    if (!userId)
      return res.status(400).json({ message: "Invalid refresh token" });
    const hash = hashToken(refreshToken);
    const [rows] = await pool.query(
      "SELECT id, refresh_token_hash, last_activity FROM users WHERE id = ?",
      [userId]
    );
    if (!rows.length)
      return res.status(401).json({ message: "User not found" });
    const row = rows[0];
    if (!row.refresh_token_hash || row.refresh_token_hash !== hash) {
      return res.status(401).json({ message: "Refresh token revoked" });
    }
    // Inactivity check (soft invalidation). If last_activity too old, revoke & deny.
    if (row.last_activity && INACTIVITY_LIMIT_MS > 0) {
      const last = new Date(row.last_activity).getTime();
      if (Date.now() - last > INACTIVITY_LIMIT_MS) {
        await revokeRefresh(userId);
        return res
          .status(401)
          .json({ message: "Session expired due to inactivity" });
      }
    }
    // Rotate refresh token if rotation enabled
    const rotate = /^true$/i.test(process.env.REFRESH_TOKEN_ROTATION || "true");
    let newRefreshToken = refreshToken;
    if (rotate) {
      const pair = await issueTokenPair(userId);
      return res.json({
        token: pair.accessToken,
        refreshToken: pair.refreshToken,
        accessExpiresInMs: pair.accessExpiresInMs,
      });
    } else {
      // Update last_activity only
      await pool.query("UPDATE users SET last_activity = NOW() WHERE id = ?", [
        userId,
      ]);
      const accessToken = signAccess({ id: userId });
      return res.json({
        token: accessToken,
        refreshToken: newRefreshToken,
        accessExpiresInMs: ACCESS_TTL_MS,
      });
    }
  } catch (e) {
    console.error("Refresh error:", e.message);
    return res.status(500).json({ message: "Server error", error: e.message });
  }
};

// ---- Logout (revoke refresh token) ----
exports.logout = async (req, res) => {
  try {
    if (!req.user || !req.user.id)
      return res.status(200).json({ success: true });
    await revokeRefresh(req.user.id);
    return res.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error.message);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};
