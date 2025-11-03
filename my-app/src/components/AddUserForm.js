import React, { useState } from 'react';
import { useDepartments } from '../hooks/useDepartments';

// Form for IT Admin to add a normal (non-admin) user directly to the database
// Uses the existing public registration endpoint (/api/auth/register)
// This keeps backend changes minimal. If a protected admin-only endpoint is later
// introduced, just change the fetch URL and add Authorization header.
const AddUserForm = () => {
  const initialState = {
    national_id: '',
    payroll_number: '',
    first_name: '',
    surname: '',
    other_names: '',
    email: '',
    birthdate: '',
    place_of_birth: '',
    postal_address: '',
    physical_address: '',
    designation: '',
  department: '',
  sub_department: '',
    nature_of_employment: '',
    phone_number: ''
  };

  const [form, setForm] = useState(initialState);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const { subDepartments: ALL_SUB_DEPARTMENTS, subToParent: SUB_DEPARTMENT_PARENT, loading: deptsLoading, error: deptError, reload } = useDepartments();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => {
      if (name === 'sub_department') {
        const parent = SUB_DEPARTMENT_PARENT[value] || '';
        return { ...prev, sub_department: value, department: parent };
      }
      if (name === 'department') {
        // If department manually changed (edge case), clear sub_department if mismatch
        if (prev.sub_department && SUB_DEPARTMENT_PARENT[prev.sub_department] !== value) {
          return { ...prev, department: value, sub_department: '' };
        }
      }
      return { ...prev, [name]: value };
    });
    setSuccess('');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSuccess('');
    setError('');
    try {
      // Basic client validation
      if (!form.national_id || !form.first_name || !form.surname || !form.email || !form.birthdate) {
        setError('Please fill in required fields (National ID, Names, Email, Birthdate).');
        setLoading(false);
        return;
      }
      const res = await fetch('/api/it-admin/create-user', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Failed to create user');
      } else {
        setSuccess(`User created successfully. Default password: ${data.defaultPassword || 'Change@001'}`);
        setForm(initialState);
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-4 mt-3">
      <h5 className="mb-3">Add New User</h5>
      <form onSubmit={handleSubmit}>
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">National ID *</label>
            <input name="national_id" value={form.national_id} onChange={handleChange} className="form-control" required />
          </div>
          <div className="col-md-4">
            <label className="form-label">First Name *</label>
            <input name="first_name" value={form.first_name} onChange={handleChange} className="form-control" required />
          </div>
            <div className="col-md-4">
            <label className="form-label">Surname *</label>
            <input name="surname" value={form.surname} onChange={handleChange} className="form-control" required />
          </div>
          <div className="col-md-4">
            <label className="form-label">Other Names</label>
            <input name="other_names" value={form.other_names} onChange={handleChange} className="form-control" />
          </div>
          <div className="col-md-4">
            <label className="form-label">Email *</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} className="form-control" required />
          </div>
          <div className="col-md-4">
            <label className="form-label">Birthdate *</label>
            <input type="date" name="birthdate" value={form.birthdate} onChange={handleChange} className="form-control" required />
          </div>
          <div className="col-md-4">
            <label className="form-label">Payroll Number</label>
            <input name="payroll_number" value={form.payroll_number} onChange={handleChange} className="form-control" />
          </div>
          <div className="col-md-4">
            <label className="form-label">Phone Number</label>
            <input name="phone_number" value={form.phone_number} onChange={handleChange} className="form-control" placeholder="e.g. +2547XXXXXXX" />
          </div>
          <div className="col-md-4">
            <label className="form-label">Designation</label>
            <input name="designation" value={form.designation} onChange={handleChange} className="form-control" />
          </div>
          <div className="col-md-6">
            <label className="form-label">Sub Department *</label>
            <select name="sub_department" value={form.sub_department} onChange={handleChange} className="form-select" required>
              <option value="">Select sub department first</option>
              {ALL_SUB_DEPARTMENTS.map(sd => <option key={sd} value={sd}>{sd}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label">Department (auto)</label>
            <input name="department" value={form.department} onChange={handleChange} className="form-control" readOnly placeholder="Auto-set from Sub Department" />
          </div>
          <div className="col-md-4">
            <label className="form-label">Nature of Employment</label>
            <select name="nature_of_employment" value={form.nature_of_employment} onChange={handleChange} className="form-select">
              <option value="">Select</option>
              <option value="Permanent">Permanent</option>
              <option value="Contract">Contract</option>
              <option value="Casual">Casual</option>
              <option value="Part-time">Part-time</option>
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Place of Birth</label>
            <input name="place_of_birth" value={form.place_of_birth} onChange={handleChange} className="form-control" />
          </div>
          <div className="col-md-4">
            <label className="form-label">Postal Address</label>
            <input name="postal_address" value={form.postal_address} onChange={handleChange} className="form-control" />
          </div>
          <div className="col-md-8">
            <label className="form-label">Physical Address</label>
            <textarea name="physical_address" value={form.physical_address} onChange={handleChange} className="form-control" rows={2} />
          </div>
        </div>
        <div className="mt-3">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Saving...' : 'Add User'}
          </button>
        </div>
  {success && <div className="alert alert-success mt-2">{success}</div>}
  {error && <div className="alert alert-danger mt-2">{error}</div>}
  {deptError && <div className="alert alert-warning mt-2">Dept load issue: {deptError} <button type="button" className="btn btn-sm btn-outline-secondary ms-2" onClick={reload}>Retry</button></div>}
  {deptsLoading && <div className="small text-muted mt-2">Loading departments...</div>}
        <p className="text-muted small mt-2 mb-0">Password policy: User's initial password is their birthdate (YYYY-MM-DD). They should change it after first login.</p>
      </form>
    </div>
  );
};

export default AddUserForm;
