import { useEffect, useRef } from 'react';

// Idle monitoring: if no user interaction for 15 minutes, clear tokens & redirect to login
// Also proactively refresh access token 60s before expiry using stored timestamps.

const IDLE_LIMIT_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_EARLY_MS = 60 * 1000; // refresh 1 minute before expiry

function IdleSessionMonitor() {
  const lastActivityRef = useRef(Date.now());
  const timeoutRef = useRef(null);
  const refreshTimerRef = useRef(null);

  function markActivity() {
    lastActivityRef.current = Date.now();
  }

  function scheduleIdleCheckFactory(timeoutRef, lastActivityRef) {
    return function scheduleIdleCheck() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_LIMIT_MS) {
        try { localStorage.removeItem('token'); localStorage.removeItem('refreshToken'); } catch {}
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
      } else {
          scheduleIdleCheck();
      }
    }, 60 * 1000); // check every minute
    };
  }

  async function attemptRefresh() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return; // nothing to refresh with
    // Access token expiry tracking stored in ms epoch at 'tokenExpiresAt'
    try {
      const res = await fetch('/api/auth/refresh', { method:'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ refreshToken }) });
      if (!res.ok) throw new Error('Refresh failed');
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('token', data.token);
        if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
        if (data.accessExpiresInMs) {
          const expiresAt = Date.now() + data.accessExpiresInMs;
          localStorage.setItem('tokenExpiresAt', String(expiresAt));
          // refresh scheduling will be re-established on next mount / manual action
        }
      }
    } catch (e) {
      // On refresh failure, force logout
      try { localStorage.removeItem('token'); localStorage.removeItem('refreshToken'); } catch {}
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
  }

  // scheduleRefresh inlined inside effect to avoid dependency churn

  useEffect(() => {
    const scheduleIdleCheck = scheduleIdleCheckFactory(timeoutRef, lastActivityRef);
    const events = ['mousemove','mousedown','keydown','scroll','touchstart'];
    events.forEach(ev => window.addEventListener(ev, markActivity));
    scheduleIdleCheck();
  function scheduleRefresh(accessExpiresAt) {
      if (!accessExpiresAt) return;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      const delay = Math.max(5000, accessExpiresAt - Date.now() - REFRESH_EARLY_MS);
      refreshTimerRef.current = setTimeout(() => { attemptRefresh(); }, delay);
    }
    const storedExp = parseInt(localStorage.getItem('tokenExpiresAt')||'0',10);
    if (storedExp > Date.now()) scheduleRefresh(storedExp);
    const timeoutSnapshot = timeoutRef.current;
    const refreshSnapshot = refreshTimerRef.current;
    return () => {
      events.forEach(ev => window.removeEventListener(ev, markActivity));
      if (timeoutSnapshot) clearTimeout(timeoutSnapshot);
      if (refreshSnapshot) clearTimeout(refreshSnapshot);
    };
  }, []); // run once

  return null;
}

export default IdleSessionMonitor;