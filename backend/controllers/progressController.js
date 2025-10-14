const Progress = require('../models/progressModel');
const userModel = require('../models/userModel');

// Assumes auth middleware has populated req.user (with id) similar to other routes
function validateProgressShape(progress) {
  if (typeof progress !== 'object' || progress === null) return 'Progress must be an object';
  const { lastStep, stateSnapshot } = progress;
  const steps = ['user','spouse','financial','review'];
  if (lastStep && !steps.includes(lastStep)) return 'Invalid lastStep';
  if (typeof stateSnapshot !== 'object' || stateSnapshot === null) return 'stateSnapshot missing';
  // Basic field size/array limits to prevent abuse
  const jsonSize = Buffer.byteLength(JSON.stringify(progress), 'utf8');
  if (jsonSize > 250 * 1024) return 'Progress payload too large';
  const { userData, spouses, children, allFinancialData, review } = stateSnapshot;
  if (userData && typeof userData !== 'object') return 'userData must be object';
  const arrChecks = [ ['spouses', spouses, 50], ['children', children, 50] , ['allFinancialData', allFinancialData, 100]];
  for (const [label, arr, max] of arrChecks) {
    if (arr && (!Array.isArray(arr) || arr.length > max)) return `${label} invalid or exceeds limit`; 
  }
  // quick per-item shape sanity
  if (Array.isArray(allFinancialData)) {
    for (const item of allFinancialData) {
      if (!item || typeof item !== 'object') return 'Invalid financial item';
      if (item.data && typeof item.data !== 'object') return 'Invalid financial item data';
    }
  }
  if (review && typeof review !== 'object') return 'review must be object';
  return null;
}

exports.saveProgress = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    // Accept either camelCase or snake_case (middleware normalizes, but keep fallback)
    const userKey = req.body.user_key || req.body.userKey;
    const progress = req.body.data || req.body.progress;
    if (!userKey || !progress) {
      console.warn('[progressController] 400 saveProgress missing fields', {
        userId,
        hasUserKey: !!userKey,
        hasProgress: !!progress,
        bodyKeys: Object.keys(req.body || {})
      });
      return res.status(400).json({ success: false, message: 'userKey and progress required' });
    }
    const validationError = validateProgressShape(progress);
    if (validationError) {
      // Avoid logging entire progress (could be large); log size + top-level keys only
      let size = 0;
      try { size = Buffer.byteLength(JSON.stringify(progress), 'utf8'); } catch (_) {}
      console.warn('[progressController] 400 saveProgress validationError', {
        userId,
        userKey,
        validationError,
        size,
        topLevelKeys: Object.keys(progress || {}),
        snapshotKeys: progress && progress.stateSnapshot ? Object.keys(progress.stateSnapshot) : []
      });
      return res.status(400).json({ success: false, message: validationError });
    }
    await Progress.upsert(userId, userKey, progress);
    return res.json({ success: true });
  } catch (e) {
    console.error('saveProgress error', e);
    res.status(500).json({ success: false, message: 'Failed to save progress' });
  }
};

exports.getProgress = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { userKey } = req.query;
    let record = null;
    if (userKey) {
      record = await Progress.get(userId, userKey);
    } else {
      record = await Progress.latest(userId);
    }
    if (!record) return res.json({ success: true, progress: null });
    // record.data may already be a JS object (if driver parsed JSON) or a JSON string.
    let raw = record.data;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { raw = {}; }
    } else if (raw && typeof raw === 'object' && raw.type === 'Buffer' && Array.isArray(raw.data)) {
      // Safety: if somehow a Buffer wrapper sneaks in
      try { raw = JSON.parse(Buffer.from(raw.data).toString('utf8')); } catch { raw = {}; }
    }
    // Defensive shaping: ensure stateSnapshot object so frontend/tests don't crash
    if (!raw.stateSnapshot || typeof raw.stateSnapshot !== 'object') {
      raw.stateSnapshot = { userData: {}, spouses: [], children: [] };
    } else if (!raw.stateSnapshot.userData) {
      raw.stateSnapshot.userData = {};
    }
    return res.json({ success: true, progress: { userKey: record.user_key, ...raw, updatedAt: record.updated_at } });
  } catch (e) {
    console.error('getProgress error', e);
    res.status(500).json({ success: false, message: 'Failed to load progress' });
  }
};

exports.deleteProgress = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const userKey = req.query.userKey || req.query.user_key;
    if (!userKey) return res.status(400).json({ success: false, message: 'userKey required' });
    await Progress.remove(userId, userKey);
    return res.json({ success: true });
  } catch (e) {
    console.error('deleteProgress error', e);
    res.status(500).json({ success: false, message: 'Failed to delete progress' });
  }
};