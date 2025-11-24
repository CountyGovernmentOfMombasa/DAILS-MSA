import React, { useMemo, useState } from "react";
import { useDepartments } from "../hooks/useDepartments";
import { DEPARTMENTS as STATIC_DEPARTMENTS } from "../constants/departments";

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
// Mapping now mirrors backend (inclusive substring fallback) to keep figures consistent.
function mapToCanonical(raw, canonicalIndex) {
  const norm = normalizeDepartment(raw);
  if (!norm) return null;
  if (canonicalIndex.has(norm)) return canonicalIndex.get(norm);
  for (const [normCanon, canonName] of canonicalIndex.entries()) {
    if (normCanon.includes(norm) || norm.includes(normCanon)) return canonName;
  }
  return null;
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
    dynamicDeps && dynamicDeps.length ? dynamicDeps : STATIC_DEPARTMENTS;
  const [mode, setMode] = useState("unique"); // unique | raw
  const { rows, overallTotalsSource, hadUnknown, backendUsed, employeeMap, rawRows } = useMemo(() => {
    // If backendStats provided, build rows directly from it (authoritative unique declarant counts)
    if (backendStats && backendStats.counts) { // Pre-calculated unique declarant stats from backend
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
          : declared;
        const percent = employeeTotalsByDepartment
          ? (totalForDept > 0 ? ((declared / totalForDept) * 100).toFixed(1) : "0.0")
          : (totalUnique > 0 ? ((declared / totalUnique) * 100).toFixed(1) : "0.0");
        return { department: canon, declared, total: totalForDept, percent };
      });
      if (showUnknown && backendStats.unknown > 0) {
        const unknownDeclared = backendStats.unknown;
        const totalForUnknown = employeeTotalsByDepartment
          ? employeeTotalsByDepartment["Unknown / Other"] ?? null
          : unknownDeclared;
        const percent = employeeTotalsByDepartment
          ? (totalForUnknown > 0 ? ((unknownDeclared / totalForUnknown) * 100).toFixed(1) : "0.0")
          : (totalUnique > 0 ? ((unknownDeclared / totalUnique) * 100).toFixed(1) : "0.0");
        rows.push({
          department: "Unknown / Other",
          declared: unknownDeclared,
          total: totalForUnknown,
          percent,
        });
      }
      // Raw declaration counts (non-dedup) if declarations supplied
      let rawRows = [];
      if (declarations && declarations.length) {
        const canonicalIndexLocal = new Map();
        CANONICAL_DEPARTMENTS.forEach(c => canonicalIndexLocal.set(normalizeDepartment(c), c));
        const rawCounts = new Map();
        let rawUnknown = 0;
        for (const d of declarations) {
          const canon = mapToCanonical(d.department, canonicalIndexLocal);
          if (canon) rawCounts.set(canon, (rawCounts.get(canon) || 0) + 1);
          else rawUnknown += 1;
        }
        rawRows = CANONICAL_DEPARTMENTS.map(c => ({
          department: c,
          declared: rawCounts.get(c) || 0,
          total: rawCounts.get(c) || 0,
          percent: "0.0", // computed below after total
        }));
        if (showUnknown && rawUnknown > 0) {
          rawRows.push({ department: "Unknown / Other", declared: rawUnknown, total: rawUnknown, percent: "0.0" });
        }
        const rawTotal = rawRows.reduce((a, r) => a + r.declared, 0);
        rawRows = rawRows.map(r => ({ ...r, percent: rawTotal > 0 ? ((r.declared / rawTotal) * 100).toFixed(1) : "0.0" }));
      }
      return {
        rows,
        rawRows,
        overallTotalsSource: employeeTotalsByDepartment ? "department totals" : "backend (unique declarants)",
        hadUnknown: (backendStats.unknown || 0) > 0,
        backendUsed: true,
        employeeMap: new Map(),
        subDepartmentSummary: [],
      };
    }

    // --- Frontend Calculation Path (if no backendStats) ---

    // Build canonical index
    const canonicalIndex = new Map(); // normalized -> canonical string
    CANONICAL_DEPARTMENTS.forEach((c) =>
      canonicalIndex.set(normalizeDepartment(c), c)
    );

    // We want to count UNIQUE employees who have at least one declaration, not raw declaration rows.
    // If an employee has multiple declarations (e.g., First + Biennial), they should be counted once.
    // If their department changes, prefer the most recent (by submitted_at, declaration_date, or id).
    const employeeMap = new Map(); // key -> {deptCanonical|null, subDept:string|null, dateValue:number, isKnown:boolean}

    const userKey = (d) =>
      d.user_id ?? d.payroll_number ?? d.email ?? `decl-${d.id}`;

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
        if (dateVal > prev.dateValue || (dateVal === prev.dateValue && !prev.isKnown && canonical)) {
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
        : unknownCount;
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

    // Raw declaration counts (non-dedup) path (frontend only)
    const rawCounts = new Map();
    let rawUnknown = 0;
    for (const d of declarations) {
      const canon = mapToCanonical(d.department, canonicalIndex);
      if (canon) rawCounts.set(canon, (rawCounts.get(canon) || 0) + 1);
      else rawUnknown += 1;
    }
    let rawRows = CANONICAL_DEPARTMENTS.map(c => ({
      department: c,
      declared: rawCounts.get(c) || 0,
      total: rawCounts.get(c) || 0,
      percent: "0.0", // compute after total
    }));
    if (showUnknown && rawUnknown > 0) {
      rawRows.push({ department: "Unknown / Other", declared: rawUnknown, total: rawUnknown, percent: "0.0" });
    }
    const rawTotal = rawRows.reduce((a, r) => a + r.declared, 0);
    rawRows = rawRows.map(r => ({ ...r, percent: rawTotal > 0 ? ((r.declared / rawTotal) * 100).toFixed(1) : "0.0" }));

    return {
      rows,
      rawRows,
      overallTotalsSource: employeeTotalsByDepartment
        ? "department totals"
        : "unique declarants",
      hadUnknown: unknownCount > 0,
      employeeMap,
      subDepartmentSummary: [],
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
              {(mode === "unique" ? rows : rawRows).map((r) => (
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
                <td>{mode === "unique" ? (backendUsed ? rows.reduce((a, r) => a + r.declared, 0) : employeeMap.size) : rawRows.reduce((a, r) => a + r.declared, 0)}</td>
                <td>{mode === "unique"
                  ? (employeeTotalsByDepartment
                    ? Object.values(employeeTotalsByDepartment).reduce((a, v) => a + (typeof v === "number" ? v : 0), 0)
                    : rows.reduce((a, r) => a + r.declared, 0))
                  : rawRows.reduce((a, r) => a + r.declared, 0)}</td>
                <td>100.0</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-3 small">
          <div className="btn-group" role="group" aria-label="Mode select">
            <button type="button" className={`btn btn-sm ${mode === 'unique' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setMode('unique')}>Unique Declarants</button>
            <button type="button" className={`btn btn-sm ${mode === 'raw' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setMode('raw')}>Raw Declarations</button>
          </div>
          <div className="mt-2 text-muted">
            {mode === 'unique' ? 'Each person counted once (latest declaration). Differences vs DB raw counts often reflect repeat filings.' : 'Counts every declaration record (includes repeat filings).'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DepartmentOverview;
