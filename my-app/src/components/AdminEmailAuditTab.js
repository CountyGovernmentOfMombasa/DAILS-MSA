import React, { useEffect, useState, useCallback } from 'react';

const AdminEmailAuditTab = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [totalPages, setTotalPages] = useState(0);
  const [filters, setFilters] = useState({ search: '', department: '', adminId: '', userId: '' });
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [sort, setSort] = useState({ by: 'changed_at', dir: 'desc' });
  const [stats, setStats] = useState({ total: 0 });

  const adminToken = localStorage.getItem('adminToken');

  const fetchAudit = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        page, limit,
        search: filters.search || '',
        department: filters.department || '',
        adminId: filters.adminId || '',
        userId: filters.userId || '',
        from: dateRange.from || '',
        to: dateRange.to || '',
        sortBy: sort.by,
        sortDir: sort.dir
      });
      const res = await fetch(`/api/admin/users/email-audit?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (!res.ok) throw new Error('Failed to load audit');
      const data = await res.json();
      if (data.success) {
        setRows(data.data || []);
        setTotalPages(data.totalPages || 0);
        setStats({ total: data.total || 0 });
      } else {
        setError(data.message || 'Error loading audit');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [adminToken, page, limit, filters, dateRange, sort]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (['search','department','adminId','userId'].includes(name)) {
      setFilters(prev => ({ ...prev, [name]: value }));
      setPage(1);
    }
  };

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prev => ({ ...prev, [name]: value }));
    setPage(1);
  };

  const handleSort = (col) => {
    setSort(prev => ({ by: col, dir: prev.by === col ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'asc' }));
  };

  const exportPdf = async () => {
    try {
      const params = new URLSearchParams({
        search: filters.search || '',
        department: filters.department || '',
        adminId: filters.adminId || '',
        userId: filters.userId || '',
        from: dateRange.from || '',
        to: dateRange.to || '',
        sortBy: sort.by,
        sortDir: sort.dir
      });
      const res = await fetch(`/api/admin/users/email-audit/export/pdf?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (!res.ok) throw new Error('PDF export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'email_audit_log.pdf';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="card shadow-sm mt-4">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h5 className="mb-0"><i className="bi bi-clock-history me-2"/>Email Change Audit</h5>
        <div>
          <button className="btn btn-outline-secondary btn-sm me-2" onClick={() => { setPage(1); fetchAudit(); }}>Refresh</button>
          <button className="btn btn-outline-primary btn-sm" onClick={exportPdf}><i className="bi bi-file-earmark-pdf me-1"/>Export PDF</button>
        </div>
      </div>
      <div className="card-body">
        <div className="row g-2 mb-3">
          <div className="col-md-2"><input name="search" value={filters.search} onChange={handleChange} className="form-control form-control-sm" placeholder="Search name/email" /></div>
          <div className="col-md-2"><input name="department" value={filters.department} onChange={handleChange} className="form-control form-control-sm" placeholder="Department" /></div>
          <div className="col-md-2"><input name="adminId" value={filters.adminId} onChange={handleChange} className="form-control form-control-sm" placeholder="Admin ID" /></div>
          <div className="col-md-2"><input name="userId" value={filters.userId} onChange={handleChange} className="form-control form-control-sm" placeholder="User ID" /></div>
          <div className="col-md-2"><input type="date" name="from" value={dateRange.from} onChange={handleDateChange} className="form-control form-control-sm" /></div>
            <div className="col-md-2"><input type="date" name="to" value={dateRange.to} onChange={handleDateChange} className="form-control form-control-sm" /></div>
        </div>
        <div className="d-flex mb-2 small text-muted">
          <div className="me-3">Total Records: {stats.total}</div>
          <div>Page {page} / {totalPages}</div>
        </div>
        <div className="table-responsive" style={{ maxHeight: '450px' }}>
          <table className="table table-sm table-hover align-middle">
            <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
              <tr>
                <th style={{cursor:'pointer'}} onClick={() => handleSort('changed_at')}>When {sort.by==='changed_at' && (sort.dir==='asc'?'▲':'▼')}</th>
                <th style={{cursor:'pointer'}} onClick={() => handleSort('payroll_number')}>Payroll</th>
                <th>Name</th>
                <th style={{cursor:'pointer'}} onClick={() => handleSort('department')}>Department {sort.by==='department' && (sort.dir==='asc'?'▲':'▼')}</th>
                <th>Old Email</th>
                <th style={{cursor:'pointer'}} onClick={() => handleSort('new_email')}>New Email {sort.by==='new_email' && (sort.dir==='asc'?'▲':'▼')}</th>
                <th style={{cursor:'pointer'}} onClick={() => handleSort('changed_by_admin_id')}>By Admin {sort.by==='changed_by_admin_id' && (sort.dir==='asc'?'▲':'▼')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan="7" className="text-center py-4"><div className="spinner-border spinner-border-sm"/></td></tr>
              )}
              {!loading && error && (
                <tr><td colSpan="7" className="text-danger small">{error}</td></tr>
              )}
              {!loading && !error && rows.length === 0 && (
                <tr><td colSpan="7" className="text-muted small py-3">No audit records found.</td></tr>
              )}
              {!loading && !error && rows.map(r => (
                <tr key={r.id}>
                  <td className="text-nowrap">{new Date(r.changed_at).toLocaleString()}</td>
                  <td><span className="badge bg-secondary">{r.payroll_number}</span></td>
                  <td>{[r.surname, r.first_name, r.other_names].filter(Boolean).join(' ')}</td>
                  <td><span className="badge bg-light text-dark">{r.department || '-'}</span></td>
                  <td className="text-muted" style={{maxWidth:'180px'}}><small>{r.old_email || '-'}</small></td>
                  <td style={{maxWidth:'180px'}}><small>{r.new_email}</small></td>
                  <td>{r.admin_username ? <span className="badge bg-info text-dark">{r.admin_username}</span> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="d-flex justify-content-between align-items-center mt-2">
          <div className="btn-group btn-group-sm">
            <button className="btn btn-outline-secondary" disabled={page===1} onClick={() => setPage(p => Math.max(1, p-1))}>Prev</button>
            <button className="btn btn-outline-secondary" disabled={page===totalPages || totalPages===0} onClick={() => setPage(p => (p+1))}>Next</button>
          </div>
          <div className="small text-muted">Showing {rows.length} records</div>
        </div>
      </div>
    </div>
  );
};

export default AdminEmailAuditTab;
