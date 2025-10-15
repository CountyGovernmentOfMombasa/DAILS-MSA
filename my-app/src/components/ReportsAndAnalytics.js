import React, { useMemo } from 'react';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title
} from 'chart.js';

// Register Chart.js components if not already registered (idempotent)
try {
  ChartJS.register(
    ArcElement,
    Tooltip,
    Legend,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Title
  );
} catch (_) {
  // ignore if already registered
}

// (Removed legacy AssetsLiabilitiesTable -- replaced by Super Admin Module)

const ReportsAndAnalytics = ({
  declarations = [],
  reportData = {},
  biennialLocked = false,
  handleToggleBiennialLock = () => {},
  firstLocked = false,
  handleToggleFirstLock = () => {},
  finalLocked = false,
  handleToggleFinalLock = () => {},
  downloadReport = () => {},
  usersCount = 0,
  hideBiennialLock = false,
  adminUser = null // added to support super-admin only module
}) => {
  const parseNumericCollection = React.useCallback((field) => {
    if (!field) return 0;
    if (Array.isArray(field)) {
      return field.reduce((s, item) => {
        if (!item) return s;
        const v = parseFloat(item.value ?? item.amount ?? item.total);
        return s + (isNaN(v) ? 0 : v);
      }, 0);
    }
    if (typeof field === 'string') {
      try {
        const arr = JSON.parse(field);
        if (Array.isArray(arr)) return parseNumericCollection(arr);
        const single = parseFloat(field);
        return isNaN(single) ? 0 : single;
      } catch {
        const single = parseFloat(field);
        return isNaN(single) ? 0 : single;
      }
    }
    if (typeof field === 'number') return field;
    if (typeof field === 'object') return parseNumericCollection(Object.values(field));
    return 0;
  }, []);

  const { avgIncome, avgNetWorth } = useMemo(() => {
    if (!Array.isArray(declarations) || declarations.length === 0) {
      return { avgIncome: 0, avgNetWorth: 0 };
    }
    let totalIncome = 0;
    let totalNetWorth = 0;
    for (const d of declarations) {
      // income
      totalIncome += parseNumericCollection(d.biennial_income || d.income || d.first_income || d.final_income);

      // assets
      let assetsVal = parseNumericCollection(d.assets);
      let liabilitiesVal = parseNumericCollection(d.liabilities);
      totalNetWorth += (assetsVal - liabilitiesVal);
    }
    return {
      avgIncome: Math.round(totalIncome / declarations.length),
      avgNetWorth: Math.round(totalNetWorth / declarations.length)
    };
  }, [declarations, parseNumericCollection]);

  // Defensive de-structuring with fallbacks
  const maritalStatus = reportData?.maritalStatus || {};
  const incomeRanges = reportData?.incomeRanges || {};
  // assetsLiabilities removed (was previously used for trend chart)
  // Super admin metrics moved to dedicated Super Metrics tab (SuperAdminMetricsModule)

  return (
  <div className="tab-pane fade show active">
    <div className="col-12">
      {/* Declaration Lock Section */}
      {!hideBiennialLock && (
        <div className="card mb-4">
          <div className="card-header bg-warning text-dark d-flex justify-content-between align-items-center">
            <h5 className="mb-0">Declaration Locks (Admin Only)</h5>
          </div>
          <div className="card-body d-flex flex-column flex-md-row align-items-md-center justify-content-between">
            <div className="mb-2 mb-md-0">
              <button
                className={`btn ${biennialLocked ? 'btn-danger' : 'btn-success'} btn-sm me-3`}
                onClick={handleToggleBiennialLock}
              >
                {biennialLocked ? 'Unlock Biennial Declaration' : 'Lock Biennial Declaration'}
              </button>
              {biennialLocked && (
                <span className="alert alert-warning mb-0 p-2" style={{fontSize: '0.95em', display: 'inline-block'}}>
                  Biennial declarations are currently <b>locked</b>.
                </span>
              )}
            </div>
            <div className="mb-2 mb-md-0">
              <button
                className={`btn ${firstLocked ? 'btn-danger' : 'btn-success'} btn-sm me-3`}
                onClick={handleToggleFirstLock}
              >
                {firstLocked ? 'Unlock First Declaration' : 'Lock First Declaration'}
              </button>
              {firstLocked && (
                <span className="alert alert-warning mb-0 p-2" style={{fontSize: '0.95em', display: 'inline-block'}}>
                  First declarations are currently <b>locked</b>.
                </span>
              )}
            </div>
            <div>
              <button
                className={`btn ${finalLocked ? 'btn-danger' : 'btn-success'} btn-sm me-3`}
                onClick={handleToggleFinalLock}
              >
                {finalLocked ? 'Unlock Final Declaration' : 'Lock Final Declaration'}
              </button>
              {finalLocked && (
                <span className="alert alert-warning mb-0 p-2" style={{fontSize: '0.95em', display: 'inline-block'}}>
                  Final declarations are currently <b>locked</b>.
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Main Reports & Analytics Card */}
      <div className="card shadow-sm">
        <div className="card-header bg-success text-white d-flex justify-content-between align-items-center">
          <h3 className="card-title mb-0">
            <i className="bi bi-graph-up me-2"></i>
            Reports & Analytics
          </h3>
          <div className="btn-group">
            <button 
              className="btn btn-light btn-sm"
              onClick={() => downloadReport('full')}
            >
              <i className="bi bi-download me-1"></i>
              Full Report
            </button>
            <button
              className="btn btn-light btn-sm"
              onClick={() => downloadReport('summary')}
            >
              Summary Report
            </button>
          </div>
        </div>
        <div className="card-body">
          <div className="row">
            {/* Statistics Cards */}
            <div className="col-md-3 mb-3">
              <div className="card bg-primary text-white">
                <div className="card-body">
                  <div className="d-flex justify-content-between">
                    <div>
                      <h6 className="card-title">No. of Employees</h6>
                      <h2 className="mb-0">{usersCount}</h2>
                    </div>
                    <i className="bi bi-people display-6"></i>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-3 mb-3">
              <div className="card bg-info text-white">
                <div className="card-body">
                  <div className="d-flex justify-content-between">
                    <div>
                      <h6 className="card-title">No. of Declarations</h6>
                      <h2 className="mb-0">{declarations.length}</h2>
                    </div>
                    <i className="bi bi-file-earmark-text display-6"></i>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-3 mb-3">
              <div className="card bg-success text-white">
                <div className="card-body">
                  <div className="d-flex justify-content-between">
                    <div>
                      <h6 className="card-title">Average Income</h6>
                      <h2 className="mb-0">Ksh {avgIncome.toLocaleString()}</h2>
                    </div>
                    <i className="bi bi-currency-dollar display-6"></i>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-md-3 mb-3">
              <div className="card bg-warning text-dark">
                <div className="card-body">
                  <div className="d-flex justify-content-between">
                    <div>
                      <h6 className="card-title">Average Net Worth</h6>
                      <h2 className="mb-0">Ksh {avgNetWorth.toLocaleString()}</h2>
                    </div>
                    <i className="bi bi-graph-up display-6"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="row mt-4">
            <div className="col-md-6 mb-4">
              <div className="card h-100">
                <div className="card-header">
                  <h5 className="card-title mb-0">Marital Status Distribution</h5>
                </div>
                <div className="card-body">
                  {Object.keys(maritalStatus).length > 0 ? (
                    <Pie
                      data={{
                        labels: Object.keys(maritalStatus),
                        datasets: [{
                          data: Object.values(maritalStatus),
                          backgroundColor: [
                            '#FF6384',
                            '#36A2EB',
                            '#FFCE56',
                            '#4BC0C0'
                          ]
                        }]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'bottom'
                          }
                        }
                      }}
                      height={300}
                    />
                  ) : <div className="text-muted">No marital status data.</div>}
                </div>
              </div>
            </div>
            
            <div className="col-md-6 mb-4">
              <div className="card h-100">
                <div className="card-header">
                  <h5 className="card-title mb-0">Income Distribution</h5>
                </div>
                <div className="card-body">
                  {Object.keys(incomeRanges).length > 0 ? (
                    <Bar
                      data={{
                        labels: Object.keys(incomeRanges),
                        datasets: [{
                          label: 'Number of Employees',
                          data: Object.values(incomeRanges),
                          backgroundColor: '#36A2EB'
                        }]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            display: false
                          }
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                            ticks: {
                              stepSize: 1
                            }
                          }
                        }
                      }}
                      height={300}
                    />
                  ) : <div className="text-muted">No income distribution data.</div>}
                </div>
              </div>
            </div>
          </div>

          {/* Super admin insights moved to separate "Super Metrics" tab */}
        </div>
      </div>
	</div>
  </div>
 );
};

export default ReportsAndAnalytics;
