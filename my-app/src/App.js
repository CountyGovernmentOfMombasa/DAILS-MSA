import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LandingPage from "./components/LandingPage";
import AdminAccessChoice from "./components/AdminAccessChoice";
import DeclarationTypePage from "./components/DeclarationTypePage";
import LoginPage from "./components/LoginPage";
import UserForm from "./components/UserForm";
import SpouseForm from "./components/SpouseForm";
import FinancialForm from "./components/FinancialForm";
import ReviewPage from "./components/ReviewPage";
import EditDeclarationPage from "./components/EditDeclarationPage";
import EditSelection from "./components/EditSelection";
import ConfirmationPage from "./components/ConfirmationPage";
import ChangePasswordPage from "./components/ChangePasswordPage";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import DeclarationView from "./components/DeclarationView";
import AdminPage from "./components/AdminPage";
import HRAdminDashboard from "./components/HRAdminDashboard";
import ITAdminDashboard from "./components/ITAdminDashboard";
import FinanceAdminDashboard from "./components/FinanceAdminDashboard";
import ErrorBoundary from "./components/ErrorBoundary";
import GuidNotes from "./components/GuidNotes";
import "./App.css";
import { UserProvider } from "./context/UserContext";
import GlobalLogoutButton from "./components/GlobalLogoutButton";
import IdleSessionMonitor from "./components/IdleSessionMonitor";
import CustomTranslateButton from "./components/CustomTranslateButton";

// This component acts as a router for different admin roles.
// It receives the adminUser object from AdminProtectedRoute and renders the appropriate dashboard.
const AdminRoleRouter = ({ adminUser }) => {
  // A non-super admin role might be, e.g., 'hr_admin', 'it_admin', etc.
  // The `adminUser` object should contain a `role` property.
  if (!adminUser) {
    // Fallback or loading state if adminUser is not available yet
    return <AdminPage />;
  }

  switch (adminUser.role) {
    case "hr_admin":
      return <HRAdminDashboard adminUser={adminUser} />;
    case "it_admin":
      return <ITAdminDashboard adminUser={adminUser} />;
    case "finance_admin":
      return <FinanceAdminDashboard adminUser={adminUser} />;
    default: // Includes 'super_admin' and any other unhandled roles
      return <AdminPage adminUser={adminUser} />;
  }
};
function App() {
  return (
    <ErrorBoundary>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UserProvider>
          <GlobalLogoutButton />
          <IdleSessionMonitor />
          <CustomTranslateButton />
          <div className="App">
            <Routes>
              <Route path="/" element={<LoginPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/landing" element={<LandingPage />} />
              <Route path="/admin-access" element={<AdminAccessChoice />} />
              <Route
                path="/select-declaration-type"
                element={<DeclarationTypePage />}
              />
              <Route path="/user-form" element={<UserForm />} />
              <Route path="/spouse-form" element={<SpouseForm />} />
              <Route path="/financial-form" element={<FinancialForm />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route
                path="/edit-declaration"
                element={<EditDeclarationPage />}
              />
              <Route path="/declaration/:id" element={<DeclarationView />} />
              <Route path="/edit-selection/:id" element={<EditSelection />} />
              <Route path="/confirmation" element={<ConfirmationPage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/guidnotes" element={<GuidNotes />} />
              <Route
                path="/admin"
                element={
                  <AdminProtectedRoute>
                    {(props) => <AdminRoleRouter {...props} />}
                  </AdminProtectedRoute>
                }
              />
            </Routes>
          </div>
        </UserProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
