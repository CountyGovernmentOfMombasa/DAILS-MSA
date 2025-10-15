import { useEffect, useState, useCallback } from 'react';

export function useDepartments({ admin = false } = {}) {
  const [departments, setDepartments] = useState([]);
  const [subMap, setSubMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true); setError('');
      const endpoint = admin ? '/api/admin/dept-config' : '/api/public/departments';
      const headers = {}; if (admin) { const t = localStorage.getItem('adminToken'); if (t) headers['Authorization'] = `Bearer ${t}`; }
      const res = await fetch(endpoint, { headers });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || 'Failed to load departments');
      if (admin) {
        // dept-config shape
        const d = j.data || [];
        setDepartments(d.map(x => x.name));
        const map = {}; d.forEach(x => { map[x.name] = (x.sub_departments || []).map(s => s.name); if (!map[x.name].length) map[x.name] = [x.name]; });
        setSubMap(map);
      } else {
        setDepartments(j.departments || []);
        setSubMap(j.subDepartmentMap || {});
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [admin]);

  useEffect(() => { load(); }, [load]);

  const subDepartments = Array.from(new Set(Object.values(subMap).flat()));
  const subToParent = Object.fromEntries(Object.entries(subMap).flatMap(([dept, subs]) => subs.map(s => [s, dept])));

  return { departments, subMap, subDepartments, subToParent, loading, error, reload: load };
}

export default useDepartments;