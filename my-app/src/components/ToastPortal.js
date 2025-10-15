import React from 'react';

// Generic portal-ish toast container (simple fixed positioning) to reuse across app.
// Accepts an array of { id, message, variant } items.
export default function ToastPortal({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;
  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 2000, maxWidth: 360 }}>
      {toasts.map(t => (
        <div key={t.id} className={`toast show text-bg-${t.variant || 'primary'} mb-2`} role="status" aria-live="assertive" aria-atomic="true">
          <div className="d-flex">
            <div className="toast-body small">{t.message}</div>
            <button
              type="button"
              className="btn-close btn-close-white me-2 m-auto"
              aria-label="Close"
              onClick={() => onDismiss && onDismiss(t.id)}
            ></button>
          </div>
        </div>
      ))}
    </div>
  );
}
