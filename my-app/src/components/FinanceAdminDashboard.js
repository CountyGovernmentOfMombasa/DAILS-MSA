import AdminConsentLogs from './AdminConsentLogs';
import React, { useState, useEffect } from 'react';
import ReportsAndAnalytics from './ReportsAndAnalytics';
import DepartmentUserStatus from './DepartmentUserStatus';
import 'bootstrap/dist/css/bootstrap.min.css';
import './AdminPage.css';

const FinanceAdminDashboard = ({ adminUser }) => {
  const [declarations, setDeclarations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentTab, setCurrentTab] = useState('declarations');

  const adminToken = localStorage.getItem('adminToken');

  useEffect(() => {
    // Fetch all declarations (with financial data)
    const fetchDeclarations = async () => {
      try {
        const res = await fetch('/api/finance-admin/declarations', {
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
      <h2>PSB Review Team Dashboard</h2>
      <div className="mb-3">
        <button className="btn btn-outline-primary" onClick={() => setCurrentTab('reports')}>Reports & Analytics</button>
        <button className="btn btn-outline-primary me-2" onClick={() => setCurrentTab('dept-user-status')}>Dept User Status</button>
        <button className="btn btn-outline-primary me-2" onClick={() => setCurrentTab('consent-logs')}>Consent Logs</button>
        <div className="float-end d-flex gap-2">
        </div>
      </div>
      {loading && <div>Loading...</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {!loading && !error && (
        <div>
          {currentTab === 'reports' && <ReportsAndAnalytics declarations={declarations} reportData={{}} hideDeclarationTypeSummary hideBiennialLock adminUser={adminUser} />}
          {currentTab === 'dept-user-status' && <DepartmentUserStatus adminUser={adminUser} />}
          {currentTab === 'consent-logs' && <AdminConsentLogs adminUser={adminUser}/>}
        </div>
      )}
    </div>
  );
};

export default FinanceAdminDashboard;
