const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const authRoutes = require("./routes/authRoutes");
const declarationRoutes = require("./routes/declarationRoutes");

const adminRoutes = require("./routes/adminRoutes");
const hrAdminRoutes = require("./routes/hrAdminRoutes");
const itAdminRoutes = require("./routes/itAdminRoutes");

const draftRoutes = require("./routes/draftRoutes");
const userRoutes = require("./routes/userRoutes");
const consentRoutes = require("./routes/consentRoutes");
const progressRoutes = require("./routes/progressRoutes");
const publicDepartments = require("./controllers/publicDepartmentsController");
const { getBiennialWindowForYear } = require("./models/windowSettingsModel");

const app = express();
// Trust first proxy (needed for express-rate-limit with X-Forwarded-For)
app.set("trust proxy", 1);

// Startup sanity checks for critical env vars
(() => {
  const crypto = require("crypto");
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error(
      "[STARTUP] JWT_SECRET is missing. Tokens will fail validation. Set JWT_SECRET in environment."
    );
  } else {
    // Log short fingerprint to help verify consistency across instances without exposing the secret
    const fp = crypto
      .createHash("sha256")
      .update(String(secret))
      .digest("hex")
      .slice(0, 8);
    console.log(`[STARTUP] JWT secret fingerprint: ${fp}`);
  }
  const accessTtl = process.env.ACCESS_TOKEN_EXPIRES_IN || "30m";
  const refreshTtl = process.env.REFRESH_TOKEN_EXPIRES_IN || "14d";
  console.log(
    `[STARTUP] Access TTL=${accessTtl}, Refresh TTL=${refreshTtl}, Inactivity(min)=${
      process.env.INACTIVITY_TIMEOUT_MINUTES || "30"
    }`
  );
})();

// Security middleware (put Helmet & logging first)
app.use(
  helmet({
    // Allow loading content from our own origins.
    // This is important for environments behind a reverse proxy.
    contentSecurityPolicy: false,
  })
);
app.use(morgan("combined"));

// CORS configuration early so even 429 responses include headers
// Support multiple allowed origins via FRONTEND_URLS (comma-separated),
// optional regex list via FRONTEND_URLS_REGEX (comma-separated regex strings),
// fallback to FRONTEND_URL single value, then localhost for dev.
const allowedOrigins = (
  process.env.FRONTEND_URLS ||
  process.env.FRONTEND_URL ||
  "http://localhost:3000"
)
  .split(",")
  .map((s) => s && s.trim())
  .filter(Boolean);
