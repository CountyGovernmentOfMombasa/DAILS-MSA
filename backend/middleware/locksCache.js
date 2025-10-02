// Simple in-memory cache middleware for declaration lock settings.
// Caches the settings row for a short TTL to reduce repetitive DB hits.
// Not suitable for multi-process clustering without a shared store, but fine for a single instance.
const settingsModel = require('../models/settingsModel');

let cachedLocks = null;
let cacheExpiresAt = 0; // epoch ms
const DEFAULT_TTL_MS = 30 * 1000; // 30 seconds (tweak as needed)

async function loadLocks() {
  const locks = await settingsModel.getDeclarationLocks();
  cachedLocks = locks;
  cacheExpiresAt = Date.now() + DEFAULT_TTL_MS;
  return locks;
}

// Middleware: attaches req.declarationLocks (fresh or cached) then calls next()
async function locksCache(req, res, next) {
  try {
    if (!cachedLocks || Date.now() > cacheExpiresAt) {
      await loadLocks();
    }
    req.declarationLocks = cachedLocks;
    return next();
  } catch (err) {
    console.error('locksCache middleware error:', err.message);
    // On failure, proceed without cached value so downstream handler can still attempt DB access.
    return next();
  }
}

// Helper to force invalidate (could be called after an update route succeeds)
function invalidateLocksCache() {
  cachedLocks = null;
  cacheExpiresAt = 0;
}

module.exports = { locksCache, invalidateLocksCache };
