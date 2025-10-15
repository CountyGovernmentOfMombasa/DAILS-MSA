// Helper to PATCH declaration fields incrementally
// diff: object containing only changed fields or collections (spouses / children arrays etc.)
export async function patchDeclarationFields(declarationId, diff, token) {
  if (!declarationId) throw new Error('Missing declarationId for patch');
  if (!diff || typeof diff !== 'object') return { success: true, skipped: true };
  const res = await fetch(`/api/declarations/${declarationId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || localStorage.getItem('token')}`
    },
    body: JSON.stringify(diff)
  });
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok || data.success === false) {
    const msg = data.message || `Patch failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}
