import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
// Helpers trimmed (financial aggregation removed)
import DeclarationAuditModal from './DeclarationAuditModal';

function formatDateDMY(dateStr) {
  if (!dateStr) return '—';
  // Accept YYYY-MM-DD or ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y,m,d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  }
  if (dateStr.includes('T')) {
    const d = new Date(dateStr);
    if (!isNaN(d)) {
      return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    }
  }
  return dateStr;
}

/**
 * WealthDeclarationRegister
 * Displays register with required columns:
 * 1. National ID
 * 2. User’s Name
 * 3. Personal Number (Payroll)
 * 4. Department
 * 5. Designation
 * 6. Type of Declaration
 * 7. Date and Signature of User
 * 8. Date and Name of Admin (last status change)
 */
const WealthDeclarationRegister = ({ adminUser }) => {
  const [rawDeclarations, setRawDeclarations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(''); // first | biennial | final
  const [showOnlyFinal, setShowOnlyFinal] = useState(false);
  const [drillDeclarationId, setDrillDeclarationId] = useState(null);
  const [deptFilter, setDeptFilter] = useState('');

  const adminToken = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
  // role not needed for current column set

  useEffect(() => {
    const fetchData = async () => {
      if (!adminToken) return;
      setLoading(true);
      setError('');
      try {
  const res = await fetch('/api/admin/declarations', { headers: { 'Authorization': `Bearer ${adminToken}` }});
        if (!res.ok) throw new Error('Failed fetching declarations');
        const data = await res.json();
        const arr = Array.isArray(data?.data) ? data.data : [];
        setRawDeclarations(arr);
      } catch (e) {
        setError(e.message || 'Error loading register');
      } finally { setLoading(false); }
    };
    fetchData();
  }, [adminToken]);

  const declarations = useMemo(() => rawDeclarations, [rawDeclarations]);

  const departmentOptions = useMemo(() => {
    const set = new Set();
    for (const d of declarations) {
      if (d && d.department) set.add(d.department);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [declarations]);

  // Role and department helpers
  const isHRAdmin = useMemo(() => {
    const role = (adminUser?.role || adminUser?.admin_role || '').toLowerCase();
    return role.includes('hr');
  }, [adminUser]);
  const adminDept = useMemo(() => (adminUser?.department || adminUser?.department_name || ''), [adminUser]);

  // Lock department filter to admin's department for HR admins
  useEffect(() => {
    if (isHRAdmin && adminDept) {
      setDeptFilter(prev => (prev === adminDept ? prev : adminDept));
    }
  }, [isHRAdmin, adminDept]);

  const filtered = useMemo(() => {
    let list = declarations;
  if (showOnlyFinal) list = list.filter(d => (d.declaration_type || '').toLowerCase().startsWith('fin'));
  if (typeFilter) list = list.filter(d => (d.declaration_type || '').toLowerCase().startsWith(typeFilter));
    if (deptFilter) list = list.filter(d => (d.department || '') === deptFilter);
    if (search) {
      const term = search.toLowerCase();
      list = list.filter(d => (
        (d.payroll_number && String(d.payroll_number).toLowerCase().includes(term)) ||
        (d.first_name && d.first_name.toLowerCase().includes(term)) ||
        (d.surname && d.surname.toLowerCase().includes(term))
      ));
    }
    return list.sort((a,b) => (b.id||0) - (a.id||0));
  }, [declarations, showOnlyFinal, typeFilter, search, deptFilter]);

  const exportToExcel = () => {
    const rows = filtered.map(d => ({
      NationalID: d.national_id || '',
      UserName: `${d.first_name || ''} ${(d.other_names || '')} ${d.surname || ''}`.replace(/\s+/g,' ').trim(),
      PersonalNumber: d.payroll_number || '',
      Department: d.department || '',
      Designation: d.designation || '',
      DeclarationType: d.declaration_type || '',
      DateOfSubmission: formatDateDMY(d.submitted_at || d.declaration_date),
      UserSignature: d.signature_path ? 'Signed' : 'Not Signed',
      AdminActionDate: d.approved_at ? formatDateDMY(d.approved_at) : '',
      AdminName: d.approved_admin_name || ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Register');
    XLSX.writeFile(wb, 'wealth_declaration_register.xlsx');
  };
  // No totals row needed for the specified register columns

  const loadImageDataURL = async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const exportToPDF = async () => {
    // Determine effective department for export
    const effectiveDept = isHRAdmin && adminDept ? adminDept : (deptFilter || '');
    const dataSource = effectiveDept ? filtered.filter(d => (d.department || '') === effectiveDept) : filtered;

    // Prepare data rows including Department even if hidden in UI
    const rows = dataSource.map((d, idx) => ([
      idx + 1,
      d.national_id || '',
      `${d.first_name || ''} ${(d.other_names || '')} ${d.surname || ''}`.replace(/\s+/g,' ').trim(),
      d.payroll_number || '',
      d.department || '',
      d.designation || '',
      d.declaration_type || '',
      formatDateDMY(d.submitted_at || d.declaration_date),
      d.signature_path ? 'Signed' : 'Not Signed',
      d.approved_at ? formatDateDMY(d.approved_at) : '',
      d.approved_admin_name || ''
    ]));

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

    // Header to roughly mirror attached template (title centered)
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 40;
    // Try to draw optional logos if placed in public/logos
    const [leftLogo, rightLogo] = await Promise.all([
      loadImageDataURL('/logos/left.png'),
      loadImageDataURL('/logos/right.png')
    ]);
    const logoW = 80, logoH = 60, logoY = 20;
    if (leftLogo) {
      try { doc.addImage(leftLogo, 'PNG', marginX, logoY, logoW, logoH); } catch {}
    }
    if (rightLogo) {
      try { doc.addImage(rightLogo, 'PNG', pageWidth - marginX - logoW, logoY, logoW, logoH); } catch {}
    }
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.text('MOMBASA COUNTY PUBLIC SERVICE BOARD', pageWidth / 2, 50, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text('REGISTER OF ISSUANCE AND RECEIPT OF THE WEALTH DECLARATION FORMS.', pageWidth / 2, 70, { align: 'center' });
  // Department filter line
  const deptLine = `Department: ${effectiveDept || 'All'}`;
  doc.setFontSize(11);
  doc.text(deptLine, pageWidth / 2, 88, { align: 'center' });

    // Table columns (includes Department)
    const head = [[
      '#',
      'National ID',
      "User's Name",
      'Personal No.',
      'Department',
      'Designation',
      'Declaration Type',
      'Date of Submission',
      'User Signature',
      'Admin Date',
      'Admin Name'
    ]];

    doc.autoTable({
      head,
      body: rows,
  startY: 108,
      styles: { fontSize: 9, cellPadding: 4, valign: 'middle' },
      headStyles: { fillColor: [240,240,240], textColor: 20, halign: 'center' },
      bodyStyles: { halign: 'left' },
      columnStyles: {
        0: { halign: 'center', cellWidth: 30 },
        1: { cellWidth: 90 },
        2: { cellWidth: 170 },
        3: { cellWidth: 90 },
        4: { cellWidth: 120 },
        5: { cellWidth: 120 },
        6: { cellWidth: 110 },
        7: { cellWidth: 110 },
        8: { cellWidth: 90 },
        9: { cellWidth: 100 },
        10: { cellWidth: 120 }
      },
      margin: { left: marginX, right: marginX }
    });

    // Footer with generation timestamp
    const generated = `Generated: ${new Date().toLocaleString()}`;
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      const y = doc.internal.pageSize.getHeight() - 20;
      doc.setFontSize(9);
      doc.text(generated, marginX, y);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - marginX, y, { align: 'right' });
    }

    doc.save('wealth_declaration_register.pdf');
  };

  return (
    <>
    <div className="card shadow-sm">
      <div className="card-header bg-secondary text-white d-flex flex-wrap align-items-center justify-content-between gap-2">
  <h5 className="mb-0"><i className="bi bi-journal-text me-2"/>Wealth Declaration Register</h5>
        <div className="d-flex flex-wrap align-items-center gap-2">
          <input
            className="form-control form-control-sm"
            style={{ minWidth: 180 }}
            placeholder="Search payroll / name"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="form-select form-select-sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">Any Type</option>
            <option value="fir">First</option>
            <option value="bien">Biennial</option>
            <option value="fin">Final</option>
          </select>
          {isHRAdmin ? (
            <span className="badge bg-info text-dark" title="Your department">
              Department: {adminDept || '—'}
            </span>
          ) : (
            <select
              className="form-select form-select-sm"
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
            >
              {/* Ensure the current value is present even if not in options */}
              {deptFilter && !departmentOptions.includes(deptFilter) && (
                <option value={deptFilter}>{deptFilter}</option>
              )}
              <option value="">All Departments</option>
              {departmentOptions.map(dep => (
                <option key={dep} value={dep}>{dep}</option>
              ))}
            </select>
          )}
          <div className="form-check form-switch m-0">
            <input className="form-check-input" type="checkbox" id="finalOnlySwitch" checked={showOnlyFinal} onChange={e => setShowOnlyFinal(e.target.checked)} />
            <label className="form-check-label small" htmlFor="finalOnlySwitch">Final Only</label>
          </div>
          <button className="btn btn-sm btn-outline-light" onClick={exportToExcel} disabled={filtered.length === 0}>
            <i className="bi bi-file-earmark-excel me-1"/>Excel
          </button>
          <button className="btn btn-sm btn-outline-light" onClick={exportToPDF} disabled={filtered.length === 0}>
            <i className="bi bi-filetype-pdf me-1"/>PDF
          </button>
        </div>
      </div>
      <div className="card-body p-0">
        {loading && <div className="p-4 text-center">Loading register...</div>}
        {error && <div className="alert alert-danger m-3 mb-0">{error}</div>}
        {!loading && !error && (
          <div className="table-responsive" style={{ maxHeight: '70vh' }}>
            <table className="table table-sm table-striped table-hover align-middle mb-0">
              <thead className="table-light sticky-top" style={{ top: 0 }}>
                <tr>
                  <th>#</th>
                  <th>National ID</th>
                  <th>User's Name</th>
                  <th>Personal No.</th>
                  <th>Designation</th>
                  <th>Declaration Type</th>
                  <th>Date of Submission</th>
                  <th>User Signature</th>
                  <th>Admin Date</th>
                  <th>Admin Name</th>
                  <th>Audit</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={11} className="text-center py-4 text-muted">No declarations match filters.</td></tr>
                )}
                {filtered.map((d, idx) => (
                  <tr key={d.id || idx}>
                    <td>{idx + 1}</td>
                    <td>{d.national_id || '—'}</td>
                    <td>{`${d.first_name || ''} ${(d.other_names || '')} ${d.surname || ''}`.replace(/\s+/g,' ').trim()}</td>
                    <td><span className="badge bg-secondary">{d.payroll_number}</span></td>
                    <td>{d.designation || '—'}</td>
                    <td>{d.declaration_type || '—'}</td>
                    <td>{formatDateDMY(d.submitted_at || d.declaration_date)}</td>
                    <td>
                      {d.signature_path
                        ? <span className="badge bg-success">Signed</span>
                        : <span className="badge bg-danger">Not Signed</span>}
                    </td>
                    <td>{d.approved_at ? formatDateDMY(d.approved_at) : '—'}</td>
                    <td>{d.approved_admin_name || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        title="View Audit Trail"
                        onClick={() => {
                          const url = new URL(window.location.href);
                          url.searchParams.set('declarationId', d.id);
                          window.history.replaceState({}, '', url.toString());
                          setDrillDeclarationId(d.id);
                        }}
                      >
                        <i className="bi bi-eye" />View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* No financial totals footer required */}
            </table>
          </div>
        )}
        <div className="p-2 small text-muted border-top">Register view generated on {new Date().toLocaleString()}.</div>
      </div>
    </div>
    {drillDeclarationId && (
      <DeclarationAuditModal
        adminToken={adminToken}
        declarationId={drillDeclarationId}
        onClose={() => {
          const url = new URL(window.location.href);
          url.searchParams.delete('declarationId');
          window.history.replaceState({}, '', url.toString());
          setDrillDeclarationId(null);
        }}
      />
    )}
    </>
  );
};

export default WealthDeclarationRegister;
