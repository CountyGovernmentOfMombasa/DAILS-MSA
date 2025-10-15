// Versioned per-user progress persistence.
// Structure: { version: 1, users: { [userKey]: { lastStep, stateSnapshot, updatedAt } } }

const STORAGE_KEY = 'declarationProgressStore';
const VERSION = 1;
const SUPPRESS_PREFIX = 'progressSuppress:';

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: VERSION, users: {} };
    const parsed = JSON.parse(raw);
    if (!parsed.version) return { version: VERSION, users: parsed.users || {} }; // migrate legacy
    return parsed;
  } catch (_) {
    return { version: VERSION, users: {} };
  }
}

function writeStore(store) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (_) { /* ignore */ }
}

export function loadProgress(userKey) {
  if (!userKey) return null;
  const store = loadStore();
  return store.users[userKey] || null;
}

export function saveProgress(update, userKey) {
  if (!update || !userKey) return null;
  const store = loadStore();
  const existing = store.users[userKey] || {};
  const merged = { ...existing, ...update, updatedAt: new Date().toISOString() };
  store.version = VERSION;
  store.users[userKey] = merged;
  writeStore(store);
  return merged;
}

export function clearProgress(userKey) {
  if (!userKey) return;
  const store = loadStore();
  if (store.users[userKey]) {
    delete store.users[userKey];
    writeStore(store);
  }
}

// Convenience to derive the route path for a given stored step
export function stepToPath(step) {
  const map = { user: '/user-form', spouse: '/spouse-form', financial: '/financial-form', review: '/review' };
  return map[step] || '/user-form';
}

// Helper to compute a user key (exported for reuse if needed)
export function deriveUserKey(obj) {
  if (!obj || typeof obj !== 'object') return 'anonymous';
  return obj.national_id || obj.payroll_number || obj.email || 'anonymous';
}

// --- Server Sync (optional multi-device resume) ---
// Debounced sync queue per user key; silent failures.
const pendingTimers = {};
const LATEST_CACHE = {};

export function scheduleServerSync(userKey, token) {
  if (!userKey || !token) return;
  // If user has started (or resumed) a new progress session, ensure any previous suppression is cleared
  try { clearProgressSuppressed(userKey); } catch (_) {}
  const snapshot = loadProgress(userKey);
  if (!snapshot) return;
  // Basic shape validation before attempting network sync to avoid 400 spam
  if (typeof snapshot !== 'object' || snapshot === null) return;
  if (typeof snapshot.stateSnapshot !== 'object' || snapshot.stateSnapshot === null) return;
  // Avoid sending if nothing meaningful inside stateSnapshot
  const { stateSnapshot } = snapshot;
  if (!stateSnapshot.userData && !stateSnapshot.spouses && !stateSnapshot.children && !stateSnapshot.allFinancialData && !stateSnapshot.review) {
    return; // nothing to persist remotely
  }
  // Minimum interval (per user) between POSTs (2s) even if debounce tries to trigger
  const now = Date.now();
  if (!scheduleServerSync.__lastPost) scheduleServerSync.__lastPost = {};
  const last = scheduleServerSync.__lastPost[userKey] || 0;
  if (now - last < 2000) {
    // Push out a new attempt after interval if one is already queued
    if (pendingTimers[userKey]) clearTimeout(pendingTimers[userKey]);
    pendingTimers[userKey] = setTimeout(() => scheduleServerSync(userKey, token), 2000 - (now - last));
    return;
  }
  scheduleServerSync.__lastPost[userKey] = now;
  LATEST_CACHE[userKey] = snapshot;
  if (pendingTimers[userKey]) clearTimeout(pendingTimers[userKey]);
  pendingTimers[userKey] = setTimeout(() => {
    // Fire and forget
    try {
      // Decide whether to prune payload if too large (backend limit ~250KB)
      const progressRaw = LATEST_CACHE[userKey];
      const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
      function calcSize(obj) {
        try {
          const json = JSON.stringify(obj);
            if (encoder) return encoder.encode(json).length;
            return json.length; // fallback approximate
        } catch (_) { return 0; }
      }
      function pruneProgress(progress) {
        // Create a lightweight clone omitting large arrays, retaining counts & basic meta
        const clone = { ...progress, _pruned: true };
        if (progress.stateSnapshot) {
          const ss = progress.stateSnapshot;
          const newSS = { ...ss };
          if (Array.isArray(ss.allFinancialData)) {
            newSS.allFinancialData = ss.allFinancialData.map(member => {
              if (!member || typeof member !== 'object') return member;
              const base = { type: member.type, name: member.name };
              if (member.data && typeof member.data === 'object') {
                const d = member.data;
                base.data = {
                  declaration_date: d.declaration_date,
                  period_start_date: d.period_start_date || d.period_start,
                  period_end_date: d.period_end_date || d.period_end,
                  biennial_income_count: Array.isArray(d.biennial_income) ? d.biennial_income.length : 0,
                  assets_count: Array.isArray(d.assets) ? d.assets.length : 0,
                  liabilities_count: Array.isArray(d.liabilities) ? d.liabilities.length : 0,
                  other_financial_info_preview: d.other_financial_info ? String(d.other_financial_info).slice(0, 120) : ''
                };
              }
              return base;
            });
          }
          clone.stateSnapshot = newSS;
        }
        return clone;
      }

      let progressToSend = progressRaw;
      let size = calcSize(progressToSend);
      const LIMIT = 250 * 1024; // backend enforced limit
      if (size > LIMIT) {
        progressToSend = pruneProgress(progressRaw);
        size = calcSize(progressToSend);
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('[scheduleServerSync] pruned oversized progress payload', { originalSize: size, prunedSize: size });
        }
      }
      fetch('/api/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userKey, progress: progressToSend })
      }).catch(() => {});
    } catch (_) { /* ignore */ }
  }, 800); // debounce window
}

// --- Post-submission suppression (prevents stale server progress reappearing) ---
export function markProgressSuppressed(userKey) {
  if (!userKey) return;
  try { localStorage.setItem(SUPPRESS_PREFIX + userKey, new Date().toISOString()); } catch (_) {}
}

export function clearProgressSuppressed(userKey) {
  if (!userKey) return;
  try { localStorage.removeItem(SUPPRESS_PREFIX + userKey); } catch (_) {}
}

export function isProgressSuppressed(userKey) {
  if (!userKey) return false;
  try {
    const val = localStorage.getItem(SUPPRESS_PREFIX + userKey);
    return !!val;
  } catch (_) {
    return false;
  }
}
