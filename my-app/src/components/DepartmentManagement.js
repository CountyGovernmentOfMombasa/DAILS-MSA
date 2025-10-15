import React, { useEffect, useState } from 'react';

const DepartmentManagement = ({ adminUser }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newDeptSubs, setNewDeptSubs] = useState(['']);
  const token = localStorage.getItem('adminToken');

  const canManage = adminUser && (adminUser.role === 'super' || adminUser.role === 'super_admin');

  const fetchData = async () => {
    if (!canManage) return;
    try {
      setLoading(true); setError('');
      const res = await fetch('/api/admin/dept-config', { headers: { Authorization: `Bearer ${token}` }});
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || 'Failed');
      setData(j.data || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); // eslint-disable-next-line
  }, []);

  const addDepartment = async (e) => {
    e.preventDefault();
    if (!newDept.trim()) return;
    try {
      setLoading(true);
      const sub_departments = newDeptSubs.map(s => s.trim()).filter(Boolean);
      const res = await fetch('/api/admin/dept-config/department', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ name:newDept.trim(), sub_departments })});
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || 'Failed');
      setNewDept(''); setNewDeptSubs(['']);
      fetchData();
    } catch (e) { setError(e.message); setLoading(false);}  
  };

  const renameDepartment = async (id, current) => {
    const name = prompt('New department name', current);
    if (!name || !name.trim() || name === current) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/dept-config/department/${id}`, { method:'PUT', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ name })});
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || 'Failed');
      fetchData();
    } catch (e) { setError(e.message); setLoading(false);}  
  };

  // Modal state for richer reassignment UX
  const [modal, setModal] = useState({ show:false, mode:null, target:null, name:'', options:[], reassignId:'', deleting:false });

  const openDeleteDept = (dept) => {
    const others = data.filter(d => d.id !== dept.id);
    setModal({ show:true, mode:'dept', target:dept, name:dept.name, options:others, reassignId:'', deleting:false });
  };

  const openDeleteSub = (sub) => {
    const allSubs = data.flatMap(d => d.sub_departments.map(s => ({...s, deptName:d.name}))).filter(s => s.id !== sub.id);
    setModal({ show:true, mode:'sub', target:sub, name:sub.name, options:allSubs, reassignId:'', deleting:false });
  };

  const executeDeletion = async () => {
    if (!modal.target) return;
    try {
      setModal(m => ({ ...m, deleting:true }));
      let url; let method='DELETE'; let body; let headers={ Authorization:`Bearer ${token}` };
      if (modal.mode === 'dept') {
        url = `/api/admin/dept-config/department/${modal.target.id}`;
        if (modal.reassignId) { body = JSON.stringify({ reassign_to: modal.reassignId }); headers['Content-Type']='application/json'; }
      } else {
        url = `/api/admin/dept-config/sub/${modal.target.id}`;
        if (modal.reassignId) { body = JSON.stringify({ reassign_to: modal.reassignId }); headers['Content-Type']='application/json'; }
      }
      const res = await fetch(url, { method, headers, body });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || 'Deletion failed');
      setModal({ show:false, mode:null, target:null, name:'', options:[], reassignId:'', deleting:false });
      fetchData();
    } catch (e) {
      setError(e.message);
      setModal(m => ({ ...m, deleting:false }));
    }
  };

  const addSub = async (deptId) => {
    const name = prompt('Sub department name');
    if (!name || !name.trim()) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/dept-config/department/${deptId}/sub`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ name })});
      const j = await res.json(); if (!res.ok) throw new Error(j.message || 'Failed');
      fetchData();
    } catch (e) { setError(e.message); setLoading(false);}  
  };

  const renameSub = async (subId, current) => {
    const name = prompt('New sub department name', current);
    if (!name || !name.trim() || name === current) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/dept-config/sub/${subId}`, { method:'PUT', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body: JSON.stringify({ name })});
      const j = await res.json(); if (!res.ok) throw new Error(j.message || 'Failed');
      fetchData();
    } catch (e) { setError(e.message); setLoading(false);}  
  };

  // deleteSub replaced by openDeleteSub

  if (!canManage) return <div className="alert alert-warning">Super admin access required for Department Management.</div>;

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center">
        <h5 className="mb-0"><i className="bi bi-sliders me-2"></i>Department & Sub-Department Management</h5>
        <button className="btn btn-sm btn-outline-light" onClick={fetchData} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
      </div>
      <div className="card-body">
        {error && <div className="alert alert-danger">{error}</div>}
        <form className="mb-4" onSubmit={addDepartment}>
          <div className="row g-2 align-items-end">
            <div className="col-md-4">
              <label className="form-label">New Department</label>
              <input className="form-control" value={newDept} onChange={e=>setNewDept(e.target.value)} placeholder="e.g. Cooperatives" />
            </div>
            <div className="col-md-6">
              <label className="form-label">Sub Departments (comma or Enter)</label>
              {newDeptSubs.map((val,i) => (
                <input key={i} className="form-control mb-1" value={val} onChange={e => {
                  const next=[...newDeptSubs]; next[i]=e.target.value; setNewDeptSubs(next);
                }} onKeyDown={e => { if (e.key==='Enter'){ e.preventDefault(); setNewDeptSubs(s=>[...s,'']); } }} placeholder="MOWASSCO" />
              ))}
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={()=>setNewDeptSubs(s=>[...s,''])}>Add another</button>
            </div>
            <div className="col-md-2">
              <button className="btn btn-primary w-100" disabled={loading || !newDept.trim()}>Add</button>
            </div>
          </div>
        </form>
        <div className="table-responsive">
          <table className="table table-sm align-middle table-bordered">
            <thead className="table-light">
              <tr>
                <th style={{width:'25%'}}>Department</th>
                <th>Sub Departments</th>
                <th style={{width:'160px'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map(d => (
                <tr key={d.id}>
                  <td><strong>{d.name}</strong></td>
                  <td>
                    {d.sub_departments && d.sub_departments.length ? (
                      <ul className="list-unstyled mb-0">
                        {d.sub_departments.map(sd => (
                          <li key={sd.id} className="d-flex justify-content-between align-items-center border rounded px-2 py-1 mb-1">
                            <span>{sd.name}</span>
                            <span>
                              <button className="btn btn-sm btn-outline-secondary me-1" type="button" onClick={()=>renameSub(sd.id, sd.name)}>Rename</button>
                              <button className="btn btn-sm btn-outline-danger" type="button" onClick={()=>openDeleteSub(sd)}>Delete</button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : <span className="text-muted">(none)</span>}
                  </td>
                  <td>
                    <div className="d-flex flex-column gap-1">
                      <button className="btn btn-sm btn-outline-secondary" type="button" onClick={()=>renameDepartment(d.id, d.name)}>Rename</button>
                      <button className="btn btn-sm btn-outline-success" type="button" onClick={()=>addSub(d.id)}>Add Sub</button>
                      <button className="btn btn-sm btn-outline-danger" type="button" onClick={()=>openDeleteDept(d)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted small mt-3 mb-0">Note: Renaming updates existing user/admin records. Delete supports optional reassignment via the dialog.</p>
        {modal.show && (
          <div className="modal d-block" tabIndex="-1" role="dialog" style={{ background:'rgba(0,0,0,0.45)' }}>
            <div className="modal-dialog" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Delete {modal.mode === 'dept' ? 'Department' : 'Sub Department'}</h5>
                  <button type="button" className="btn-close" onClick={()=> setModal({ show:false, mode:null, target:null, name:'', options:[], reassignId:'', deleting:false })}></button>
                </div>
                <div className="modal-body">
                  <p className="mb-2">You are about to delete: <strong>{modal.name}</strong></p>
                  <p className="small text-muted">If it is in use you must reassign affected users/admins to another {modal.mode === 'dept' ? 'department' : 'sub department'}.</p>
                  {modal.options.length > 0 ? (
                    <div className="mb-3">
                      <label className="form-label">Optional Reassignment Target</label>
                      <select className="form-select" value={modal.reassignId} onChange={e=> setModal(m => ({ ...m, reassignId: e.target.value }))}>
                        <option value="">(None – attempt hard delete)</option>
                        {modal.options.map(o => (
                          <option key={o.id} value={o.id}>{o.name}{o.deptName ? ` (${o.deptName})` : ''}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="alert alert-info py-2">No alternative targets available; deletion will fail if in use.</div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" disabled={modal.deleting} onClick={()=> setModal({ show:false, mode:null, target:null, name:'', options:[], reassignId:'', deleting:false })}>Cancel</button>
                  <button type="button" className="btn btn-danger" disabled={modal.deleting} onClick={executeDeletion}>
                    {modal.deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DepartmentManagement;
