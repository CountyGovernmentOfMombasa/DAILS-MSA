import React, { useEffect, useState } from 'react';
import { adminFetch } from '../api';

export default function DeclarationEditOverridesAdmin() {
  const [overrides, setOverrides] = useState([]);
  const [form, setForm] = useState({ type: 'biennial_edit', user_id: '', declaration_id: '', allow_from: '', allow_until: '', allow: true, reason: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await adminFetch('/api/admin/overrides/declaration-edits');
        const data = await resp.json();
        if (mounted) setOverrides(data?.data || []);
      } catch (e) {
        if (mounted) setError(e.message);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        type: form.type,
        user_id: form.user_id ? Number(form.user_id) : null,
        declaration_id: form.declaration_id ? Number(form.declaration_id) : null,
        allow_from: form.allow_from || null,
        allow_until: form.allow_until || null,
        allow: !!form.allow,
        reason: form.reason || null
      };
      const respPost = await adminFetch('/api/admin/overrides/declaration-edits', { method: 'POST', body: JSON.stringify(payload) });
      if (!respPost.ok) {
        const errData = await respPost.json().catch(()=>({}));
        throw new Error(errData.message || `HTTP ${respPost.status}`);
      }
      const resp = await adminFetch('/api/admin/overrides/declaration-edits');
      const data = await resp.json();
      setOverrides(data?.data || []);
      setForm({ type: 'biennial_edit', user_id: '', declaration_id: '', allow_from: '', allow_until: '', allow: true, reason: '' });
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    }
  }

  async function deactivate(id) {
    if (!window.confirm('Deactivate this override?')) return;
    const respDel = await adminFetch(`/api/admin/overrides/declaration-edits/${id}`, { method: 'DELETE' });
    if (!respDel.ok) {
      const errData = await respDel.json().catch(()=>({}));
      throw new Error(errData.message || `HTTP ${respDel.status}`);
    }
    const resp = await adminFetch('/api/admin/overrides/declaration-edits');
    const data = await resp.json();
    setOverrides(data?.data || []);
  }

  return (
    <div className="mt-4">
      <h3 className="text-lg font-semibold mb-2">Overrides</h3>
      <form onSubmit={submit} className="space-y-2 border p-3 rounded bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
          <div>
            <label className="block text-sm">Type</label>
            <select className="border rounded px-2 py-1 w-full" value={form.type} onChange={(e)=>setForm(f=>({...f, type: e.target.value}))}>
              <option value="biennial_edit">Biennial Edit</option>
            </select>
          </div>
          <div>
            <label className="block text-sm">User ID</label>
            <input type="number" className="border rounded px-2 py-1 w-full" value={form.user_id} onChange={(e)=>setForm(f=>({...f, user_id: e.target.value}))} />
          </div>
          <div>
            <label className="block text-sm">Declaration ID</label>
            <input type="number" className="border rounded px-2 py-1 w-full" value={form.declaration_id} onChange={(e)=>setForm(f=>({...f, declaration_id: e.target.value}))} />
          </div>
          <div>
            <label className="block text-sm">Allow From</label>
            <input type="datetime-local" className="border rounded px-2 py-1 w-full" value={form.allow_from} onChange={(e)=>setForm(f=>({...f, allow_from: e.target.value}))} />
          </div>
          <div>
            <label className="block text-sm">Allow Until</label>
            <input type="datetime-local" className="border rounded px-2 py-1 w-full" value={form.allow_until} onChange={(e)=>setForm(f=>({...f, allow_until: e.target.value}))} />
          </div>
          <div className="flex items-center gap-2">
            <input id="allow" type="checkbox" checked={!!form.allow} onChange={(e)=>setForm(f=>({...f, allow: e.target.checked}))} />
            <label htmlFor="allow">Allow</label>
          </div>
        </div>
        <div>
          <label className="block text-sm">Reason</label>
          <input type="text" className="border rounded px-2 py-1 w-full" value={form.reason} onChange={(e)=>setForm(f=>({...f, reason: e.target.value}))} />
        </div>
        <button type="submit" className="bg-green-600 text-white px-3 py-1 rounded">Create Override</button>
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </form>

      <div className="overflow-auto mt-3">
        <table className="min-w-full border">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-2 border">ID</th>
              <th className="p-2 border">Type</th>
              <th className="p-2 border">User</th>
              <th className="p-2 border">Declaration</th>
              <th className="p-2 border">Allow From</th>
              <th className="p-2 border">Allow Until</th>
              <th className="p-2 border">Allow</th>
              <th className="p-2 border">Active</th>
              <th className="p-2 border">Reason</th>
              <th className="p-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map(o => (
              <tr key={o.id}>
                <td className="p-2 border">{o.id}</td>
                <td className="p-2 border">{o.type}</td>
                <td className="p-2 border">{o.user_id ?? ''}</td>
                <td className="p-2 border">{o.declaration_id ?? ''}</td>
                <td className="p-2 border">{o.allow_from ? new Date(o.allow_from).toLocaleString() : ''}</td>
                <td className="p-2 border">{o.allow_until ? new Date(o.allow_until).toLocaleString() : ''}</td>
                <td className="p-2 border">{o.allow ? 'Yes' : 'No'}</td>
                <td className="p-2 border">{o.active ? 'Yes' : 'No'}</td>
                <td className="p-2 border">{o.reason || ''}</td>
                <td className="p-2 border">
                  {o.active && (
                    <button className="bg-red-600 text-white px-2 py-1 rounded" onClick={() => deactivate(o.id)}>Deactivate</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
