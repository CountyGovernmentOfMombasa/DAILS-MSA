import React, { useEffect, useState, useCallback } from 'react';

// Displays all users in the (admin) department with their latest declaration status.
// Backend endpoint: GET /api/admin/department/users-status
// Query params: search= (optional). Super admins may pass &department=...

const STATUS_BADGE = (status) => {
  if (!status) return <span className="badge bg-secondary">None</span>;
  if (status === 'approved') return <span className="badge bg-success">Approved</span>;
  if (status === 'rejected') return <span className="badge bg-danger">Requesting Clarification</span>;
  // Map 'pending' to 'Submitted' for display
  return <span className="badge bg-warning text-dark">Submitted</span>;
};

const DepartmentUserStatus = ({ adminUser }) => {
  const adminToken = localStorage.getItem('adminToken');
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const isSuper = adminUser && (adminUser.role === 'super' || adminUser.role === 'super_admin');
  const [lastFetchedDept, setLastFetchedDept] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all|approved|pending|rejected|none
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const filteredUsers = users.filter(u => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'none') return !u.latest_declaration_status;
    if (statusFilter === 'pending') return !!u.latest_declaration_status && !['approved','rejected'].includes(u.latest_declaration_status);
    return u.latest_declaration_status === statusFilter;
  });
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const pageUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);

  const fetchData = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      const res = await fetch('/api/admin/department/users-status?' + params.toString(), {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Request failed (${res.status}) ${txt}`);
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'API error');
      setUsers(data.data.users || []);
      setSummary(data.data.summary || null);
  setLastFetchedDept(adminUser?.department || '');
      setPage(1); // reset to first page after refresh
    } catch (e) {
      setError(e.message);
      setUsers([]); setSummary(null);
    } finally { setLoading(false); }
  }, [adminToken, search, adminUser]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // After all hooks, optionally render nothing for super admin
  if (isSuper) return null;

  const exportCsv = () => {
    if (!users.length) return;
  const header = ['UserID','Payroll','National ID','First Name','Other Names','Surname','Email','Department','Latest Declaration ID','Type','Status','Declaration Date','Submitted At'];
    const lines = [header.join(',')];
    users.forEach(u => {
      const statusLabel = u.latest_declaration_status === 'pending' ? 'Submitted' : (u.latest_declaration_status === 'rejected' ? 'Requesting Clarification' : (u.latest_declaration_status || ''));
      const row = [u.id,u.payroll_number,u.national_id||'',u.first_name,u.other_names || '',u.surname||'',u.email||'',u.department||'',u.latest_declaration_id||'',u.latest_declaration_type||'',statusLabel,u.latest_declaration_date||'',u.latest_submitted_at||''];
      lines.push(row.map(v => {
        if (v === null || v === undefined) return '';
        const s = String(v).replace(/"/g,'""');
        return /[",\n]/.test(s) ? '"'+s+'"' : s;
      }).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'department_user_status.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card">
      <div className="card-header d-flex flex-wrap gap-2 align-items-end">
        <div className="me-auto">
          <h5 className="mb-0"><i className="bi bi-people text-primary me-2"></i>Department Staff Declaration Status</h5>
          {summary && (
            <div className="small text-muted mt-1">
              Total: {summary.totalUsers} | With Declaration: {summary.withDeclaration} | Without: {summary.withoutDeclaration} | Approved: {summary.approved} | Submitted: {summary.pending} | Requesting Clarification: {summary.rejected}
            </div>
          )}
          {lastFetchedDept && <div className="small text-muted">Department: {lastFetchedDept}</div>}
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="Search user"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 160 }}
          />
          <button className="btn btn-sm btn-outline-primary" onClick={fetchData} disabled={loading}>Refresh</button>
          <button className="btn btn-sm btn-outline-secondary" onClick={() => { setSearch(''); fetchData(); }} disabled={loading}>Clear</button>
          <button className="btn btn-sm btn-outline-success" onClick={exportCsv} disabled={!users.length}>Export CSV</button>
        </div>
      </div>
      <div className="card-body p-0">
        <div className="p-2 border-bottom d-flex flex-wrap gap-2 align-items-center">
          <span className="small text-muted">Status:</span>
          {['all','approved','pending','rejected','none'].map(s => (
            <button
              key={s}
              className={`btn btn-xs btn-${statusFilter===s?'primary':'outline-primary'}`}
              style={{ padding: '2px 8px', fontSize: 12 }}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              disabled={loading}
            >{s==='none' ? 'No Decl' : (s==='pending' ? 'Submitted' : s.charAt(0).toUpperCase()+s.slice(1))}</button>
          ))}
          <div className="ms-auto small text-muted">Showing {pageUsers.length} of {filteredUsers.length}</div>
        </div>
        {error && <div className="p-3 text-danger small">{error}</div>}
        {!error && loading && <div className="p-3 small">Loading...</div>}
        {!error && !loading && filteredUsers.length === 0 && (
          <div className="p-3 text-muted small">No users found.</div>
        )}
        {!error && !loading && filteredUsers.length > 0 && (
          <div className="table-responsive" style={{ maxHeight: 480 }}>
            <table className="table table-sm table-striped mb-0">
              <thead className="table-light">
                <tr>
                  <th>Payroll</th>
                  <th>National ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Latest Declaration</th>
                  <th>Status</th>
                  <th>Submitted / Date</th>
                </tr>
              </thead>
              <tbody>
                {pageUsers.map(u => {
                  const name = [u.first_name, u.other_names, u.surname].filter(Boolean).join(' ');
                  const dateShown = u.latest_submitted_at || u.latest_declaration_date || '';
                  const noDecl = !u.latest_declaration_status;
                  const rowClass = noDecl ? 'table-danger' : '';
                  return (
                    <tr key={u.id} className={rowClass}>
                      <td>{u.payroll_number || ''}</td>
                      <td>{u.national_id || ''}</td>
                      <td>{name}</td>
                      <td>{u.email || ''}</td>
                      <td>{u.latest_declaration_type || <span className="text-muted">None</span>}</td>
                      <td>{STATUS_BADGE(u.latest_declaration_status)}</td>
                      <td><small className="text-muted">{dateShown ? new Date(dateShown).toLocaleDateString() : ''}</small></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="d-flex justify-content-between align-items-center p-2 border-top">
          <button className="btn btn-sm btn-outline-secondary" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Prev</button>
          <span className="small">Page {page} / {totalPages}</span>
          <button className="btn btn-sm btn-outline-secondary" disabled={page>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages,p+1))}>Next</button>
        </div>
      </div>
    </div>
  );
};

export default DepartmentUserStatus;
