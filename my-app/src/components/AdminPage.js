import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AdminSessionMonitor from './AdminSessionMonitor';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import EmailManagement from './EmailManagement';
import AdminEmailAuditTab from './AdminEmailAuditTab';
import AdminUserCreation from './AdminUserCreation';
import AddUserForm from './AddUserForm';
import AdminConsentLogs from './AdminConsentLogs';
import DepartmentOverview from './DepartmentOverview';
import DepartmentManagement from './DepartmentManagement';
import PersonnelManagement from './PersonnelManagement';
import ReportsAndAnalytics from './ReportsAndAnalytics';
import SuperAdminMetricsModule from './SuperAdminMetricsModule';
import SubDepartmentOverview from './SubDepartmentOverview';
import StatusAuditModule from './StatusAuditModule';
import BiennialWindowsAdmin from './BiennialWindowsAdmin';
import FamilyFinancials from './FamilyFinancials';
import ITAdminAuditsAndRequests from './ITAdminAuditsAndRequests';
import BulkSMSPanel from './BulkSMSPanel';
import WealthDeclarationRegister from './WealthDeclarationRegister';
import { getUsersCount } from '../api';
import { DEPARTMENTS as CANONICAL_DEPARTMENTS } from '../constants/departments';
import LandingPageButton from './shared/LandingPageButton';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import 'bootstrap/dist/css/bootstrap.min.css';
import './AdminPage.css';
import { Modal, Button, Toast, ToastContainer } from 'react-bootstrap';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

const EXPORT_COLUMNS = [
  { key: 'payroll_number', label: 'Payroll Number' },
  { key: 'first_name', label: 'First Name' },
  { key: 'other_names', label: 'Other Names' },
  { key: 'surname', label: 'Surname' },
  { key: 'email', label: 'Email' },
  { key: 'phone_number', label: 'Phone Number' },
  { key: 'department', label: 'Department' },
  { key: 'designation', label: 'Designation' },
  { key: 'national_id', label: 'National ID' },
  { key: 'birthdate', label: 'Birthdate' },
  { key: 'marital_status', label: 'Marital Status' },
  { key: 'declaration_type', label: 'Declaration Type' },
  { key: 'declaration_date', label: 'Declaration Date' },
  { key: 'biennial_income', label: 'Biennial Income' },
  { key: 'assets', label: 'Assets' },
  { key: 'liabilities', label: 'Liabilities' },
  { key: 'net_worth', label: 'Net Worth' },
  { key: 'status', label: 'Status' },
  { key: 'correction_message', label: 'Correction Message' },
];

