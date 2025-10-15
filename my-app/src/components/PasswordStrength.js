import React from 'react';

const PasswordStrength = ({ password, small = false }) => {
  if (!password) return null;
  const tests = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password)
  };
  const passed = Object.values(tests).filter(Boolean).length;
  const percent = (passed / 5) * 100;
  const barColor = percent < 40 ? '#dc3545' : percent < 80 ? '#ffc107' : '#28a745';
  return (
    <div className={small ? 'mt-1' : 'mt-2'}>
      <div className="progress" style={{ height: small ? '4px' : '6px' }}>
        <div className="progress-bar" role="progressbar" style={{ width: `${percent}%`, background: barColor }} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} />
      </div>
      <small className="text-muted d-block mt-1">
        {tests.length ? '✓' : '✗'} 8+ | {tests.upper ? '✓' : '✗'} Upper | {tests.lower ? '✓' : '✗'} Lower | {tests.number ? '✓' : '✗'} Number | {tests.symbol ? '✓' : '✗'} Symbol
      </small>
    </div>
  );
};

export default PasswordStrength;
