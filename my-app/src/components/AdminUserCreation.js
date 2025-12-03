import React, { useState } from 'react';
import { useDepartments } from '../hooks/useDepartments';

const AdminUserCreation = ({ adminUser }) => {
  const [form, setForm] = useState({
    first_name: '',
    surname: '',
    username: '',
    role: 'hr_admin',
    department: '',
    sub_department: '',
    linkExistingUser: false,
    userId: '',
    nationalId: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  // Lookup UI states
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupNotFound, setLookupNotFound] = useState(false);
  const [lastLookupNationalId, setLastLookupNationalId] = useState('');

  const { subToParent: SUB_DEPARTMENT_PARENT, subDepartments: SUB_DEPARTMENTS, loading: deptsLoading, error: deptError, reload } = useDepartments();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => {
      if (name === 'sub_department') {
        const parent = SUB_DEPARTMENT_PARENT[value] || '';
        return { ...prev, sub_department: value, department: parent };
      }
      if (name === 'department') {
        if (prev.sub_department && SUB_DEPARTMENT_PARENT[prev.sub_department] !== value) {
          return { ...prev, department: value, sub_department: '' };
        }
      }
      if (name === 'linkExistingUser') {
        const checked = e.target.checked;
        return { ...prev, linkExistingUser: checked, userId: checked ? prev.userId : '', nationalId: checked ? prev.nationalId : '' };
      }
      // When first_name or surname change, auto-build a username if user hasn't manually edited (simple heuristic: previous username equals previous composed name)
      if (name === 'first_name' || name === 'surname') {
        const newFirst = name === 'first_name' ? value : prev.first_name;
        const newSurname = name === 'surname' ? value : prev.surname;
        const composed = (newFirst + ' ' + newSurname).trim().toLowerCase().replace(/\s+/g, '.');
        let nextUsername = prev.username;
        const prevComposed = (prev.first_name + ' ' + prev.surname).trim().toLowerCase().replace(/\s+/g, '.');
        if (!prev.username || prev.username === prevComposed) {
          nextUsername = composed;
        }
        return { ...prev, [name]: value, username: nextUsername };
      }
      return { ...prev, [name]: value };
    });
    setError('');
    setSuccess('');
  };

  // Auto-fetch user details by national ID when linking and nationalId length appears valid
  const handleNationalIdBlur = async () => {
    const raw = form.nationalId.trim();
    if (!form.linkExistingUser || !raw || raw.length < 4) return;
    // Avoid duplicate lookups for the same value
    if (lastLookupNationalId === raw) return;
    setLastLookupNationalId(raw);
    setLookupLoading(true);
    setLookupNotFound(false);
    try {
      const res = await fetch(`/api/admin/users/lookup?nationalId=${encodeURIComponent(raw)}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` }
      });
      if (!res.ok) {
        setLookupLoading(false);
        return;
      }
      const data = await res.json();
      if (data && data.success && data.user) {
        setLookupNotFound(false);
        setForm(prev => {
          const autoFirst = data.user.first_name || prev.first_name;
          const autoSurname = data.user.surname || prev.surname;
          const composed = (autoFirst + ' ' + autoSurname).trim().toLowerCase().replace(/\s+/g, '.');
          const prevComposed = (prev.first_name + ' ' + prev.surname).trim().toLowerCase().replace(/\s+/g, '.');
          let nextUsername = prev.username;
          if (!prev.username || prev.username === prevComposed) {
            nextUsername = composed;
          }
          return {
            ...prev,
            first_name: autoFirst,
            surname: autoSurname,
            userId: data.user.id || prev.userId,
            department: prev.role === 'super_admin' ? '' : (data.user.department || prev.department), // Populate department from user record
            sub_department: prev.role === 'super_admin' ? '' : (data.user.sub_department || prev.sub_department), // Populate sub-department
            username: nextUsername
          };
        });
      } else {
        setLookupNotFound(true);
      }
    } catch (_) {
      // Network / parsing issues silently ignored
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      // Validation for department & sub-department when not super_admin
      if (form.linkExistingUser) {
        if (!form.userId) {
          setLoading(false);
          setError('Please look up a user by National ID and ensure a User ID is populated.');
          return;
        }
      } else if (form.role !== 'super_admin') {
        if (!form.sub_department) {
          setLoading(false);
          setError('Sub Department is required');
          return;
        }
        if (!form.department) {
          setLoading(false);
          setError('Department derivation failed for selected sub department');
          return;
        }
      }
      const payload = {
        username: form.username,
        role: form.role,
        first_name: form.first_name || undefined,
        surname: form.surname || undefined,
        department: form.role === 'super_admin' ? undefined : form.department || undefined,
        sub_department: form.role === 'super_admin' ? undefined : form.sub_department || undefined,
        linkExistingUser: form.linkExistingUser || undefined,
        userId: form.userId ? parseInt(form.userId,10) : undefined,
        nationalId: form.nationalId || undefined
      };
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess('Admin user created successfully!');
        setForm({ first_name: '', surname: '', username: '', role: 'hr_admin', department: '', sub_department: '', linkExistingUser:false, userId:'', nationalId:'' });
      } else {
        setError(data.message || 'Failed to create admin user');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-4 mt-3">
      <h5>Create New Admin User</h5>
      <form onSubmit={handleSubmit}>
        <div className="mb-2">
          <label className="form-label">First Name</label>
          <input type="text" className="form-control" name="first_name" value={form.first_name} onChange={handleChange} required />
        </div>
        <div className="mb-2">
          <label className="form-label">Surname</label>
          <input type="text" className="form-control" name="surname" value={form.surname} onChange={handleChange} required />
        </div>
        <div className="mb-2">
          <label className="form-label">Username</label>
          <input type="text" className="form-control" name="username" value={form.username} onChange={handleChange} required />
        </div>
        <div className="form-check form-switch mb-2">
          <input className="form-check-input" type="checkbox" id="linkUserChk" name="linkExistingUser" checked={form.linkExistingUser} onChange={handleChange} />
          <label className="form-check-label" htmlFor="linkUserChk">Link to Existing User (no separate admin password)</label>
        </div>
        {form.linkExistingUser && (
          <div className="mb-2 border rounded p-2 bg-light">
            <div className="mb-2">
              <label className="form-label small">National ID</label>
              <input type="text" className="form-control form-control-sm" name="nationalId" value={form.nationalId} onChange={handleChange} onBlur={handleNationalIdBlur} placeholder="e.g. 12345678" required />
              {lookupLoading && <div className="small text-info mt-1">Looking up National ID...</div>}
              {(!lookupLoading && lookupNotFound) && <div className="small text-warning mt-1">No user found for that National ID.</div>}
            </div>
            <div className="mb-2">
              <label className="form-label small">User ID</label>
              <input type="number" className="form-control form-control-sm" name="userId" value={form.userId} placeholder="Populated from lookup" readOnly />
            </div>
            <div className="small text-muted">Enter the user's National ID to look them up and link their account.</div>
          </div>
        )}
        <div className="mb-2">
          <label className="form-label">Role</label>
          <select className="form-select" name="role" value={form.role} onChange={handleChange} required>
            <option value="hr_admin">HR Admin</option>
            <option value="it_admin">IT Admin</option>
            <option value="finance_admin">Finance Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
        {form.role !== 'super_admin' && (
          <>
            <div className="mb-2">
              <label className="form-label">Sub Department *</label>
              <select className="form-select" name="sub_department" value={form.sub_department} onChange={handleChange} required>
                <option value="">Select Sub Department</option>
                {SUB_DEPARTMENTS.map(sd => <option key={sd} value={sd}>{sd}</option>)}
              </select>
            </div>
            <div className="mb-2">
              <label className="form-label">Department (auto)</label>
              <input className="form-control" name="department" value={form.department} readOnly placeholder="Derived from Sub Department" />
            </div>
          </>
        )}
        {deptError && <div className="alert alert-warning mt-2">Dept load issue: {deptError} <button type="button" className="btn btn-sm btn-outline-secondary ms-2" onClick={reload}>Retry</button></div>}
        {deptsLoading && <div className="small text-muted">Loading departments...</div>}
        <button type="submit" className="btn btn-success" disabled={loading}>
          {loading ? 'Creating...' : 'Create Admin'}
        </button>
        {success && <div className="alert alert-success mt-2">{success}</div>}
        {error && <div className="alert alert-danger mt-2">{error}</div>}
      </form>
    </div>
  );
};

export default AdminUserCreation;
