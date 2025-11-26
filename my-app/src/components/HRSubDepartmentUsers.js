import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

const HRSubDepartmentUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const token = localStorage.getItem('adminToken');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const debounceRef = useRef(null);

  const fetchPage = async (p = page, l = pageSize, s = search) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(p), limit: String(l) });
      if (s && s.trim()) params.append('search', s.trim());
      const res = await fetch(`/api/hr/sub-department/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load');
      setUsers(Array.isArray(data.data) ? data.data : []);
      setTotal(Number(data.total || 0));
      setError('');
    } catch (e) {
      setError(e.message);
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPage(1, pageSize, search); /* initial */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchPage(1, pageSize, search);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchPage(page, pageSize, search);
  }, [page, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / pageSize)), [total, pageSize]);
  const pageData = users; // server already paginated

  const prettyStatus = (status) => {
    if (!status) return '—';
    if (status === 'pending') return 'Submitted';
    if (status === 'approved') return 'Approved';
    if (status === 'rejected') return 'Requesting Clarification';
    return status;
  };

  const statusBadgeClass = (status) => {
    if (!status) return 'badge bg-secondary';
    if (status === 'pending') return 'badge bg-warning text-dark';
    if (status === 'approved') return 'badge bg-success';
    if (status === 'rejected') return 'badge bg-danger';
    return 'badge bg-secondary';
  };

  const fetchAllForExport = async () => {
    const pageLimit = 500; // backend max
    const pages = Math.max(1, Math.ceil((total || 0) / pageLimit));
    const acc = [];
    for (let p = 1; p <= pages; p++) {
      const params = new URLSearchParams({ page: String(p), limit: String(pageLimit) });
      if (search && search.trim()) params.append('search', search.trim());
      const res = await fetch(`/api/hr/sub-department/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || `Failed to load page ${p}`);
      const rows = Array.isArray(data.data) ? data.data : [];
      acc.push(...rows);
    }
    return acc;
  };

  const handleExport = async () => {
    try {
      setLoading(true);
      const all = await fetchAllForExport();
      const rows = (all || []).map(u => ({
        Name: [u.first_name, u.other_names, u.surname].filter(Boolean).join(' '),
        Payroll: u.payroll_number || '',
        Email: u.email || '',
        Designation: u.designation || '',
        Employment: u.nature_of_employment || '',
        Department: u.department || '',
        SubDepartment: u.sub_department || '',
        DeclarationStatus: prettyStatus(u.latest_declaration_status)
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'SubDeptUsers');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      saveAs(new Blob([wbout], { type: 'application/octet-stream' }), 'sub_department_users.xlsx');
    } catch (e) {
      setError(e.message || 'Export failed');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-3">Loading...</div>;
  if (error) return <div className="alert alert-danger m-2">{error}</div>;

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
        <h5 className="mb-0">
          <i className="bi bi-people-fill me-2"></i>
          My Sub-Department Staff ({total})
        </h5>
        <div className="d-flex gap-2 align-items-center">
          <button type="button" className="btn btn-sm btn-light" onClick={handleExport}>
            <i className="bi bi-file-earmark-excel me-1"></i>
            Export
          </button>
          <div className="input-group input-group-sm" style={{ maxWidth: 300 }}>
            <span className="input-group-text"><i className="bi bi-search"></i></span>
            <input
              type="text"
              className="form-control"
              placeholder="Search name, payroll, email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="card-body p-0">
        {total === 0 ? (
          <div className="p-3 text-muted">No users found.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm table-striped mb-0">
              <thead className="table-light">
                <tr>
                  <th>Name</th>
                  <th>Payroll</th>
                  <th>Email</th>
                  <th>Designation</th>
                  <th>Employment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map(u => (
                  <tr key={u.id}>
                    <td>{[u.first_name, u.other_names, u.surname].filter(Boolean).join(' ')}</td>
                    <td>{u.payroll_number}</td>
                    <td>{u.email}</td>
                    <td>{u.designation || '—'}</td>
                    <td>{u.nature_of_employment || '—'}</td>
                    <td>
                      <span className={statusBadgeClass(u.latest_declaration_status)}>
                        {prettyStatus(u.latest_declaration_status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <div className="d-flex justify-content-between align-items-center p-2 border-top small">
            <div>
              Page {page} of {totalPages} • Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
            </div>
            <div className="d-flex align-items-center gap-2">
              <select className="form-select form-select-sm" style={{ width: 90 }} value={pageSize} onChange={e => setPageSize(parseInt(e.target.value, 10))}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <div className="btn-group">
                <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
                <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HRSubDepartmentUsers;