const allowedOriginRegexes = (process.env.FRONTEND_URLS_REGEX || "")
  .split(",")
  .map((s) => s && s.trim())
  .filter(Boolean)
  .map((p) => {
    try {
      return new RegExp(p);
    } catch {
      return null;
    }
  })
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser or same-origin requests (no Origin header)
      if (!origin) return callback(null, true);
      // Exact allow list
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Regex allow list
      try {
        if (allowedOriginRegexes.some((rx) => rx.test(origin))) {
          return callback(null, true);
        }
      } catch {}
      // Optional: treat origins matching the origin part of any allowed URL as allowed
      try {
        const url = new URL(origin);
        if (
          allowedOrigins.some((ao) => {
            try {
              const a = new URL(ao);
              return a.origin === url.origin;
            } catch {
              return false;
            }
          })
        ) {
          return callback(null, true);
        }
      } catch {}
      // Not allowed – do NOT throw; respond without CORS headers (browser will block), avoid 500s
      console.warn(`CORS blocked origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
  })
);

// Rate limiting strategy:
// 1. authLimiter: strict for authentication endpoints (login, register, OTP, etc.)
// 2. generalLimiter: high ceiling for the rest of the API; skips /api/auth/* and OPTIONS
// Avoid double limiting by skipping auth paths in general limiter.
const authLimiter = rateLimit({
  windowMs: parseInt(
    process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
    10
  ),
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || 30, 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const crypto = require("crypto");
    let idPart = "";
    if (req.body && typeof req.body.nationalId === "string") {
      idPart =
        ":" +
        crypto
          .createHash("sha256")
          .update(req.body.nationalId)
          .digest("hex")
          .slice(0, 16);
    }
    return req.ip + idPart;
  },
  // Only apply limiter to authentication-related endpoints
  skip: (req) => {
    if (req.method === "OPTIONS") return true;
    const url = req.originalUrl;
    return !url.startsWith("/api/auth/") && !url.startsWith("/api/admin/login");
  },
  message: { success: false, message: "Too many auth attempts, please wait." },
  handler: (req, res, next, options) => {
    console.warn(`[RATE-LIMIT][AUTH] ip=${req.ip} path=${req.originalUrl}`);
    res.status(options.statusCode).json(options.message);
  },
});

const generalLimiter = rateLimit({
  windowMs: parseInt(
    process.env.GENERAL_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
    10
  ),
  max: parseInt(process.env.GENERAL_RATE_LIMIT_MAX || 1500, 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => req.ip, // Keep it simple for general traffic
  skip: (req) =>
    req.method === "OPTIONS" || req.originalUrl.startsWith("/api/auth"),
  message: { success: false, message: "Too many requests, slow down." },
  handler: (req, res, next, options) => {
    console.warn(`[RATE-LIMIT][GENERAL] ip=${req.ip} path=${req.originalUrl}`);
    res.status(options.statusCode).json(options.message);
  },
});

// Apply limiters
app.use(authLimiter); // applies to all, but only counts for /api/auth/* due to skip filters in generalLimiter
app.use(generalLimiter);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
// Serve uploaded files
app.use("/uploads", express.static("uploads"));

// Endpoint to get server date in DD/MM/YYYY format
app.get("/api/server-date", (req, res) => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const formattedDate = `${day}/${month}/${year}`;
  res.json({ date: formattedDate });
});

// Public endpoint to fetch the active Biennial declaration window
// Optional query param: year (number). If omitted, uses current server year.
app.get("/api/windows/biennial", async (req, res) => {
  try {
    const now = new Date();
    const qYear = parseInt(String(req.query.year || now.getFullYear()), 10);
    const windowRow = await getBiennialWindowForYear(isNaN(qYear) ? now.getFullYear() : qYear);
    if (!windowRow) {
      return res.json({ success: true, window: null });
    }
    return res.json({ success: true, window: {
      id: windowRow.id,
      year: windowRow.year,
      start_date: windowRow.start_date,
      end_date: windowRow.end_date,
      active: !!windowRow.active,
      notes: windowRow.notes || null
    }});
  } catch (e) {
    console.error("/api/windows/biennial error:", e.message);
    return res.status(500).json({ success: false, message: "Failed to fetch biennial window" });
  }
});

// Public (read‑only) endpoint for declaration lock statuses so regular users
// (who are not admins and thus have no admin token) can still discover which
// declaration types are currently locked. Wrapped with a light in-memory cache.
try {
  const { locksCache } = require("./middleware/locksCache");
  app.get("/api/settings/locks", locksCache, async (req, res) => {
    // locksCache already attached req.declarationLocks (best-effort)
    if (req.declarationLocks) {
      return res.json({
        success: true,
        locks: req.declarationLocks,
        cached: true,
      });
    }
    // Fallback (unlikely) – direct fetch
    try {
      const settingsModel = require("./models/settingsModel");
      const locks = await settingsModel.getDeclarationLocks();
      return res.json({ success: true, locks, cached: false });
    } catch (err) {
      console.error("Error fetching public locks (fallback):", err.message);
      return res
        .status(500)
        .json({ success: false, message: "Error fetching locks" });
    }
  });
} catch (e) {
  console.warn("Unable to initialize cached public locks route:", e.message);
}

app.use("/api/auth", authRoutes);
app.use("/api/declarations", declarationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/hr-admin", hrAdminRoutes);
app.use("/api/it-admin", itAdminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/drafts", draftRoutes);
// Consent submission was originally mounted only under /api/admin/consent/consent
// Frontend expects /api/consent/consent; expose both for backward compatibility.
app.use("/api/admin/consent", consentRoutes); // legacy path
app.use("/api/consent", consentRoutes); // public/standardized path
app.use("/api/progress", progressRoutes);
// Public departments listing (for registration forms)
app.get("/api/public/departments", publicDepartments.list);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    message: "Employee Declaration API is running",
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("Global error handler:", error);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Something went wrong",
  });
});

const PORT = process.env.PORT || 5000;
async function startServer() {
  // Optional: auto-run migrations on startup if enabled
  if (process.env.AUTO_MIGRATE === "true") {
    try {
      console.log("AUTO_MIGRATE=true detected. Running database migrations...");
      const { spawn } = require("child_process");
      await new Promise((resolve, reject) => {
        const p = spawn(
          process.execPath,
          [require("path").join(__dirname, "scripts", "runMigrations.js")],
          { stdio: "inherit" }
        );
        p.on("exit", (code) => {
          if (code === 0) return resolve();
          const msg = `Migration script exited with code ${code}`;
          console.error(msg);
          // Do not reject to avoid boot blocking; just log and continue
          resolve();
        });
        p.on("error", reject);
      });
    } catch (e) {
      console.error("Failed to run migrations on startup:", e.message);
    }
  }

  if (process.env.NODE_ENV !== "test") {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  }
}

startServer();

module.exports = app;

// Lightweight background task to clear expired OTPs so they don't linger in the DB
// Uses application time for comparison (same as when OTPs are created) to avoid timezone drift issues.
try {
  const pool = require("./config/db");
  const intervalMs = parseInt(
    process.env.OTP_CLEANUP_INTERVAL_MS || "60000",
    10
  );
  if (intervalMs > 0 && process.env.NODE_ENV !== "test") {
    setInterval(async () => {
      try {
        const now = new Date();
        const [result] = await pool.query(
          "UPDATE users SET otp_code = NULL, otp_expires_at = NULL WHERE otp_expires_at IS NOT NULL AND otp_expires_at < ? LIMIT 1000",
          [now]
        );
        if (result && result.affectedRows) {
          console.log(
            `[OTP CLEANUP] Cleared ${result.affectedRows} expired OTP(s)`
          );
        }
      } catch (e) {
        console.warn("OTP cleanup task failed:", e.message);
      }
    }, intervalMs);
  }
} catch (e) {
  console.warn("OTP cleanup not initialized:", e.message);
}
