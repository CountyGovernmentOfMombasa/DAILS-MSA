import React from 'react';
import { useNavigate } from 'react-router-dom';

const LandingPageButton = ({ className = '', children = 'Return to Landing Page' }) => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={`btn btn-sm btn-outline-secondary ${className}`.trim()}
      onClick={() => navigate('/landing')}
      aria-label="Return to landing page"
    >
      {children}
    </button>
  );
};

export default LandingPageButton;