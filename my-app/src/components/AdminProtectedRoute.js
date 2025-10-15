import React, { useState, useEffect, useRef } from 'react';
import useAdminSession from '../hooks/useAdminSession';
import ToastPortal from './ToastPortal';

// Enhanced: integrates useAdminSession for automatic elevation & silent refresh.
// Shows a toast when admin token is silently refreshed or elevated.
const AdminProtectedRoute = ({ children }) => {
  const { hasAdminAccess, adminToken, elevate, elevating } = useAdminSession();
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [adminUser, setAdminUser] = useState(null);
  const [toasts, setToasts] = useState([]);
  const attemptedRefreshRef = useRef(false);

  useEffect(() => {
    checkAdminAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pushToast = (message, variant='primary') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, variant }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };
  const dismissToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  const verifyWithToken = async (token) => {
    try {
      const response = await fetch('/api/admin/verify', { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) {
        const currentAdmin = localStorage.getItem('adminUser');
        if (currentAdmin) setAdminUser(JSON.parse(currentAdmin));
        setIsAdminAuthenticated(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const checkAdminAuth = async () => {
    const storedAdmin = localStorage.getItem('adminUser');
    const token = localStorage.getItem('adminToken');
    if (token && storedAdmin) {
      const ok = await verifyWithToken(token);
      if (ok) {
        setIsLoading(false);
        return;
      }
    }
    // If verify failed or no token: attempt elevation if user has admin access.
    if (hasAdminAccess) {
      const success = await elevate({ redirect: false });
      if (success) {
        const newTok = localStorage.getItem('adminToken');
        if (newTok) {
          const verified = await verifyWithToken(newTok);
          if (verified) pushToast('Admin session started');
        }
      }
    }
    setIsLoading(false);
  };

  // Watch for token loss (expiry) then re-elevate once.
  useEffect(() => {
    if (!isLoading && hasAdminAccess && !adminToken && !elevating && isAdminAuthenticated) {
      if (!attemptedRefreshRef.current) {
        attemptedRefreshRef.current = true;
        elevate({ redirect: false }).then((ok) => {
          if (ok) {
            pushToast('Admin session refreshed');
            verifyWithToken(localStorage.getItem('adminToken') || '');
          }
          setTimeout(() => { attemptedRefreshRef.current = false; }, 5000);
        });
      }
    }
  }, [adminToken, elevating, hasAdminAccess, isAdminAuthenticated, isLoading, elevate]);

  const handleAdminLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    setIsAdminAuthenticated(false);
    setAdminUser(null);
    pushToast('Admin session ended', 'secondary');
  };

  if (isLoading) {
    return (
      <div className="min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="text-muted">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdminAuthenticated) {
    return <><ToastPortal toasts={toasts} onDismiss={dismissToast} /></>;
  }

  // Support function-as-children for dynamic dashboards. Avoid injecting custom props
  // into plain DOM nodes (would trigger React unknown prop warnings in tests & console).
  const childProps = { adminUser, onAdminLogout: handleAdminLogout };
  let content;
  if (typeof children === 'function') {
    content = children(childProps);
  } else if (React.isValidElement(children) && typeof children.type === 'string') {
    // DOM element (e.g., <div/>): render as-is, do not clone with extra props
    content = children;
  } else if (React.isValidElement(children)) {
    // Likely a custom component: safe to inject admin props
    content = React.cloneElement(children, childProps);
  } else {
    content = children;
  }

  return <>{content}<ToastPortal toasts={toasts} onDismiss={dismissToast} /></>;
};

export default AdminProtectedRoute;