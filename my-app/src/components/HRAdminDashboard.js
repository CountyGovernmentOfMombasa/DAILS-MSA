import React, { useState, useEffect } from 'react';
import EmailManagement from './EmailManagement';
import DepartmentUserStatus from './DepartmentUserStatus';
import WealthDeclarationRegister from './WealthDeclarationRegister';
import 'bootstrap/dist/css/bootstrap.min.css';
import './AdminPage.css';

const HRAdminDashboard = ({ adminUser }) => {
  const [declarations, setDeclarations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentTab, setCurrentTab] = useState('declarations');
  const adminToken = localStorage.getItem('adminToken');

  useEffect(() => {
    // Fetch declarations (excluding financial data)
    const fetchDeclarations = async () => {
      try {
        const res = await fetch('/api/hr-admin/declarations', {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        if (!res.ok) throw new Error('Failed to fetch declarations');
  const data = await res.json();
  // Use the correct property from the API response
  setDeclarations(Array.isArray(data.data) ? data.data : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDeclarations();
  }, [adminToken]);


  return (
  <div className="container mt-4">
    <h2>Dedicated DIALs Officer Dashboard</h2>
    <div className="mb-3">
      <button className="btn btn-outline-primary me-2" onClick={() => setCurrentTab('declarations')}>List of Declarations</button>
      <button className="btn btn-outline-primary me-2" onClick={() => setCurrentTab('wealth-register')}>Wealth Declaration Register</button>
      <button className="btn btn-outline-primary me-2" onClick={() => setCurrentTab('email')}>Email Management</button>
      <button className="btn btn-outline-primary me-2" onClick={() => setCurrentTab('dept-user-status')}>Department Staff Status</button>
    <div className="float-end d-flex gap-2">
    </div>
    </div>
      {loading && <div>Loading...</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {!loading && !error && (
        <div>
          {currentTab === 'declarations' && (
            <div>
              <h4>All Declarations</h4>
              <ul className="list-group">
                {declarations.map(decl => (
                  <li key={decl.id} className="list-group-item">
                    {decl.surname}, {decl.first_name} {decl.other_names} - {decl.national_id} - {decl.payroll_number} - {decl.status}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {currentTab === 'email' && <EmailManagement adminUser={adminUser} />}
          {currentTab === 'wealth-register' && <WealthDeclarationRegister adminUser={adminUser} />}
          {currentTab === 'dept-user-status' && <DepartmentUserStatus adminUser={adminUser} />}
        </div>
      )}
    </div>
  );
};

export default HRAdminDashboard;
