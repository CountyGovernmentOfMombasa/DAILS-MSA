const mysql = require("mysql2/promise");
require("dotenv").config();

const APP_TIMEZONE = "+03:00"; // EAT is UTC+3. Using offset is more compatible than named zones.

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT),
  dateStrings: true, // Return dates as strings to preserve timezone
  connectTimeout: 10000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // ✅ ADD SSL CONFIGURATION
  ssl: {
    rejectUnauthorized: false,
  },
});

// Set the timezone for all new connections in the pool
pool.on("connection", function (connection) {
  connection.query(`SET time_zone = '${APP_TIMEZONE}'`, (err) => {
    if (err)
      console.error(
        `[DB] Failed to set timezone for connection: ${err.message}`
      );
  });
});
// Connection tester with simple retry (handles XAMPP/MySQL cold starts)
async function verifyConnectionWithRetry({
  attempts = 5,
  delayMs = 1000,
} = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const conn = await pool.getConnection();
      await conn.query("SELECT 1");
      conn.release();
      console.log(`Database connected (attempt ${i}/${attempts})`);
      return true;
    } catch (err) {
      const terminal = i === attempts;
      console.error(
        `DB connection attempt ${i} failed${
          terminal ? "" : ", retrying..."
        } ->`,
        err.code || err.message
      );
      if (terminal) {
        console.error("Exhausted all retry attempts. Exiting.");
        process.exit(1);
      }
      // Exponential-ish backoff but capped
      const wait = Math.min(delayMs * i, 5000);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

verifyConnectionWithRetry();

module.exports = pool;
