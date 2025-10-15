import React from 'react';

const departments = [
  "Department of Transport, Infrastructure and Governance",
  "Department of Trade, Tourism and Culture",
  "Department of Education and Vocational Training",
  "Department of Environment and Water",
  "Department of Lands, Urban Planning,Housing and Serikali Mtaani",
  "Department of Health",
  "Department of Public Service Administration, Youth, Gender and Sports",
  "Department of Finance, Economic Planning and Digital Transformation",
  "Department of Blue Economy ,Cooperatives, Agriculture and Livestock",
  "Department of Climate Change,Energy and Natural Resources"
];

// Accept either `users` or legacy `declarations` prop for backwards compatibility.
const PersonnelManagement = ({ 
  users, 
  declarations, 
  onAddPersonnel, 
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
      {/* Add Personnel Form */}
      <form
        className="mb-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const newPerson = Object.fromEntries(formData.entries());
          if (onAddPersonnel) {
            await onAddPersonnel(newPerson);
          }
          e.target.reset();
        }}
      >
        <div className="row">
          <div className="col-md-2">
            <input name="national_id" className="form-control mb-2" placeholder="National ID" required />
          </div>
          <div className="col-md-2">
            <input name="payroll_number" className="form-control mb-2" placeholder="Payroll Number" required />
          </div>
          <div className="col-md-2">
            <input name="first_name" className="form-control mb-2" placeholder="First Name" required />
          </div>
          <div className="col-md-2">
            <input name="surname" className="form-control mb-2" placeholder="Surname" required />
          </div>
          <div className="col-md-4">
            <select name="department" className="form-control mb-2" required>
              <option value="">Select Department</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit" className="btn btn-success mt-2">Add Personnel</button>
      </form>
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