import React, { useState, useEffect, useCallback } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';

const EmailManagement = () => {
    // Users returned already filtered by server (search, emailFilter, department)
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [emailFilter, setEmailFilter] = useState('all'); // all, with-email, without-email
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [departments, setDepartments] = useState([]);
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sortBy, setSortBy] = useState('surname');
    const [sortDir, setSortDir] = useState('asc');
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [bulkEmail, setBulkEmail] = useState('');
    const [showBulkUpdate, setShowBulkUpdate] = useState(false);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0
    });
    const [stats, setStats] = useState({
        total: 0,
        withEmail: 0,
        withoutEmail: 0
    });

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            const queryParams = new URLSearchParams({
                page: pagination.page,
                limit: pagination.limit,
                emailFilter: emailFilter,
                search: debouncedSearch || '',
                department: departmentFilter || '',
                sortBy: sortBy,
                sortDir: sortDir
            });
            const adminToken = localStorage.getItem('adminToken');
            if (!adminToken) {
                console.warn('No adminToken found in localStorage.');
            }
            const response = await fetch(`/api/admin/users?${queryParams}`, {
                headers: {
                    'Authorization': `Bearer ${adminToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setFilteredUsers(data.users || []);
                setPagination(prev => ({
                    ...prev,
                    total: data.total,
                    totalPages: data.totalPages
                }));
                // If backend provides stats, use them; else fallback to local calculation
                if (data.stats) {
                    setStats(prev => ({
                        ...prev,
                        total: data.stats.total ?? data.total ?? 0,
                        withEmail: data.stats.withEmail ?? 0,
                        withoutEmail: data.stats.withoutEmail ?? 0
                    }));
                } else {
                    // fallback: calculate from all users in current page (not accurate for paginated data)
                    setStats({
                        total: data.total,
                        withEmail: (data.users || []).filter(u => u.email).length,
                        withoutEmail: (data.users || []).filter(u => !u.email).length
                    });
                }
            } else {
                console.error('Failed to fetch users. Status:', response.status);
            }
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.limit, emailFilter, debouncedSearch, departmentFilter, sortBy, sortDir]);

    // Debounce search input
    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 400);
        return () => clearTimeout(id);
    }, [searchTerm]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // Load distinct departments once
    useEffect(() => {
        const loadDepartments = async () => {
            try {
                const adminToken = localStorage.getItem('adminToken');
                const resp = await fetch('/api/admin/users/departments/distinct', {
                    headers: { 'Authorization': `Bearer ${adminToken}` }
                });
                if (resp.ok) {
                    const data = await resp.json();
                    // Prefer full enum list (departments) but fallback to stats names
                    let list = data.departments;
                    if ((!list || list.length === 0) && Array.isArray(data.departmentStats)) {
                        list = data.departmentStats.map(d => d.name);
                    }
                    setDepartments(list || []);
                }
            } catch (e) {
                console.warn('Failed to load departments', e);
            }
        };
        loadDepartments();
    }, []);

    // Remove client-side filtering; server responds with already filtered data

    const handleEmailUpdate = async (userId, email) => {
        try {
            const adminToken = localStorage.getItem('adminToken');
            const response = await fetch(`/api/admin/users/${userId}/email`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({ email })
            });

            if (response.ok) {
                // Update local state (update in filteredUsers array)
                setFilteredUsers(prev => prev.map(user => 
                    user.id === userId ? { ...user, email } : user
                ));
                alert('Email updated successfully!');
            } else {
                const errorData = await response.json();
                alert(`Error: ${errorData.message}`);
            }
        } catch (error) {
            console.error('Error updating email:', error);
            alert('Network error. Please try again.');
        }
    };

    const handleBulkEmailUpdate = async () => {
        if (selectedUsers.length === 0) {
            alert('Please select users to update');
            return;
        }

        if (!bulkEmail.trim()) {
            alert('Please enter an email template');
            return;
        }

        try {
            setLoading(true);
            const adminToken = localStorage.getItem('adminToken');
            const response = await fetch('/api/admin/users/bulk-email', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${adminToken}`
                },
                body: JSON.stringify({
                    userIds: selectedUsers,
                    emailTemplate: bulkEmail
                })
            });

            if (response.ok) {
                const result = await response.json();
                alert(`Successfully updated ${result.updated} email addresses`);
                setSelectedUsers([]);
                setBulkEmail('');
                setShowBulkUpdate(false);
                fetchUsers(); // Refresh data
            } else {
                const errorData = await response.json();
                alert(`Error: ${errorData.message}`);
            }
        } catch (error) {
            console.error('Error bulk updating emails:', error);
            alert('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectUser = (userId) => {
        setSelectedUsers(prev => 
            prev.includes(userId) 
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const handleSelectAll = () => {
        if (selectedUsers.length === filteredUsers.length) {
            setSelectedUsers([]);
        } else {
            setSelectedUsers(filteredUsers.map(user => user.id));
        }
    };

    const toggleSort = (field) => {
        if (sortBy === field) {
            setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortDir('asc');
        }
    };

    const renderSortIcon = (field) => {
        if (sortBy !== field) return <i className="bi bi-arrow-down-up ms-1 text-muted"></i>;
        return sortDir === 'asc' ? <i className="bi bi-arrow-up ms-1"></i> : <i className="bi bi-arrow-down ms-1"></i>;
    };

    const exportUsersWithoutEmail = () => {
        const usersWithoutEmail = filteredUsers.filter(user => !user.email);
        const csvContent = [
            ['ID Number', 'First Name', 'Last Name', 'Department', 'Birth Date'],
            ...usersWithoutEmail.map(user => [
                user.national_id,
                user.surname,
                user.first_name,
                user.other_names,
                user.department || '',
                user.birthdate || ''
            ])
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'users_without_email.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="container-fluid py-4">
            <div className="card shadow-sm">
                {/* Header */}
                <div className="card-header bg-primary text-white">
                    <div className="d-flex justify-content-between align-items-center">
                        <h3 className="card-title mb-0">
                            <i className="bi bi-envelope-fill me-2"></i>
                            Email Management
                        </h3>
                        <div className="btn-group">
                            <button 
                                className={`btn ${showBulkUpdate ? 'btn-warning' : 'btn-light'}`}
                                onClick={() => setShowBulkUpdate(!showBulkUpdate)}
                            >
                                <i className="bi bi-pencil-square me-1"></i>
                                Bulk Update
                            </button>
                            <button 
                                className="btn btn-light"
                                onClick={exportUsersWithoutEmail}
                            >
                                <i className="bi bi-download me-1"></i>
                                Export Missing Emails
                            </button>
                        </div>
                    </div>
                </div>

                <div className="card-body">
                    {/* Statistics Cards */}
                    <div className="row mb-4">
                        <div className="col-md-3">
                            <div className="card bg-info text-white">
                                <div className="card-body">
                                    <div className="d-flex justify-content-between">
                                        <div>
                                            <h6 className="card-title">Total Users</h6>
                                            <h4 className="mb-0">{stats.total}</h4>
                                        </div>
                                        <i className="bi bi-people-fill display-6"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="col-md-3">
                            <div className="card bg-success text-white">
                                <div className="card-body">
                                    <div className="d-flex justify-content-between">
                                        <div>
                                            <h6 className="card-title">With Email</h6>
                                            <h4 className="mb-0">{stats.withEmail}</h4>
                                        </div>
                                        <i className="bi bi-envelope-check-fill display-6"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="col-md-3">
                            <div className="card bg-warning text-dark">
                                <div className="card-body">
                                    <div className="d-flex justify-content-between">
                                        <div>
                                            <h6 className="card-title">Missing Email</h6>
                                            <h4 className="mb-0">{stats.withoutEmail}</h4>
                                        </div>
                                        <i className="bi bi-envelope-x-fill display-6"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="col-md-3">
                            <div className="card bg-secondary text-white">
                                <div className="card-body">
                                    <div className="d-flex justify-content-between">
                                        <div>
                                            <h6 className="card-title">Selected</h6>
                                            <h4 className="mb-0">{selectedUsers.length}</h4>
                                        </div>
                                        <i className="bi bi-check-square-fill display-6"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="row mb-4">
                        <div className="col-md-4">
                            <div className="input-group">
                                <span className="input-group-text">
                                    <i className="bi bi-search"></i>
                                </span>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Search by name, payroll, or email..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="col-md-2 mt-3 mt-md-0">
                            <select 
                                className="form-select"
                                value={emailFilter}
                                onChange={(e) => setEmailFilter(e.target.value)}
                            >
                                <option value="all">All Users</option>
                                <option value="with-email">With Email</option>
                                <option value="without-email">Without Email</option>
                            </select>
                        </div>
                        <div className="col-md-3 mt-3 mt-md-0">
                            <div className="input-group">
                                <span className="input-group-text">
                                    <i className="bi bi-building"></i>
                                </span>
                                <select
                                    className="form-select"
                                    value={departmentFilter}
                                    onChange={(e) => setDepartmentFilter(e.target.value)}
                                >
                                    <option value="">All Departments</option>
                                    {departments.map(dep => (
                                        <option key={dep} value={dep}>{dep}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="col-md-3 mt-3 mt-md-0 d-flex align-items-center justify-content-end">
                            <span className="badge bg-primary me-2">
                                Showing: {filteredUsers.length}
                            </span>
                            {(debouncedSearch || departmentFilter || emailFilter !== 'all') && (
                                <button className="btn btn-sm btn-outline-secondary" onClick={() => { setSearchTerm(''); setDepartmentFilter(''); setEmailFilter('all'); }}>
                                    Clear Filters
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Bulk Update Panel */}
                    {showBulkUpdate && (
                        <div className="alert alert-info border-0 shadow-sm mb-4">
                            <h5 className="alert-heading">
                                <i className="bi bi-gear-fill me-2"></i>
                                Bulk Email Update
                            </h5>
                            <div className="row">
                                <div className="col-md-8">
                                    <div className="input-group">
                                        <span className="input-group-text">
                                            <i className="bi bi-envelope-at"></i>
                                        </span>
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="Email template (use {surname}, {first_name}, {other_names}, {id_number} for placeholders)"
                                            value={bulkEmail}
                                            onChange={(e) => setBulkEmail(e.target.value)}
                                        />
                                    </div>
                                    <small className="form-text text-muted mt-1">
                                        Example: {'{surname}.{first_name}.{other_names}.{id_number}@company.com'} will generate personalized emails
                                    </small>
                                </div>
                                <div className="col-md-4">
                                    <button 
                                        className="btn btn-success w-100"
                                        onClick={handleBulkEmailUpdate}
                                        disabled={selectedUsers.length === 0 || !bulkEmail.trim() || loading}
                                    >
                                        {loading ? (
                                            <>
                                                <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                                                Updating...
                                            </>
                                        ) : (
                                            <>
                                                <i className="bi bi-check-circle me-1"></i>
                                                Update {selectedUsers.length} Users
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Users Table */}
                    <div className="table-responsive">
                        <table className="table table-hover table-striped">
                            <thead className="table-dark">
                                <tr>
                                    <th scope="col" style={{ width: '50px' }}>
                                        <div className="form-check">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                                                onChange={handleSelectAll}
                                            />
                                        </div>
                                    </th>
                                    <th scope="col" style={{cursor:'pointer'}} onClick={() => toggleSort('national_id')}>
                                        ID Number {renderSortIcon('national_id')}
                                    </th>
                                    <th scope="col" style={{cursor:'pointer'}} onClick={() => toggleSort('surname')}>
                                        Name {renderSortIcon('surname')}
                                    </th>
                                    <th scope="col" style={{cursor:'pointer'}} onClick={() => toggleSort('email')}>
                                        Email {renderSortIcon('email')}
                                    </th>
                                    <th scope="col" style={{cursor:'pointer'}} onClick={() => toggleSort('has_email')}>
                                        Status {renderSortIcon('has_email')}
                                    </th>
                                    <th scope="col" style={{ width: '150px' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="6" className="text-center py-4">
                                            <div className="spinner-border text-primary" role="status">
                                                <span className="visually-hidden">Loading...</span>
                                            </div>
                                            <div className="mt-2">Loading users...</div>
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="text-center py-4">
                                            <i className="bi bi-inbox display-4 text-muted"></i>
                                            <div className="mt-2 text-muted">No users found</div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredUsers.map(user => (
                                        <UserEmailRow
                                            key={user.id}
                                            user={user}
                                            isSelected={selectedUsers.includes(user.id)}
                                            onSelect={() => handleSelectUser(user.id)}
                                            onEmailUpdate={handleEmailUpdate}
                                        />
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <nav aria-label="User pagination">
                        <ul className="pagination justify-content-center">
                            <li className={`page-item ${pagination.page === 1 ? 'disabled' : ''}`}>
                                <button 
                                    className="page-link"
                                    onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                                    disabled={pagination.page === 1}
                                >
                                    <i className="bi bi-chevron-left"></i>
                                    Previous
                                </button>
                            </li>
                            
                            {/* Page numbers */}
                            {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                                const pageNum = Math.max(1, pagination.page - 2) + i;
                                if (pageNum <= pagination.totalPages) {
                                    return (
                                        <li key={pageNum} className={`page-item ${pagination.page === pageNum ? 'active' : ''}`}>
                                            <button 
                                                className="page-link"
                                                onClick={() => setPagination(prev => ({ ...prev, page: pageNum }))}
                                            >
                                                {pageNum}
                                            </button>
                                        </li>
                                    );
                                }
                                return null;
                            })}
                            
                            <li className={`page-item ${pagination.page === pagination.totalPages ? 'disabled' : ''}`}>
                                <button 
                                    className="page-link"
                                    onClick={() => setPagination(prev => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))}
                                    disabled={pagination.page === pagination.totalPages}
                                >
                                    Next
                                    <i className="bi bi-chevron-right"></i>
                                </button>
                            </li>
                        </ul>
                    </nav>

                    <div className="text-center text-muted">
                        Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total users)
                    </div>
                </div>
            </div>
        </div>
    );
};

const UserEmailRow = ({ user, isSelected, onSelect, onEmailUpdate }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [email, setEmail] = useState(user.email || '');

    const handleSave = () => {
        if (email !== user.email) {
            onEmailUpdate(user.id, email);
        }
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEmail(user.email || '');
        setIsEditing(false);
    };

    return (
        <tr className={!user.email ? 'table-warning' : ''}>
            <td>
                <div className="form-check">
                    <input
                        className="form-check-input"
                        type="checkbox"
                        checked={isSelected}
                        onChange={onSelect}
                    />
                </div>
            </td>
            <td>
                <span className="badge bg-secondary">{user.national_id}</span>
            </td>
            <td>
                <div className="fw-bold">{`${user.surname} ${user.first_name} ${user.other_names || ''}`.trim()}</div>
                {user.department && <small className="text-muted">{user.department}</small>}
            </td>
            <td>
                {isEditing ? (
                    <div className="input-group input-group-sm">
                        <span className="input-group-text">
                            <i className="bi bi-envelope"></i>
                        </span>
                        <input
                            type="email"
                            className="form-control"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSave()}
                            placeholder="Enter email address"
                        />
                    </div>
                ) : (
                    <span className={!user.email ? 'text-muted fst-italic' : ''}>
                        {user.email || 'No email provided'}
                    </span>
                )}
            </td>
            <td>
                <span className={`badge ${user.email ? 'bg-success' : 'bg-warning text-dark'}`}>
                    <i className={`bi ${user.email ? 'bi-check-circle' : 'bi-exclamation-triangle'} me-1`}></i>
                    {user.email ? 'Complete' : 'Missing'}
                </span>
            </td>
            <td>
                {isEditing ? (
                    <div className="btn-group btn-group-sm">
                        <button className="btn btn-success" onClick={handleSave}>
                            <i className="bi bi-check"></i>
                        </button>
                        <button className="btn btn-secondary" onClick={handleCancel}>
                            <i className="bi bi-x"></i>
                        </button>
                    </div>
                ) : (
                    <button 
                        className={`btn btn-sm ${user.email ? 'btn-outline-primary' : 'btn-primary'}`}
                        onClick={() => setIsEditing(true)}
                    >
                        <i className={`bi ${user.email ? 'bi-pencil' : 'bi-plus-circle'} me-1`}></i>
                        {user.email ? 'Edit' : 'Add'}
                    </button>
                )}
            </td>
        </tr>
    );
};

export default EmailManagement;