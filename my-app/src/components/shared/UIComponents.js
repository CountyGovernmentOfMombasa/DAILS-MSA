import React from 'react';

// Reusable Button Components
export const PrimaryButton = ({ children, onClick, type = "button", disabled = false, className = "" }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`btn btn-blue ${disabled ? 'disabled' : ''} ${className}`}
  >
    {children}
  </button>
);

export const SecondaryButton = ({ children, onClick, type = "button", disabled = false, className = "" }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`btn btn-outline-secondary ${className}`}
  >
    {children}
  </button>
);

export const GreenButton = ({ children, onClick, type = "button", disabled = false, className = "" }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`btn btn-green ${disabled ? 'disabled' : ''} ${className}`}
  >
    {children}
  </button>
);

// Reusable Input Component
export const FormInput = ({ label, type = "text", name, value, onChange, required = false, placeholder = "", className = "" }) => (
  <div className={`mb-3 ${className}`}>
    <label className="form-label">
      {label}
    </label>
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      className="form-input form-control"
    />
  </div>
);

// Reusable Select Component
export const FormSelect = ({ label, name, value, onChange, options, required = false, className = "" }) => (
  <div className={`mb-3 ${className}`}>
    <label className="form-label">
      {label}
    </label>
    <select
      name={name}
      value={value}
      onChange={onChange}
      required={required}
      className="form-select form-control"
    >
      <option value="">Select {label.toLowerCase()}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </div>
);

// Reusable Card Component
export const FormCard = ({ children, title, subtitle, step }) => (
  <div className="card card-blue">
    <div className="text-center mb-4">
      <div className="icon-container-mixed mx-auto mb-3">
        <svg className="text-white" style={{width: '2rem', height: '2rem'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h2 className="h2 fw-bold text-dark mb-2">{title}</h2>
      {subtitle && <p className="text-muted">{subtitle}</p>}
      {step && <p className="text-muted">{step}</p>}
    </div>
    {children}
  </div>
);

// Loading Spinner Component
export const LoadingSpinner = ({ size = "md" }) => {
  const sizeClasses = {
    sm: "16px",
    md: "32px",
    lg: "48px"
  };

  return (
    <div className="d-flex align-items-center justify-content-center">
      <div 
        className="spinner-border text-primary" 
        role="status"
        style={{width: sizeClasses[size], height: sizeClasses[size]}}
      >
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );
};

// Error Message Component
export const ErrorMessage = ({ message }) => (
  <div className="alert alert-danger rounded-xl">
    {message}
  </div>
);

// Success Message Component
export const SuccessMessage = ({ message }) => (
  <div className="alert alert-success rounded-xl">
    {message}
  </div>
);