const parseFinancialField = (field) => {
  if (!field) return [];
  if (Array.isArray(field)) return field;
  try {
    const parsed = JSON.parse(field);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const sumFinancialField = (field) => {
  if (Array.isArray(field)) {
    return field.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
  }
  // If field is a stringified array
  if (typeof field === 'string') {
    try {
      const arr = JSON.parse(field);
      if (Array.isArray(arr)) {
        return arr.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
      }
      // If it's a number string
      const num = parseFloat(field);
      return isNaN(num) ? 0 : num;
    } catch {
      const num = parseFloat(field);
      return isNaN(num) ? 0 : num;
    }
  }
  // If field is a number
  if (typeof field === 'number') {
    return field;
  }
  return 0;
};

const generateReportData = (data, setReportData) => {
  const maritalStatus = data.reduce((acc, curr) => {
    acc[curr.marital_status] = (acc[curr.marital_status] || 0) + 1;
    return acc;
  }, {});
  const incomeRanges = {
    '0-50k': 0,
    '50k-100k': 0,
    '100k-200k': 0,
    '200k+': 0
  };
  data.forEach(declaration => {
  const income = sumFinancialField(declaration.biennial_income);
    if (income < 50000) incomeRanges['0-50k']++;
    else if (income < 100000) incomeRanges['50k-100k']++;
    else if (income < 200000) incomeRanges['100k-200k']++;
    else incomeRanges['200k+']++;
  });
  const assetsLiabilities = data.map(declaration => {
    const assets = sumFinancialField(declaration.assets);
    const liabilities = sumFinancialField(declaration.liabilities);
    return {
      id: declaration.id,
      assets,
      liabilities,
      netWorth: assets - liabilities
    };
  });
  setReportData({
    maritalStatus,
    incomeRanges,
    assetsLiabilities
  });
};

const AdminPage = ({ adminUser }) => {
  const [adminToast, setAdminToast] = useState({ show: false, message: '' });
  const [declarations, setDeclarations] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersStats, setUsersStats] = useState(null);

  const adminToken = localStorage.getItem('adminToken');
  const isSuper = adminUser && (adminUser.role === 'super' || adminUser.role === 'super_admin');
  const isIT = adminUser && (adminUser.role === 'it_admin');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentTab, setCurrentTab] = useState('declarations');
  const [reportData, setReportData] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [selectedDeclaration, setSelectedDeclaration] = useState(null);
  const [previousCorrections, setPreviousCorrections] = useState([]);
  const [biennialLocked, setBiennialLocked] = useState(false);
  const [firstLocked, setFirstLocked] = useState(false);
  const [finalLocked, setFinalLocked] = useState(false);
  const [usersCount, setUsersCount] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedExportColumns, setSelectedExportColumns] = useState(EXPORT_COLUMNS.map(col => col.key));
  const [missingDeptAdmins, setMissingDeptAdmins] = useState([]);
  const [loadingMissingAdmins, setLoadingMissingAdmins] = useState(false);
  const [adminsLoadError, setAdminsLoadError] = useState('');
  const [deptStats, setDeptStats] = useState(null);
  const [loadingDeptStats, setLoadingDeptStats] = useState(false);
  const [deptStatsFetchedAt, setDeptStatsFetchedAt] = useState(null);
  const [declarationFilters, setDeclarationFilters] = useState({
    search: '',
    department: '',
    declarationType: '',
    status: ''
  });
  const DEPT_STATS_TTL_MS = 5 * 60 * 1000; // 5 minutes
  // Status audit state moved into StatusAuditModule component

  // Normalize declaration types (handles case + legacy misspelling 'Bienniel')
  const declarationTypeCounts = React.useMemo(() => {
    const normalize = (t) => {
      if (!t) return '';
      const val = String(t).trim().toLowerCase();
  if (val.startsWith('bien')) return 'biennial'; // covers 'biennial' & legacy 'bienniel'
      if (val.startsWith('fir')) return 'first';
      if (val.startsWith('fin')) return 'final';
      return val;
    };
    return declarations.reduce((acc, d) => {
      const norm = normalize(d.declaration_type);
      if (!norm) return acc;
      acc[norm] = (acc[norm] || 0) + 1;
      return acc;
    }, { first: 0, biennial: 0, final: 0 });
  }, [declarations]);

  const filteredDeclarations = useMemo(() => {
    if (!declarations) return [];
    return declarations.filter(d => {
      const searchLower = declarationFilters.search.toLowerCase();
      const name = `${d.first_name || ''} ${d.other_names || ''} ${d.surname || ''}`.toLowerCase();
      const matchSearch = !declarationFilters.search ||
        name.includes(searchLower) ||
        (d.payroll_number && String(d.payroll_number).toLowerCase().includes(searchLower)) ||
        (d.national_id && String(d.national_id).toLowerCase().includes(searchLower)) ||
        (d.email && d.email.toLowerCase().includes(searchLower));

      const matchDept = !declarationFilters.department || d.department === declarationFilters.department;
      
      const normalizedDeclType = (d.declaration_type || '').toLowerCase();
      const matchType = !declarationFilters.declarationType || (declarationFilters.declarationType === 'biennial' ? normalizedDeclType.startsWith('bien') : normalizedDeclType.startsWith(declarationFilters.declarationType));

      const matchStatus = !declarationFilters.status || d.status === declarationFilters.status;

      return matchSearch && matchDept && matchType && matchStatus;
    });
  }, [declarations, declarationFilters]);
  // Export to Excel logic
  const handleExportExcel = () => {
    setShowExportModal(true);
  };

  const fetchDeptStats = React.useCallback(async (force = false) => {
    try {
      const now = Date.now();
      // If we already have fresh data and not forced, skip network
      if (!force && deptStats && deptStatsFetchedAt && (now - deptStatsFetchedAt) < DEPT_STATS_TTL_MS) {
        return; // Cache hit
      }
      setLoadingDeptStats(true);
      const token = localStorage.getItem('adminToken');
      const res = await fetch('/api/admin/reports/departments', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setDeptStats(data.data);
        setDeptStatsFetchedAt(now);
        // Persist lightweight cache
        try {
          sessionStorage.setItem('deptStatsCache', JSON.stringify({ data: data.data, fetchedAt: now }));
        } catch {}
      }
    } catch (e) {
      // Non-fatal; keep previous stats
    } finally {
      setLoadingDeptStats(false);
    }
  }, [deptStats, deptStatsFetchedAt, DEPT_STATS_TTL_MS]);

  // Attempt to hydrate from sessionStorage on first mount
  const fetchUsersPage = React.useCallback(async (page = 1, search = usersSearch) => {
    if (!adminToken) return;
    try {
      setUsersLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (search) params.append('search', search);
      const res = await fetch(`/api/admin/users?${params.toString()}`, { headers: { Authorization: `Bearer ${adminToken}` }});
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.users)) {
          setAllUsers(data.users);
          setUsersPage(data.page || page);
          setUsersTotalPages(data.totalPages || 1);
          setUsersStats(data.stats || null);
        }
      }
    } catch (e) { /* silent */ }
    finally { setUsersLoading(false); }
  }, [adminToken, usersSearch]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('deptStatsCache');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.data && parsed.fetchedAt && (Date.now() - parsed.fetchedAt) < DEPT_STATS_TTL_MS) {
          setDeptStats(parsed.data);
          setDeptStatsFetchedAt(parsed.fetchedAt);
        }
      }
    } catch {}
  }, [DEPT_STATS_TTL_MS]);

  // Fetch department stats when tab first opened
  useEffect(() => {
    if (currentTab === 'department' && !loadingDeptStats) {
      fetchDeptStats(false);
    }
  }, [currentTab, loadingDeptStats, fetchDeptStats]);

  // Ensure declarations include latest user fields (e.g., sub_department) when opening Sub-Department tab
  const refreshDeclarations = React.useCallback(async () => {
    if (!adminToken) return;
    try {
      setLoading(true);
      const response = await fetch('/api/admin/declarations?detailed=true', {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.data && Array.isArray(data.data)) {
          setDeclarations(data.data);
          generateReportData(data.data, setReportData);
        }
      }
    } catch {}
    finally { setLoading(false); }
  }, [adminToken]);

  // Re-fetch when user visits Sub-Department tab so latest backend shape is used
  useEffect(() => {
    if (currentTab === 'sub-department') {
      refreshDeclarations();
    }
  }, [currentTab, refreshDeclarations]);

  const handleExportConfirm = () => {
    // Prepare data
    const dataToExport = filteredDeclarations.map(declaration => {
      const row = {};
      selectedExportColumns.forEach(col => {
        if (col === 'biennial_income') {
          // Flatten biennial income
          const parsed = parseFinancialField(declaration.biennial_income);
          row[col] = parsed.length > 0 ? parsed.map(item => Object.entries(item).map(([k, v]) => `${k}: ${v}`).join('; ')).join(' | ') : declaration.biennial_income;
        } else if (col === 'assets') {
          const parsed = parseFinancialField(declaration.assets);
          row[col] = parsed.length > 0 ? parsed.map(item => Object.entries(item).map(([k, v]) => `${k}: ${v}`).join('; ')).join(' | ') : declaration.assets;
        } else if (col === 'liabilities') {
          const parsed = parseFinancialField(declaration.liabilities);
          row[col] = parsed.length > 0 ? parsed.map(item => Object.entries(item).map(([k, v]) => `${k}: ${v}`).join('; ')).join(' | ') : declaration.liabilities;
        } else if (col === 'net_worth') {
          const assets = sumFinancialField(declaration.assets);
          const liabilities = sumFinancialField(declaration.liabilities);
          row[col] = assets - liabilities;
        } else if (col === 'status') {
          const val = declaration.status;
          row[col] = val === 'pending' ? 'Submitted' : (val === 'rejected' ? 'Requesting Clarification' : (val !== undefined && val !== null ? val : ''));
        } else {
          row[col] = declaration[col] !== undefined && declaration[col] !== null ? declaration[col] : '';
        }
      });
      return row;
    });
    // Create worksheet and workbook
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Declarations');
    // Export
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), 'declarations_export.xlsx');
    setShowExportModal(false);
  };

  const handleExportColumnChange = (colKey) => {
    setSelectedExportColumns(prev =>
      prev.includes(colKey)
        ? prev.filter(k => k !== colKey)
        : [...prev, colKey]
    );
  };

  // Pretty-print admin role for table display
  const prettyAdminRole = (role) => {
    switch (role) {
      case 'super_admin': return 'Super';
      case 'hr_admin': return 'HR';
      case 'finance_admin': return 'Finance';
      case 'it_admin': return 'IT';
      default: return role;
    }
  };
  // Fetch all admins (repurposed from previous "missing department" list)
  const fetchMissingDeptAdmins = useCallback(async () => { // keep original name to minimize wider changes
    if (!isSuper || !adminToken) return;
    try {
      setLoadingMissingAdmins(true);
      setAdminsLoadError('');
      const res = await fetch('/api/admin/admins', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          console.log('[Admin Users] Loaded admins count:', (data.data || []).length);
          setMissingDeptAdmins(data.data || []);
        } else {
          setAdminsLoadError(data.message || 'Failed to load admins');
          console.warn('[Admin Users] API responded without success flag:', data);
        }
      } else {
        const txt = await res.text();
        setAdminsLoadError(`Request failed (${res.status})`);
        console.error('[Admin Users] HTTP error:', res.status, txt);
      }
    } catch (e) {
      setAdminsLoadError('Network error loading admins');
      console.error('[Admin Users] Network/JS error:', e);
    } finally {
      setLoadingMissingAdmins(false);
    }
  }, [isSuper, adminToken]);

  // Auto-fetch whenever tab becomes active (even if previously attempted) so user doesn't see stale empty table
  useEffect(() => {
    if (currentTab === 'admin-users' && isSuper) {
      fetchMissingDeptAdmins();
    }
  }, [currentTab, isSuper, fetchMissingDeptAdmins]);


  const handleAddPersonnel = async (person) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify(person)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to add user');
      // Prepend new user to list
      setAllUsers(prev => [data.user, ...prev]);
      setAdminToast({
        show: true, message: `User added. Temp password: ${data.temporaryPassword}`
      });
      alert('User added. Temporary password: ' + data.temporaryPassword);
    } catch (err) {
      alert('Error adding user: ' + err.message);
    }
  };

