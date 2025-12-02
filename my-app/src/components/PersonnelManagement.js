import React from 'react';

// Accept either `users` or legacy `declarations` prop for backwards compatibility.
const PersonnelManagement = ({ 
  users, 
  declarations, 
  onRemovePersonnel,
  onPageChange,
  currentPage = 1,
  totalPages = 1,
  onSearch,
  loading = false,
  stats
}) => {
  const people = users || declarations || [];
  const [localSearch, setLocalSearch] = React.useState('');
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (onSearch) onSearch(localSearch.trim());
  };
  return (
  <div className="card shadow-sm">
    <div className="card-header bg-dark text-white">
      <h3 className="card-title mb-0">
        <i className="bi bi-person-badge me-2"></i>
        Personnel Management
      </h3>
    </div>
    <div className="card-body">
      <div className="d-flex flex-wrap align-items-center mb-3 gap-2">
        <form className="d-flex" onSubmit={handleSearchSubmit} role="search">
          <input
            type="text"
            className="form-control me-2"
            placeholder="Search name, payroll, national ID..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            style={{ minWidth: '240px' }}
          />
          <button className="btn btn-outline-primary" type="submit" disabled={loading}>Search</button>
          {localSearch && (
            <button
              type="button"
              className="btn btn-outline-secondary ms-2"
              onClick={() => { setLocalSearch(''); onSearch && onSearch(''); }}
              disabled={loading}
            >Clear</button>
          )}
        </form>
        {stats && (
          <div className="ms-auto small text-muted">
            Total: {stats.total} | With Email: {stats.withEmail} | Without Email: {stats.withoutEmail}
          </div>
        )}
      </div>
      {/* Personnel List */}
      <div className="table-responsive">
        <table className="table table-striped table-hover">
          <thead className="table-dark">
            <tr>
              <th>National ID</th>
              <th>Payroll Number</th>
              <th>First Name</th>
              <th>Surname</th>
              <th>Department</th>
              <th>Declarations</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="text-center">Loading...</td></tr>
            )}
            {!loading && people.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted">No users found</td></tr>
            )}
            {!loading && people.map(person => {
              const declCount = person.declaration_count ?? 0;
              const canDelete = declCount === 0;
              return (
                <tr key={person.id || person.payroll_number}>
                  <td>{person.national_id || ''}</td>
                  <td>{person.payroll_number}</td>
                  <td>{person.first_name}</td>
                  <td>{person.surname}</td>
                  <td>{person.department}</td>
                  <td>{declCount}</td>
                  <td>
                    <div className="btn-group btn-group-sm" role="group">
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={!canDelete}
                        title={canDelete ? 'Delete user' : 'Cannot delete: user has declarations'}
                        onClick={() => canDelete && onRemovePersonnel && onRemovePersonnel(person)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
        <div className="small text-muted">Page {currentPage} of {totalPages}</div>
        <div className="btn-group" role="group">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={currentPage <= 1 || loading}
            onClick={() => onPageChange && onPageChange(currentPage - 1)}
          >Previous</button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={currentPage >= totalPages || loading}
            onClick={() => onPageChange && onPageChange(currentPage + 1)}
          >Next</button>
        </div>
      </div>
    </div>
  </div>
  );
};

export default PersonnelManagement;