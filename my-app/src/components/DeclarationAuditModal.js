import React, { useEffect, useState } from 'react';

function fmt(dt) {
  try { return new Date(dt).toLocaleString(); } catch { return dt || ''; }
}

// Reusable modal to show declaration details + audit trail
// Props: adminToken (required), declarationId (number), onClose (fn)
const DeclarationAuditModal = ({ adminToken, declarationId, onClose }) => {
  const [loadingDecl, setLoadingDecl] = useState(true);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [declError, setDeclError] = useState('');
  const [auditError, setAuditError] = useState('');
  const [declaration, setDeclaration] = useState(null);
  const [audit, setAudit] = useState([]);

  useEffect(() => {
    if (!declarationId || !adminToken) return;
    let abort = false;
    const fetchDecl = async () => {
      setLoadingDecl(true); setDeclError('');
      try {
        const res = await fetch(`/api/admin/declarations/${declarationId}`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
        if (!res.ok) throw new Error('Failed to load declaration');
        const j = await res.json();
        if (!abort && j.success) setDeclaration(j.data);
      } catch (e) { if (!abort) setDeclError(e.message); }
      finally { if (!abort) setLoadingDecl(false); }
    };
    const fetchAudit = async () => {
      setLoadingAudit(true); setAuditError('');
      try {
        const res = await fetch(`/api/admin/declarations/${declarationId}/status-audit?limit=100`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
        if (!res.ok) throw new Error('Failed to load audit');
        const j = await res.json();
        if (!abort && j.success) setAudit(j.data || []);
      } catch (e) { if (!abort) setAuditError(e.message); }
      finally { if (!abort) setLoadingAudit(false); }
    };
    fetchDecl();
    fetchAudit();
    return () => { abort = true; };
  }, [adminToken, declarationId]);

  if (!declarationId) return null;

  return (
    <div className="modal fade show" style={{ display: 'block', background: 'rgba(0,0,0,0.4)' }} tabIndex="-1" role="dialog">
      <div className="modal-dialog modal-lg" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Declaration Status History</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {loadingDecl && <div>Loading declaration details...</div>}
            {declError && <div className="alert alert-danger py-1 small">{declError}</div>}
            {declaration && (
              <div className="mb-3 small">
                <h6 className="fw-bold">Declaration Info</h6>
                <div><strong>ID:</strong> {declaration.id}</div>
                <div><strong>User:</strong> {[declaration.first_name, declaration.other_names, declaration.surname].filter(Boolean).join(' ')}</div>
                <div><strong>National ID:</strong> {declaration.national_id || '—'}</div>
                <div><strong>Payroll:</strong> {declaration.payroll_number || '—'}</div>
                <div><strong>Department:</strong> {declaration.department || '—'}</div>
                <div><strong>Type:</strong> {declaration.declaration_type || '—'}</div>
                <div><strong>Status:</strong> {declaration.status}</div>
                <div><strong>Submitted:</strong> {fmt(declaration.submitted_at || declaration.declaration_date)}</div>
              </div>
            )}
            <h6 className="fw-bold mt-3">Audit Trail</h6>
            {loadingAudit && <div>Loading audit trail...</div>}
            {auditError && <div className="alert alert-danger py-1 small">{auditError}</div>}
            {!loadingAudit && audit.length === 0 && !auditError && <div className="text-muted small">No audit records.</div>}
            {!loadingAudit && audit.length > 0 && (
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
                    {audit.map(a => (
                      <tr key={a.id}>
                        <td>{a.id}</td>
                        <td>{a.previous_status || '∅'}</td>
                        <td>{a.new_status}</td>
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
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeclarationAuditModal;