const handleRemovePersonnel = async (person) => {
    if (!person || !person.id) return alert('Missing user id');
    if (!window.confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/admin/users/${person.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to delete user');
      setAllUsers(prev => prev.filter(u => u.id !== person.id));
      alert('User deleted');
    } catch (err) {
      alert('Error deleting user: ' + err.message);
    }
  };

  const handleToggleBiennialLock = async () => {
    try {
      const res = await fetch('/api/admin/settings/locks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ biennial_declaration_locked: !biennialLocked })
      });
      if (!res.ok) throw new Error('Failed to update lock');
      const data = await res.json();
      setBiennialLocked(!!data?.locks?.biennial_declaration_locked);
    } catch (err) {
      alert('Error updating lock: ' + err.message);
    }
  };

  const handleToggleFirstLock = async () => {
    try {
      const res = await fetch('/api/admin/settings/locks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ first_declaration_locked: !firstLocked })
      });
      if (!res.ok) throw new Error('Failed to update lock');
      const data = await res.json();
      setFirstLocked(!!data?.locks?.first_declaration_locked);
    } catch (err) {
      alert('Error updating lock: ' + err.message);
    }
  };

  const handleToggleFinalLock = async () => {
    try {
      const res = await fetch('/api/admin/settings/locks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ final_declaration_locked: !finalLocked })
      });
      if (!res.ok) throw new Error('Failed to update lock');
      const data = await res.json();
      setFinalLocked(!!data?.locks?.final_declaration_locked);
    } catch (err) {
      alert('Error updating lock: ' + err.message);
    }
  };

  useEffect(() => {
    // Fetch all lock statuses
    const fetchLocks = async () => {
      try {
  const res = await fetch('/api/admin/settings/locks', {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.locks) {
            setBiennialLocked(!!data.locks.biennial_declaration_locked);
            setFirstLocked(!!data.locks.first_declaration_locked);
            setFinalLocked(!!data.locks.final_declaration_locked);
          }
        }
      } catch {}
    };
    fetchLocks();
    // removed unused fetchData helper

    if (adminToken) {
      const fetchDataWithLog = async () => {
        try {
          setLoading(true);
          const response = await fetch('/api/admin/declarations?detailed=true', {
            headers: {
              'Authorization': `Bearer ${adminToken}`,
              'Content-Type': 'application/json'
            }
          });
          if (response.ok) {
            const data = await response.json();
            // ...removed debug log...
            if (data && data.data && Array.isArray(data.data)) {
              setDeclarations(data.data);
              generateReportData(data.data, setReportData);
            } else {
              setDeclarations([]);
            }
          } else {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          setError('');
        } catch (err) {
          setError('Failed to fetch declarations');
          setDeclarations([]);
        } finally {
          setLoading(false);
        }
      };
      fetchDataWithLog();
      // Fetch users count for dashboard
      getUsersCount(adminToken).then(setUsersCount).catch(() => setUsersCount(0));
      // Initial users fetch
      fetchUsersPage(1, usersSearch);
    }
  }, [adminToken, fetchUsersPage, usersSearch]);

  const downloadReport = (reportType) => {
    let csvContent = '';
    let filename = '';
    switch (reportType) {
      case 'full':
        csvContent = 'Payroll Number,Declaration Date,Marital Status,Annual Income,Assets,Liabilities,Net Worth\n';
        declarations.forEach(declaration => {
          const assets = sumFinancialField(declaration.assets);
          const liabilities = sumFinancialField(declaration.liabilities);
          const income = sumFinancialField(declaration.biennial_income);
          const netWorth = assets - liabilities;
          csvContent += `${declaration.payroll_number},${declaration.declaration_date},${declaration.marital_status},${income},${assets},${liabilities},${netWorth}\n`;
        });
        filename = 'full_declarations_report.csv';
        break;
      case 'summary':
        csvContent = 'Metric,Value\n';
        csvContent += `Total Declarations,${declarations.length}\n`;
        const avgIncome = declarations.length > 0
          ? Math.round(declarations.reduce((sum, d) => sum + sumFinancialField(d.biennial_income), 0) / declarations.length)
          : 0;
        csvContent += `Average Income,${avgIncome}\n`;
        const totalAssets = declarations.reduce((sum, d) => sum + sumFinancialField(d.assets), 0);
        const totalLiabilities = declarations.reduce((sum, d) => sum + sumFinancialField(d.liabilities), 0);
        csvContent += `Total Assets,${totalAssets}\n`;
        csvContent += `Total Liabilities,${totalLiabilities}\n`;
        filename = 'summary_report.csv';
        break;
      default:
        return;
    }
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  const handleViewDetails = async (declaration) => {
    try {
      setShowModal(true);
      setSelectedDeclaration(declaration);
      setPreviousCorrections([]);
      // Fetch full details (spouses, children, etc.)
      const res = await fetch(`/api/admin/declarations/${declaration.id}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.success && data?.data) {
          // Update the main declarations list with the newly fetched detailed data.
          // This is crucial for the Sub-Department Overview to get updated info.
          setDeclarations(prevDeclarations => 
            prevDeclarations.map(d => 
              d.id === declaration.id ? { ...d, ...data.data } : d
            )
          );
          // Also update the state for the modal to show the new details immediately.
          setSelectedDeclaration(prev => ({ ...prev, ...data.data }));
        }
      }
      // Fetch previous corrections (if any)
      try {
        const corrRes = await fetch(`/api/admin/declarations/${declaration.id}/previous-corrections`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
        if (corrRes.ok) {
          const corrData = await corrRes.json();
          if (corrData?.success && Array.isArray(corrData.data)) {
            setPreviousCorrections(corrData.data);
          }
        }
      } catch (e) { /* ignore */ }
    } catch (e) {
      // Non-blocking: show basic data if details fetch fails
      console.error('Failed to fetch declaration details', e);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedDeclaration(null);
  };

  function ApproveRejectForm({ declarationId, currentStatus, onActionComplete, priorCorrections }) {
  // If editing an existing approved/rejected declaration, default to its current status
  const [action, setAction] = useState(currentStatus && ['approved','rejected'].includes(currentStatus) ? currentStatus : 'approved');
  const [correctionMsg, setCorrectionMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const adminToken = localStorage.getItem('adminToken');
      const res = await fetch(`/api/admin/declarations/${declarationId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: action, correction_message: action === 'rejected' ? correctionMsg : undefined })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to update status');
      }
      onActionComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-2">
        <label className="form-label">Action:</label>
        <select className="form-select" value={action} onChange={e => setAction(e.target.value)}>
          <option value="approved">Approve</option>
          <option value="rejected">Reject</option>
        </select>
      </div>
      {action === 'rejected' && (
        <div className="mb-2">
          <label className="form-label">Correction Message:</label>
          <textarea className="form-control" value={correctionMsg} onChange={e => setCorrectionMsg(e.target.value)} required rows={3} placeholder="Describe what needs to be corrected..."></textarea>
          {priorCorrections && priorCorrections.length > 0 && (
            <div className="mt-2 small text-muted" style={{ maxHeight: '120px', overflowY: 'auto' }}>
              <strong>Previous correction notes:</strong>
              <ul className="mb-0 ps-3">
                {priorCorrections.map((c, i) => (
                  <li key={i}>
                    <span className="d-block">{new Date(c.changed_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}: {c.correction_message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {error && <div className="alert alert-danger py-1">{error}</div>}
      <button className="btn btn-primary" type="submit" disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );};
  

  // Helper to convert YYYY-MM-DD to DD/MM/YYYY
  function formatDateToDMY(dateStr) {
    if (!dateStr || dateStr === '0000-00-00') return 'N/A';
    // If YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const parts = dateStr.split('-');
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    // If DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      return dateStr;
    }
    // If ISO string (e.g., 2025-08-19T21:32:44.000Z)
    if (dateStr.includes('T')) {
      const d = new Date(dateStr);
      if (!isNaN(d)) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
      }
    }
    return dateStr;
  }

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '50vh' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger m-3" role="alert">
        <i className="bi bi-exclamation-triangle-fill me-2"></i>
        {error}
      </div>
    );
  }

  return (
    <>
    {/* Session monitor handles idle timeout & silent refresh for admins */}
    <AdminSessionMonitor />
    <div className="container-fluid py-4">
      <div className="row">
        <div className="col-12">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h1 className="h2 text-primary mb-0">
              <i className="bi bi-speedometer2 me-2"></i>
              Admin Dashboard
            </h1>
            <div className="d-flex align-items-center">
              <div className="me-3">
                <LandingPageButton />
              </div>
              <button
                className="btn btn-outline-secondary me-3"
                type="button"
                onClick={() => {
                  // Force re-elevation by clearing token then letting AdminProtectedRoute / adminFetch logic handle it
                  localStorage.removeItem('adminToken');
                  localStorage.removeItem('adminTokenExpiresAt');
                  // Soft visual feedback
                  const btn = document.activeElement; if (btn) btn.blur();
                }}
              >
                <i className="bi bi-arrow-repeat me-1"></i>
                Refresh Session
              </button>
              <div className="me-3">
                <span className="text-muted">Welcome, </span>
                <span className="fw-bold text-primary">
                  {adminUser?.username || 'Admin'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Bootstrap Nav Tabs */}
          <ul className="nav nav-tabs mb-4" id="adminTabs" role="tablist">
            <li className="nav-item" role="presentation">
              <button 
                className={`nav-link ${currentTab === 'declarations' ? 'active' : ''}`}
                onClick={() => setCurrentTab('declarations')}
                type="button"
              >
                <i className="bi bi-file-text me-2"></i>
                All Declarations
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link ${currentTab === 'wealth-register' ? 'active' : ''}`}
                onClick={() => setCurrentTab('wealth-register')}
                type="button"
              >
                <i className="bi bi-journal-text me-2"></i>
                Wealth Register
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button 
                className={`nav-link ${currentTab === 'family-financials' ? 'active' : ''}`}
                onClick={() => setCurrentTab('family-financials')}
                type="button"
              >
                <i className="bi bi-people me-2"></i>
                Family Financials
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button 
                className={`nav-link ${currentTab === 'email-management' ? 'active' : ''}`}
                onClick={() => setCurrentTab('email-management')}
                type="button"
              >
                <i className="bi bi-envelope me-2"></i>
                Email Management
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link ${currentTab === 'bulk-sms' ? 'active' : ''}`}
                onClick={() => setCurrentTab('bulk-sms')}
                type="button"
              >
                <i className="bi bi-chat-dots me-2"></i>
                Bulk SMS
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button 
                className={`nav-link ${currentTab === 'reports' ? 'active' : ''}`}
                onClick={() => setCurrentTab('reports')}
                type="button"
              >
                <i className="bi bi-graph-up me-2"></i>
                Reports & Analytics
              </button>
            </li>
            {isSuper && (
              <li className="nav-item" role="presentation">
                <button 
                  className={`nav-link ${currentTab === 'windows' ? 'active' : ''}`}
                  onClick={() => setCurrentTab('windows')}
                  type="button"
                >
                  <i className="bi bi-calendar-range me-2"></i>
                  Windows & Overrides
                </button>
              </li>
            )}
            {isSuper && (
              <li className="nav-item" role="presentation">
                <button 
                  className={`nav-link ${currentTab === 'super-metrics' ? 'active' : ''}`}
                  onClick={() => setCurrentTab('super-metrics')}
                  type="button"
                >
                  <i className="bi bi-shield-lock me-2"></i>
                  Super Metrics
                </button>
              </li>
            )}
            {isSuper && (
              <li className="nav-item" role="presentation">
                <button 
                  className={`nav-link ${currentTab === 'status-audit' ? 'active' : ''}`}
                  onClick={() => setCurrentTab('status-audit')}
                  type="button"
                >
                  <i className="bi bi-layers me-2"></i>
                  Status Audit
                </button>
              </li>
            )}
            {isSuper && (
              <li className="nav-item" role="presentation">
                <button 
                  className={`nav-link ${currentTab === 'dept-mgmt' ? 'active' : ''}`}
                  onClick={() => setCurrentTab('dept-mgmt')}
                  type="button"
                >
                  <i className="bi bi-sliders me-2"></i>
                  Dept Mgmt
                </button>
              </li>
            )}
            <li className="nav-item" role="presentation">
              <button 
                className={`nav-link ${currentTab === 'department' ? 'active' : ''}`}
                onClick={() => setCurrentTab('department')}
                type="button"
              >
                <i className="bi bi-building me-2"></i>
                Department Overview
              </button>
            </li>
            {(isSuper || isIT) && (
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${currentTab === 'sub-department' ? 'active' : ''}`}
                  onClick={() => setCurrentTab('sub-department')}
                  type="button"
                >
                  <i className="bi bi-diagram-3 me-2"></i>
                  Sub-Dept Overview
                </button>
              </li>
            )}
            <li className="nav-item" role="presentation">
              <button 
                className={`nav-link ${currentTab === 'personnel' ? 'active' : ''}`}
                onClick={() => setCurrentTab('personnel')}
                type="button"
              >
                <i className="bi bi-person-badge me-2"></i>
                Personnel Management
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button 
                className={`nav-link ${currentTab === 'consent-logs' ? 'active' : ''}`}
                onClick={() => setCurrentTab('consent-logs')}
                type="button"
              >
                <i className="bi bi-clipboard-check me-2"></i>
                Consent Logs
              </button>
            </li>
            {isSuper && (
              <li className="nav-item" role="presentation">
                <button 
                  className={`nav-link ${currentTab === 'admin-users' ? 'active' : ''}`}
                  onClick={() => {
                    setCurrentTab('admin-users');
                    if (missingDeptAdmins.length === 0 && !loadingMissingAdmins) {
                      fetchMissingDeptAdmins();
                    }
                  }}
                  type="button"
                >
                  <i className="bi bi-person-gear me-2"></i>
                  Admin Users
                </button>
              </li>
            )}
            {isSuper && (
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${currentTab === 'add-user' ? 'active' : ''}`}
                  onClick={() => setCurrentTab('add-user')}
                  type="button"
                >
                  <i className="bi bi-person-plus me-2"></i>Add User
                </button>
              </li>
            )}
            {(isIT || isSuper) && (
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${currentTab === 'it-audits' ? 'active' : ''}`}
                  onClick={() => setCurrentTab('it-audits')}
                  type="button"
                >
                  <i className="bi bi-shield-check me-2"></i>
                  IT Audits
                </button>
              </li>
            )}
            <li className="nav-item" role="presentation">
              <button 
                className={`nav-link ${currentTab === 'email-audit' ? 'active' : ''}`}
                onClick={() => setCurrentTab('email-audit')}
                type="button"
              >
                <i className="bi bi-clock-history me-2"></i>
                Email Audit
              </button>
            </li>
          </ul>
          
          {/* Tab Content */}
          <div className="tab-content">
            {currentTab === 'declarations' && (
              <div className="tab-pane fade show active">
                <div className="card shadow-sm">
                  <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center">
                      <h3 className="card-title mb-0">
                        <i className="bi bi-people-fill me-2"></i>
                        All Employee Declarations
                      </h3>
                    </div>
                    <button
                      className="btn"
                      style={{ background: '#fff', color: '#0d6efd', border: '1px solid #0d6efd', fontWeight: 500 }}
                      onClick={handleExportExcel}
                    >
                      <i className="bi bi-file-earmark-excel me-1"></i>
                      Export to Excel
                    </button>
                {/* Export to Excel Modal */}
                {showExportModal && (
                  <div className="modal fade show" style={{ display: 'block' }} tabIndex="-1" role="dialog">
                    <div className="modal-dialog" role="document">
                      <div className="modal-content">
                        <div className="modal-header">
                          <h5 className="modal-title">Export Declarations to Excel</h5>
                          <button type="button" className="btn-close" onClick={() => setShowExportModal(false)}></button>
                        </div>
                        <div className="modal-body">
                          <p>Select columns to include in the export:</p>
                          <div className="row">
                            {EXPORT_COLUMNS.map(col => (
                              <div className="col-6" key={col.key}>
                                <div className="form-check">
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id={`export-col-${col.key}`}
                                    checked={selectedExportColumns.includes(col.key)}
                                    onChange={() => handleExportColumnChange(col.key)}
                                  />
                                  <label className="form-check-label" htmlFor={`export-col-${col.key}`}>{col.label}</label>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="modal-footer">
                          <button type="button" className="btn btn-secondary" onClick={() => setShowExportModal(false)}>Cancel</button>
                          <button type="button" className="btn btn-success" onClick={handleExportConfirm} disabled={selectedExportColumns.length === 0}>Export</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                  </div>
                  <div className="card-body">
                    <div className="row g-2 mb-3 p-2 border-bottom">
                      <div className="col-md-3">
                        <input 
                          type="text" 
                          className="form-control form-control-sm" 
                          placeholder="Search name, payroll, ID..."
                          value={declarationFilters.search}
                          onChange={e => setDeclarationFilters(f => ({ ...f, search: e.target.value }))}
                        />
                      </div>
                      <div className="col-md-3">
                        <select 
                          className="form-select form-select-sm"
                          value={declarationFilters.department}
                          onChange={e => setDeclarationFilters(f => ({ ...f, department: e.target.value }))}
                        >
                          <option value="">All Departments</option>
                          {CANONICAL_DEPARTMENTS.sort().map(dept => (
                            <option key={dept} value={dept}>{dept}</option> // Use canonical list
                          ))}
                        </select>
                      </div>
                      <div className="col-md-2">
                        <select 
                          className="form-select form-select-sm"
                          value={declarationFilters.declarationType}
                          onChange={e => setDeclarationFilters(f => ({ ...f, declarationType: e.target.value }))}
                        >
                          <option value="">Any Type</option>
                          <option value="first">First</option>
                          <option value="biennial">Biennial</option>
                          <option value="final">Final</option>
                        </select>
                      </div>
                      <div className="col-md-2">
                        <select className="form-select form-select-sm" value={declarationFilters.status} onChange={e => setDeclarationFilters(f => ({ ...f, status: e.target.value }))}>
                          <option value="">Any Status</option>
                          <option value="pending">Submitted</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Requesting Clarification</option>
                        </select>
                      </div>
                      <div className="col-md-2 d-flex align-items-center justify-content-end small text-muted">{filteredDeclarations.length} / {declarations.length}</div>
                    </div>
                    {Array.isArray(filteredDeclarations) && filteredDeclarations.length > 0 ? (
                      <div className="table-responsive">
                        <table className="table table-striped table-hover">
                          <thead className="table-dark">
                            <tr>
                              <th scope="col">Payroll Number</th>
                              <th scope="col">Declaration Date</th>
                              <th scope="col">Marital Status</th>
                              <th scope="col">Biennial Income</th>
                              <th scope="col">Assets</th>
                              <th scope="col">Liabilities</th>
                              <th scope="col">Net Worth</th>
                              <th scope="col">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDeclarations.map((declaration) => {
                              // Aggregate root + spouse + child values since data may live only in spouses/children tables
                              const rootAssets = sumFinancialField(declaration.assets);
                              const rootLiabilities = sumFinancialField(declaration.liabilities);
                              const rootIncome = sumFinancialField(declaration.biennial_income);
                              const spouseAssets = (declaration.spouses || []).reduce((t, s) => t + sumFinancialField(s.assets), 0);
                              const spouseLiabilities = (declaration.spouses || []).reduce((t, s) => t + sumFinancialField(s.liabilities), 0);
                              const spouseIncome = (declaration.spouses || []).reduce((t, s) => t + sumFinancialField(s.biennial_income), 0);
                              const childAssets = (declaration.children || []).reduce((t, c) => t + sumFinancialField(c.assets), 0);
                              const childLiabilities = (declaration.children || []).reduce((t, c) => t + sumFinancialField(c.liabilities), 0);
                              const childIncome = (declaration.children || []).reduce((t, c) => t + sumFinancialField(c.biennial_income), 0);
                              const assetsTotal = rootAssets + spouseAssets + childAssets;
                              const liabilitiesTotal = rootLiabilities + spouseLiabilities + childLiabilities;
                              const incomeTotal = rootIncome + spouseIncome + childIncome;
                              const netWorth = assetsTotal - liabilitiesTotal;
                              const date = formatDateToDMY(declaration.declaration_date);
                              return (
                                <tr key={declaration.id}>
                                  <td>
                                    <span className="badge bg-secondary">{declaration.payroll_number}</span>
                                  </td>
                                  <td>{date}</td>
                                  <td>
                                    <span className={`badge ${declaration.marital_status === 'married' ? 'bg-success' : declaration.marital_status === 'separated' ? 'bg-warning' : 'bg-info'}`}>
                                      {declaration.marital_status.charAt(0).toUpperCase() + declaration.marital_status.slice(1)}
                                    </span>
                                  </td>
                                  <td className="text-success fw-bold">
                                    Ksh {incomeTotal.toLocaleString()}
                                  </td>
                                  <td className="text-primary">
                                    Ksh {assetsTotal.toLocaleString()}
                                  </td>
                                  <td className="text-danger">
                                    Ksh {liabilitiesTotal.toLocaleString()}
                                  </td>
                                  <td className={`fw-bold ${netWorth >= 0 ? 'text-success' : 'text-danger'}`}>
                                    Ksh {netWorth.toLocaleString()}
                                  </td>
                                  <td>
                                    <button
                                      className="btn btn-outline-primary btn-sm"
                                      onClick={() => handleViewDetails(declaration)}
                                    >
                                      <i className="bi bi-eye me-1"></i>
                                      View Details
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-5">
                        <i className="bi bi-inbox display-4 text-muted"></i>
                        <h4 className="text-muted mt-3">No declarations found</h4>
                        <p className="text-muted">There are currently no employee declarations to display.</p>
                      </div>
                    )}
                  </div>
                </div>
                {/* Details Modal */}
                <Modal show={showModal} onHide={handleCloseModal} centered>
                  <Modal.Header closeButton>
                    <Modal.Title>Declaration Details</Modal.Title>
                  </Modal.Header>
                  <Modal.Body>
                    {selectedDeclaration && (
                      <div>
                        {/* Admin Toast Container for PDF instruction */}
                        <ToastContainer position="bottom-end" className="p-3">
                          {adminToast?.show && (
                            <Toast bg="dark" onClose={() => setAdminToast({ show: false, message: '' })} show={adminToast.show} delay={5000} autohide>
                              <Toast.Header closeButton={true}>
                                <strong className="me-auto">PDF Password</strong>
                                <small>Now</small>
                              </Toast.Header>
                              <Toast.Body className="text-white">{adminToast.message}</Toast.Body>
                            </Toast>
                          )}
                        </ToastContainer>
                        <div className="d-flex justify-content-end mb-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={async () => {
                              try {
                                if (!selectedDeclaration.id) return;
                                const resp = await fetch(`/api/admin/declarations/${selectedDeclaration.id}/download-pdf`, {
                                  headers: { 'Authorization': `Bearer ${adminToken}` }
                                });
                                if (!resp.ok) {
                                  const txt = await resp.text();
                                  return alert('Failed to export PDF: ' + txt);
                                }
                                const blob = await resp.blob();
                                const instruction = resp.headers.get('X-PDF-Password-Instruction');
                                const inferredNatId = selectedDeclaration.national_id || '';
                                const fileNameBase = (inferredNatId ? inferredNatId.replace(/[^A-Za-z0-9_-]/g,'_') : 'declaration') + '_DAILs_Form.pdf';
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = fileNameBase;
                                document.body.appendChild(a);
                                a.click();
                                setTimeout(()=>{
                                  document.body.removeChild(a);
                                  window.URL.revokeObjectURL(url);
                                }, 0);
                                const msg = instruction || 'The password for the attached PDF is Your National ID number.';
                                setAdminToast({ show: true, message: msg });
                              } catch (e) {
                                alert('Unexpected error exporting PDF: ' + e.message);
                              }
                            }}
                          >
                            <i className="bi bi-filetype-pdf me-1"></i> Export to PDF
                          </button>
                        </div>
                        <p><strong>Status:</strong> <span className={`badge ${selectedDeclaration.status === 'approved' ? 'bg-success' : selectedDeclaration.status === 'rejected' ? 'bg-danger' : 'bg-warning text-dark'}`}>{selectedDeclaration.status ? (selectedDeclaration.status === 'pending' ? 'Submitted' : (selectedDeclaration.status === 'rejected' ? 'Requesting Clarification' : selectedDeclaration.status.charAt(0).toUpperCase() + selectedDeclaration.status.slice(1))) : 'Submitted'}</span></p>
                        {selectedDeclaration.status === 'rejected' && selectedDeclaration.correction_message && (
                          <div className="alert alert-danger"><strong>Correction Required:</strong> {selectedDeclaration.correction_message}</div>
                        )}
                        <p><strong>Declaration Type:</strong> {selectedDeclaration.declaration_type || 'N/A'}</p>
                        <p><strong>Payroll Number:</strong> {selectedDeclaration.payroll_number}</p>
                        <p><strong>Name:</strong> {selectedDeclaration.first_name} {selectedDeclaration.other_names} {selectedDeclaration.surname}</p>
                        <p><strong>Email:</strong> {selectedDeclaration.email}</p>
                        {selectedDeclaration.phone_number && (
                          <p><strong>Phone Number:</strong> {selectedDeclaration.phone_number}</p>
                        )}
                        {selectedDeclaration.department && (
                          <p><strong>Department:</strong> {selectedDeclaration.department}</p>
                        )}
                        {selectedDeclaration.designation && (
                          <p><strong>Designation:</strong> {selectedDeclaration.designation}</p>
                        )}
                        {selectedDeclaration.national_id && (
                          <p><strong>National ID:</strong> {selectedDeclaration.national_id}</p>
                        )}
                        {selectedDeclaration.birthdate && (
                          <p><strong>Birthdate:</strong> {formatDateToDMY(selectedDeclaration.birthdate)}</p>
                        )}
                        {selectedDeclaration.physical_address && (
                          <p><strong>Physical Address:</strong> {selectedDeclaration.physical_address}</p>
                        )}
                        {selectedDeclaration.postal_address && (
                          <p><strong>Postal Address:</strong> {selectedDeclaration.postal_address}</p>
                        )}
                        <p><strong>Declaration Date:</strong> {formatDateToDMY(selectedDeclaration.declaration_date)}</p>
                        <p><strong>Marital Status:</strong> {selectedDeclaration.marital_status}</p>
                        <p><strong>Biennial Income:</strong><br />
                          {(() => {
                            const parsed = parseFinancialField(selectedDeclaration.biennial_income);
                            if (parsed.length > 0) {
                              return parsed.map((item, i) => (
                                <span key={i} style={{ display: 'block', marginBottom: 6 }}>
                                  {Object.entries(item).map(([key, value]) => (
                                    <span key={key} style={{ marginRight: 10 }}>
                                      <strong>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong> {value} 
                                    </span>
                                  ))}
                                </span>
                              ));
                            } else if (selectedDeclaration.biennial_income) {
                              return <span><strong>Amount:</strong> Ksh {parseFloat(selectedDeclaration.biennial_income).toLocaleString()}</span>;
                            } else {
                              return <span>N/A</span>;
                            }
                          })()}
                        </p>
                        <p><strong>Assets:</strong><br />
                          {(() => {
                            const parsed = parseFinancialField(selectedDeclaration.assets);
                            if (parsed.length > 0) {
                              return parsed.map((item, i) => (
                                <span key={i} style={{ display: 'block', marginBottom: 6 }}>
                                  {Object.entries(item).map(([key, value]) => (
                                    <span key={key} style={{ marginRight: 10 }}>
                                      <strong>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong> {value} 
                                    </span>
                                  ))}
                                </span>
                              ));
                            } else {
                              return <span>N/A</span>;
                            }
                          })()}
                        </p>
                        <p><strong>Liabilities:</strong><br />
                          {(() => {
                            const parsed = parseFinancialField(selectedDeclaration.liabilities);
                            if (parsed.length > 0) {
                              return parsed.map((item, i) => (
                                <span key={i} style={{ display: 'block', marginBottom: 6 }}>
                                  {Object.entries(item).map(([key, value]) => (
                                    <span key={key} style={{ marginRight: 10 }}>
                                      <strong>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</strong> {value} 
                                    </span>
                                  ))}
                                </span>
                              ));
                            } else {
                              return <span>N/A</span>;
                            }
                          })()}
                        </p>
                        {/* Spouse and Children info */}
                        <p><strong>Spouse(s):</strong><br />
                          {selectedDeclaration.spouses && selectedDeclaration.spouses.length > 0
                            ? selectedDeclaration.spouses.map((spouse, i) => (
                                <span key={i}>
                                  {spouse.full_name || `${spouse.first_name} ${spouse.other_names || ''} ${spouse.surname}`.trim()}
                                  {(() => {
                                    const parsed = parseFinancialField(spouse.biennial_income);
                                    if (parsed.length > 0) {
                                      return <><br /><strong>Biennial Income:</strong> {parsed.map((item, j) => (
                                        <span key={j}><strong>Details:</strong> {item.description} <strong>Amount:</strong> Ksh {parseFloat(item.value).toLocaleString()}<br /></span>
                                      ))}</>;
                                    } else if (spouse.biennial_income) {
                                      return <><br /><strong>Biennial Income:</strong> <strong>Amount:</strong> Ksh {parseFloat(spouse.biennial_income).toLocaleString()}</>;
                                    } else {
                                      return null;
                                    }
                                  })()}
                                  {(() => {
                                    const assets = parseFinancialField(spouse.assets);
                                    if (assets.length > 0) {
                                      return <><strong>Assets:</strong> {assets.map((a, k) => (
                                        <span key={k}><strong>{a.description || a.type || 'Item'}:</strong> Ksh {parseFloat(a.value || 0).toLocaleString()}<br /></span>
                                      ))}</>;
                                    }
                                    return null;
                                  })()}
                                  {(() => {
                                    const liabilities = parseFinancialField(spouse.liabilities);
                                    if (liabilities.length > 0) {
                                      return <><strong>Liabilities:</strong> {liabilities.map((l, k) => (
                                        <span key={k}><strong>{l.description || l.type || 'Item'}:</strong> Ksh {parseFloat(l.value || 0).toLocaleString()}<br /></span>
                                      ))}</>;
                                    }
                                    return null;
                                  })()}
                                  <br />
                                </span>
                              ))
                            : 'None'}
                        </p>
                        <p><strong>Children:</strong><br />
                          {selectedDeclaration.children && selectedDeclaration.children.length > 0
                            ? selectedDeclaration.children.map((child, i) => (
                                <span key={i}>
                                  {child.full_name || `${child.first_name} ${child.other_names || ''} ${child.surname}`.trim()}
                                  {(() => {
                                    const parsed = parseFinancialField(child.biennial_income);
                                    if (parsed.length > 0) {
                                      return <><br /><strong>Biennial Income:</strong> {parsed.map((item, j) => (
                                        <span key={j}><strong>Details:</strong> {item.description} <strong>Amount:</strong> Ksh {parseFloat(item.value).toLocaleString()}<br /></span>
                                      ))}</>;
                                    } else if (child.biennial_income) {
                                      return <><br /><strong>Biennial Income:</strong> <strong>Amount:</strong> Ksh {parseFloat(child.biennial_income).toLocaleString()}</>;
                                    } else {
                                      return null;
                                    }
                                  })()}
                                  {(() => {
                                    const assets = parseFinancialField(child.assets);
                                    if (assets.length > 0) {
                                      return <><strong>Assets:</strong> {assets.map((a, k) => (
                                        <span key={k}><strong>{a.description || a.type || 'Item'}:</strong> Ksh {parseFloat(a.value || 0).toLocaleString()}<br /></span>
                                      ))}</>;
                                    }
                                    return null;
                                  })()}
                                  {(() => {
                                    const liabilities = parseFinancialField(child.liabilities);
                                    if (liabilities.length > 0) {
                                      return <><strong>Liabilities:</strong> {liabilities.map((l, k) => (
                                        <span key={k}><strong>{l.description || l.type || 'Item'}:</strong> Ksh {parseFloat(l.value || 0).toLocaleString()}<br /></span>
                                      ))}</>;
                                    }
                                    return null;
                                  })()}
                                  <br />
                                </span>
                              ))
                            : 'None'}
                        </p>
                        <p><strong>Other Info:</strong> {selectedDeclaration.other_financial_info}</p>

                        {/* Approve/Reject Controls (Super admin can revise after decision) */}
                        {(selectedDeclaration.status === 'pending' || (isSuper && ['approved','rejected'].includes(selectedDeclaration.status))) && (
                          <div className="mt-3">
                            <hr />
                            <div className="d-flex align-items-center justify-content-between">
                              <h5 className="mb-0">Admin Action</h5>
                              <span className="badge bg-secondary text-capitalize">Current: {selectedDeclaration.status === 'pending' ? 'Submitted' : (selectedDeclaration.status === 'rejected' ? 'Requesting Clarification' : (selectedDeclaration.status || 'pending'))}</span>
                            </div>
                            {selectedDeclaration._statusAudit && selectedDeclaration._statusAudit.length > 0 && (
                              <div className="mt-2 small" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                                <strong>Recent Status Changes:</strong>
                                <ul className="mb-0 ps-3">
                                  {selectedDeclaration._statusAudit.map(a => (
                                    <li key={a.id}>
                                      <span className="d-block"><strong>{a.previous_status || '∅'}</strong> → <strong>{a.new_status}</strong>{a.admin_username && <> by <em>{a.admin_username}</em></>} <span className="text-muted">@ {new Date(a.changed_at).toLocaleString()}</span></span>
                                      {a.new_correction_message && <span className="text-muted">Note: {a.new_correction_message}</span>}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {isSuper && selectedDeclaration.status !== 'pending' && (
                              <div className="small text-muted mt-1">
                                As Super Admin you may revise the status (e.g. switch from approved to rejected or vice versa).
                              </div>
                            )}
                            <ApproveRejectForm
                              declarationId={selectedDeclaration.id}
                              currentStatus={selectedDeclaration.status}
                              priorCorrections={previousCorrections}
                              onActionComplete={() => { setShowModal(false); window.location.reload(); }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </Modal.Body>
                  <Modal.Footer>
                    <Button variant="secondary" onClick={handleCloseModal}>
                      Close
                    </Button>
                  </Modal.Footer>
                </Modal>
              </div>
            )}
            {currentTab === 'windows' && isSuper && (
              <div className="tab-pane fade show active">
                <div className="card shadow-sm">
                  <div className="card-header bg-primary text-white">
                    <h3 className="card-title mb-0">
                      <i className="bi bi-calendar-range me-2"></i>
                      Biennial Windows & Overrides
                    </h3>
                  </div>
                  <div className="card-body">
                    <BiennialWindowsAdmin />
                  </div>
                </div>
              </div>
            )}
            {currentTab === 'super-metrics' && isSuper && (
              <div className="tab-pane fade show active">
                <SuperAdminMetricsModule
                  adminUser={adminUser}
                  declarations={declarations}
                  avgIncome={0 /* placeholder, we can compute or reuse ReportsAndAnalytics values if lifted state */}
                  avgNetWorth={0}
                />
              </div>
            )}
            {currentTab === 'wealth-register' && (
              <div className="tab-pane fade show active">
                <WealthDeclarationRegister adminUser={adminUser} />
              </div>
            )}
            {currentTab === 'status-audit' && isSuper && (
              <div className="tab-pane fade show active">
                <StatusAuditModule adminToken={adminToken} isSuper={isSuper} />
              </div>
            )}
            {currentTab === 'dept-mgmt' && isSuper && (
              <div className="tab-pane fade show active">
                <DepartmentManagement adminUser={adminUser} />
              </div>
            )}

            {currentTab === 'family-financials' && (
              <div className="tab-pane fade show active">
                <FamilyFinancials declarations={declarations} />
              </div>
            )}
            
            {currentTab === 'email-management' && (
              <div className="tab-pane fade show active">
                <EmailManagement />
              </div>
            )}
            {currentTab === 'bulk-sms' && (
              <div className="tab-pane fade show active">
                <BulkSMSPanel />
              </div>
            )}
            {currentTab === 'email-audit' && (
              <div className="tab-pane fade show active">
                <AdminEmailAuditTab />
              </div>
            )}

            {currentTab === 'admin-users' && isSuper && (
              <div className="tab-pane fade show active">
                <div className="row">
                  <div className="col-lg-5 mb-4">
                    <AdminUserCreation adminUser={adminUser} />
                  </div>
                  <div className="col-lg-7">
                    <div className="card h-100">
                      <div className="card-header d-flex justify-content-between align-items-center">
                        <h5 className="mb-0"><i className="bi bi-people me-2 text-primary"></i>All Admins</h5>
                        <button className="btn btn-sm btn-outline-secondary" onClick={fetchMissingDeptAdmins} disabled={loadingMissingAdmins}>
                          {loadingMissingAdmins ? 'Refreshing...' : 'Refresh'}
                        </button>
                      </div>
                      <div className="card-body p-0">
                        {loadingMissingAdmins && <div className="p-3">Loading...</div>}
                        {!loadingMissingAdmins && adminsLoadError && (
                          <div className="p-3 text-danger small">{adminsLoadError}</div>
                        )}
                        {!loadingMissingAdmins && !adminsLoadError && missingDeptAdmins.length === 0 && (
                          <div className="p-3 text-muted">No admins found.</div>
                        )}
                        {!loadingMissingAdmins && missingDeptAdmins.length > 0 && (
                          <div className="table-responsive">
                            <table className="table table-sm table-striped mb-0">
                              <thead className="table-light">
                                <tr>
                                  <th>First Name</th>
                                  <th>Surname</th>
                                  <th>Username</th>
                                  <th>Role</th>
                                  <th>Department</th>
                                </tr>
                              </thead>
                              <tbody>
                                {missingDeptAdmins.map(a => (
                                  <tr key={a.id}>
                                    <td>{a.first_name || ''}</td>
                                    <td>{a.surname || ''}</td>
                                    <td>{a.username}</td>
                                    <td>{prettyAdminRole(a.role)}</td>
                                    <td>{a.department || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {currentTab === 'add-user' && isSuper && (
              <div className="tab-pane fade show active">
                <AddUserForm />
              </div>
            )}

            {currentTab === 'it-audits' && (isIT || isSuper) && (
              <div className="tab-pane fade show active">
                <ITAdminAuditsAndRequests />
              </div>
            )}

             {currentTab === 'department' && (
                <div className="tab-pane fade show active">
                  <DepartmentOverview
                    declarations={declarations}
                    backendStats={deptStats}
                    loading={loadingDeptStats}
                    onRefresh={() => fetchDeptStats(true)}
                  />
                </div>
              )}

            {currentTab === 'sub-department' && (isSuper || isIT) && (
              <div className="tab-pane fade show active">
                <SubDepartmentOverview
                  declarations={declarations}
                  loading={loading}
                />
              </div>
            )}
              {currentTab === 'personnel' && (
                <div className="tab-pane fade show active">
                  <PersonnelManagement
                    users={allUsers}
                    onAddPersonnel={handleAddPersonnel}
                    onRemovePersonnel={handleRemovePersonnel}
                    onPageChange={(p) => fetchUsersPage(p)}
                    currentPage={usersPage}
                    totalPages={usersTotalPages}
                    onSearch={(term) => { setUsersSearch(term); fetchUsersPage(1, term); }}
                    loading={usersLoading}
                    stats={usersStats}
                  />
                </div>
                  )}
            {currentTab === 'reports' && (
              <div className="tab-pane fade show active">
                {/* Declaration Type Table */}
                <div className="card mb-4">
                  <div className="card-header bg-info text-white">
                    <h5 className="mb-0">Declaration Type Summary</h5>
                  </div>
                  <div className="card-body p-0">
                    <table className="table table-bordered mb-0">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>First Declaration</td>
                          <td>{declarationTypeCounts.first}</td>
                        </tr>
                        <tr>
                          <td>Biennial Declaration</td>
                          <td>{declarationTypeCounts.biennial}</td>
                        </tr>
                        <tr>
                          <td>Final Declaration</td>
                          <td>{declarationTypeCounts.final}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <ReportsAndAnalytics
                  declarations={declarations}
                  reportData={reportData}
                  biennialLocked={biennialLocked}
                  handleToggleBiennialLock={handleToggleBiennialLock}
                  firstLocked={firstLocked}
                  handleToggleFirstLock={handleToggleFirstLock}
                  finalLocked={finalLocked}
                  handleToggleFinalLock={handleToggleFinalLock}
                  downloadReport={downloadReport}
                  usersCount={usersCount}
                  adminUser={adminUser}
                />
              </div>
            )}
            {currentTab === 'consent-logs' && (
              <div className="tab-pane fade show active">
                <AdminConsentLogs />
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminPage;