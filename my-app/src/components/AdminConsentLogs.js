import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { Table, Pagination, Form, Spinner, Alert, Button } from 'react-bootstrap';

function AdminConsentLogs() {
  const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      const date = new Date(isoString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
      const year = date.getFullYear();
      const time = date.toTimeString().split(' ')[0]; // hh:mm:ss
      return `${day}-${month}-${year} ${time}`;
    } catch (e) { return 'Invalid Date'; }
  };

  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastStatus, setLastStatus] = useState(null);
  // Replace state-based retries (which cause re-renders) with refs to avoid duplicate fetches
  const retryAttemptsRef = useRef(0);
  const pendingTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  const MAX_AUTO_RETRIES = 0; // Disable auto-retry to prevent multiple DB hits; use manual Retry

  const fetchLogs = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      try { abortControllerRef.current.abort(); } catch { /* ignore */ }
    }
    abortControllerRef.current = new AbortController();
    // Clear any queued retry timeouts
    if (pendingTimeoutRef.current) {
      clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }
    setLoading(true);
    setError('');
    setLastStatus(null);
    try {
      const res = await axios.get('/api/admin/consent-logs', {
        params: { page, pageSize, search },
        headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` },
        signal: abortControllerRef.current.signal,
      });
      setLogs(Array.isArray(res.data.logs) ? res.data.logs : []);
      setTotal(Number(res.data.total) || 0);
      retryAttemptsRef.current = 0; // reset after success
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        // Request was canceled due to parameter change/unmount; do not set error
        return;
      }
      const status = err.response?.status;
      setLastStatus(status || null);
      const backendMsg = err.response?.data?.error || err.response?.data?.message;
      setError(backendMsg || 'Failed to fetch consent logs.');
      // Optional: one-time auto-retry if enabled
      if (MAX_AUTO_RETRIES > 0 && status && status >= 500 && retryAttemptsRef.current < MAX_AUTO_RETRIES) {
        const delayMs = 1000 * (retryAttemptsRef.current + 1);
        retryAttemptsRef.current += 1;
        pendingTimeoutRef.current = setTimeout(() => {
          pendingTimeoutRef.current = null;
          fetchLogs();
        }, delayMs);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    fetchLogs();
    return () => {
      if (abortControllerRef.current) {
        try { abortControllerRef.current.abort(); } catch { /* ignore */ }
      }
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = null;
      }
    };
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-light d-flex justify-content-between align-items-center">
        <h5 className="mb-0"><i className="bi bi-clipboard-check me-2" />Consent Logs</h5>
        <Form.Control
          type="text"
          placeholder="Search by name, ID, or designation"
          value={search}
          onChange={e => { setPage(1); setSearch(e.target.value); }}
          style={{ width: '300px' }}
        />
      </div>
      <div className="card-body">
        {loading ? (
          <div className="text-center py-5">
            <Spinner animation="border" />
            <p className="mt-2">Loading logs...</p>
          </div>
        ) : error ? (
          <Alert variant="danger" className="d-flex justify-content-between align-items-center">
            <div>
              <strong>Error:</strong> {error}
              {lastStatus && <small className="d-block">HTTP Status: {lastStatus}</small>}
            </div>
            <Button variant="outline-danger" size="sm" onClick={fetchLogs}>Retry</Button>
          </Alert>
        ) : (
          <Table striped bordered hover responsive>
            <thead>
              <tr>
                <th>#</th>
                <th>Full Name</th>
                <th>National ID</th>
                <th>Designation</th>
                <th>Signed</th>
                <th>Submitted At</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted py-4">No logs found.</td></tr>
              ) : logs.map((log, idx) => (
                <tr key={log.id}>
                  <td>{(page - 1) * pageSize + idx + 1}</td>
                  <td>{log.full_name}</td>
                  <td>{log.national_id}</td>
                  <td>{log.designation}</td>
                  <td>{log.signed ? 'Yes' : 'No'}</td>
                  <td>{formatDateTime(log.submitted_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      {total > 0 && !loading && (
        <div className="card-footer d-flex justify-content-between align-items-center">
          <small className="text-muted">Showing {logs.length} of {total} records</small>
          <Pagination size="sm" className="mb-0">
            <Pagination.Prev onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} />
            <Pagination.Item active>{page}</Pagination.Item>
            <Pagination.Next onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} />
          </Pagination>
        </div>
      )}
    </div>
  );
}

export default AdminConsentLogs;
