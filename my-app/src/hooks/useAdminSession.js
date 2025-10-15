import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// Centralized admin elevation & session utilities for UI components.
// Handles: first elevation, retry, token persistence, role hint, invalid user token fallback.
export function useAdminSession() {
  const navigate = useNavigate();
  const [elevating, setElevating] = useState(false);
  const [error, setError] = useState('');
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('adminToken') || '');
  const [hasAdminAccess, setHasAdminAccess] = useState(() => localStorage.getItem('hasAdminAccess') === '1');
  const [roleRaw, setRoleRaw] = useState(() => localStorage.getItem('adminRawRoleHint') || '');
  const invalidatedRef = useRef(false);

  const computeRoleAbbrev = useCallback((raw) => {
    if (raw === 'hr_admin') return 'HR';
    if (raw === 'finance_admin') return 'FIN';
    if (raw === 'it_admin') return 'IT';
    if (raw === 'super_admin') return 'SUPER';
    return '';
  }, []);
  const roleAbbrev = computeRoleAbbrev(roleRaw);

  // Listen for cross-tab updates to admin token / flags.
  useEffect(() => {
    function handleStorage(e) {
      if (e.key === 'adminToken') setAdminToken(e.newValue || '');
      if (e.key === 'hasAdminAccess') setHasAdminAccess(e.newValue === '1');
      if (e.key === 'adminRawRoleHint') setRoleRaw(e.newValue || '');
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const parseTtlToMs = (ttl) => {
    if (!ttl) return 30 * 60000; // default 30m
    const m = String(ttl).match(/(\d+)([smhd])/i);
    if (!m) return 30 * 60000;
    const v = parseInt(m[1], 10);
    const u = m[2].toLowerCase();
    return v * (u === 's' ? 1000 : u === 'm' ? 60000 : u === 'h' ? 3600000 : 86400000);
  };

  const clearUserSessionAndRedirect = useCallback(() => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('tokenExpiresAt');
    } catch {}
    navigate('/');
  }, [navigate]);

  const elevate = useCallback(async ({ redirect = false } = {}) => {
    setError('');
    if (elevating) return; // de-dupe rapid clicks
    setElevating(true);
    try {
      const userToken = localStorage.getItem('token');
      if (!userToken) {
        setError('Session expired. Please log in.');
        clearUserSessionAndRedirect();
        return false;
      }
      const res = await fetch('/api/admin/elevate-from-user', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}` }
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        // User token invalid/expired
        setError(data.message || 'User session expired. Please log in again.');
        clearUserSessionAndRedirect();
        return false;
      }
      if (!res.ok) {
        setError(data.message || 'Elevation failed');
        return false;
      }
      if (data.adminToken) {
        localStorage.setItem('adminToken', data.adminToken);
        setAdminToken(data.adminToken);
      }
      if (data.refreshToken) localStorage.setItem('adminRefreshToken', data.refreshToken);
      if (data.accessTtl) {
        try { localStorage.setItem('adminTokenExpiresAt', String(Date.now() + parseTtlToMs(data.accessTtl))); } catch {}
      }
      if (data.admin) {
        localStorage.setItem('adminUser', JSON.stringify(data.admin));
        if (data.admin.role) {
          // Some responses give short form; if so convert to raw-like for consistency? We'll store directly.
          localStorage.setItem('adminRawRoleHint', data.admin.role);
          setRoleRaw(data.admin.role);
        }
      }
      if (redirect) navigate('/admin');
      return true;
    } catch (e) {
      setError(e.message || 'Network error during elevation');
      return false;
    } finally {
      setElevating(false);
    }
  }, [clearUserSessionAndRedirect, elevating, navigate]);

  // Auto-expiry watcher: if token expiry passes, clear admin token (user stays logged in) so UI can re-elevate.
  useEffect(() => {
    const interval = setInterval(() => {
      const expStr = localStorage.getItem('adminTokenExpiresAt');
      if (!expStr) return;
      const exp = parseInt(expStr, 10);
      if (exp && Date.now() > exp && !invalidatedRef.current) {
        invalidatedRef.current = true;
        localStorage.removeItem('adminToken');
        setAdminToken('');
        setTimeout(() => { invalidatedRef.current = false; }, 1500);
      }
      // Detect manual removal of token (e.g., refresh button) and sync state
      const lt = localStorage.getItem('adminToken');
      if (!lt && adminToken) {
        setAdminToken('');
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [adminToken]);

  // Also sync on window focus for faster test + UX feedback.
  useEffect(() => {
    const handleFocus = () => {
      const lt = localStorage.getItem('adminToken');
      if (!lt && adminToken) setAdminToken('');
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [adminToken]);

  return {
    hasAdminAccess,
    adminToken,
    roleAbbrev,
    elevating,
    error,
    elevate,
    // Convenience: elevate and redirect to admin
    elevateAndGo: () => elevate({ redirect: true })
  };
}

export default useAdminSession;
