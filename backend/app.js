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
const financeAdminRoutes = require("./routes/financeAdminRoutes");

const draftRoutes = require("./routes/draftRoutes");
const userRoutes = require("./routes/userRoutes");
const consentRoutes = require("./routes/consentRoutes");
const progressRoutes = require("./routes/progressRoutes");
const publicDepartments = require("./controllers/publicDepartmentsController");

const app = express();
// Trust first proxy (needed for express-rate-limit with X-Forwarded-For)
app.set("trust proxy", 1);

// Security middleware (put Helmet & logging first)
app.use(helmet());
app.use(morgan("combined"));

// CORS configuration early so even 429 responses include headers
app.use(
  cors({
    origin: (origin, callback) => {
      // In production, only allow specific origins.
      const prodOrigins = [
        "https://localhost:3000",
        "https://cgm-dials-22kfe.ondigitalocean.app",
      ];
      if (process.env.FRONTEND_URL) {
        prodOrigins.push(process.env.FRONTEND_URL);
      }

      if (process.env.NODE_ENV === "production") {
        if (!origin || prodOrigins.includes(origin)) {
          callback(null, true);
        } else {
          // Block requests from unknown origins in production
          callback(new Error("Not allowed by CORS"));
        }
      } else {
        // Allow requests from any origin in development for flexibility.
        callback(null, true);
      }
    },
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
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
  // Only apply limiter to sensitive, unauthenticated authentication endpoints
  skip: (req) => {
    if (req.method === "OPTIONS") return true;
    const sensitiveAuthPaths = [
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/resend-otp",
      "/api/auth/verify-otp",
      "/api/auth/forgot-password",
      "/api/auth/forgot-password/verify",
      "/api/auth/check-password-status",
      "/api/admin/login",
    ];
    // Apply the limiter ONLY if the path is one of the sensitive ones.
    return !sensitiveAuthPaths.includes(req.path);
  },
  message: {
    success: false,
    message: "Too many authentication attempts, please wait.",
  },
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
  // Skip OPTIONS and the sensitive auth paths handled by authLimiter
  skip: (req) => {
    if (req.method === "OPTIONS") return true;
    const sensitiveAuthPaths = [
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/resend-otp",
      "/api/auth/verify-otp",
      "/api/auth/forgot-password",
      "/api/auth/forgot-password/verify",
      "/api/auth/check-password-status",
      "/api/admin/login",
    ];
    return sensitiveAuthPaths.includes(req.path);
  },
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
app.use("/api/finance-admin", financeAdminRoutes);
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
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  });
}

module.exports = app;
