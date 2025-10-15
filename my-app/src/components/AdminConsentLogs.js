import React, { useEffect, useState } from 'react';
import axios from 'axios';

function AdminConsentLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line
  }, [page, search]);

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/admin/consent-logs', {
        params: { page, pageSize, search },
        headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` }
      });
      setLogs(res.data.logs);
      setTotal(res.data.total);
    } catch (err) {
      setError('Failed to fetch consent logs.');
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 24 }}>
      <h2>Consent Logs</h2>
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by name, ID, or designation"
          value={search}
          onChange={e => { setPage(1); setSearch(e.target.value); }}
          style={{ padding: 8, width: 300, borderRadius: 4, border: '1px solid #ccc' }}
        />
      </div>
      {loading ? <div>Loading...</div> : error ? <div style={{ color: 'red' }}>{error}</div> : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
            <thead>
              <tr style={{ background: '#f0f0f0' }}>
                <th style={{ padding: 8, border: '1px solid #ddd' }}>#</th>
                <th style={{ padding: 8, border: '1px solid #ddd' }}>Full Name</th>
                <th style={{ padding: 8, border: '1px solid #ddd' }}>National ID</th>
                <th style={{ padding: 8, border: '1px solid #ddd' }}>Designation</th>
                <th style={{ padding: 8, border: '1px solid #ddd' }}>Signed</th>
                <th style={{ padding: 8, border: '1px solid #ddd' }}>Submitted At</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 16 }}>No logs found.</td></tr>
              ) : logs.map((log, idx) => (
                <tr key={log.id}>
                  <td style={{ padding: 8, border: '1px solid #eee' }}>{(page - 1) * pageSize + idx + 1}</td>
                  <td style={{ padding: 8, border: '1px solid #eee' }}>{log.full_name}</td>
                  <td style={{ padding: 8, border: '1px solid #eee' }}>{log.national_id}</td>
                  <td style={{ padding: 8, border: '1px solid #eee' }}>{log.designation}</td>
                  <td style={{ padding: 8, border: '1px solid #eee' }}>{log.signed ? 'Yes' : 'No'}</td>
                  <td style={{ padding: 8, border: '1px solid #eee' }}>{new Date(log.submitted_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Page {page} of {totalPages}</span>
            <div>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AdminConsentLogs;
