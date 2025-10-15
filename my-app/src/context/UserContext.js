import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

// Lightweight in-memory user/profile cache (per tab). Avoids repeated /api/auth/me fetches.
// If token changes, profile is re-fetched automatically.

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastErrorAt, setLastErrorAt] = useState(null);
  const [tokenSnapshot, setTokenSnapshot] = useState(() => localStorage.getItem('token'));

  // Guard to avoid parallel refresh storms
  const refreshingRef = useRef(false);

  const attemptRefresh = async () => {
    if (refreshingRef.current) return false;
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;
    try {
      refreshingRef.current = true;
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('token', data.token);
        if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
        if (data.accessExpiresInMs) {
          localStorage.setItem('tokenExpiresAt', String(Date.now() + data.accessExpiresInMs));
        }
        return true;
      }
      return false;
    } catch (e) {
      return false;
    } finally {
      refreshingRef.current = false;
    }
  };

  // Avoid concurrent overlapping fetchProfile calls
  const inFlightRef = useRef(false);

  const safeLogoutRedirect = () => {
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('tokenExpiresAt');
    } catch {}
    setProfile(null);
    setTokenSnapshot(null);
    if (!window.location.pathname.startsWith('/login')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
  };

  const fetchProfile = useCallback(async () => {
    if (inFlightRef.current) return; // collapse into single flight
    inFlightRef.current = true;
    const token = localStorage.getItem('token');
    if (!token) {
      setProfile(null);
      inFlightRef.current = false;
      return;
    }
    // If we already loaded for this token, skip unless forced.
    if (profile && token === tokenSnapshot) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        // Try a single silent refresh then retry once.
        const refreshed = await attemptRefresh();
        if (refreshed) {
          const newToken = localStorage.getItem('token');
          if (newToken) {
            const retry = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${newToken}` } });
            if (!retry.ok) throw new Error(`Profile fetch failed after refresh: ${retry.status}`);
            const data2 = await retry.json();
            setProfile(data2);
            setTokenSnapshot(newToken);
            inFlightRef.current = false;
            return;
          }
        }
        // Refresh failed -> force logout/redirect
        safeLogoutRedirect();
        throw new Error('Profile fetch failed: 401 (refresh failed)');
      }
      if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
      const data = await res.json();
      setProfile(data);
      setTokenSnapshot(token);
    } catch (e) {
      setError(e.message);
      setLastErrorAt(Date.now());
      // profile already cleared on logout scenario above; only clear if still present
      if (e.message && !/refresh failed/.test(e.message)) {
        setProfile(null);
      }
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [profile, tokenSnapshot]);

  // Initial load
  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Listen for token changes across tabs/windows via storage events
  useEffect(() => {
    function handleStorage(e) {
      if (e.key === 'token') {
        setTokenSnapshot(e.newValue);
        setProfile(null); // force refetch for new token
        fetchProfile();
      }
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [fetchProfile]);

  const refreshProfile = useCallback(() => {
    setProfile(null);
    fetchProfile();
  }, [fetchProfile]);

  const logout = useCallback(() => {
    try { localStorage.removeItem('token'); localStorage.removeItem('refreshToken'); localStorage.removeItem('tokenExpiresAt'); } catch (_) { /* ignore */ }
    setProfile(null);
    setTokenSnapshot(null);
  }, []);

  return (
    <UserContext.Provider value={{ profile, loading, error, lastErrorAt, refreshProfile, setProfile, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
