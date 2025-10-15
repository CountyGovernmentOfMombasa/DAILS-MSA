import React, { useEffect, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

// Utility: safe date formatting
function fmt(dt) {
  try { return new Date(dt).toLocaleString(); } catch { return dt || ''; }
}

// Columns captured: ID, Declaration ID, National ID, User Full Name, Previous Status, New Status, Correction (prev/new), Admin Username, Changed At.
// Backend now stores user_full_name & national_id snapshots inside declaration_status_audit.

const PAGE_LIMIT_DEFAULT = 25;

function StatusAuditModule({ adminToken, isSuper }) {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(PAGE_LIMIT_DEFAULT);
  const [filters, setFilters] = useState({ status: '', admin: '', national_id: '', from: '', to: '' });
  // Drill-down state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailDeclaration, setDetailDeclaration] = useState(null);
  const [detailAudit, setDetailAudit] = useState([]);
  const [detailAuditLoading, setDetailAuditLoading] = useState(false);

  const fetchAudit = useCallback(async (targetPage = 1) => {
    if (!isSuper) return;
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams();
      qs.set('page', targetPage.toString());
      qs.set('limit', limit.toString());
      if (filters.status) qs.set('status', filters.status);
      if (filters.admin) qs.set('admin', filters.admin);
      if (filters.national_id) qs.set('national_id', filters.national_id);
      if (filters.from) qs.set('from', filters.from);
      if (filters.to) qs.set('to', filters.to);
  const res = await fetch(`/api/admin/declarations/status-audit/global?${qs.toString()}`, { headers: { 'Authorization': `Bearer ${adminToken}` }});
      if (!res.ok) throw new Error('Failed to fetch status audit');
      const data = await res.json();
      if (data.success) {
        setRows(data.data || []);
        setPage(data.page || targetPage);
        setPages(data.pages || 1);
        setTotal(data.total || 0);
      } else {
        setError(data.message || 'Unknown error');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [adminToken, filters, limit, isSuper]);

  useEffect(() => { if (isSuper) fetchAudit(1); }, [fetchAudit, isSuper]);

  const resetFilters = () => { setFilters({ status: '', admin: '', national_id: '', from: '', to: '' }); setPage(1); };

  // Export current filtered rows to Excel
  const exportExcel = () => {
    if (!rows.length) return;
    const data = rows.map(r => ({
      ID: r.id,
      DeclarationID: r.declaration_id,
      NationalID: r.national_id || '',
      UserName: r.user_full_name || '',
      PreviousStatus: r.previous_status === 'pending' ? 'Submitted' : (r.previous_status || ''),
      NewStatus: r.status === 'pending' ? 'Submitted' : (r.status || ''),
      PreviousCorrection: r.previous_correction_message || '',
      NewCorrection: r.new_correction_message || '',
      Admin: r.admin_username || '',
      ChangedAt: fmt(r.changed_at)
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'StatusAudit');
    XLSX.writeFile(wb, 'status_audit_export.xlsx');
  };

  // Drill-down: fetch declaration details + full audit history
  const openDetail = async (declarationId) => {
    setDetailOpen(true);
    setDetailError('');
    setDetailDeclaration(null);
    setDetailAudit([]);
    setDetailLoading(true);
    try {
      const declRes = await fetch(`/api/admin/declarations/${declarationId}`, { headers: { 'Authorization': `Bearer ${adminToken}` }});
      if (declRes.ok) {
        const declData = await declRes.json();
        if (declData.success) setDetailDeclaration(declData.data);
      } else {
        setDetailError('Failed to load declaration details');
      }
    } catch (e) { setDetailError(e.message); }
    finally { setDetailLoading(false); }
    // Audit history
    setDetailAuditLoading(true);
    try {
      const audRes = await fetch(`/api/admin/declarations/${declarationId}/status-audit?limit=100`, { headers: { 'Authorization': `Bearer ${adminToken}` }});
      if (audRes.ok) {
        const audData = await audRes.json();
        if (audData.success) setDetailAudit(audData.data || []);
      }
    } catch (e) { /* ignore */ }
    finally { setDetailAuditLoading(false); }
  };

  // Manage query param deep link (?declarationId=123)
  const setQueryParam = (id) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('declarationId', id); else url.searchParams.delete('declarationId');
    window.history.replaceState({}, '', url.toString());
  };

  const openDetailWithLink = (id) => {
    setQueryParam(id);
    openDetail(id);
  };

  const closeDetail = () => { setDetailOpen(false); setQueryParam(null); };

  // Auto-open if query param present
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const id = parseInt(sp.get('declarationId'), 10);
    if (id && !isNaN(id)) {
      openDetail(id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card shadow-sm">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h5 className="mb-0"><i className="bi bi-layers me-2"></i>Status Audit</h5>
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-sm btn-outline-primary" disabled={!rows.length || loading} onClick={exportExcel}>
            <i className="bi bi-file-earmark-excel me-1"/>Export
          </button>
          <div className="small text-muted">Total: {total}</div>
        </div>
      </div>
      <div className="card-body pb-2">
        <div className="row g-2 mb-3">
          <div className="col-auto">
            <label className="form-label mb-1 small">Status</label>
            <select className="form-select form-select-sm" value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(1); }}>
              <option value="">Any</option>
              <option value="pending">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
          <div className="col-auto">
            <label className="form-label mb-1 small">Admin</label>
            <input className="form-control form-control-sm" value={filters.admin} onChange={e => { setFilters(f => ({ ...f, admin: e.target.value })); setPage(1); }} placeholder="username" />
          </div>
          <div className="col-auto">
            <label className="form-label mb-1 small">National ID</label>
            <input className="form-control form-control-sm" value={filters.national_id} onChange={e => { setFilters(f => ({ ...f, national_id: e.target.value })); setPage(1); }} placeholder="ID" />
          </div>
          <div className="col-auto">
            <label className="form-label mb-1 small">From</label>
            <input type="date" className="form-control form-control-sm" value={filters.from} onChange={e => { setFilters(f => ({ ...f, from: e.target.value })); setPage(1); }} />
          </div>
            <div className="col-auto">
            <label className="form-label mb-1 small">To</label>
            <input type="date" className="form-control form-control-sm" value={filters.to} onChange={e => { setFilters(f => ({ ...f, to: e.target.value })); setPage(1); }} />
          </div>
          <div className="col-auto">
            <label className="form-label mb-1 small">Per Page</label>
            <select className="form-select form-select-sm" value={limit} onChange={e => { setLimit(parseInt(e.target.value) || PAGE_LIMIT_DEFAULT); setPage(1); }}>
              {[25,50,100,200].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="col-auto align-self-end">
            <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => fetchAudit(1)} disabled={loading}>Refresh</button>
            <button className="btn btn-sm btn-outline-secondary" onClick={resetFilters} disabled={loading}>Reset</button>
          </div>
        </div>
        {error && <div className="alert alert-danger py-1 small">{error}</div>}
        <div className="table-responsive" style={{ maxHeight: '55vh' }}>
          <table className="table table-sm table-hover align-middle">
            <thead className="table-light">
              <tr>
                <th>ID</th>
                <th>Declaration</th>
                <th>National ID</th>
                <th>User Name</th>
                <th>Prev → New</th>
                <th>Correction (New)</th>
                <th>Admin</th>
                <th>Changed At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-4"><div className="spinner-border spinner-border-sm" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-3 text-muted">No audit entries</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDetailWithLink(r.declaration_id)} title="Click for details">
                  <td>{r.id}</td>
                  <td>{r.declaration_id}</td>
                  <td>{r.national_id || '—'}</td>
                  <td>{r.user_full_name || '—'}</td>
                  <td><span className="badge bg-secondary text-capitalize me-1">{r.previous_status || '∅'}</span>→<span className="badge bg-primary text-capitalize ms-1">{r.status === 'pending' ? 'Submitted' : r.status}</span></td>
                  <td className="text-truncate" style={{ maxWidth: '220px' }}>{r.new_correction_message || ''}</td>
                  <td>{r.admin_username || '—'}</td>
                  <td>{new Date(r.changed_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="d-flex align-items-center justify-content-between mt-2">
          <div className="btn-group btn-group-sm">
            <button className="btn btn-outline-secondary" disabled={page <= 1 || loading} onClick={() => { if (page>1) fetchAudit(page - 1); }}>Prev</button>
            <button className="btn btn-outline-secondary" disabled={page >= pages || loading} onClick={() => { if (page<pages) fetchAudit(page + 1); }}>Next</button>
          </div>
          <div className="small text-muted">Page {page} / {pages}</div>
        </div>
      </div>
      {/* Detail Modal */}
      {detailOpen && (
        <div className="modal fade show" style={{ display: 'block', background: 'rgba(0,0,0,0.4)' }} tabIndex="-1" role="dialog">
          <div className="modal-dialog modal-lg" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Declaration Status History</h5>
                <button type="button" className="btn-close" onClick={closeDetail}></button>
              </div>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {detailLoading && <div>Loading declaration details...</div>}
                {detailError && <div className="alert alert-danger py-1 small">{detailError}</div>}
                {detailDeclaration && (
                  <div className="mb-3">
                    <h6 className="fw-bold">Declaration Info</h6>
                    <div className="small">
                      <div><strong>ID:</strong> {detailDeclaration.id}</div>
                      <div><strong>User:</strong> {[detailDeclaration.first_name, detailDeclaration.other_names, detailDeclaration.surname].filter(Boolean).join(' ')}</div>
                      <div><strong>Payroll:</strong> {detailDeclaration.payroll_number}</div>
                      <div><strong>Department:</strong> {detailDeclaration.department || '—'}</div>
                      <div><strong>Type:</strong> {detailDeclaration.declaration_type || '—'}</div>
                      <div><strong>Status:</strong> {detailDeclaration.status === 'pending' ? 'Submitted' : (detailDeclaration.status === 'rejected' ? 'Requesting Clarification' : detailDeclaration.status)}</div>
                      <div><strong>Submitted:</strong> {fmt(detailDeclaration.submitted_at || detailDeclaration.declaration_date)}</div>
                    </div>
                  </div>
                )}
                <h6 className="fw-bold mt-3">Audit Trail</h6>
                {detailAuditLoading && <div>Loading audit trail...</div>}
                {!detailAuditLoading && detailAudit.length === 0 && <div className="text-muted small">No audit records.</div>}
                {!detailAuditLoading && detailAudit.length > 0 && (
                  <div className="table-responsive small">
                    <table className="table table-sm table-striped">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Prev</th>
                          <th>New</th>
                          <th>Admin</th>
                          <th>Prev Corr</th>
                          <th>New Corr</th>
                          <th>Changed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailAudit.map(a => (
                          <tr key={a.id}>
                            <td>{a.id}</td>
                            <td>{a.previous_status || '∅'}</td>
                            <td>{a.new_status === 'pending' ? 'Submitted' : (a.new_status === 'rejected' ? 'Requesting Clarification' : a.new_status)}</td>
                            <td>{a.admin_username || '—'}</td>
                            <td className="text-truncate" style={{ maxWidth: '140px' }}>{a.previous_correction_message || ''}</td>
                            <td className="text-truncate" style={{ maxWidth: '140px' }}>{a.new_correction_message || ''}</td>
                            <td>{fmt(a.changed_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closeDetail}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StatusAuditModule;
