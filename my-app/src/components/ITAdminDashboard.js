import AdminConsentLogs from "./AdminConsentLogs";
import React, { useState, useEffect, useCallback } from "react";
import EmailManagement from "./EmailManagement";
import ReportsAndAnalytics from "./ReportsAndAnalytics";
import AdminUserCreation from "./AdminUserCreation";
import AddUserForm from "./AddUserForm";
import ITAdminAuditsAndRequests from "./ITAdminAuditsAndRequests";
import UserAccountManagement from "./UserAccountManagement";
import DepartmentOverview from "./DepartmentOverview";
import BulkSMSPanel from "./BulkSMSPanel";
import "bootstrap/dist/css/bootstrap.min.css";
import "./AdminPage.css";

const ITAdminDashboard = ({ adminUser }) => {
  const [declarations, setDeclarations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Default to the new Add User tab since declarations tab is removed
  const [currentTab, setCurrentTab] = useState("dept-overview");
  const [deptStats, setDeptStats] = useState(null);
  const [loadingDeptStats, setLoadingDeptStats] = useState(false);
  const [deptStatsFetchedAt, setDeptStatsFetchedAt] = useState(null);
  const DEPT_STATS_TTL_MS = 5 * 60 * 1000; // 5 minutes

  const adminToken = localStorage.getItem("adminToken");

  useEffect(() => {
    // Fetch declarations (excluding financial data)
    const fetchDeclarations = async () => {
      try {
        const res = await fetch("/api/it-admin/declarations", {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        if (!res.ok) throw new Error("Failed to fetch declarations");
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

  const fetchDeptStats = useCallback(
    async (force = false) => {
      try {
        const now = Date.now();
        if (
          !force &&
          deptStats &&
          deptStatsFetchedAt &&
          now - deptStatsFetchedAt < DEPT_STATS_TTL_MS
        ) {
          return;
        }
        setLoadingDeptStats(true);
        const token = localStorage.getItem("adminToken");
        const res = await fetch("/api/admin/reports/departments", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          setDeptStats(data.data);
          setDeptStatsFetchedAt(now);
        }
      } catch (e) {
        // Non-fatal
      } finally {
        setLoadingDeptStats(false);
      }
    },
    [deptStats, deptStatsFetchedAt, DEPT_STATS_TTL_MS]
  );

  useEffect(() => {
    if (currentTab === "dept-overview" && !loadingDeptStats) {
      fetchDeptStats(false);
    }
  }, [currentTab, loadingDeptStats, fetchDeptStats]);

  return (
    <div className="container mt-4">
      <h2>Digital Transformation Team Dashboard</h2>
      <div className="mb-3 d-flex flex-wrap gap-2 align-items-center">
        <button
          className="btn btn-outline-primary"
          onClick={() => setCurrentTab("add-user")}
        >
          Add User
        </button>
        <button
          className="btn btn-outline-primary"
          onClick={() => setCurrentTab("email")}
        >
          Email Management
        </button>
        <button
          className="btn btn-outline-primary"
          onClick={() => setCurrentTab("account-management")}
        >
          Account Management
        </button>
        <button
          className="btn btn-outline-primary"
          onClick={() => setCurrentTab("reports")}
        >
          Reports & Analytics
        </button>
        <button
          className="btn btn-outline-primary"
          onClick={() => setCurrentTab("audits")}
        >
          Audits & Edit Requests
        </button>
        <button
          className="btn btn-outline-primary"
          onClick={() => setCurrentTab("dept-overview")}
        >
          Department Overview
        </button>
        <button
          className="btn btn-outline-primary"
          onClick={() => setCurrentTab("bulk-sms")}
        >
          Bulk SMS
        </button>
        <button
          className="btn btn-outline-success"
          onClick={() => setCurrentTab("adminUser")}
        >
          Admin User Creation
        </button>
        <button
          className="btn btn-outline-primary"
          onClick={() => setCurrentTab("consent-logs")}
        >
          Consent Logs
        </button>
        <div className="ms-auto d-flex gap-2"></div>
      </div>
      {loading && <div>Loading...</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {!loading && !error && (
        <div>
          {currentTab === "add-user" && <AddUserForm />}
          {currentTab === "account-management" && <UserAccountManagement />}
          {currentTab === "email" && <EmailManagement adminUser={adminUser} />}
          {currentTab === "audits" && <ITAdminAuditsAndRequests />}
          {currentTab === "reports" && (
            <ReportsAndAnalytics
              declarations={declarations}
              reportData={{}}
              adminUser={adminUser}
            />
          )}
          {currentTab === "adminUser" && (
            <AdminUserCreation adminUser={adminUser} />
          )}
          {currentTab === "dept-overview" && (
            <DepartmentOverview
              declarations={declarations}
              backendStats={deptStats}
              loading={loadingDeptStats}
              onRefresh={() => fetchDeptStats(true)}
            />
          )}
          {currentTab === "consent-logs" && (
            <AdminConsentLogs adminUser={adminUser} />
          )}
          {currentTab === "bulk-sms" && <BulkSMSPanel itAdmin />}
        </div>
      )}
    </div>
  );
};

export default ITAdminDashboard;
