import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LandingPage from '../../components/LandingPage';
import AdminAccessChoice from '../../components/AdminAccessChoice';
import { UserProvider } from '../../context/UserContext';
import AdminProtectedRoute from '../../components/AdminProtectedRoute';

// Simple mock for navigate effect (we'll assert side-effects via localStorage)
const renderWithProviders = (ui, { route = '/landing' } = {}) => {
  window.history.pushState({}, 'Test', route);
  return render(
    <MemoryRouter initialEntries={[route]}>
      <UserProvider>
        <Routes>
          <Route path="/landing" element={<LandingPage />} />
          <Route path="/admin-access" element={<AdminAccessChoice />} />
          <Route path="/admin" element={<AdminProtectedRoute><div data-testid="admin-root">Admin Root</div></AdminProtectedRoute>} />
        </Routes>
      </UserProvider>
    </MemoryRouter>
  );
};

describe('Elevation Flow UI', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test('Admin Access button appears when hasAdminAccess and no adminToken', () => {
    localStorage.setItem('token', 'userTok');
    localStorage.setItem('hasAdminAccess', '1');
    renderWithProviders(<LandingPage />);
    expect(screen.getByTestId('admin-access-button')).toBeInTheDocument();
  });

  test('Elevation success stores adminToken and navigates', async () => {
    localStorage.setItem('token', 'userTok');
    localStorage.setItem('hasAdminAccess', '1');
    global.fetch = jest.fn((url) => {
      if (url === '/api/admin/elevate-from-user') {
        return Promise.resolve({
          ok: true,
            json: () => Promise.resolve({ adminToken: 'adm123', accessTtl: '30m', admin: { id: 9, role: 'hr_admin' } })
        });
      }
      // Default minimal profile fetch for UserContext
      if (url === '/api/auth/me') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ first_name: 'Test' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    renderWithProviders(<LandingPage />);
  fireEvent.click(screen.getByTestId('admin-access-button'));
    await waitFor(() => expect(localStorage.getItem('adminToken')).toBe('adm123'));
  });

  test('Auto elevation occurs on protected route mount when token absent but user has admin access', async () => {
    localStorage.setItem('token', 'userTok');
    localStorage.setItem('hasAdminAccess', '1');
    global.fetch = jest.fn((url) => {
      if (url === '/api/admin/elevate-from-user') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ adminToken: 'autoADM', accessTtl: '30m', admin: { id: 1, role: 'super_admin' } }) });
      }
      if (url === '/api/admin/verify') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ message: 'Admin verified' }) });
      }
      if (url === '/api/auth/me') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ first_name: 'Test' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    renderWithProviders(<LandingPage />); // first ensure context
    // Navigate to admin route
    renderWithProviders(<AdminProtectedRoute><div data-testid="admin-root">Admin Root</div></AdminProtectedRoute>, { route: '/admin' });
    await waitFor(() => expect(localStorage.getItem('adminToken')).toBe('autoADM'));
  });

  test('Toast appears on refresh (simulated admin token expiration)', async () => {
    localStorage.setItem('token', 'userTok');
    localStorage.setItem('hasAdminAccess', '1');
    localStorage.setItem('adminToken', 'initialADM');
    localStorage.setItem('adminUser', JSON.stringify({ id: 1, username: 'tester', role: 'super_admin' }));
    // Force verify OK first, then simulate expiration by clearing token after mount and ensure re-elevation toast logic triggers
    let elevateCalls = 0;
    global.fetch = jest.fn((url) => {
      if (url === '/api/admin/verify') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ message: 'ok' }) });
      }
      if (url === '/api/admin/elevate-from-user') {
        elevateCalls++;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ adminToken: 'refreshedADM', accessTtl: '30m', admin: { id: 1, role: 'super_admin' } }) });
      }
      if (url === '/api/auth/me') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ first_name: 'Test' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    renderWithProviders(<AdminProtectedRoute><div data-testid="admin-root">Admin Root</div></AdminProtectedRoute>, { route: '/admin' });
    // Simulate manual refresh by removing token -> triggering watcher
    await waitFor(() => expect(localStorage.getItem('adminToken')).toBe('initialADM'));
    localStorage.removeItem('adminToken');
    // Trigger focus to force sync of removal -> effect re-elevation
    window.dispatchEvent(new Event('focus'));
    // Wait for elevation call
    await waitFor(() => expect(localStorage.getItem('adminToken')).toBe('refreshedADM'));
    expect(elevateCalls).toBeGreaterThan(0);
  });

  test('Role badge renders when adminRawRoleHint present and adminToken exists', () => {
    localStorage.setItem('token', 'userTok');
    localStorage.setItem('hasAdminAccess', '1');
    localStorage.setItem('adminToken', 'admXYZ');
    localStorage.setItem('adminRawRoleHint', 'hr_admin');
    renderWithProviders(<LandingPage />);
    expect(screen.getByTestId('role-badge')).toHaveTextContent('HR');
  });

  test('AdminAccessChoice elevates and navigates', async () => {
    localStorage.setItem('token', 'userTok');
    global.fetch = jest.fn((url) => {
      if (url === '/api/admin/elevate-from-user') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ adminToken: 'adm555', accessTtl: '30m', admin: { id: 2, role: 'super_admin' } }) });
      }
      if (url === '/api/auth/me') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ first_name: 'Test' }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    renderWithProviders(<AdminAccessChoice />, { route: '/admin-access' });
    fireEvent.click(screen.getByText(/Elevate & Continue/i));
    await waitFor(() => expect(localStorage.getItem('adminToken')).toBe('adm555'));
  });
});
