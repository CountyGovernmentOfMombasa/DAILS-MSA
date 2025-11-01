import React, { useEffect, useMemo, useState } from 'react';
import { sendBulkSMS, getBulkSmsAudit } from '../api';

// Shared Bulk SMS panel for Admin and IT Admin dashboards
// Props: { itAdmin?: boolean }
const BulkSMSPanel = ({ itAdmin = false }) => {
  const [departments, setDepartments] = useState([]);
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [status, setStatus] = useState(''); // '', 'pending', 'approved', 'rejected'
  const [includeNoDeclaration, setIncludeNoDeclaration] = useState(false);
  const [userIdsText, setUserIdsText] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // Audit table state
  const [audit, setAudit] = useState({ data: [], page: 1, limit: 20, total: 0, pages: 0 });
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditFilters, setAuditFilters] = useState({ adminUsername: '', role: '', from: '', to: '' });

  // Load departments once
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const resp = await fetch('/api/admin/users/departments/distinct', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken') || ''}` }
        });
        if (!resp.ok) return; // silently ignore
        const data = await resp.json();
        let list = data.departments;
        if ((!list || list.length === 0) && Array.isArray(data.departmentStats)) {
          list = data.departmentStats.map(d => d.name);
        }
        setDepartments(Array.isArray(list) ? list : []);
      } catch {}
    };
    loadDepartments();
  }, []);

  const chars = message.length;
  const smsSegments = useMemo(() => {
    // Basic GSM-7 assumption. 160 chars per segment, 153 for concatenated. Keep simple estimate.
    if (chars <= 160) return 1;
    return Math.ceil(chars / 153);
  }, [chars]);

  const parseUserIds = () => {
    return userIdsText
      .split(/[\s,;]+/)
      .map(t => parseInt(t, 10))
      .filter(n => !isNaN(n));
  };

  const doPreview = async () => {
    try {
      setError('');
      setSending(true);
      const data = await sendBulkSMS({
        message,
        userIds: parseUserIds(),
        departments: selectedDepartments,
        status: status || undefined,
        includeNoDeclaration: !!includeNoDeclaration,
        dryRun: true,
        itAdmin
      });
      setPreview(data);
    } catch (e) {
      setError(e.message || 'Preview failed');
      setPreview(null);
    } finally {
      setSending(false);
    }
  };

  const doSend = async () => {
    if (!message.trim()) {
      setError('Please enter a message.');
      return;
    }
    try {
      setError('');
      setSending(true);
      const data = await sendBulkSMS({
        message,
        userIds: parseUserIds(),
        departments: selectedDepartments,
        status: status || undefined,
        includeNoDeclaration: !!includeNoDeclaration,
        dryRun: false,
        itAdmin
      });
      setPreview(data);
      // Refresh audit on successful send
      try { await loadAudit(audit.page, audit.limit, auditFilters); } catch {}
    } catch (e) {
      setError(e.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const toggleDepartment = (dep) => {
    setSelectedDepartments(prev => prev.includes(dep) ? prev.filter(d => d !== dep) : [...prev, dep]);
  };

  // Load audit with current filters and pagination
  const loadAudit = async (page = 1, limit = 20, filters = auditFilters) => {
    try {
      setAuditError('');
      setAuditLoading(true);
      const resp = await getBulkSmsAudit({ page, limit, ...filters, itAdmin });
      setAudit({ data: resp.data || [], page: resp.page, limit: resp.limit, total: resp.total, pages: resp.pages });
    } catch (e) {
      setAuditError(e.message || 'Failed to load audit');
    } finally {
      setAuditLoading(false);
    }
  };

  // Initial audit load
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAudit(1, audit.limit, auditFilters); }, []);

  const onAuditFilterChange = (patch) => setAuditFilters(prev => ({ ...prev, ...patch }));
  const applyAuditFilters = () => loadAudit(1, audit.limit, auditFilters);
  const clearAuditFilters = () => { const base = { adminUsername: '', role: '', from: '', to: '' }; setAuditFilters(base); loadAudit(1, audit.limit, base); };
  const setAuditPage = (p) => loadAudit(p, audit.limit, auditFilters);

  return (
    <>
    <div className="container-fluid py-3">
      <div className="card shadow-sm">
        <div className="card-header bg-dark text-white d-flex align-items-center justify-content-between">
          <h5 className="mb-0"><i className="bi bi-chat-dots me-2"></i>Bulk SMS</h5>
          <span className="small">Compose and send SMS to users with phone numbers</span>
        </div>
        <div className="card-body">
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="row g-3">
            <div className="col-lg-8">
              <label className="form-label fw-semibold">Message</label>
              <textarea className="form-control" rows={5} maxLength={480} value={message} onChange={e => setMessage(e.target.value)} placeholder="Type the SMS message to send..." />
              <div className="d-flex justify-content-between mt-2 small text-muted">
                <span>Characters: {chars} / 480</span>
                <span>Estimated segments: {smsSegments}</span>
              </div>
            </div>
            <div className="col-lg-4">
              <div className="mb-3">
                <label className="form-label fw-semibold">Filter by Status</label>
                <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="">All with phone</option>
                  <option value="pending">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Requesting Clarification</option>
                </select>
                <div className="form-check mt-2">
                  <input className="form-check-input" type="checkbox" id="includeNoDecl" checked={includeNoDeclaration} onChange={e => setIncludeNoDeclaration(e.target.checked)} disabled={!!status} />
                  <label htmlFor="includeNoDecl" className="form-check-label">Include users without any declaration</label>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label fw-semibold">Departments</label>
                <div className="border rounded p-2" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {departments.length === 0 && <div className="text-muted small">No departments available</div>}
                  {departments.map(dep => (
                    <div className="form-check" key={dep}>
                      <input className="form-check-input" type="checkbox" id={`dep-${dep}`} checked={selectedDepartments.includes(dep)} onChange={() => toggleDepartment(dep)} />
                      <label className="form-check-label" htmlFor={`dep-${dep}`}>{dep}</label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label fw-semibold">Specific User IDs (optional)</label>
                <input type="text" className="form-control" placeholder="e.g. 12, 34, 56" value={userIdsText} onChange={e => setUserIdsText(e.target.value)} />
                <div className="form-text">Comma or space separated</div>
              </div>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-secondary" disabled={sending || !message.trim()} onClick={doPreview}>
                  <i className="bi bi-eye me-1"></i> Preview (Dry Run)
                </button>
                <button className="btn btn-primary" disabled={sending || !message.trim()} onClick={doSend}>
                  <i className="bi bi-send me-1"></i> Send SMS
                </button>
              </div>
            </div>
          </div>

          {preview && (
            <div className="alert alert-info mt-4">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0">Result</h6>
                {preview.dryRun ? <span className="badge bg-secondary">Dry Run</span> : <span className="badge bg-success">Sent</span>}
              </div>
              <div className="row">
                <div className="col-md-4"><strong>Total Recipients:</strong> {preview.totalRecipients}</div>
                {'sent' in preview && <div className="col-md-4"><strong>Sent (ok):</strong> {preview.sent}</div>}
                {'chunks' in preview && <div className="col-md-4"><strong>Chunks:</strong> {preview.chunks}</div>}
              </div>
              {Array.isArray(preview.sample) && preview.sample.length > 0 && (
                <div className="mt-2"><strong>Sample:</strong> <code>{preview.sample.join(', ')}</code></div>
              )}
              {Array.isArray(preview.results) && preview.results.length > 0 && (
                <div className="mt-3">
                  <div className="fw-semibold mb-1">Chunk Results</div>
                  <ul className="mb-0">
                    {preview.results.map((r, idx) => (
                      <li key={idx} className={r.ok ? 'text-success' : 'text-danger'}>
                        {r.ok ? 'OK' : 'FAIL'} — {r.count} recipients{!r.ok && r.error ? `: ${r.error}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
  </div>
  <div className="card shadow-sm mt-4">
      <div className="card-header bg-light d-flex justify-content-between align-items-center">
        <h6 className="mb-0"><i className="bi bi-clipboard2-data me-2"></i>Bulk SMS Audit</h6>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => loadAudit(audit.page, audit.limit, auditFilters)} disabled={auditLoading}>Refresh</button>
        </div>
      </div>
      <div className="card-body">
        {/* Filters */}
        <div className="row g-2 mb-3">
          <div className="col-md-3">
            <input className="form-control" placeholder="Admin username" value={auditFilters.adminUsername} onChange={e => onAuditFilterChange({ adminUsername: e.target.value })} />
          </div>
          <div className="col-md-3">
            <select className="form-select" value={auditFilters.role} onChange={e => onAuditFilterChange({ role: e.target.value })}>
              <option value="">All roles</option>
              <option value="super">Super</option>
              <option value="it_admin">IT Admin</option>
              <option value="hr_admin">HR Admin</option>
            </select>
          </div>
          <div className="col-md-2">
            <input type="date" className="form-control" value={auditFilters.from} onChange={e => onAuditFilterChange({ from: e.target.value })} />
          </div>
          <div className="col-md-2">
            <input type="date" className="form-control" value={auditFilters.to} onChange={e => onAuditFilterChange({ to: e.target.value })} />
          </div>
          <div className="col-md-2 d-flex gap-2">
            <button className="btn btn-primary w-50" onClick={applyAuditFilters} disabled={auditLoading}>Apply</button>
            <button className="btn btn-outline-secondary w-50" onClick={clearAuditFilters} disabled={auditLoading}>Clear</button>
          </div>
        </div>

        {auditError && <div className="alert alert-danger">{auditError}</div>}
        {auditLoading && <div>Loading...</div>}
        {!auditLoading && !auditError && (
          <div className="table-responsive">
            <table className="table table-sm table-striped">
              <thead className="table-light">
                <tr>
                  <th>When</th>
                  <th>Admin</th>
                  <th>Role</th>
                  <th>Path</th>
                  <th>Total</th>
                  <th>Sent OK</th>
                  <th>Chunks</th>
                  <th>Failed</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.length === 0 && (
                  <tr><td colSpan="8" className="text-muted">No audit records</td></tr>
                )}
                {audit.data.map(row => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                    <td>{row.admin_username || '—'}</td>
                    <td>{row.admin_role || '—'}</td>
                    <td className="text-truncate" style={{maxWidth: 160}}>{row.api_path}</td>
                    <td>{row.total_recipients}</td>
                    <td>{row.sent_ok}</td>
                    <td>{row.chunks}</td>
                    <td className={row.failed_chunks ? 'text-danger' : ''}>{row.failed_chunks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Pagination */}
        {!auditLoading && audit.pages > 1 && (
          <div className="d-flex justify-content-between align-items-center mt-2">
            <div className="small text-muted">Page {audit.page} of {audit.pages} • {audit.total} total</div>
            <div className="btn-group">
              <button className="btn btn-sm btn-outline-secondary" disabled={audit.page <= 1} onClick={() => setAuditPage(audit.page - 1)}>Prev</button>
              <button className="btn btn-sm btn-outline-secondary" disabled={audit.page >= audit.pages} onClick={() => setAuditPage(audit.page + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
};

export default BulkSMSPanel;
