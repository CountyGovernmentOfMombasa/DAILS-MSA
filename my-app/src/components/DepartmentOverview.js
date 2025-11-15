import React, { useMemo } from "react";
import { useDepartments } from "../hooks/useDepartments";

// Normalization helper: collapse whitespace, remove most punctuation (keep alphanumerics & spaces), map & -> and
function normalizeDepartment(name) {
  return (name || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ") // non-alphanumeric to single space
    .replace(/\s+/g, " ") // collapse spaces
    .trim();
}

// Attempt to map an arbitrary department string to a canonical department.
function mapToCanonical(raw, canonicalIndex) {
  const norm = normalizeDepartment(raw);
  if (!norm) return null;
  // 1. Exact match (best case)
  if (canonicalIndex.has(norm)) return canonicalIndex.get(norm);
  // 2. Fallback: partial matching (contains or starts/ends with)
  for (const [normCanon, canonName] of canonicalIndex.entries()) {
    // Check if the user's department is a substring of a canonical one, or vice-versa.
    if (normCanon.includes(norm) || norm.includes(nCanon)) {
      return canonName;
    }
  }
  return null; // unknown bucket
}

/**
 * DepartmentOverview Component
 * Props:
 *   declarations: Array<{ department: string, ... }>
 *   employeeTotalsByDepartment?: { [canonicalDepartment: string]: number } (optional)
 *     If provided, Percentage = declared_in_dept / total_in_dept.
 *     If omitted, Percentage = declared_in_dept / total_declared_overall.
 *   showUnknown?: boolean (default true) – whether to show an 'Unknown / Other' row.
 */
const DepartmentOverview = ({
  declarations = [],
  employeeTotalsByDepartment = null,
  showUnknown = true,
  backendStats = null,
  loading = false,
  onRefresh = null,
}) => {
  const { departments: dynamicDeps } = useDepartments();
  const CANONICAL_DEPARTMENTS =
    dynamicDeps && dynamicDeps.length
      ? dynamicDeps
      : require("../constants/departments").DEPARTMENTS;
  const { rows, overallTotalsSource, hadUnknown, backendUsed } = useMemo(() => {
    // If backendStats provided, build rows directly from it (authoritative unique declarant counts)
    if (backendStats && backendStats.counts) {
      const totalUnique =
        backendStats.totalUniqueEmployeesWithDeclarations ||
        Object.values(backendStats.counts).reduce(
          (a, v) => a + (typeof v === "number" ? v : 0),
          0
        ) + (backendStats.unknown || 0);
      const rows = CANONICAL_DEPARTMENTS.map((canon) => {
        const declared = backendStats.counts[canon] || 0;
        const totalForDept = employeeTotalsByDepartment
          ? employeeTotalsByDepartment[canon] ?? null
          : declared; // if separate totals passed, use them
        const percent =
          totalUnique > 0 ? ((declared / totalUnique) * 100).toFixed(1) : "0.0";
        return { department: canon, declared, total: totalForDept, percent };
      });
      if (showUnknown && backendStats.unknown > 0) {
        const unknownDeclared = backendStats.unknown;
        const totalForUnknown = employeeTotalsByDepartment
          ? employeeTotalsByDepartment["Unknown / Other"] ?? null
          : unknownDeclared;
        const percent =
          totalUnique > 0
            ? ((unknownDeclared / totalUnique) * 100).toFixed(1)
            : "0.0";
        rows.push({
          department: "Unknown / Other",
          declared: unknownDeclared,
          total: totalForUnknown,
          percent,
        });
      }
      return {
        rows,
        overallTotalsSource: "backend (unique declarants)",
        hadUnknown: (backendStats.unknown || 0) > 0,
        backendUsed: true,
      };
    }
    // Build canonical index
    const canonicalIndex = new Map(); // normalized -> canonical string
    CANONICAL_DEPARTMENTS.forEach((c) =>
      canonicalIndex.set(normalizeDepartment(c), c)
    );

    // Helper to derive a stable user key
    const userKey = (d) =>
      d.user_id ?? d.payroll_number ?? d.email ?? `decl-${d.id}`;

    // We want to count UNIQUE employees who have at least one declaration, not raw declaration rows.
    // If an employee has multiple declarations (e.g., First + Biennial), they should be counted once.
    // If their department changes, prefer the most recent (by submitted_at, declaration_date, or id).
    const employeeMap = new Map(); // key -> {deptCanonical|null, dateValue:number, isKnown:boolean}

    const parseDatePriority = (d) => {
      // Prefer submitted_at, then declaration_date, else use id as last resort
      const dateStr = d.submitted_at || d.declaration_date;
      const ts = dateStr
        ? Date.parse(dateStr.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1"))
        : undefined; // handle DD/MM/YYYY
      if (!isNaN(ts)) return ts;
      return typeof d.id === "number" ? d.id : 0;
    };

    for (const d of declarations) {
      const key = userKey(d);
      const canonical = mapToCanonical(d.department, canonicalIndex); // may be null
      const dateVal = parseDatePriority(d);
      if (!employeeMap.has(key)) {
        employeeMap.set(key, {
          dept: canonical,
          dateValue: dateVal,
          isKnown: !!canonical,
        });
      } else {
        const prev = employeeMap.get(key);
        // Update if newer, or if previous was unknown and this one is known
        if (dateVal >= prev.dateValue) {
          if (!prev.isKnown && canonical) {
            employeeMap.set(key, {
              dept: canonical,
              dateValue: dateVal,
              isKnown: true,
            });
          } else if (canonical && prev.isKnown) {
            employeeMap.set(key, {
              dept: canonical,
              dateValue: dateVal,
              isKnown: true,
            });
          } else if (!prev.isKnown && !canonical) {
            employeeMap.set(key, {
              dept: null,
              dateValue: dateVal,
              isKnown: false,
            });
          }
        }
      }
    }

    // Count unique employees per canonical department
    const counts = new Map();
    let unknownCount = 0;
    for (const { dept, isKnown } of employeeMap.values()) {
      if (isKnown && dept) {
        counts.set(dept, (counts.get(dept) || 0) + 1);
      } else {
        unknownCount += 1;
      }
    }

    const overallUnique = employeeMap.size; // unique employees declared
    const rows = [];

    for (const canon of CANONICAL_DEPARTMENTS) {
      const declared = counts.get(canon) || 0;
      // When we don't have an external total employees mapping, show the department's declared count as its own total (so the column is meaningful per row)
      const totalForDept = employeeTotalsByDepartment
        ? employeeTotalsByDepartment[canon] ?? null
        : declared;
      let percent;
      if (employeeTotalsByDepartment) {
        percent =
          totalForDept > 0
            ? ((declared / totalForDept) * 100).toFixed(1)
            : "0.0";
      } else {
        // Still base percentage on overall unique declarants so distribution sums ~100%
        percent =
          overallUnique > 0
            ? ((declared / overallUnique) * 100).toFixed(1)
            : "0.0";
      }
      rows.push({ department: canon, declared, total: totalForDept, percent });
    }

    if (showUnknown && unknownCount > 0) {
      const totalForUnknown = employeeTotalsByDepartment
        ? employeeTotalsByDepartment["Unknown / Other"] ?? null
        : overallUnique;
      let percent;
      if (employeeTotalsByDepartment) {
        percent =
          totalForUnknown > 0
            ? ((unknownCount / totalForUnknown) * 100).toFixed(1)
            : "0.0";
      } else {
        percent =
          overallUnique > 0
            ? ((unknownCount / overallUnique) * 100).toFixed(1)
            : "0.0";
      }
      rows.push({
        department: "Unknown / Other",
        declared: unknownCount,
        total: totalForUnknown,
        percent,
      });
    }

    return {
      rows,
      overallTotalsSource: employeeTotalsByDepartment
        ? "department totals"
        : "unique declarants",
      hadUnknown: unknownCount > 0,
      backendUsed: false,
    };
  }, [
    declarations,
    employeeTotalsByDepartment,
    showUnknown,
    backendStats,
    CANONICAL_DEPARTMENTS,
  ]);

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-secondary text-white d-flex justify-content-between align-items-center">
        <h3 className="card-title mb-0">
          <i className="bi bi-building me-2"></i>
          Department Overview
        </h3>
        <div className="d-flex flex-column align-items-end">
          <small className="text-light fst-italic mb-1">
            Percent base: {overallTotalsSource}
            {hadUnknown ? " (includes unknown bucket)" : ""}
            {backendUsed ? " ✔" : ""}
          </small>
          {onRefresh && (
            <button
              className="btn btn-sm btn-outline-light"
              onClick={onRefresh}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh Stats"}
            </button>
          )}
        </div>
      </div>
      <div className="card-body">
        {loading && (
          <div className="alert alert-info py-2">
            Loading department statistics...
          </div>
        )}
        <div className="table-responsive">
          <table className="table table-striped table-hover">
            <thead className="table-dark">
              <tr>
                <th>Department</th>
                <th>Declared</th>
                <th>
                  {employeeTotalsByDepartment
                    ? "Total Employees"
                    : "Declared (Dept)"}
                </th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.department}>
                  <td>{r.department}</td>
                  <td>{r.declared}</td>
                  <td>{r.total === null ? "—" : r.total}</td>
                  <td>{r.percent}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="fw-bold">
                <td>Total</td>
                <td>{rows.reduce((a, r) => a + r.declared, 0)}</td>
                <td>
                  {employeeTotalsByDepartment
                    ? Object.values(employeeTotalsByDepartment).reduce(
                        (a, v) => a + (typeof v === "number" ? v : 0),
                        0
                      )
                    : rows.reduce((a, r) => a + r.total, 0)}
                </td>
                <td>100.0</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DepartmentOverview;
