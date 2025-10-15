import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

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
  if (typeof field === 'string') {
    try {
      const arr = JSON.parse(field);
      if (Array.isArray(arr)) {
        return arr.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
      }
      const num = parseFloat(field);
      return isNaN(num) ? 0 : num;
    } catch {
      const num = parseFloat(field);
      return isNaN(num) ? 0 : num;
    }
  }
  if (typeof field === 'number') {
    return field;
  }
  return 0;
};

function formatDateToDMY(dateStr) {
  if (!dateStr || dateStr === '0000-00-00') return 'N/A';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    return dateStr;
  }
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

const FamilyFinancials = ({ declarations }) => {
  // We now rely on backend already attaching spouses and children.
  const [error] = useState('');

  // (Removed renderIncomeCell helper – inlined logic handled during transformation to entries.)
  // Build normalized data entries for pagination & export
  const entries = useMemo(() => {
    // Only include Spouse and Child rows (Declarant removed per latest requirement)
    if (!declarations || declarations.length === 0) return [];
    const out = [];
    declarations.forEach(declaration => {
      if (Array.isArray(declaration.spouses)) {
        declaration.spouses.forEach((spouse, idx) => {
          const incomeField = spouse?.biennial_income || spouse?.annual_income;
          const parsedIncome = parseFinancialField(incomeField);
          const incomeDetails = parsedIncome.length > 0
            ? parsedIncome.map(item => `${item.description || item.type}: ${item.value}`).join(' | ')
            : (incomeField || '');
          const incomeSum = parsedIncome.length > 0
            ? parsedIncome.reduce((s, it) => s + (parseFloat(it.value) || 0), 0)
            : (parseFloat(incomeField) || 0);
          out.push({
            payroll_number: declaration.payroll_number,
            declaration_date: formatDateToDMY(declaration.declaration_date),
            declaration_id: declaration.id,
            type: 'Spouse',
            name: spouse.full_name || `${spouse.first_name || ''} ${spouse.other_names || ''} ${spouse.surname || ''}`.trim(),
            income_details: incomeDetails,
            income_sum: incomeSum,
            assets_sum: spouse.assets ? sumFinancialField(spouse.assets) : 0,
            liabilities_sum: spouse.liabilities ? sumFinancialField(spouse.liabilities) : 0,
            other_info: spouse.other_financial_info || '',
            entity_index: idx,
            entity_type: 'spouse'
          });
        });
      }
      if (Array.isArray(declaration.children)) {
        declaration.children.forEach((child, idx) => {
          const incomeField = child?.biennial_income || child?.annual_income;
          const parsedIncome = parseFinancialField(incomeField);
          const incomeDetails = parsedIncome.length > 0
            ? parsedIncome.map(item => `${item.description || item.type}: ${item.value}`).join(' | ')
            : (incomeField || '');
          const incomeSum = parsedIncome.length > 0
            ? parsedIncome.reduce((s, it) => s + (parseFloat(it.value) || 0), 0)
            : (parseFloat(incomeField) || 0);
          out.push({
            payroll_number: declaration.payroll_number,
            declaration_date: formatDateToDMY(declaration.declaration_date),
            declaration_id: declaration.id,
            type: 'Child',
            name: child.full_name || `${child.first_name || ''} ${child.other_names || ''} ${child.surname || ''}`.trim(),
            income_details: incomeDetails,
            income_sum: incomeSum,
            assets_sum: child.assets ? sumFinancialField(child.assets) : 0,
            liabilities_sum: child.liabilities ? sumFinancialField(child.liabilities) : 0,
            other_info: child.other_financial_info || '',
            entity_index: idx,
            entity_type: 'child'
          });
        });
      }
    });
    return out;
  }, [declarations]);

  // Filters & Search & Sorting
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // all | Spouse | Child
  const [sortBy, setSortBy] = useState('payroll_number');
  const [sortDir, setSortDir] = useState('asc');

  const normalizedSearch = search.trim().toLowerCase();
  const filteredEntries = useMemo(() => {
    let list = entries;
    if (typeFilter !== 'all') {
      list = list.filter(e => e.type === typeFilter);
    }
    if (normalizedSearch) {
      list = list.filter(e =>
        (e.name && e.name.toLowerCase().includes(normalizedSearch)) ||
        (e.payroll_number && e.payroll_number.toLowerCase().includes(normalizedSearch))
      );
    }
    // Sort
    const compare = (a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      let av = a[sortBy];
      let bv = b[sortBy];
      if (av === undefined || av === null) av = '';
      if (bv === undefined || bv === null) bv = '';
      if (typeof av === 'number' && typeof bv === 'number') return av === bv ? 0 : av < bv ? -1 * dir : 1 * dir;
      // fallback string compare
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
      if (av === bv) return 0;
      return av < bv ? -1 * dir : 1 * dir;
    };
    return [...list].sort(compare);
  }, [entries, typeFilter, normalizedSearch, sortBy, sortDir]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortDir('asc');
    }
  };

  const sortIndicator = (column) => {
    if (sortBy !== column) return null;
    return <span className="ms-1">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));

  useEffect(() => { setCurrentPage(1); }, [pageSize, entries.length]);

  const pagedEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEntries.slice(start, start + pageSize);
  }, [filteredEntries, currentPage, pageSize]);

  // Export CSV (filtered subset)
  const handleExportCSV = () => {
    if (filteredEntries.length === 0) return;
    const header = ['Payroll Number','Type','Name','Declaration Date','Income Details','Income Sum','Assets Sum','Liabilities Sum','Other Info'];
    const lines = [header.join(',')];
    filteredEntries.forEach(e => {
      const row = [
        e.payroll_number,
        e.type,
        (e.name || '').replace(/,/g,';'),
        e.declaration_date,
        (e.income_details || '').replace(/,/g,';'),
        e.income_sum,
        e.assets_sum,
        e.liabilities_sum,
        (e.other_info || '').replace(/,/g,';')
      ];
      lines.push(row.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'family_financials_filtered.csv';
    link.click();
  };

  // Export Excel (filtered subset)
  const handleExportExcel = () => {
    if (filteredEntries.length === 0) return;
    const data = filteredEntries.map(e => ({
      Payroll_Number: e.payroll_number,
      Type: e.type,
      Name: e.name,
      Declaration_Date: e.declaration_date,
      Income_Details: e.income_details,
      Income_Sum: e.income_sum,
      Assets_Sum: e.assets_sum,
      Liabilities_Sum: e.liabilities_sum,
      Other_Info: e.other_info
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Filtered');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), 'family_financials_filtered.xlsx');
  };

  // Derived rows for render
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsEntity, setDetailsEntity] = useState(null); // {entry, fullEntity, declaration}

  const resolveFullEntity = (entry) => {
    if (!entry) return null;
    const decl = (declarations || []).find(d => d.id === entry.declaration_id);
    if (!decl) return null;
    if (entry.entity_type === 'spouse' && Array.isArray(decl.spouses)) return { declaration: decl, entity: decl.spouses[entry.entity_index], type: 'Spouse' };
    if (entry.entity_type === 'child' && Array.isArray(decl.children)) return { declaration: decl, entity: decl.children[entry.entity_index], type: 'Child' };
    return null;
  };

  const handleViewDetails = (entry) => {
    const resolved = resolveFullEntity(entry);
    if (resolved) {
      setDetailsEntity({ ...resolved, entry });
      setDetailsOpen(true);
    }
  };
  const closeDetails = () => { setDetailsOpen(false); setDetailsEntity(null); };

  const rows = pagedEntries.map((e, idx) => (
    <tr key={`${e.type}-${e.payroll_number}-${idx}`}>
      <td>{e.payroll_number}</td>
      <td>{e.type}</td>
      <td>{e.name}</td>
      <td>{e.declaration_date}</td>
      <td>
        {(() => {
          if (!e.income_details && !e.income_sum) return 'N/A';
          if (e.income_details && e.income_details.includes('|')) {
            return e.income_details.split(' | ').map((seg, i) => <span key={i}>{seg}<br /></span>);
          }
          if (e.income_details) return e.income_details;
          return <span><strong>Amount:</strong> Ksh {e.income_sum.toLocaleString()}</span>;
        })()}
      </td>
      <td>{e.assets_sum ? e.assets_sum.toLocaleString() : '0'}</td>
      <td>{e.liabilities_sum ? e.liabilities_sum.toLocaleString() : '0'}</td>
      <td>{e.other_info || 'N/A'}</td>
      <td>
        <button className="btn btn-sm btn-outline-primary" onClick={() => handleViewDetails(e)}>
          <i className="bi bi-eye me-1"></i>View
        </button>
      </td>
    </tr>
  ));

  return (
    <div className="card shadow-sm">
      <div className="card-header bg-info text-white d-flex flex-wrap gap-2 justify-content-between align-items-center">
        <div className="d-flex align-items-center">
          <h3 className="card-title mb-0">
            <i className="bi bi-people me-2"></i>
            Family Financial Details
          </h3>
          <span className="badge bg-light text-dark ms-3">{filteredEntries.length} / {entries.length} entries</span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <div className="input-group input-group-sm me-2" style={{ width: 220 }}>
            <span className="input-group-text"><i className="bi bi-search"></i></span>
            <input
              type="text"
              className="form-control"
              placeholder="Search name or payroll"
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <div className="input-group input-group-sm me-2" style={{ width: 'auto' }}>
            <span className="input-group-text">Type</span>
            <select className="form-select" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1); }}>
              <option value="all">All</option>
              <option value="Spouse">Spouse</option>
              <option value="Child">Child</option>
            </select>
          </div>
          <div className="input-group input-group-sm me-2" style={{ width: 'auto' }}>
            <span className="input-group-text">Page Size</span>
            <select className="form-select" value={pageSize} onChange={e => setPageSize(parseInt(e.target.value) || 25)}>
              {[10,25,50,100].map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
          <button className="btn btn-sm btn-light" onClick={handleExportCSV} disabled={entries.length === 0} title="Export CSV">
            <i className="bi bi-filetype-csv me-1"></i>CSV
          </button>
          <button className="btn btn-sm btn-light" onClick={handleExportExcel} disabled={entries.length === 0} title="Export Excel">
            <i className="bi bi-file-earmark-excel me-1"></i>Excel
          </button>
        </div>
      </div>
      <div className="card-body">
        {error && <div className="alert alert-danger py-2 mb-3">{error}</div>}
        {rows.length === 0 && !error && (
          <div className="text-center text-muted py-4">
            <i className="bi bi-inbox display-6 d-block mb-2"></i>
            No family financial entries found.
          </div>
        )}
        {rows.length > 0 && (
          <div className="table-responsive">
            <table className="table table-striped table-hover">
              <thead className="table-dark">
                <tr>
                  <th scope="col" style={{cursor:'pointer'}} onClick={() => handleSort('payroll_number')}>Payroll Number {sortIndicator('payroll_number')}</th>
                  <th scope="col" style={{cursor:'pointer'}} onClick={() => handleSort('type')}>Type {sortIndicator('type')}</th>
                  <th scope="col" style={{cursor:'pointer'}} onClick={() => handleSort('name')}>Name {sortIndicator('name')}</th>
                  <th scope="col" style={{cursor:'pointer'}} onClick={() => handleSort('declaration_date')}>Declaration Date {sortIndicator('declaration_date')}</th>
                  <th scope="col" style={{cursor:'pointer'}} onClick={() => handleSort('income_sum')}>Biennial / Annual Income {sortIndicator('income_sum')}</th>
                  <th scope="col" style={{cursor:'pointer'}} onClick={() => handleSort('assets_sum')}>Assets (Sum) {sortIndicator('assets_sum')}</th>
                  <th scope="col" style={{cursor:'pointer'}} onClick={() => handleSort('liabilities_sum')}>Liabilities (Sum) {sortIndicator('liabilities_sum')}</th>
                  <th scope="col">Other Info</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>{rows}</tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <div className="d-flex flex-wrap justify-content-between align-items-center mt-3">
            <div className="text-muted small mb-2">
              Showing {(currentPage - 1) * pageSize + (filteredEntries.length ? 1 : 0)}-{Math.min(currentPage * pageSize, filteredEntries.length)} of {filteredEntries.length}
            </div>
            <div className="btn-group mb-2">
              <button className="btn btn-sm btn-outline-light" disabled={currentPage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>&laquo; Prev</button>
              <button className="btn btn-sm btn-outline-light disabled">Page {currentPage} / {totalPages}</button>
              <button className="btn btn-sm btn-outline-light" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Next &raquo;</button>
            </div>
          </div>
        )}
      </div>
      {detailsOpen && detailsEntity && (
        <div className="modal fade show" style={{ display: 'block', background: 'rgba(0,0,0,0.35)' }} tabIndex="-1" role="dialog">
          <div className="modal-dialog modal-lg modal-dialog-scrollable" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{detailsEntity.type} Financial Details</h5>
                <button type="button" className="btn-close" onClick={closeDetails}></button>
              </div>
              <div className="modal-body">
                {(() => {
                  const { entity, declaration, type } = detailsEntity;
                  if (!entity) return <div className="text-muted">No data available.</div>;
                  const incomeField = entity.biennial_income || entity.annual_income;
                  const parsedIncome = parseFinancialField(incomeField);
                  const assetsList = parseFinancialField(entity.assets);
                  const liabilitiesList = parseFinancialField(entity.liabilities);
                  return (
                    <div>
                      <div className="mb-3">
                        <strong>Type:</strong> {type} <br />
                        <strong>Name:</strong> {entity.full_name || `${entity.first_name || ''} ${entity.other_names || ''} ${entity.surname || ''}`.trim()}<br />
                        <strong>Payroll Number (Declarant):</strong> {declaration.payroll_number}<br />
                        <strong>Declaration Date:</strong> {formatDateToDMY(declaration.declaration_date)}
                      </div>
                      <hr />
                      <h6>Income</h6>
                      {parsedIncome.length > 0 ? (
                        <ul className="list-unstyled small">
                          {parsedIncome.map((item, i) => {
                            const amount = parseFloat(item.value || 0);
                            return (
                              <li key={i} className="mb-1">
                                • <strong>Type:</strong> {item.type || 'N/A'}
                                {item.description && item.description.trim() !== '' && (
                                  <><strong className="ms-2">Desc:</strong> {item.description}</>
                                )}
                                <strong className="ms-2">Amount:</strong> Ksh {isNaN(amount) ? '0' : amount.toLocaleString()}
                              </li>
                            );
                          })}
                        </ul>
                      ) : incomeField ? (
                        <p>
                          <strong>Type:</strong> {(() => { try { const arr = JSON.parse(incomeField); return Array.isArray(arr) && arr[0]?.type ? arr[0].type : 'N/A'; } catch { return 'N/A'; } })()} {' '}
                          <strong className="ms-2">Amount:</strong> Ksh {parseFloat(incomeField).toLocaleString()}
                        </p>
                      ) : (
                        <p className="text-muted">No income data.</p>
                      )}
                      <h6 className="mt-4">Assets</h6>
                      {assetsList.length > 0 ? (
                        <ul className="list-unstyled small">
                          {assetsList.map((it, i) => {
                            const val = parseFloat(it.value || 0);
                            return (
                              <li key={i} className="mb-1">
                                • <strong>Type:</strong> {it.type || 'N/A'}
                                {it.description && it.description.trim() !== '' && (
                                  <><strong className="ms-2">Desc:</strong> {it.description}</>
                                )}
                                {it.asset_other_type && it.asset_other_type.trim() !== '' && (
                                  <><strong className="ms-2">Other:</strong> {it.asset_other_type}</>
                                )}
                                <strong className="ms-2">Value:</strong> Ksh {isNaN(val) ? '0' : val.toLocaleString()}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (<p className="text-muted">No assets listed.</p>)}
                      <h6 className="mt-4">Liabilities</h6>
                      {liabilitiesList.length > 0 ? (
                        <ul className="list-unstyled small">
                          {liabilitiesList.map((it, i) => {
                            const val = parseFloat(it.value || 0);
                            return (
                              <li key={i} className="mb-1">
                                • <strong>Type:</strong> {it.type || 'N/A'}
                                {it.description && it.description.trim() !== '' && (
                                  <><strong className="ms-2">Desc:</strong> {it.description}</>
                                )}
                                {it.liability_other_description && it.liability_other_description.trim() !== '' && (
                                  <><strong className="ms-2">Other:</strong> {it.liability_other_description}</>
                                )}
                                <strong className="ms-2">Value:</strong> Ksh {isNaN(val) ? '0' : val.toLocaleString()}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (<p className="text-muted">No liabilities listed.</p>)}
                      <h6 className="mt-4">Other Info</h6>
                      <p>{entity.other_financial_info || 'None'}</p>
                    </div>
                  );
                })()}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeDetails}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FamilyFinancials;
