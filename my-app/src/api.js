import axios from 'axios';

// Compute API base URL robustly.
// If REACT_APP_API_URL is an absolute URL without a path and on the same origin
// (e.g. https://dials.mcpsb.go.ke), assume the backend is reverse-proxied at '/api'.
// Otherwise, respect the provided path (e.g. https://api.example.com or https://host/app/api).
function normalizeApiBase(raw) {
  try {
    if (!raw) return '/api';
    const trimmed = String(raw).trim();
    // Absolute URL provided
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed);
      const path = (u.pathname || '/').replace(/\/+$/, '');
      if (!path || path === '/') {
        // No path segment – if pointing to current origin, prefer relative '/api'
        if (typeof window !== 'undefined' && u.origin === window.location.origin) {
          return '/api';
        }
        // Different origin without path: default to '/api' on that origin
        return u.origin + '/api';
      }
      // Has a path – use origin + normalized path as base
      return u.origin + path;
    }
    // Relative string – ensure leading slash and fallback to '/api' if empty
    const rel = trimmed.replace(/\/+$/, '');
    return rel || '/api';
  } catch {
    return '/api';
  }
}

const API_URL = normalizeApiBase(process.env.REACT_APP_API_URL);

// Global Axios interceptor for uniform 401 / 404 handling
let interceptorInstalled = false;
export function installGlobalInterceptors(onAuthError, onNotFound) {
  if (interceptorInstalled) return;
  axios.interceptors.response.use(
    resp => resp,
    err => {
      const status = err?.response?.status;
      if (status === 401 && typeof onAuthError === 'function') {
        onAuthError(err);
      } else if (status === 404 && typeof onNotFound === 'function') {
        onNotFound(err);
      }
      return Promise.reject(err);
    }
  );
  interceptorInstalled = true;
}

// Simple in-flight GET dedupe: prevents multiple identical concurrent GETs
// Keyed by full URL + sorted params. Removed immediately after resolve/reject (no caching beyond in-flight window)
const inFlightGet = new Map();
const buildKey = (url, config = {}) => {
  const params = config.params ? JSON.stringify(Object.keys(config.params).sort().reduce((acc, k) => { acc[k] = config.params[k]; return acc; }, {})) : '';
  const auth = config.headers && config.headers.Authorization ? config.headers.Authorization : '';
  return `${url}|${params}|${auth}`; // include auth to avoid cross-user leakage
};
const dedupedGet = (url, config = {}) => {
  const key = buildKey(url, config);
  if (inFlightGet.has(key)) {
    return inFlightGet.get(key);
  }
  const p = axios.get(url, config)
    .finally(() => {
      // cleanup after microtask so chained thens still receive the same promise
      setTimeout(() => inFlightGet.delete(key), 0);
    });
  inFlightGet.set(key, p);
  return p;
};

// Separate light-weight dedupe for fetch-based relative API calls (used where axios base URL differs or legacy code paths)
const inFlightFetch = new Map();
const buildFetchKey = (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  const auth = options.headers && options.headers.Authorization ? options.headers.Authorization : '';
  return `${method}|${url}|${auth}`;
};
const dedupedFetchJson = (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    // Only dedupe GET
    return fetch(url, options).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
  }
  const key = buildFetchKey(url, options);
  if (inFlightFetch.has(key)) {
    return inFlightFetch.get(key);
  }
  const p = fetch(url, options).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }).finally(() => {
    setTimeout(() => inFlightFetch.delete(key), 0);
  });
  inFlightFetch.set(key, p);
  return p;
};

