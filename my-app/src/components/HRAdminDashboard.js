import React, { useState, useEffect } from "react";
import EmailManagement from "./EmailManagement";
import DepartmentUserStatus from "./DepartmentUserStatus";
import WealthDeclarationRegister from "./WealthDeclarationRegister";
import HRSubDepartmentUsers from './HRSubDepartmentUsers';
import "bootstrap/dist/css/bootstrap.min.css";
import "./AdminPage.css";

const HRAdminDashboard = ({ adminUser }) => {
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState("declarations");
  // The WealthDeclarationRegister component fetches its own data, so we don't need to do it here.
  // We can just manage a simple loading state.
  useEffect(() => {
    setLoading(false);
  }, []);

  return (
    <div className="container mt-4">
      <h2>Dedicated DIALs Officer Dashboard</h2>
      <div className="mb-3">
        <button
          className="btn btn-outline-primary me-2"
          onClick={() => setCurrentTab("declarations")}
        >
          List of Declarations
        </button>
        <button
          className="btn btn-outline-primary me-2"
          onClick={() => setCurrentTab("wealth-register")}
        >
          Wealth Declaration Register
        </button>
                <button
                  className={`nav-link ${currentTab === 'hr-sub-dept-users' ? 'active' : ''}`}
                  onClick={() => setCurrentTab('hr-sub-dept-users')}>
                  My Sub-Department
                </button>
        <button
          className="btn btn-outline-primary me-2"
          onClick={() => setCurrentTab("email")}
        >
          Email Management
        </button>
        <button
          className="btn btn-outline-primary me-2"
          onClick={() => setCurrentTab("dept-user-status")}
        >
          Department Staff Status
        </button>
        <div className="float-end d-flex gap-2"></div>
      </div>
      {loading && <div>Loading...</div>}
      {/* Error state removed, so only check for loading */}
      {!loading && (
        <div>
          {currentTab === "declarations" && (<WealthDeclarationRegister adminUser={adminUser} />)}
          {currentTab === "hr-sub-dept-users" && (<HRSubDepartmentUsers adminUser={adminUser} /> )}
          {currentTab === "email" && <EmailManagement adminUser={adminUser} />}
          {currentTab === "wealth-register" && (<WealthDeclarationRegister adminUser={adminUser} />)}
          {currentTab === "dept-user-status" && (<DepartmentUserStatus adminUser={adminUser} />)}
        </div>
      )}
    </div>
  );
};

export default HRAdminDashboard;
