import React, { useEffect, useState } from 'react';
import { adminFetch } from '../api';
import DeclarationEditOverridesAdmin from './DeclarationEditOverridesAdmin';

function DateInput({ value, onChange }) {
  return (
    <input
      type="date"
      className="border rounded px-2 py-1"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function BiennialWindowsAdmin() {
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ year: '', start_date: '', end_date: '', active: true, notes: '' });
  const [audit, setAudit] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const resp = await adminFetch('/api/admin/windows/biennial');
        const data = await resp.json();
        if (mounted) setWindows(data?.data || []);
        // load audit
        try {
          const aresp = await adminFetch('/api/admin/windows/audit');
          const adata = await aresp.json();
          if (mounted) setAudit(adata?.data || []);
        } catch { /* non-fatal */ }
      } catch (e) {
        if (mounted) setError(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function submitWindow(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        year: form.year === '' ? null : Number(form.year),
        start_date: form.start_date,
        end_date: form.end_date,
        active: !!form.active,
        notes: form.notes || null
      };
      const respPost = await adminFetch('/api/admin/windows/biennial', { method: 'POST', body: JSON.stringify(payload) });
      if (!respPost.ok) {
        const errData = await respPost.json().catch(()=>({}));
        throw new Error(errData.message || `HTTP ${respPost.status}`);
      }
  // refresh list
      const resp = await adminFetch('/api/admin/windows/biennial');
      const data = await resp.json();
      setWindows(data?.data || []);
      try {
        const aresp = await adminFetch('/api/admin/windows/audit');
        const adata = await aresp.json();
        setAudit(adata?.data || []);
      } catch {}
      setForm({ year: '', start_date: '', end_date: '', active: true, notes: '' });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-3">Biennial Declaration Windows</h2>
      <form onSubmit={submitWindow} className="space-y-2 mb-4 border p-3 rounded bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
          <div>
            <label className="block text-sm">Year (blank = Global)</label>
            <input type="number" className="border rounded px-2 py-1 w-full" value={form.year} onChange={(e)=>setForm(f=>({...f, year: e.target.value}))} />
          </div>
          <div>
            <label className="block text-sm">Start Date</label>
            <DateInput value={form.start_date} onChange={(v)=>setForm(f=>({...f, start_date: v}))} />
          </div>
          <div>
            <label className="block text-sm">End Date</label>
            <DateInput value={form.end_date} onChange={(v)=>setForm(f=>({...f, end_date: v}))} />
          </div>
          <div className="flex items-center gap-2">
            <input id="active" type="checkbox" checked={!!form.active} onChange={(e)=>setForm(f=>({...f, active: e.target.checked}))} />
            <label htmlFor="active">Active</label>
          </div>
          <div>
            <label className="block text-sm">Notes</label>
            <input type="text" className="border rounded px-2 py-1 w-full" value={form.notes} onChange={(e)=>setForm(f=>({...f, notes: e.target.value}))} />
          </div>
        </div>
        <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded">Save Window</button>
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </form>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full border">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="p-2 border">ID</th>
                <th className="p-2 border">Year</th>
                <th className="p-2 border">Start</th>
                <th className="p-2 border">End</th>
                <th className="p-2 border">Active</th>
                <th className="p-2 border">Notes</th>
              </tr>
            </thead>
            <tbody>
              {windows.map(w => (
                <tr key={w.id}>
                  <td className="p-2 border">{w.id}</td>
                  <td className="p-2 border">{w.year ?? 'Global'}</td>
                  <td className="p-2 border">{w.start_date?.slice(0,10)}</td>
                  <td className="p-2 border">{w.end_date?.slice(0,10)}</td>
                  <td className="p-2 border">{w.active ? 'Yes' : 'No'}</td>
                  <td className="p-2 border">{w.notes || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DeclarationEditOverridesAdmin />

      <div className="mt-6">
        <h3 className="text-lg font-semibold mb-2">Audit Log</h3>
        <div className="overflow-auto">
          <table className="min-w-full border">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="p-2 border">When</th>
                <th className="p-2 border">Action</th>
                <th className="p-2 border">Actor</th>
                <th className="p-2 border">Target</th>
                <th className="p-2 border">Target ID</th>
              </tr>
            </thead>
            <tbody>
              {(audit || []).map(a => (
                <tr key={a.id}>
                  <td className="p-2 border">{new Date(a.created_at).toLocaleString()}</td>
                  <td className="p-2 border">{a.action}</td>
                  <td className="p-2 border">{a.actor_admin_id ?? ''}</td>
                  <td className="p-2 border">{a.target}</td>
                  <td className="p-2 border">{a.target_id ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