export const login = (data) => axios.post(`${API_URL}/auth/login`, data);
export const register = (data) => axios.post(`${API_URL}/auth/register`, data);
export const resendOtp = (data) => axios.post(`${API_URL}/auth/resend-otp`, data);
export const verifyOtp = (token, otp) => axios.post(`${API_URL}/auth/verify-otp`, { otp }, { headers: { Authorization: `Bearer ${token}` } });
export const submitDeclaration = (data, token) => axios.post(`${API_URL}/declarations`, data, { headers: { Authorization: token } });
export const getDeclarations = (token) => dedupedGet(`${API_URL}/declarations`, { headers: { Authorization: token } });
export const getDeclarationById = (id, token) => dedupedGet(`${API_URL}/declarations/${id}`, { headers: { Authorization: token } });
export const updateDeclaration = (id, data, token) => axios.put(`${API_URL}/declarations/${id}`, data, { headers: { Authorization: token } });
// Removed unified financial endpoints (financial tables deprecated); declaration GET now includes synthesized financial_unified
// Additional idempotent GET helpers (fetch-based) with in-flight dedupe
export const getAuthProfile = (token) => dedupedFetchJson('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
export const getAdminDeclarations = (adminToken) => dedupedFetchJson('/api/admin/declarations', { headers: { Authorization: `Bearer ${adminToken}` } });
export const getProgress = (userKey, token) => dedupedFetchJson(`/api/progress?userKey=${encodeURIComponent(userKey)}`, { headers: { Authorization: `Bearer ${token}` } });
export const deleteProgress = (userKey, token) => dedupedFetchJson(`/api/progress?userKey=${encodeURIComponent(userKey)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
export const deleteDeclaration = (id, token) => axios.delete(`${API_URL}/declarations/${id}`, { headers: { Authorization: token } });
export const getAllDeclarations = async (token) => {
  try {
    const response = await fetch('/api/admin/declarations', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching declarations:', error);
    throw error;
  }
};
// Auto-elevating admin fetch wrapper.
// 1. If no adminToken but user hasAdminAccess + user token, attempt elevation.
// 2. Perform request.
// 3. If 401 (once), re-elevate & retry (guards against race with expiry).
export const adminFetch = async (url, options = {}) => {
  const attempt = async (retry = false) => {
    let adminToken = localStorage.getItem('adminToken');
    const userToken = localStorage.getItem('token');
    const hasAdminAccess = localStorage.getItem('hasAdminAccess') === '1';
    if ((!adminToken || adminToken === 'undefined') && hasAdminAccess && userToken) {
      try {
        const elevateRes = await fetch('/api/admin/elevate-from-user', { method: 'POST', headers: { Authorization: `Bearer ${userToken}` } });
        if (elevateRes.ok) {
          const elevData = await elevateRes.json();
          if (elevData.adminToken) localStorage.setItem('adminToken', elevData.adminToken);
          if (elevData.refreshToken) localStorage.setItem('adminRefreshToken', elevData.refreshToken);
          adminToken = elevData.adminToken || localStorage.getItem('adminToken');
          if (elevData.accessTtl) {
            try {
              const m = String(elevData.accessTtl).match(/(\d+)([smhd])/i); let ttlMs = 30*60000;
              if (m) { const v=parseInt(m[1],10); const u=m[2].toLowerCase(); ttlMs = v*(u==='s'?1000:u==='m'?60000:u==='h'?3600000:86400000); }
              localStorage.setItem('adminTokenExpiresAt', String(Date.now()+ttlMs));
            } catch {}
          }
          if (elevData.admin) localStorage.setItem('adminUser', JSON.stringify(elevData.admin));
        }
      } catch { /* ignore elevation network errors */ }
    }
    const resp = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    if (resp.status === 401 && !retry && hasAdminAccess && userToken) {
      // Possibly expired; try fresh elevation then redo once
      try {
        await fetch('/api/admin/elevate-from-user', { method: 'POST', headers: { Authorization: `Bearer ${userToken}` } });
      } catch { /* swallow */ }
      return attempt(true);
    }
    return resp;
  };
  return attempt(false);
};
export const getUsersCount = async () => {
  const response = await adminFetch('/api/admin/users');
  if (!response.ok) throw new Error('Failed to fetch users count');
  const data = await response.json();
  return data.total;
};

// Bulk SMS API helper (admin scope). If itAdmin is true, call IT Admin endpoint.
export const sendBulkSMS = async ({ message, userIds, departments, status, includeNoDeclaration, dryRun, maxChunkSize, itAdmin } = {}) => {
  const url = itAdmin ? '/api/it-admin/bulk-sms' : '/api/admin/bulk-sms';
  const resp = await adminFetch(url, {
    method: 'POST',
    body: JSON.stringify({ message, userIds, departments, status, includeNoDeclaration, dryRun, maxChunkSize }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data && data.message ? data.message : `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return data;
};

export const getBulkSmsAudit = async ({ page = 1, limit = 20, adminUsername, role, from, to, itAdmin } = {}) => {
  const url = new URL((itAdmin ? '/api/it-admin/bulk-sms/audit' : '/api/admin/bulk-sms/audit'), window.location.origin);
  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('limit', String(limit));
  if (adminUsername) qs.set('adminUsername', adminUsername);
  if (role) qs.set('role', role);
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  const resp = await adminFetch(url.pathname + '?' + qs.toString(), { method: 'GET' });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data && data.message ? data.message : `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return data;
};