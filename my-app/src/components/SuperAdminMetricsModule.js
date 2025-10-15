import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Pie, Bar } from 'react-chartjs-2';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';

try { ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title); } catch { /* ignore */ }

const PAGE_SIZE_OPTIONS = [10,20,50,100];
const COUNTDOWN_INTERVAL_MS = 30000;
const CACHE_KEY = 'super_admin_metrics_cache_v1';
const CACHE_TTL_MS = 5 * 60 * 1000;

const ConfirmToast = ({ message, onConfirm, onCancel }) => (
  <div style={{minWidth:230}}>
    <div className="fw-semibold mb-2">{message}</div>
    <div className="d-flex gap-2 justify-content-end">
      <button className="btn btn-sm btn-outline-secondary" onClick={onCancel}>Cancel</button>
      <button className="btn btn-sm btn-danger" onClick={onConfirm}>Confirm</button>
    </div>
  </div>
);

const SuperAdminMetricsModule = ({ adminUser, declarations = [], avgIncome = 0, avgNetWorth = 0 }) => {
  const isSuper = !!(adminUser && ((adminUser.role === 'super' || adminUser.role === 'super_admin') || adminUser.normalizedRole === 'super'));
  const adminToken = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;

  const [metrics, setMetrics] = useState(null);
  const [metricsError, setMetricsError] = useState('');
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [forceReloadTick, setForceReloadTick] = useState(0);

  const [showAllAssets, setShowAllAssets] = useState(false);
  const [showAllLiabilities, setShowAllLiabilities] = useState(false);
  const [showAllIncome, setShowAllIncome] = useState(false);
  const [rootFilter, setRootFilter] = useState('');
  const [spouseFilter, setSpouseFilter] = useState('');
  const [childFilter, setChildFilter] = useState('');
  const [showAllSpouseAssets, setShowAllSpouseAssets] = useState(false);
  const [showAllSpouseLiabilities, setShowAllSpouseLiabilities] = useState(false);
  const [showAllSpouseIncome, setShowAllSpouseIncome] = useState(false);
  const [showAllChildAssets, setShowAllChildAssets] = useState(false);
  const [showAllChildLiabilities, setShowAllChildLiabilities] = useState(false);
  const [showAllChildIncome, setShowAllChildIncome] = useState(false);

  const [lockedUsers, setLockedUsers] = useState([]);
  const [lockedLoading, setLockedLoading] = useState(false);
  const [lockError, setLockError] = useState('');
  const [lockedSearchNationalId, setLockedSearchNationalId] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());

  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPageSize, setAuditPageSize] = useState(20);
  const [auditFilters, setAuditFilters] = useState({ userId: '', nationalId: '', eventType: '', from: '', to: '' });

  const coveragePercent = useMemo(() => {
    if (!metrics) return null;
    const usersTotal = metrics.users.total || 0;
    const withAny = metrics.declarations.usersWithDeclaration || 0;
    return usersTotal ? Math.round((withAny / usersTotal) * 100) : 0;
  }, [metrics]);

  const fetchMetrics = useCallback(async (force=false) => {
    if (!isSuper || !adminToken) return;
    try {
      setMetricsError(''); setMetricsLoading(true);
      if (!force) {
        const cachedRaw = localStorage.getItem(CACHE_KEY);
        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw);
            if (cached.fetchedAt && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
              setMetrics(cached.data); setLastUpdated(new Date(cached.fetchedAt)); setMetricsLoading(false); return;
            }
          } catch {/* ignore */}
        }
      }
      const res = await fetch('/api/admin/super/metrics', { headers: { Authorization: `Bearer ${adminToken}` }});
      if (!res.ok) throw new Error(`Failed (${res.status}) retrieving metrics`);
      const data = await res.json();
      setMetrics(data.data); setLastUpdated(new Date());
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: data.data, fetchedAt: Date.now() })); } catch {/* ignore */}
    } catch(e){ setMetricsError(e.message); } finally { setMetricsLoading(false); }
  }, [isSuper, adminToken]);

  const fetchLocked = useCallback(async () => {
    if (!isSuper || !adminToken) return;
    try {
      setLockError(''); setLockedLoading(true);
      const url = new URL('/api/admin/users/locked', window.location.origin);
      if (lockedSearchNationalId.trim()) url.searchParams.set('nationalId', lockedSearchNationalId.trim());
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${adminToken}` }});
      if (!res.ok) throw new Error('Failed to load locked users');
      const data = await res.json(); setLockedUsers(data.data || []);
    } catch(e){ setLockError(e.message);} finally { setLockedLoading(false); }
  }, [isSuper, adminToken, lockedSearchNationalId]);

  const performClearLockout = async (userId) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/clear-lockout`, { method:'POST', headers:{ Authorization: `Bearer ${adminToken}` }});
      if (!res.ok) { const d = await res.json().catch(()=>({})); throw new Error(d.message||'Failed to clear'); }
      toast.success('Lockout cleared');
      await fetchLocked();
      await fetchAudit(true);
    } catch(e){ toast.error(e.message); }
  };

  const confirmClearLockout = (userId) => {
    const id = toast.info(<ConfirmToast message="Clear lockout for this user?" onConfirm={()=>{ toast.dismiss(id); performClearLockout(userId); }} onCancel={()=>toast.dismiss(id)} />, { autoClose:false, closeOnClick:false, draggable:false });
  };

  const fetchAudit = useCallback(async (resetPage=false) => {
    if (resetPage) setAuditPage(1);
    const page = resetPage ? 1 : auditPage;
    try {
      setAuditError(''); setAuditLoading(true);
      const params = new URLSearchParams();
      params.set('page', page); params.set('pageSize', auditPageSize);
      Object.entries(auditFilters).forEach(([k,v])=>{ if(v) params.set(k,v); });
      const res = await fetch(`/api/admin/lockouts/audit?${params.toString()}`, { headers: { Authorization: `Bearer ${adminToken}` }});
      if (!res.ok) throw new Error('Failed to load audit');
      const data = await res.json(); setAuditRows(data.data||[]); setAuditTotal(data.total||0);
    } catch(e){ setAuditError(e.message);} finally { setAuditLoading(false); }
  }, [auditPage, auditPageSize, auditFilters, adminToken]);

  useEffect(()=>{ fetchMetrics(forceReloadTick>0); }, [fetchMetrics, forceReloadTick]);
  useEffect(()=>{ fetchLocked(); }, [fetchLocked]);
  useEffect(()=>{ fetchAudit(); }, [fetchAudit]);
  useEffect(()=>{ const t = setInterval(()=> setNowTick(Date.now()), COUNTDOWN_INTERVAL_MS); return ()=> clearInterval(t); }, []);

  const handleRefresh = () => setForceReloadTick(t=>t+1);

  const safeParseArray = val => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') { try { const p = JSON.parse(val); return Array.isArray(p)?p:[]; } catch { return []; } }
    return [];
  };

  const flattened = useMemo(() => {
    const assets=[]; const liabilities=[]; const income=[];
    const spouseAssets=[]; const spouseLiabilities=[]; const spouseIncome=[];
    const childAssets=[]; const childLiabilities=[]; const childIncome=[];
    (declarations||[]).forEach(d => {
      safeParseArray(d.assets).forEach(a=>assets.push(a));
      safeParseArray(d.liabilities).forEach(l=>liabilities.push(l));
      safeParseArray(d.biennial_income || d.income).forEach(i=>income.push(i));
      (d.spouses||[]).forEach(s=>{
        safeParseArray(s.assets).forEach(a=>spouseAssets.push(a));
        safeParseArray(s.liabilities).forEach(l=>spouseLiabilities.push(l));
        safeParseArray(s.biennial_income).forEach(i=>spouseIncome.push(i));
      });
      (d.children||[]).forEach(c=>{
        safeParseArray(c.assets).forEach(a=>childAssets.push(a));
        safeParseArray(c.liabilities).forEach(l=>childLiabilities.push(l));
        safeParseArray(c.biennial_income).forEach(i=>childIncome.push(i));
      });
    });
    const norm = arr => arr.map(it=>({
      type: (it && (it.type || it.asset_other_type || it.liability_other_type || it.description || 'Unknown')).toString(),
      description: (it && (it.description || it.asset_other_type || it.liability_other_description || '')) || '',
      value: Number(it && it.value ? it.value : 0)
    })).filter(r=>r.type || r.description || r.value);
    return {
      assets: norm(assets).sort((a,b)=>b.value-a.value),
      liabilities: norm(liabilities).sort((a,b)=>b.value-a.value),
      income: norm(income).sort((a,b)=>b.value-a.value),
      spouse: {
        assets: norm(spouseAssets).sort((a,b)=>b.value-a.value),
        liabilities: norm(spouseLiabilities).sort((a,b)=>b.value-a.value),
        income: norm(spouseIncome).sort((a,b)=>b.value-a.value)
      },
      child: {
        assets: norm(childAssets).sort((a,b)=>b.value-a.value),
        liabilities: norm(childLiabilities).sort((a,b)=>b.value-a.value),
        income: norm(childIncome).sort((a,b)=>b.value-a.value)
      }
    };
  }, [declarations]);

  const limitedOrAll = (arr, showAll) => showAll ? arr : arr.slice(0,20);
  const applyFilter = (arr, filterText) => {
    if (!filterText) return arr;
    const f = filterText.toLowerCase();
    return arr.filter(r => (r.type && r.type.toLowerCase().includes(f)) || (r.description && r.description.toLowerCase().includes(f)));
  };

  const exportCsv = (filename, rows) => {
    const header = ['Type','Description','Value'];
    const csvLines = [header.join(',')].concat(rows.map(r=>[r.type||'', (r.description||'').replace(/[\n\r,]/g,' '), r.value].join(',')));
    const blob = new Blob([csvLines.join('\n')], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
  };

  const statusChart = useMemo(()=>{
    if(!metrics) return null; const labels = Object.keys(metrics.declarations.byStatus||{}); const values=Object.values(metrics.declarations.byStatus||{});
    return { labels, datasets:[{ data: values, backgroundColor:['#0d6efd','#198754','#ffc107','#dc3545','#6c757d','#20c997'] }] };
  },[metrics]);
  const typeChart = useMemo(()=>{
    if(!metrics) return null; const labels=Object.keys(metrics.declarations.byType||{}); const values=Object.values(metrics.declarations.byType||{});
    return { labels, datasets:[{ label:'Declarations', data: values, backgroundColor:'#36A2EB' }] };
  },[metrics]);

  if (!isSuper) return <div className="text-muted small">You do not have access to this module.</div>;

  const calcMinutesLeft = (lockUntil, staticMinutesRemaining) => {
    if (lockUntil) {
      const diffMs = new Date(lockUntil).getTime() - nowTick;
      return Math.max(0, Math.ceil(diffMs / 60000));
    }
    if (staticMinutesRemaining != null) return Math.max(0, staticMinutesRemaining);
    return '—';
  };

  return (
    <div className="card border-primary shadow-sm">
      <div className="card-header bg-primary text-white d-flex flex-wrap gap-2 justify-content-between align-items-center">
        <h4 className="mb-0"><i className="bi bi-shield-lock me-2"></i>Super Admin Insights</h4>
        <div className="d-flex gap-2 align-items-center">
          {lastUpdated && <span className="small text-light">Updated: {lastUpdated.toLocaleTimeString()}</span>}
          <button className="btn btn-sm btn-light" onClick={handleRefresh} disabled={metricsLoading}><i className="bi bi-arrow-clockwise me-1"></i>{metricsLoading?'Refreshing...':'Refresh'}</button>
        </div>
      </div>
      <div className="card-body">
        {metricsLoading && <div className="text-muted">Loading metrics...</div>}
        {metricsError && <div className="text-danger small">{metricsError}</div>}
        {metrics && (
          <>
            <div className="row g-3 mb-3">
              <div className="col-md-4">
                <div className="border rounded p-2 h-100 small">
                  <div className="fw-bold text-uppercase text-muted" style={{fontSize:11}}>Employees</div>
                  <div className="display-6" style={{fontSize:'1.6rem'}}>{metrics.users.total}</div>
                  <div className="text-muted">No Dept: {metrics.users.withoutDepartment}</div>
                  <div className="text-muted">No Nat ID: {metrics.users.withoutNationalId}</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="border rounded p-2 h-100 small">
                  <div className="fw-bold text-uppercase text-muted" style={{fontSize:11}}>Declarations</div>
                  <div className="display-6" style={{fontSize:'1.6rem'}}>{metrics.declarations.total}</div>
                  <div className="text-muted">Users With Any: {metrics.declarations.usersWithDeclaration}</div>
                  <div className="text-muted">Coverage: {coveragePercent}%</div>
                  <div className="progress mt-1" style={{height:5}}>
                    <div className="progress-bar bg-success" style={{width:`${coveragePercent}%`}}></div>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="border rounded p-2 h-100 small">
                  <div className="fw-bold text-uppercase text-muted" style={{fontSize:11}}>Departments</div>
                  <div className="display-6" style={{fontSize:'1.6rem'}}>{metrics.departments.totalDistinct}</div>
                  <div className="text-muted">Dept Coverage: {metrics.departments.coveragePercent}%</div>
                  <div className="progress mt-1" style={{height:5}}>
                    <div className="progress-bar bg-info" style={{width:`${metrics.departments.coveragePercent}%`}}></div>
                  </div>
                </div>
              </div>
            </div>

            <div className="row g-3 mb-4">
              <div className="col-md-6">
                <div className="card h-100">
                  <div className="card-header py-2"><h6 className="mb-0">Declarations by Status</h6></div>
                  <div className="card-body" style={{height:320}}>
                    {statusChart ? <Pie data={statusChart} options={{maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}}} /> : <div className="text-muted small">No data.</div>}
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div className="card h-100">
                  <div className="card-header py-2"><h6 className="mb-0">Declarations by Type</h6></div>
                  <div className="card-body" style={{height:320}}>
                    {typeChart ? <Bar data={typeChart} options={{maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}}}} /> : <div className="text-muted small">No data.</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* Root Financial */}
            <div className="row g-4 mb-4">
              <div className="col-12 d-flex flex-wrap gap-3 align-items-center mb-2">
                <h5 className="mb-0">Employee (Root) Financial Items</h5>
                <input className="form-control form-control-sm" style={{maxWidth:240}} placeholder="Filter type/description..." value={rootFilter} onChange={e=>setRootFilter(e.target.value)} />
                <div className="ms-auto d-flex gap-2">
                  <button className="btn btn-sm btn-outline-primary" onClick={()=>exportCsv('root_assets.csv', applyFilter(flattened.assets, rootFilter))}>Export Assets</button>
                  <button className="btn btn-sm btn-outline-primary" onClick={()=>exportCsv('root_liabilities.csv', applyFilter(flattened.liabilities, rootFilter))}>Export Liabilities</button>
                  <button className="btn btn-sm btn-outline-primary" onClick={()=>exportCsv('root_income.csv', applyFilter(flattened.income, rootFilter))}>Export Income</button>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="card h-100">
                  <div className="card-header py-2 d-flex justify-content-between align-items-center">
                    <h6 className="mb-0">Assets</h6>
                    {flattened.assets.length>20 && <button className="btn btn-sm btn-outline-secondary" onClick={()=>setShowAllAssets(s=>!s)}>{showAllAssets?'Show Top 20':'Show All'}</button>}
                  </div>
                  <div className="card-body p-0" style={{maxHeight:300,overflowY:'auto'}}>
                    <table className="table table-sm mb-0">
                      <thead className="table-light"><tr><th style={{width:'35%'}}>Type</th><th style={{width:'45%'}}>Description</th><th className="text-end" style={{width:'20%'}}>Value</th></tr></thead>
                      <tbody>
                        {limitedOrAll(applyFilter(flattened.assets, rootFilter), showAllAssets).map((r,i)=>(<tr key={i}><td>{r.type||'—'}</td><td>{r.description||'—'}</td><td className="text-end">{r.value.toLocaleString()}</td></tr>))}
                        {!applyFilter(flattened.assets, rootFilter).length && <tr><td colSpan={3} className="text-center text-muted">No assets</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="card h-100">
                  <div className="card-header py-2 d-flex justify-content-between align-items-center">
                    <h6 className="mb-0">Liabilities</h6>
                    {flattened.liabilities.length>20 && <button className="btn btn-sm btn-outline-secondary" onClick={()=>setShowAllLiabilities(s=>!s)}>{showAllLiabilities?'Show Top 20':'Show All'}</button>}
                  </div>
                  <div className="card-body p-0" style={{maxHeight:300,overflowY:'auto'}}>
                    <table className="table table-sm mb-0">
                      <thead className="table-light"><tr><th style={{width:'35%'}}>Type</th><th style={{width:'45%'}}>Description</th><th className="text-end" style={{width:'20%'}}>Value</th></tr></thead>
                      <tbody>
                        {limitedOrAll(applyFilter(flattened.liabilities, rootFilter), showAllLiabilities).map((r,i)=>(<tr key={i}><td>{r.type||'—'}</td><td>{r.description||'—'}</td><td className="text-end">{r.value.toLocaleString()}</td></tr>))}
                        {!applyFilter(flattened.liabilities, rootFilter).length && <tr><td colSpan={3} className="text-center text-muted">No liabilities</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="card h-100">
                  <div className="card-header py-2 d-flex justify-content-between align-items-center">
                    <h6 className="mb-0">Income</h6>
                    {flattened.income.length>20 && <button className="btn btn-sm btn-outline-secondary" onClick={()=>setShowAllIncome(s=>!s)}>{showAllIncome?'Show Top 20':'Show All'}</button>}
                  </div>
                  <div className="card-body p-0" style={{maxHeight:300,overflowY:'auto'}}>
                    <table className="table table-sm mb-0">
                      <thead className="table-light"><tr><th style={{width:'35%'}}>Type</th><th style={{width:'45%'}}>Description</th><th className="text-end" style={{width:'20%'}}>Value</th></tr></thead>
                      <tbody>
                        {limitedOrAll(applyFilter(flattened.income, rootFilter), showAllIncome).map((r,i)=>(<tr key={i}><td>{r.type||'—'}</td><td>{r.description||'—'}</td><td className="text-end">{r.value.toLocaleString()}</td></tr>))}
                        {!applyFilter(flattened.income, rootFilter).length && <tr><td colSpan={3} className="text-center text-muted">No income records</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Spouse */}
            <div className="row g-4 mb-4">
              <div className="col-12 d-flex flex-wrap gap-3 align-items-center mb-2">
                <h5 className="mb-0">Spouse Financial Items</h5>
                <input className="form-control form-control-sm" style={{maxWidth:240}} placeholder="Filter spouse items..." value={spouseFilter} onChange={e=>setSpouseFilter(e.target.value)} />
                <div className="ms-auto d-flex gap-2">
                  <button className="btn btn-sm btn-outline-primary" onClick={()=>exportCsv('spouse_assets.csv', applyFilter(flattened.spouse.assets, spouseFilter))}>Export Assets</button>
                  <button className="btn btn-sm btn-outline-primary" onClick={()=>exportCsv('spouse_liabilities.csv', applyFilter(flattened.spouse.liabilities, spouseFilter))}>Export Liabilities</button>
                  <button className="btn btn-sm btn-outline-primary" onClick={()=>exportCsv('spouse_income.csv', applyFilter(flattened.spouse.income, spouseFilter))}>Export Income</button>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="card h-100">
                  <div className="card-header py-2 d-flex justify-content-between align-items-center">
                    <h6 className="mb-0">Assets</h6>
                    {flattened.spouse.assets.length>20 && <button className="btn btn-sm btn-outline-secondary" onClick={()=>setShowAllSpouseAssets(s=>!s)}>{showAllSpouseAssets?'Show Top 20':'Show All'}</button>}
                  </div>
                  <div className="card-body p-0" style={{maxHeight:300,overflowY:'auto'}}>
                    <table className="table table-sm mb-0">
                      <thead className="table-light"><tr><th style={{width:'35%'}}>Type</th><th style={{width:'45%'}}>Description</th><th className="text-end" style={{width:'20%'}}>Value</th></tr></thead>
                      <tbody>
                        {limitedOrAll(applyFilter(flattened.spouse.assets, spouseFilter), showAllSpouseAssets).map((r,i)=>(<tr key={i}><td>{r.type||'—'}</td><td>{r.description||'—'}</td><td className="text-end">{r.value.toLocaleString()}</td></tr>))}
                        {!applyFilter(flattened.spouse.assets, spouseFilter).length && <tr><td colSpan={3} className="text-center text-muted">No spouse assets</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="card h-100">
                  <div className="card-header py-2 d-flex justify-content-between align-items-center">
                    <h6 className="mb-0">Liabilities</h6>
                    {flattened.spouse.liabilities.length>20 && <button className="btn btn-sm btn-outline-secondary" onClick={()=>setShowAllSpouseLiabilities(s=>!s)}>{showAllSpouseLiabilities?'Show Top 20':'Show All'}</button>}
                  </div>
                  <div className="card-body p-0" style={{maxHeight:300,overflowY:'auto'}}>
                    <table className="table table-sm mb-0">
                      <thead className="table-light"><tr><th style={{width:'35%'}}>Type</th><th style={{width:'45%'}}>Description</th><th className="text-end" style={{width:'20%'}}>Value</th></tr></thead>
                      <tbody>
                        {limitedOrAll(applyFilter(flattened.spouse.liabilities, spouseFilter), showAllSpouseLiabilities).map((r,i)=>(<tr key={i}><td>{r.type||'—'}</td><td>{r.description||'—'}</td><td className="text-end">{r.value.toLocaleString()}</td></tr>))}
                        {!applyFilter(flattened.spouse.liabilities, spouseFilter).length && <tr><td colSpan={3} className="text-center text-muted">No spouse liabilities</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="card h-100">
                  <div className="card-header py-2 d-flex justify-content-between align-items-center">
                    <h6 className="mb-0">Income</h6>
                    {flattened.spouse.income.length>20 && <button className="btn btn-sm btn-outline-secondary" onClick={()=>setShowAllSpouseIncome(s=>!s)}>{showAllSpouseIncome?'Show Top 20':'Show All'}</button>}
                  </div>
                  <div className="card-body p-0" style={{maxHeight:300,overflowY:'auto'}}>
                    <table className="table table-sm mb-0">
                      <thead className="table-light"><tr><th style={{width:'35%'}}>Type</th><th style={{width:'45%'}}>Description</th><th className="text-end" style={{width:'20%'}}>Value</th></tr></thead>
                      <tbody>
                        {limitedOrAll(applyFilter(flattened.spouse.income, spouseFilter), showAllSpouseIncome).map((r,i)=>(<tr key={i}><td>{r.type||'—'}</td><td>{r.description||'—'}</td><td className="text-end">{r.value.toLocaleString()}</td></tr>))}
                        {!applyFilter(flattened.spouse.income, spouseFilter).length && <tr><td colSpan={3} className="text-center text-muted">No spouse income</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* Child */}
            <div className="row g-4 mb-4">
              <div className="col-12 d-flex flex-wrap gap-3 align-items-center mb-2">
                <h5 className="mb-0">Child Financial Items</h5>
                <input className="form-control form-control-sm" style={{maxWidth:240}} placeholder="Filter child items..." value={childFilter} onChange={e=>setChildFilter(e.target.value)} />
                <div className="ms-auto d-flex gap-2">
                  <button className="btn btn-sm btn-outline-primary" onClick={()=>exportCsv('child_assets.csv', applyFilter(flattened.child.assets, childFilter))}>Export Assets</button>
                  <button className="btn btn-sm btn-outline-primary" onClick={()=>exportCsv('child_liabilities.csv', applyFilter(flattened.child.liabilities, childFilter))}>Export Liabilities</button>
                  <button className="btn btn-sm btn-outline-primary" onClick={()=>exportCsv('child_income.csv', applyFilter(flattened.child.income, childFilter))}>Export Income</button>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="card h-100">
                  <div className="card-header py-2 d-flex justify-content-between align-items-center">
                    <h6 className="mb-0">Assets</h6>
                    {flattened.child.assets.length>20 && <button className="btn btn-sm btn-outline-secondary" onClick={()=>setShowAllChildAssets(s=>!s)}>{showAllChildAssets?'Show Top 20':'Show All'}</button>}
                  </div>
                  <div className="card-body p-0" style={{maxHeight:300,overflowY:'auto'}}>
                    <table className="table table-sm mb-0">
                      <thead className="table-light"><tr><th style={{width:'35%'}}>Type</th><th style={{width:'45%'}}>Description</th><th className="text-end" style={{width:'20%'}}>Value</th></tr></thead>
                      <tbody>
                        {limitedOrAll(applyFilter(flattened.child.assets, childFilter), showAllChildAssets).map((r,i)=>(<tr key={i}><td>{r.type||'—'}</td><td>{r.description||'—'}</td><td className="text-end">{r.value.toLocaleString()}</td></tr>))}
                        {!applyFilter(flattened.child.assets, childFilter).length && <tr><td colSpan={3} className="text-center text-muted">No child assets</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="card h-100">
                  <div className="card-header py-2 d-flex justify-content-between align-items-center">
                    <h6 className="mb-0">Liabilities</h6>
                    {flattened.child.liabilities.length>20 && <button className="btn btn-sm btn-outline-secondary" onClick={()=>setShowAllChildLiabilities(s=>!s)}>{showAllChildLiabilities?'Show Top 20':'Show All'}</button>}
                  </div>
                  <div className="card-body p-0" style={{maxHeight:300,overflowY:'auto'}}>
                    <table className="table table-sm mb-0">
                      <thead className="table-light"><tr><th style={{width:'35%'}}>Type</th><th style={{width:'45%'}}>Description</th><th className="text-end" style={{width:'20%'}}>Value</th></tr></thead>
                      <tbody>
                        {limitedOrAll(applyFilter(flattened.child.liabilities, childFilter), showAllChildLiabilities).map((r,i)=>(<tr key={i}><td>{r.type||'—'}</td><td>{r.description||'—'}</td><td className="text-end">{r.value.toLocaleString()}</td></tr>))}
                        {!applyFilter(flattened.child.liabilities, childFilter).length && <tr><td colSpan={3} className="text-center text-muted">No child liabilities</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="col-lg-4">
                <div className="card h-100">
                  <div className="card-header py-2 d-flex justify-content-between align-items-center">
                    <h6 className="mb-0">Income</h6>
                    {flattened.child.income.length>20 && <button className="btn btn-sm btn-outline-secondary" onClick={()=>setShowAllChildIncome(s=>!s)}>{showAllChildIncome?'Show Top 20':'Show All'}</button>}
                  </div>
                  <div className="card-body p-0" style={{maxHeight:300,overflowY:'auto'}}>
                    <table className="table table-sm mb-0">
                      <thead className="table-light"><tr><th style={{width:'35%'}}>Type</th><th style={{width:'45%'}}>Description</th><th className="text-end" style={{width:'20%'}}>Value</th></tr></thead>
                      <tbody>
                        {limitedOrAll(applyFilter(flattened.child.income, childFilter), showAllChildIncome).map((r,i)=>(<tr key={i}><td>{r.type||'—'}</td><td>{r.description||'—'}</td><td className="text-end">{r.value.toLocaleString()}</td></tr>))}
                        {!applyFilter(flattened.child.income, childFilter).length && <tr><td colSpan={3} className="text-center text-muted">No child income</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="alert alert-secondary py-2 small mb-0">
              <strong>Local Snapshot:</strong> Loaded Declarations: {declarations.length} | Avg Income: Ksh {avgIncome.toLocaleString()} | Avg Net Worth: Ksh {avgNetWorth.toLocaleString()}
            </div>

            {/* Lockouts & Audit */}
            <div className="mt-4">
              <h5 className="mb-3 d-flex align-items-center"><i className="bi bi-lock-fill me-2"></i>Account Lockouts</h5>
              <div className="row g-3">
                <div className="col-lg-5">
                  <div className="card h-100">
                    <div className="card-header py-2 d-flex flex-wrap gap-2 justify-content-between align-items-center">
                      <h6 className="mb-0">Currently Locked Users</h6>
                      <div className="d-flex gap-2">
                        <input className="form-control form-control-sm" style={{width:130}} placeholder="National ID" value={lockedSearchNationalId} onChange={e=>setLockedSearchNationalId(e.target.value)} />
                        <button className="btn btn-sm btn-outline-secondary" onClick={fetchLocked} disabled={lockedLoading}>{lockedLoading?'...':'Go'}</button>
                      </div>
                    </div>
                    <div className="card-body p-0" style={{maxHeight:320, overflowY:'auto'}}>
                      {lockError && <div className="text-danger small p-2">{lockError}</div>}
                      {!lockError && (
                        <table className="table table-sm mb-0">
                          <thead className="table-light"><tr><th>User</th><th>Attempts</th><th>Minutes Left</th><th></th></tr></thead>
                          <tbody>
                            {lockedUsers.map(u=>(
                              <tr key={u.id}>
                                <td>{u.first_name} {u.surname}<br/><small className="text-muted">{u.national_id}</small></td>
                                <td>{u.failed_login_attempts}</td>
                                <td>{calcMinutesLeft(u.lock_until, u.minutes_remaining)}</td>
                                <td><button className="btn btn-sm btn-outline-danger" onClick={()=>confirmClearLockout(u.id)}>Clear</button></td>
                              </tr>
                            ))}
                            {!lockedUsers.length && <tr><td colSpan={4} className="text-center text-muted">No active lockouts</td></tr>}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-lg-7">
                  <div className="card h-100">
                    <div className="card-header py-2 d-flex flex-wrap gap-2 align-items-center">
                      <h6 className="mb-0 me-auto">Lockout Audit</h6>
                      <select className="form-select form-select-sm" style={{width:100}} value={auditPageSize} onChange={e=>setAuditPageSize(parseInt(e.target.value,10))}>
                        {PAGE_SIZE_OPTIONS.map(n=> <option key={n} value={n}>{n}/pg</option>)}
                      </select>
                    </div>
                    <div className="card-body p-2 d-flex flex-column">
                      <form className="row g-2 mb-2" onSubmit={e=>{e.preventDefault(); fetchAudit(true);}}>
                        <div className="col-md-2"><input className="form-control form-control-sm" placeholder="User ID" value={auditFilters.userId} onChange={e=>setAuditFilters(f=>({...f,userId:e.target.value}))} /></div>
                        <div className="col-md-2"><input className="form-control form-control-sm" placeholder="Nat ID" value={auditFilters.nationalId} onChange={e=>setAuditFilters(f=>({...f,nationalId:e.target.value}))} /></div>
                        <div className="col-md-2">
                          <select className="form-select form-select-sm" value={auditFilters.eventType} onChange={e=>setAuditFilters(f=>({...f,eventType:e.target.value}))}>
                            <option value="">All Events</option>
                            <option value="LOCK">LOCK</option>
                            <option value="UNLOCK">UNLOCK</option>
                            <option value="CLEAR">CLEAR</option>
                          </select>
                        </div>
                        <div className="col-md-3"><input type="date" className="form-control form-control-sm" value={auditFilters.from} onChange={e=>setAuditFilters(f=>({...f,from:e.target.value}))} /></div>
                        <div className="col-md-3"><input type="date" className="form-control form-control-sm" value={auditFilters.to} onChange={e=>setAuditFilters(f=>({...f,to:e.target.value}))} /></div>
                        <div className="col-12 d-flex gap-2">
                          <button className="btn btn-sm btn-primary" type="submit">Apply</button>
                          <button className="btn btn-sm btn-outline-secondary" type="button" onClick={()=>{setAuditFilters({userId:'',nationalId:'',eventType:'',from:'',to:''}); fetchAudit(true);}}>Reset</button>
                        </div>
                      </form>
                      {auditError && <div className="text-danger small mb-2">{auditError}</div>}
                      <div className="flex-grow-1" style={{overflowY:'auto'}}>
                        <table className="table table-sm table-striped mb-0">
                          <thead className="table-light"><tr><th>ID</th><th>User</th><th>Event</th><th>Attempts</th><th>Lock Until</th><th>Actor</th><th>When</th></tr></thead>
                          <tbody>
                            {auditRows.map(r=> (
                              <tr key={r.id}>
                                <td>{r.id}</td>
                                <td>{r.user_id}<br/><small className="text-muted">{r.national_id}</small></td>
                                <td>{r.event_type}</td>
                                <td>{r.failed_attempts ?? '—'}</td>
                                <td>{r.lock_until ? new Date(r.lock_until).toLocaleTimeString() : '—'}</td>
                                <td>{r.performed_by_admin_id ? (<>{r.performed_by_username || ('Admin #' + r.performed_by_admin_id)}<br/><small className="text-muted">{r.performed_by_role}</small></>) : '—'}</td>
                                <td>{new Date(r.created_at).toLocaleString()}</td>
                              </tr>
                            ))}
                            {!auditRows.length && !auditLoading && <tr><td colSpan={7} className="text-center text-muted">No audit records</td></tr>}
                            {auditLoading && <tr><td colSpan={7} className="text-center text-muted">Loading...</td></tr>}
                          </tbody>
                        </table>
                      </div>
                      <div className="d-flex justify-content-between align-items-center mt-2 small">
                        <div>Page {auditPage} of {Math.max(1, Math.ceil(auditTotal / auditPageSize))} ({auditTotal} records)</div>
                        <div className="btn-group btn-group-sm">
                          <button className="btn btn-outline-secondary" disabled={auditPage<=1} onClick={()=>setAuditPage(p=>p-1)}>Prev</button>
                          <button className="btn btn-outline-secondary" disabled={auditPage >= Math.ceil(auditTotal / auditPageSize)} onClick={()=>setAuditPage(p=>p+1)}>Next</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <ToastContainer position="bottom-right" autoClose={4000} newestOnTop closeOnClick pauseOnFocusLoss draggable pauseOnHover theme="colored" />
    </div>
  );
};

export default SuperAdminMetricsModule;