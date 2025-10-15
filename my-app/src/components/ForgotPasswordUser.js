import React, { useState } from 'react';
import PasswordStrength from './PasswordStrength';

const ForgotPasswordUser = () => {
  const [nationalId, setNationalId] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [stage, setStage] = useState('request'); // request -> verify -> reset
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState({ new: false, confirm: false });

  const requestCode = async () => {
    setError(''); setMessage('');
    if (!nationalId.trim()) { setError('Enter your National ID'); return; }
    setLoading(true);
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nationalId: nationalId.trim() })
      });
  setStage('verify');
      setMessage('If the account exists, a reset code was sent via SMS.');
    } catch (e) { setError('Failed to request code'); }
    finally { setLoading(false); }
  };

  const verifyCode = async () => {
    setError(''); setMessage('');
    if (!code.match(/^\d{6}$/)) { setError('Enter the 6-digit code'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nationalId: nationalId.trim(), code })
      });
      const data = await res.json();
      if (res.ok && data.success) { setToken(data.token); setStage('reset'); setMessage('Code verified. Set a new password.'); }
      else setError(data.message || 'Invalid code');
    } catch { setError('Verify failed'); }
    finally { setLoading(false); }
  };

  const resetPassword = async () => {
    setError(''); setMessage('');
    if (!newPassword || newPassword !== confirmPassword) { setError('Passwords must match'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password/reset', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ newPassword })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage('Password reset successful. You can now login.');
        setStage('done');
      } else setError(data.message || 'Reset failed');
    } catch { setError('Reset failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="card mt-3">
      <div className="card-header"><strong>Forgot Password</strong></div>
      <div className="card-body">
        {message && <div className="alert alert-success py-2">{message}</div>}
        {error && <div className="alert alert-danger py-2">{error}</div>}
        {stage === 'request' && (
          <div>
            <div className="mb-2">
              <label className="form-label small">National ID</label>
              <input className="form-control" value={nationalId} onChange={e => setNationalId(e.target.value)} />
            </div>
            <button className="btn btn-primary w-100" disabled={loading || !nationalId.trim()} onClick={requestCode}>{loading ? 'Sending...' : 'Send Reset Code'}</button>
          </div>
        )}
        {stage === 'verify' && (
          <div>
            <p className="small text-muted">Enter the 6-digit code sent to your registered phone.</p>
            <input className="form-control mb-2" placeholder="123456" value={code} onChange={e => setCode(e.target.value)} />
            <div className="d-flex gap-2">
              <button className="btn btn-secondary w-50" disabled={loading} onClick={() => setStage('request')}>Back</button>
              <button className="btn btn-primary w-50" disabled={loading || !code} onClick={verifyCode}>{loading ? 'Verifying...' : 'Verify Code'}</button>
            </div>
          </div>
        )}
        {stage === 'reset' && (
          <div>
            <div className="mb-2 position-relative">
              <label className="form-label small">New Password</label>
              <input
                type={show.new ? 'text' : 'password'}
                className="form-control pe-5"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                aria-label="New password"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm position-absolute top-50 end-0 translate-middle-y me-2"
                onClick={() => setShow(s => ({ ...s, new: !s.new }))}
                aria-label={show.new ? 'Hide new password' : 'Show new password'}
              >
                <i className={`fas ${show.new ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
            <PasswordStrength password={newPassword} />
            <div className="mb-2 position-relative">
              <label className="form-label small">Confirm Password</label>
              <input
                type={show.confirm ? 'text' : 'password'}
                className="form-control pe-5"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                aria-label="Confirm new password"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm position-absolute top-50 end-0 translate-middle-y me-2"
                onClick={() => setShow(s => ({ ...s, confirm: !s.confirm }))}
                aria-label={show.confirm ? 'Hide confirm password' : 'Show confirm password'}
              >
                <i className={`fas ${show.confirm ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
            <button className="btn btn-success w-100" disabled={loading} onClick={resetPassword}>{loading ? 'Resetting...' : 'Reset Password'}</button>
          </div>
        )}
        {stage === 'done' && (
          <div className="text-center text-success">
            <i className="bi bi-check-circle display-4" />
            <p className="mt-2">You can close this and login now.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordUser;
