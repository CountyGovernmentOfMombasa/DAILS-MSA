import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import AdminAccessChoice from './components/AdminAccessChoice';
import DeclarationTypePage from './components/DeclarationTypePage';
import LoginPage from './components/LoginPage';
import UserForm from './components/UserForm';
import SpouseForm from './components/SpouseForm';
import FinancialForm from './components/FinancialForm';
import ReviewPage from './components/ReviewPage';
import EditDeclarationPage from './components/EditDeclarationPage';
import EditSelection from './components/EditSelection';
import ConfirmationPage from './components/ConfirmationPage';
import ChangePasswordPage from './components/ChangePasswordPage';
import AdminProtectedRoute from './components/AdminProtectedRoute';
import DeclarationView from './components/DeclarationView';
import AdminPage from './components/AdminPage';
import HRAdminDashboard from './components/HRAdminDashboard';
import ITAdminDashboard from './components/ITAdminDashboard';
// FinanceAdminDashboard removed; finance role deprecated
import ErrorBoundary from './components/ErrorBoundary';
import GuidNotes from './components/GuidNotes';
import './App.css';
import { UserProvider } from './context/UserContext';
import GlobalLogoutButton from './components/GlobalLogoutButton';
import IdleSessionMonitor from './components/IdleSessionMonitor';
import ProfileErrorToast from './components/ProfileErrorToast';

function App() {
  return (
    <ErrorBoundary>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UserProvider>
          <IdleSessionMonitor />
          <GlobalLogoutButton />
          <ProfileErrorToast />
          <div className="App">
            <Routes>
              <Route path="/" element={<LoginPage />} />
              {/* Legacy /login path support for redirects coming from older code */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/landing" element={<LandingPage />} />
              <Route path="/admin-access" element={<AdminAccessChoice />} />
              <Route path="/select-declaration-type" element={<DeclarationTypePage />} />
              <Route path="/user-form" element={<UserForm />} />
              <Route path="/spouse-form" element={<SpouseForm />} />
              <Route path="/financial-form" element={<FinancialForm />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/edit-declaration" element={<EditDeclarationPage />} />
              <Route path="/declaration/:id" element={<DeclarationView />} />
              <Route path="/edit-selection/:id" element={<EditSelection />} />
              <Route path="/confirmation" element={<ConfirmationPage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/guidnotes" element={<GuidNotes />} />
              <Route 
                path="/admin" 
                element={
                  <AdminProtectedRoute>
                    {(props) => {
                      const adminUser = props.adminUser || JSON.parse(localStorage.getItem('adminUser'));
                      // Normalize role to short form for routing (supports both raw *_admin & short form values)
                      const rawRole = adminUser && adminUser.role ? adminUser.role : '';
                      const normalized = rawRole === 'hr_admin' ? 'hr'
                        : rawRole === 'it_admin' ? 'it'
                        : rawRole === 'super_admin' ? 'super'
                        : rawRole; // already short or unknown
                      if (normalized === 'hr') {
                        return <HRAdminDashboard {...props} />;
                      }
                      if (normalized === 'it') {
                        return <ITAdminDashboard {...props} />;
                      }
                      // finance role removed
                      // Default (super or fallback) => main AdminPage
                      return <AdminPage {...props} />;
                    }}
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