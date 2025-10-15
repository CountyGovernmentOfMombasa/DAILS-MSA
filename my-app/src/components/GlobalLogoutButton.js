import React, { useEffect, useState } from 'react';
import { Button, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import './animations.css';

// Appears on all authenticated pages (token present) except public auth routes
// Provides a consistent logout action using context logout helper
export default function GlobalLogoutButton() {
  const { logout } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const publicPaths = ['/', '/change-password'];
  if (!token || publicPaths.includes(location.pathname)) return null;

  const handleClick = () => {
    logout();
    navigate('/');
  };

  return (
    <OverlayTrigger placement="left" overlay={<Tooltip id="logout-tip">Logout</Tooltip>}>
      <Button
        variant="outline-danger"
        size="sm"
        onClick={handleClick}
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 1050,
          borderRadius: '20px'
        }}
        aria-label="Logout"
        className={`logout-fab ${show ? 'visible' : ''}`}
      >
        <i className="fas fa-sign-out-alt" />
      </Button>
    </OverlayTrigger>
  );
}
