import React, { useMemo } from "react";

/**
 * SubDepartmentOverview Component
 * Renders a summary table of unique declarants per sub-department.
 *
 * Props:
 *   declarations: Array of declaration objects. Each object should have a `sub_department` property.
 *   loading: Boolean indicating if data is currently being fetched.
 */
const SubDepartmentOverview = ({ declarations = [], loading = false }) => {
  const subDepartmentSummary = useMemo(() => {
    // console.log('[SubDepartmentOverview] Recalculating summary. Declarations with sub-depts:', declarations.filter(d => d.sub_department).length);
    if (!declarations || declarations.length === 0) {
      return [];
    }

    // Helper to derive a stable user key from a declaration object
    const userKey = (d) =>
      d.user_id ?? d.payroll_number ?? d.email ?? `decl-${d.id}`;

    // Helper to read a sub-department value from various possible field names
    const getSubDept = (d) => {
      const val =
        d.sub_department ||
        d.user_sub_department ||
        d.subDepartment ||
        d.user_subDepartment ||
        d.user_sub_dept ||
        d.sub_dept ||
        null;
      if (!val) return null;
      const s = String(val).trim();
      return s.length ? s : null;
    };

    // Use a map to count each user only once, associated with their sub-department.
    // This correctly handles cases where a user might have multiple declarations.
    const subDeptEmployeeMap = new Map();
    for (const d of declarations) {
      const sd = getSubDept(d);
      if (sd) {
        subDeptEmployeeMap.set(userKey(d), sd);
      }
    }

    // Count the occurrences of each sub-department from the unique user map.
    const subDeptCounts = new Map();
    for (const subDept of subDeptEmployeeMap.values()) {
      subDeptCounts.set(subDept, (subDeptCounts.get(subDept) || 0) + 1);
    }

    // Convert the map to an array of objects and sort it for display.
    return Array.from(subDeptCounts.entries())
      .map(([subDepartment, count]) => ({ subDepartment, count }))
      .sort(
        (a, b) =>
          b.count - a.count || a.subDepartment.localeCompare(b.subDepartment)
      );
  }, [declarations]);

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-secondary text-white">
        <h3 className="card-title mb-0">
          <i className="bi bi-diagram-3 me-2"></i>
          Sub-Department Overview
        </h3>
      </div>
      <div className="card-body">
        {loading && (
          <div className="alert alert-info py-2">
            Loading sub-department statistics...
          </div>
        )}
        {subDepartmentSummary.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-sm table-bordered table-striped">
              <thead className="table-light">
                <tr>
                  <th>Sub-Department</th>
                  <th className="text-end">Unique Declarants</th>
                </tr>
              </thead>
              <tbody>
                {subDepartmentSummary.map(({ subDepartment, count }) => (
                  <tr key={subDepartment}>
                    <td>{subDepartment}</td>
                    <td className="text-end">{count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="fw-bold table-group-divider">
                <tr>
                  <td>Total (with sub-department)</td>
                  <td className="text-end">
                    {subDepartmentSummary.reduce((total, item) => total + item.count, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : !loading ? (
          <div className="alert alert-secondary">No sub-department data available to display.</div>
        ) : null}
      </div>
    </div>
  );
};

export default SubDepartmentOverview;