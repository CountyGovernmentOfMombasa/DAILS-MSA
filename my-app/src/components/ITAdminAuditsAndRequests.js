import React, { useEffect, useState } from 'react';

// Aggregated view: Declaration Edit Requests, Email Change Audit, User Creation Audit
// Assumes endpoints:
//  - GET /api/admin/users/email-audit (existing)
//  - GET /api/admin/declaration-edit-requests (NOT existing yet: we will reuse /api/declarations/edit-requests? but currently only /api/admin? none) -> We'll call /api/admin/declarations/edit-requests if added later
//  - GET /api/it-admin/user-creation-audit (to be implemented) -- for now we fetch nothing if 404
// For immediate utility we will:
//  * Fetch edit requests from /api/admin/edit-requests if alias added; fallback to /api/declarations/edit-requests if accessible with admin token
//  * Fetch email audit (existing)
//  * Fetch user creation audit (new backend endpoint recommended)

const ITAdminAuditsAndRequests = () => {
  const adminToken = localStorage.getItem('adminToken');
  const [editRequests, setEditRequests] = useState([]);
  const [emailAudit, setEmailAudit] = useState([]);
  const [userCreationAudit, setUserCreationAudit] = useState([]);
  const [adminCreationAudit, setAdminCreationAudit] = useState([]);
  const [passwordChangeAudit, setPasswordChangeAudit] = useState([]);
  // Admin password reset request feature removed
  const [loading, setLoading] = useState(true);
  // Filters & pagination
  const [filters, setFilters] = useState({
    from: '',
    to: '',
  department: '',
  sub_department: '',
    adminId: '',
    search: '',
    page: 1,
    limit: 25
  });
  const [creationMeta, setCreationMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [adminCreationMeta, setAdminCreationMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [passwordAuditMeta, setPasswordAuditMeta] = useState({ total: 0, page: 1, totalPages: 1 });
  const [errors, setErrors] = useState([]);
  // OTP disclosure audit
  const [otpAudit, setOtpAudit] = useState([]);
  const [otpMeta, setOtpMeta] = useState({ total:0, page:1, totalPages:1 });
  const [otpFilters, setOtpFilters] = useState({ page:1, limit:25, adminId:'', userId:'', action:'', search:'', from:'', to:'' });
  const [otpLoading, setOtpLoading] = useState(false);
  const [revealForm, setRevealForm] = useState({ userId:'', nationalId:'', reason:'', regenerate:false });
  const [revealResult, setRevealResult] = useState(null);
  const [revealError, setRevealError] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(null);

  // headers built inside effect to avoid stale closure warnings

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const fetchAll = async () => {
      if (inFlight) return; // guard
      inFlight = true;
      setLoading(true);
      const localErrors = [];
      const authHeaders = { Authorization: `Bearer ${adminToken}` };
      // Edit Requests
      try {
        // Try an admin route alias first
        let res = await fetch('/api/admin/declarations/edit-requests', { headers: authHeaders });
        if (res.status === 404) {
          res = await fetch('/api/declarations/edit-requests', { headers: authHeaders });
        }
        if (res.ok) {
          const data = await res.json();
            setEditRequests(Array.isArray(data.data) ? data.data : data.data?.rows || data.data || []);
        } else {
          console.warn('Edit requests fetch failed with status', res.status);
          localErrors.push('Failed to load edit requests');
        }
      } catch (e) {
        console.warn('Edit requests fetch error', e);
        localErrors.push('Error fetching edit requests');
      }
      // Email audit
      try {
        const res = await fetch('/api/admin/users/email-audit', { headers: authHeaders });
        if (res.ok) {
          const data = await res.json();
          // data likely contains an array named audit or rows
          setEmailAudit(data.data || data.audit || data.rows || []);
        } else {
          localErrors.push('Failed to load email change audit');
        }
      } catch (e) {
        localErrors.push('Error fetching email change audit');
      }
      // User creation audit (with pagination & filters)
      try {
        const qs = new URLSearchParams();
        if (filters.from) qs.append('from', filters.from);
        if (filters.to) qs.append('to', filters.to);
  if (filters.department) qs.append('department', filters.department);
  if (filters.sub_department) qs.append('sub_department', filters.sub_department);
        if (filters.adminId) qs.append('adminId', filters.adminId);
        if (filters.search) qs.append('search', filters.search);
        qs.append('page', filters.page);
        qs.append('limit', filters.limit);
        const res = await fetch('/api/it-admin/user-creation-audit?' + qs.toString(), { headers: authHeaders });
        if (res.ok) {
          const data = await res.json();
          setUserCreationAudit(data.data || data.audit || []);
          if (data.total !== undefined) {
            setCreationMeta({ total: data.total, page: data.page, totalPages: data.totalPages });
          }
        } else if (res.status !== 404) {
          localErrors.push('Failed to load user creation audit');
        }
      } catch (e) {
        // Probably not implemented yet
      }
      // Password change audit (admin passwords)
      try {
        const qsP = new URLSearchParams();
        if (filters.from) qsP.append('from', filters.from);
        if (filters.to) qsP.append('to', filters.to);
        if (filters.adminId) qsP.append('adminId', filters.adminId);
        qsP.append('page', filters.page);
        qsP.append('limit', filters.limit);
        const resP = await fetch('/api/admin/password-change-audit?' + qsP.toString(), { headers: authHeaders });
        if (resP.ok) {
          const dataP = await resP.json();
          if (dataP.success) {
            setPasswordChangeAudit(Array.isArray(dataP.data) ? dataP.data : []);
            if (dataP.total !== undefined) {
              setPasswordAuditMeta({ total: dataP.total, page: dataP.page, totalPages: dataP.totalPages });
            }
          } else {
            localErrors.push('Failed to load password change audit');
          }
        } else if (resP.status !== 404) {
          localErrors.push('Failed to load password change audit');
        }
      } catch (e) {
        // silent
      }
      // Admin password reset requests removed
      // Admin creation audit (with same filters / pagination independent meta for now reusing same page)
      try {
        const qs2 = new URLSearchParams();
        if (filters.from) qs2.append('from', filters.from);
        if (filters.to) qs2.append('to', filters.to);
  if (filters.department) qs2.append('department', filters.department);
  if (filters.sub_department) qs2.append('sub_department', filters.sub_department);
        if (filters.adminId) qs2.append('createdByAdminId', filters.adminId);
        if (filters.search) qs2.append('search', filters.search);
        qs2.append('page', filters.page);
        qs2.append('limit', filters.limit);
        const res2 = await fetch('/api/it-admin/admin-creation-audit?' + qs2.toString(), { headers: authHeaders });
        if (res2.ok) {
          const data2 = await res2.json();
            setAdminCreationAudit(data2.data || []);
            if (data2.total !== undefined) {
              setAdminCreationMeta({ total: data2.total, page: data2.page, totalPages: data2.totalPages });
            }
        } else if (res2.status !== 404) {
          localErrors.push('Failed to load admin creation audit');
        }
      } catch (e) {
        // silent
      }
      if (!cancelled) {
        setErrors(localErrors);
        setLoading(false);
      }
      inFlight = false;
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [adminToken, filters]);

  // Fetch OTP audit when filters change
  useEffect(()=>{
    const load = async () => {
      setOtpLoading(true); setRevealError('');
      try {
        const qs = new URLSearchParams();
        ['adminId','userId','action','search','from','to'].forEach(k=>{ if(otpFilters[k]) qs.append(k, otpFilters[k]); });
        qs.append('page', otpFilters.page); qs.append('limit', otpFilters.limit);
        const res = await fetch('/api/it-admin/otp-disclosure-audit?' + qs.toString(), { headers:{ Authorization: `Bearer ${adminToken}` }});
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setOtpAudit(data.data || []);
            setOtpMeta({ total:data.total, page:data.page, totalPages:data.totalPages });
          }
        }
      } catch (e) { /* silent */ }
      setOtpLoading(false);
    };
    if (adminToken) load();
  }, [adminToken, otpFilters]);

  // Countdown effect for revealed OTP
  useEffect(()=>{
    if (!revealResult?.expiresAt) { setOtpCountdown(null); return; }
    const exp = new Date(revealResult.expiresAt).getTime();
    const interval = setInterval(()=>{
      const diff = exp - Date.now();
      if (diff <= 0) { setOtpCountdown('Expired'); clearInterval(interval); return; }
      const m = Math.floor(diff/60000); const s = Math.floor((diff%60000)/1000);
      setOtpCountdown(`${m}m ${s}s`);
    }, 1000);
    return ()=> clearInterval(interval);
  }, [revealResult]);

  const submitReveal = async (e) => {
    e.preventDefault(); setRevealError(''); setRevealResult(null);
    if ((!revealForm.userId && !revealForm.nationalId) || !revealForm.reason) { setRevealError('Provide User ID or National ID, and a reason'); return; }
    try {
      const base = revealForm.nationalId
        ? `/api/it-admin/users/by-national-id/${encodeURIComponent(revealForm.nationalId)}/reveal-otp`
        : `/api/it-admin/users/${encodeURIComponent(revealForm.userId)}/reveal-otp`;
      const res = await fetch(base, {
        method:'POST', headers:{ 'Content-Type':'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ reason:revealForm.reason, regenerate: !!revealForm.regenerate })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRevealResult(data);
        // refresh audit quickly
        setOtpFilters(f => ({ ...f }));
      } else {
        setRevealError(data.message || 'Failed');
      }
    } catch (err) { setRevealError('Network error'); }
  };
  const copyOtp = () => {
    if (revealResult?.otp) {
      navigator.clipboard.writeText(revealResult.otp).catch(()=>{});
    }
  };
  const updateOtpFilter = (e) => { const { name, value } = e.target; setOtpFilters(f => ({ ...f, [name]: value, page:1 })); };
  const changeOtpPage = (d) => setOtpFilters(f=> ({ ...f, page: Math.min(Math.max(1, f.page + d), otpMeta.totalPages || 1) }));

  const updateFilter = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value, page: 1 }));
  };
  const changePage = (delta) => {
    setFilters(prev => ({ ...prev, page: Math.min(Math.max(1, prev.page + delta), creationMeta.totalPages || 1) }));
  };
  // For admin creation we reuse same page filters, so no separate handler needed.
  const exportCreation = (type) => {
    const qs = new URLSearchParams();
  ['from','to','department','sub_department','adminId','search'].forEach(k => { if (filters[k]) qs.append(k, filters[k]); });
    const url = '/api/it-admin/user-creation-audit/export/' + type + (qs.toString() ? '?' + qs.toString() : '');
    window.open(url, '_blank');
  };
  const exportAdminCreation = (type) => {
    const qs = new URLSearchParams();
  ['from','to','department','sub_department','adminId','search'].forEach(k => { if (filters[k]) qs.append(k === 'adminId' ? 'createdByAdminId' : k, filters[k]); });
    const url = '/api/it-admin/admin-creation-audit/export/' + type + (qs.toString() ? '?' + qs.toString() : '');
    window.open(url, '_blank');
  };

  const formatDateTime = (d) => {
    if (!d) return '';
    try { return new Date(d).toLocaleString(); } catch { return d; }
  };

  // actOnResetRequest removed

  return (
    <div className="mt-3">
      <h4>Audits & Edit Requests</h4>
      {loading && <div>Loading audit data...</div>}
      {errors.length > 0 && (
        <div className="alert alert-warning py-2">
          {errors.map((e,i) => <div key={i}>{e}</div>)}
        </div>
      )}
      {/* OTP Reveal & Audit Section */}
      <div className="mt-4">
        <h4>OTP Support & Disclosure Audit</h4>
        <div className="row g-3">
          <div className="col-md-4">
            <div className="card h-100">
              <div className="card-header py-2 bg-info text-white">Reveal / Regenerate User OTP</div>
              <div className="card-body p-2">
                <form onSubmit={submitReveal} className="small d-flex flex-column gap-2">
                  <input className="form-control form-control-sm" placeholder="National ID (preferred)" value={revealForm.nationalId} onChange={e=>setRevealForm(f=>({...f,nationalId:e.target.value}))} />
                  <div className="text-center text-muted small">or</div>
                  <input className="form-control form-control-sm" placeholder="User ID (optional)" value={revealForm.userId} onChange={e=>setRevealForm(f=>({...f,userId:e.target.value}))} />
                  <textarea className="form-control form-control-sm" placeholder="Reason (min 5 chars)" value={revealForm.reason} onChange={e=>setRevealForm(f=>({...f,reason:e.target.value}))} />
                  <div className="form-check">
                    <input id="regen" type="checkbox" className="form-check-input" checked={revealForm.regenerate} onChange={e=>setRevealForm(f=>({...f,regenerate:e.target.checked}))} />
                    <label htmlFor="regen" className="form-check-label">Force regenerate new OTP</label>
                  </div>
                  <button className="btn btn-sm btn-primary" type="submit">Submit</button>
                  {revealError && <div className="text-danger small">{revealError}</div>}
                </form>
                {revealResult && (
                  <div className="mt-2 small border rounded p-2 bg-light">
                    <div><strong>OTP:</strong> {revealResult.otp} <button className="btn btn-xs btn-outline-secondary ms-2" type="button" onClick={copyOtp}>Copy</button></div>
                    <div><strong>Expires:</strong> {new Date(revealResult.expiresAt).toLocaleString()} ({otpCountdown || '...'})</div>
                    <div><strong>Generated:</strong> {revealResult.generated ? 'Yes' : 'No (existing)'} </div>
                    <div className="text-muted">Masked Phone: {revealResult.maskedPhone || 'N/A'}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="col-md-8">
            <div className="card h-100">
              <div className="card-header py-2 bg-info text-white d-flex justify-content-between align-items-center">
                <span>OTP Disclosure Audit</span>
                <div className="d-flex gap-1">
                  <input name="search" value={otpFilters.search} onChange={updateOtpFilter} placeholder="Search reason/role/dept" className="form-control form-control-sm" style={{width:180}} />
                  <button className="btn btn-sm btn-outline-light" onClick={()=>setOtpFilters({ page:1, limit:25, adminId:'', userId:'', action:'', search:'', from:'', to:'' })}>Clear</button>
                </div>
              </div>
              <div className="card-body p-2" style={{ maxHeight: 350, overflowY:'auto' }}>
                {otpLoading && <div className="small text-muted">Loading...</div>}
                {!otpLoading && otpAudit.length === 0 && <div className="small text-muted">No audit entries</div>}
                <div className="row g-1 mb-2 small">
                  <div className="col-4"><input name="adminId" value={otpFilters.adminId} onChange={updateOtpFilter} placeholder="Admin ID" className="form-control form-control-sm" /></div>
                  <div className="col-4"><input name="userId" value={otpFilters.userId} onChange={updateOtpFilter} placeholder="User ID" className="form-control form-control-sm" /></div>
                  <div className="col-4"><select name="action" value={otpFilters.action} onChange={updateOtpFilter} className="form-select form-select-sm"><option value="">Action</option><option>VIEW</option><option>REGENERATE</option></select></div>
                  <div className="col-6"><input type="date" name="from" value={otpFilters.from} onChange={updateOtpFilter} className="form-control form-control-sm" /></div>
                  <div className="col-6"><input type="date" name="to" value={otpFilters.to} onChange={updateOtpFilter} className="form-control form-control-sm" /></div>
                </div>
                {otpAudit.map(r => (
                  <div key={r.id} className="border-bottom small py-1">
                    <div><strong>{r.action}</strong> user {r.user_id} by admin {r.admin_id} ({r.admin_role})</div>
                    <div className="text-muted">Dept: {r.admin_department || '—'} {r.admin_sub_department ? '/ '+r.admin_sub_department : ''}</div>
                    <div>Reason: {r.reason}</div>
                    <div className="text-muted">At: {formatDateTime(r.created_at)} • Last2:{r.otp_last2} • Gen:{r.generated? 'Y':'N'}</div>
                  </div>
                ))}
              </div>
              <div className="card-footer p-2 d-flex justify-content-between align-items-center">
                <button className="btn btn-sm btn-outline-secondary" disabled={otpMeta.page<=1} onClick={()=>changeOtpPage(-1)}>Prev</button>
                <span className="small">Page {otpMeta.page} / {otpMeta.totalPages}</span>
                <button className="btn btn-sm btn-outline-secondary" disabled={otpMeta.page>=otpMeta.totalPages} onClick={()=>changeOtpPage(1)}>Next</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {!loading && (
        <div className="row g-4">
          <div className="col-12">
            <div className="card mb-3">
              <div className="card-body py-2">
                <div className="row g-2 align-items-end">
                  <div className="col-md-2">
                    <label className="form-label mb-0 small">From</label>
                    <input type="date" name="from" value={filters.from} onChange={updateFilter} className="form-control form-control-sm" />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label mb-0 small">To</label>
                    <input type="date" name="to" value={filters.to} onChange={updateFilter} className="form-control form-control-sm" />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label mb-0 small">Department</label>
                    <input name="department" value={filters.department} onChange={updateFilter} className="form-control form-control-sm" placeholder="Dept" />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label mb-0 small">Sub Dept</label>
                    <input name="sub_department" value={filters.sub_department} onChange={updateFilter} className="form-control form-control-sm" placeholder="Sub Dept" />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label mb-0 small">Admin ID</label>
                    <input name="adminId" value={filters.adminId} onChange={updateFilter} className="form-control form-control-sm" />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label mb-0 small">Search</label>
                    <input name="search" value={filters.search} onChange={updateFilter} className="form-control form-control-sm" placeholder="email / nat ID" />
                  </div>
                  <div className="col-md-2 d-flex gap-2">
                    <button className="btn btn-sm btn-outline-secondary w-100" onClick={() => setFilters(prev => ({ ...prev, from: '', to: '', department: '', sub_department: '', adminId: '', search: '', page: 1 }))}>Clear</button>
                  </div>
                </div>
                <div className="d-flex gap-2 mt-2">
                  <button className="btn btn-sm btn-outline-primary" onClick={() => exportCreation('csv')}>Export CSV</button>
                  <button className="btn btn-sm btn-outline-primary" onClick={() => exportCreation('pdf')}>Export PDF</button>
                </div>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card h-100">
              <div className="card-header bg-primary text-white py-2">Declaration Edit Requests</div>
              <div className="card-body p-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {editRequests.length === 0 && <div className="text-muted small">No edit requests</div>}
                {editRequests.map(r => (
                  <div key={r.id || r.declarationId + '-' + r.userId} className="border-bottom small py-1">
                    <div><strong>Declaration:</strong> {r.declarationId || r.declaration_id}</div>
                    <div><strong>User:</strong> {r.userId || r.user_id}</div>
                    <div><strong>Reason:</strong> {r.reason}</div>
                    <div className="text-muted">{formatDateTime(r.requestedAt || r.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card h-100">
              <div className="card-header bg-secondary text-white py-2">Email Change Audit</div>
              <div className="card-body p-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {emailAudit.length === 0 && <div className="text-muted small">No email changes</div>}
                {emailAudit.map(a => (
                  <div key={a.id} className="border-bottom small py-1">
                    <div><strong>User:</strong> {a.user_id}</div>
                    <div><strong>Old:</strong> {a.old_email || a.oldEmail}</div>
                    <div><strong>New:</strong> {a.new_email || a.newEmail}</div>
                    <div><strong>By Admin:</strong> {a.changed_by_admin_id}</div>
                    <div className="text-muted">{formatDateTime(a.changed_at || a.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card h-100">
              <div className="card-header bg-success text-white py-2">User Creation Audit</div>
              <div className="card-body p-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {userCreationAudit.length === 0 && <div className="text-muted small">No user creation audit entries</div>}
                {userCreationAudit.map(u => (
                  <div key={u.id} className="border-bottom small py-1">
                    <div><strong>User ID:</strong> {u.user_id}</div>
                    <div><strong>National ID:</strong> {u.user_national_id}</div>
                    <div><strong>Email:</strong> {u.user_email}</div>
                    <div><strong>Dept:</strong> {u.user_department} {u.user_sub_department ? <em className="text-muted">/ {u.user_sub_department}</em> : ''}</div>
                    <div><strong>By Admin:</strong> {u.created_by_admin_id} ({u.admin_role})</div>
                    <div className="text-muted">{formatDateTime(u.created_at)}</div>
                  </div>
                ))}
              </div>
              <div className="card-footer p-2 d-flex justify-content-between align-items-center">
                <button className="btn btn-sm btn-outline-secondary" disabled={creationMeta.page <= 1} onClick={() => changePage(-1)}>Prev</button>
                <span className="small">Page {creationMeta.page} / {creationMeta.totalPages}</span>
                <button className="btn btn-sm btn-outline-secondary" disabled={creationMeta.page >= creationMeta.totalPages} onClick={() => changePage(1)}>Next</button>
              </div>
              <div className="card-footer p-2 d-flex gap-2">
                <button className="btn btn-sm btn-outline-primary" onClick={() => exportCreation('csv')}>CSV</button>
                <button className="btn btn-sm btn-outline-primary" onClick={() => exportCreation('pdf')}>PDF</button>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card h-100">
              <div className="card-header bg-warning text-dark py-2">Admin Creation Audit</div>
              <div className="card-body p-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {adminCreationAudit.length === 0 && <div className="text-muted small">No admin creation audit entries</div>}
                {adminCreationAudit.map(a => (
                  <div key={a.id} className="border-bottom small py-1">
                    <div><strong>Admin ID:</strong> {a.admin_id}</div>
                    <div><strong>Username:</strong> {a.new_admin_username}</div>
                    <div><strong>Role:</strong> {a.new_admin_role}</div>
                    <div><strong>Dept:</strong> {a.new_admin_department || '—'} {a.new_admin_sub_department ? <em className="text-muted">/ {a.new_admin_sub_department}</em> : ''}</div>
                    <div><strong>Name:</strong> {a.new_admin_first_name} {a.new_admin_surname}</div>
                    <div><strong>By:</strong> {a.created_by_admin_id} ({a.creator_role})</div>
                    <div className="text-muted">{formatDateTime(a.created_at)}</div>
                  </div>
                ))}
              </div>
              <div className="card-footer p-2 d-flex justify-content-between align-items-center">
                <button className="btn btn-sm btn-outline-secondary" disabled={adminCreationMeta.page <= 1} onClick={() => changePage(-1)}>Prev</button>
                <span className="small">Page {adminCreationMeta.page} / {adminCreationMeta.totalPages}</span>
                <button className="btn btn-sm btn-outline-secondary" disabled={adminCreationMeta.page >= adminCreationMeta.totalPages} onClick={() => changePage(1)}>Next</button>
              </div>
              <div className="card-footer p-2 d-flex gap-2">
                <button className="btn btn-sm btn-outline-primary" onClick={() => exportAdminCreation('csv')}>CSV</button>
                <button className="btn btn-sm btn-outline-primary" onClick={() => exportAdminCreation('pdf')}>PDF</button>
              </div>
            </div>
          </div>
          {/* Admin password reset requests panel removed */}
          <div className="col-md-4">
            <div className="card h-100">
              <div className="card-header bg-dark text-white py-2">Admin Password Change Audit</div>
              <div className="card-body p-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {passwordChangeAudit.length === 0 && <div className="text-muted small">No password changes</div>}
                {passwordChangeAudit.map(p => (
                  <div key={p.id} className="border-bottom small py-1">
                    <div><strong>Admin:</strong> {p.admin_username || p.admin_id}</div>
                    <div><strong>Changed By:</strong> {p.changed_by_username || p.changed_by_admin_id || '—'}</div>
                    <div><strong>IP:</strong> {p.ip_address || '—'}</div>
                    <div className="text-muted">{formatDateTime(p.created_at)}</div>
                  </div>
                ))}
              </div>
              <div className="card-footer p-2 d-flex justify-content-between align-items-center">
                <button className="btn btn-sm btn-outline-secondary" disabled={passwordAuditMeta.page <= 1} onClick={() => changePage(-1)}>Prev</button>
                <span className="small">Page {passwordAuditMeta.page} / {passwordAuditMeta.totalPages}</span>
                <button className="btn btn-sm btn-outline-secondary" disabled={passwordAuditMeta.page >= passwordAuditMeta.totalPages} onClick={() => changePage(1)}>Next</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="mt-3 text-muted small">
        <em>Endpoints expected: /api/admin/users/email-audit, /api/admin/declarations/edit-requests (or /api/declarations/edit-requests), /api/it-admin/user-creation-audit, /api/it-admin/admin-creation-audit.</em>
      </div>
    </div>
  );
};

export default ITAdminAuditsAndRequests;
