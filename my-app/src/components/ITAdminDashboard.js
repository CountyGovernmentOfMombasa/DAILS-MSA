import AdminConsentLogs from "./AdminConsentLogs";
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import EmailManagement from "./EmailManagement";
import ReportsAndAnalytics from "./ReportsAndAnalytics";
import AdminUserCreation from "./AdminUserCreation";
import AddUserForm from "./AddUserForm";
import ITAdminAuditsAndRequests from "./ITAdminAuditsAndRequests";
import UserAccountManagement from "./UserAccountManagement";
import DepartmentOverview from "./DepartmentOverview";
import SubDepartmentOverview from "./SubDepartmentOverview";
import BulkSMSPanel from "./BulkSMSPanel";
import "bootstrap/dist/css/bootstrap.min.css";
import "./AdminPage.css";
import { getUsersCount } from "../api";

const ITAdminDashboard = ({ adminUser }) => {
  const [declarations, setDeclarations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentTab, setCurrentTab] = useState("dept-overview");
  const [deptStats, setDeptStats] = useState(null);
  const [loadingDeptStats, setLoadingDeptStats] = useState(false);
  const [deptStatsFetchedAt, setDeptStatsFetchedAt] = useState(null);
  const DEPT_STATS_TTL_MS = 5 * 60 * 1000; // 5 minutes
  // Report & analytics related state
  const [reportData, setReportData] = useState({});
  const [biennialLocked, setBiennialLocked] = useState(false);
  const [firstLocked, setFirstLocked] = useState(false);
  const [finalLocked, setFinalLocked] = useState(false);
  const [usersCount, setUsersCount] = useState(0);

  const adminToken = localStorage.getItem("adminToken");
  const navigate = useNavigate();

  // Helpers replicated (simplified) from AdminPage
  const sumFinancialField = (field) => {
    if (Array.isArray(field)) {
      return field.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
    }
    if (typeof field === "string") {
      try {
        const arr = JSON.parse(field);
        if (Array.isArray(arr)) {
          return arr.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
        }
        const num = parseFloat(field);
        return isNaN(num) ? 0 : num;
      } catch {
        const num = parseFloat(field);
        return isNaN(num) ? 0 : num;
      }
    }
    if (typeof field === "number") return field;
    return 0;
  };

  const generateReportData = useCallback((data) => {
    if (!Array.isArray(data) || data.length === 0) {
      setReportData({ maritalStatus: {}, incomeRanges: {}, assetsLiabilities: [] });
      return;
    }
    const maritalStatus = data.reduce((acc, curr) => {
      acc[curr.marital_status] = (acc[curr.marital_status] || 0) + 1;
      return acc;
    }, {});
    const incomeRanges = { "0-50k": 0, "50k-100k": 0, "100k-200k": 0, "200k+": 0 };
    for (const d of data) {
      const income = sumFinancialField(d.biennial_income);
      if (income < 50000) incomeRanges["0-50k"]++;
      else if (income < 100000) incomeRanges["50k-100k"]++;
      else if (income < 200000) incomeRanges["100k-200k"]++;
      else incomeRanges["200k+"]++;
    }
    const assetsLiabilities = data.map((d) => {
      const assets = sumFinancialField(d.assets);
      const liabilities = sumFinancialField(d.liabilities);
      return { id: d.id, assets, liabilities, netWorth: assets - liabilities };
    });
    setReportData({ maritalStatus, incomeRanges, assetsLiabilities });
  }, []);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const res = await fetch("/api/it-admin/declarations", {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        let data = [];
        if (res.ok) {
          const json = await res.json();
            data = Array.isArray(json.data) ? json.data : [];
        }
        setDeclarations(data);
        generateReportData(data);
        // Locks (reuse admin endpoint; IT admin may have permission)
        try {
          const locksRes = await fetch("/api/admin/settings/locks", {
            headers: { Authorization: `Bearer ${adminToken}` },
          });
          if (locksRes.ok) {
            const locksJson = await locksRes.json();
            if (locksJson.success && locksJson.locks) {
              setBiennialLocked(!!locksJson.locks.biennial_declaration_locked);
              setFirstLocked(!!locksJson.locks.first_declaration_locked);
              setFinalLocked(!!locksJson.locks.final_declaration_locked);
            }
          }
        } catch {}
        // Users count
        try {
          const count = await getUsersCount(adminToken);
          setUsersCount(count || 0);
        } catch {
          setUsersCount(0);
        }
      } catch (err) {
        setError(err.message || "Failed to fetch data");
        setDeclarations([]);
      } finally {
        setLoading(false);
      }
    };
    if (adminToken) fetchAll();
  }, [adminToken, generateReportData]);

  const handleToggleBiennialLock = async () => {
    try {
      const res = await fetch("/api/admin/settings/locks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ biennial_declaration_locked: !biennialLocked }),
      });
      if (!res.ok) throw new Error("Failed to update lock");
      const data = await res.json();
      setBiennialLocked(!!data?.locks?.biennial_declaration_locked);
    } catch (e) {
      alert("Error updating biennial lock: " + e.message);
    }
  };

  const handleToggleFirstLock = async () => {
    try {
      const res = await fetch("/api/admin/settings/locks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ first_declaration_locked: !firstLocked }),
      });
      if (!res.ok) throw new Error("Failed to update lock");
      const data = await res.json();
      setFirstLocked(!!data?.locks?.first_declaration_locked);
    } catch (e) {
      alert("Error updating first lock: " + e.message);
    }
  };

  const handleToggleFinalLock = async () => {
    try {
      const res = await fetch("/api/admin/settings/locks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ final_declaration_locked: !finalLocked }),
      });
      if (!res.ok) throw new Error("Failed to update lock");
      const data = await res.json();
      setFinalLocked(!!data?.locks?.final_declaration_locked);
    } catch (e) {
      alert("Error updating final lock: " + e.message);
    }
  };

  const downloadReport = (reportType) => {
    let csvContent = "";
    let filename = "";
    switch (reportType) {
      case "full":
        csvContent = "Payroll Number,Declaration Date,Marital Status,Annual Income,Assets,Liabilities,Net Worth\n";
        declarations.forEach((d) => {
          const assets = sumFinancialField(d.assets);
          const liabilities = sumFinancialField(d.liabilities);
          const income = sumFinancialField(d.biennial_income);
          const netWorth = assets - liabilities;
          csvContent += `${d.payroll_number},${d.declaration_date},${d.marital_status},${income},${assets},${liabilities},${netWorth}\n`;
        });
        filename = "full_declarations_report.csv";
        break;
      case "summary":
        csvContent = "Metric,Value\n";
        csvContent += `Total Declarations,${declarations.length}\n`;
        const avgIncome = declarations.length > 0
          ? Math.round(declarations.reduce((sum, d) => sum + sumFinancialField(d.biennial_income), 0) / declarations.length)
          : 0;
        csvContent += `Average Income,${avgIncome}\n`;
        const totalAssets = declarations.reduce((sum, d) => sum + sumFinancialField(d.assets), 0);
        const totalLiabilities = declarations.reduce((sum, d) => sum + sumFinancialField(d.liabilities), 0);
        csvContent += `Total Assets,${totalAssets}\n`;
        csvContent += `Total Liabilities,${totalLiabilities}\n`;
        filename = "summary_report.csv";
        break;
      default:
        return;
    }
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

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
        <button className="btn btn-outline-primary" onClick={() => setCurrentTab("add-user")}>Add User </button>
        <button className="btn btn-outline-primary" onClick={() => setCurrentTab("email")}> Email Management</button>
        <button className="btn btn-outline-primary" onClick={() => setCurrentTab("account-management")}> Account Management </button>
        <button className="btn btn-outline-primary" onClick={() => setCurrentTab("reports")}> Reports & Analytics</button>
        <button className="btn btn-outline-primary" onClick={() => setCurrentTab("audits")}> Audits & Edit Requests</button>
        <button className="btn btn-outline-primary" onClick={() => setCurrentTab("dept-overview")} > Department Overview</button>
        <button className="btn btn-outline-primary" onClick={() => setCurrentTab("sub-department")} > Sub-Department Overview</button>
        <button className="btn btn-outline-primary" onClick={() => setCurrentTab("bulk-sms")}> Bulk SMS </button>
        <button className="btn btn-outline-primary" onClick={() => setCurrentTab("adminUser")}> Admin User Creation </button>
        <button className="btn btn-outline-primary" onClick={() => setCurrentTab("consent-logs")} > Consent Logs </button>
        <div className="ms-auto d-flex gap-2">
          <button className="btn btn-secondary" onClick={() => navigate("/landing")}>Back to Landing</button>
        </div>
      </div>
      {loading && <div>Loading...</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {!loading && !error && (
        <div>
          {currentTab === "add-user" && <AddUserForm />}
          {currentTab === "account-management" && <UserAccountManagement />}
          {currentTab === "email" && <EmailManagement adminUser={adminUser} />}
          {currentTab === "audits" && <ITAdminAuditsAndRequests />}
          {currentTab === "reports" && ( <ReportsAndAnalytics declarations={declarations} reportData={reportData} biennialLocked={biennialLocked} handleToggleBiennialLock={handleToggleBiennialLock} firstLocked={firstLocked} handleToggleFirstLock={handleToggleFirstLock} finalLocked={finalLocked} handleToggleFinalLock={handleToggleFinalLock} downloadReport={downloadReport} usersCount={usersCount} adminUser={adminUser} /> )}
          {currentTab === "adminUser" && (<AdminUserCreation adminUser={adminUser} />)}
          {currentTab === "dept-overview" && (<DepartmentOverview declarations={declarations} backendStats={deptStats} loading={loadingDeptStats} onRefresh={() => fetchDeptStats(true)} /> )}
         {currentTab === 'sub-department' && ( <SubDepartmentOverview declarations={declarations} loading={loading} /> )}
          {currentTab === "consent-logs" && (  <AdminConsentLogs adminUser={adminUser} /> )}
          {currentTab === "bulk-sms" && <BulkSMSPanel itAdmin />}
        </div>
      )}
    </div>
  );
};

export default ITAdminDashboard;
