// Global Jest setup: close MySQL pool after all tests to avoid open handle warning.
const pool = require('../config/db');

afterAll(async () => {
  try {
    await pool.end();
  } catch (e) {
    // ignore
  }
});
