import { useEffect, useRef } from 'react';

// Admin session monitor: shorter access token, refresh a minute early, idle logout (15m)
const IDLE_LIMIT_MS = 15 * 60 * 1000;
const REFRESH_EARLY_MS = 60 * 1000;

export default function AdminSessionMonitor() {
  const lastActivity = useRef(Date.now());
  const idleTimer = useRef(null);
  const refreshTimer = useRef(null);

  function mark() { lastActivity.current = Date.now(); }

  function forceLogout() {
    try { localStorage.removeItem('adminToken'); localStorage.removeItem('adminRefreshToken'); localStorage.removeItem('adminTokenExpiresAt'); localStorage.removeItem('adminUser'); } catch {}
    if (!window.location.pathname.startsWith('/admin')) return; // stay if not on admin page
    window.location.href = '/admin-access';
  }

  useEffect(() => {
    async function attemptRefreshLocal() {
      const refreshToken = localStorage.getItem('adminRefreshToken');
      if (!refreshToken) return;
      try {
        const res = await fetch('/api/admin/refresh', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ refreshToken }) });
        if (!res.ok) throw new Error('Refresh failed');
        const data = await res.json();
        if (data.adminToken) {
          localStorage.setItem('adminToken', data.adminToken);
          if (data.refreshToken) localStorage.setItem('adminRefreshToken', data.refreshToken);
          if (data.accessTtl) {
            const m = String(data.accessTtl).match(/(\d+)([smhd])/i);
            let ttlMs = 30*60000;
            if (m) {
              const v = parseInt(m[1],10); const u = m[2].toLowerCase();
              ttlMs = v * (u==='s'?1000:u==='m'?60000:u==='h'?3600000:86400000);
            }
            localStorage.setItem('adminTokenExpiresAt', String(Date.now() + ttlMs));
            scheduleRefresh();
          }
        }
      } catch (e) {
        console.warn('Admin token refresh failed:', e.message);
        forceLogout();
      }
    }
    function scheduleIdleCheck() {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        if (Date.now() - lastActivity.current >= IDLE_LIMIT_MS) {
          forceLogout();
        } else {
          scheduleIdleCheck();
        }
      }, 60000);
    }
    function scheduleRefresh() {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      const exp = parseInt(localStorage.getItem('adminTokenExpiresAt')||'0',10);
      if (!exp) return;
      const delay = Math.max(5000, exp - Date.now() - REFRESH_EARLY_MS);
      refreshTimer.current = setTimeout(() => attemptRefreshLocal(), delay);
    }
    const events = ['mousemove','mousedown','keydown','scroll','touchstart'];
    events.forEach(e=>window.addEventListener(e, mark));
    scheduleIdleCheck();
    scheduleRefresh();
    return () => {
      events.forEach(e=>window.removeEventListener(e, mark));
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  return null;
}