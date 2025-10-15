// Utility to manage edit context across routes/state/query/localStorage
// Schema:
// {
//   declarationId: string | number,
//   editInfo: { reason?: string, requestedAt?: string } | null
// }

const STORAGE_KEY = 'editContext';

function parseSearch(search) {
  try {
    if (!search) return {};
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    return Object.fromEntries(params.entries());
  } catch (_) {
    return {};
  }
}

export function getEditContext({ locationState, locationSearch } = {}) {
  // Priority order: explicit state > query string > localStorage
  const fromState = locationState && typeof locationState === 'object' ? locationState : {};
  const query = parseSearch(locationSearch);

  let declarationId = fromState?.declarationId ?? query.declarationId;
  let editInfo = fromState?.editInfo;

  if (!declarationId || (!editInfo)) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!declarationId && parsed?.declarationId) declarationId = parsed.declarationId;
        if (!editInfo && parsed?.editInfo) editInfo = parsed.editInfo;
      }
    } catch (_) {
      // ignore
    }
  }

  // Normalize declarationId to string to keep URL/query consistent
  if (declarationId != null) {
    declarationId = String(declarationId);
  }

  return { declarationId, editInfo: editInfo || null };
}

export function saveEditContext({ declarationId, editInfo }) {
  try {
    const toStore = { declarationId: declarationId != null ? String(declarationId) : null, editInfo: editInfo || null };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch (_) {
    // ignore storage errors
  }
}

export function clearEditContext() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // ignore
  }
}

export function appendDeclarationIdToPath(path, declarationId) {
  if (!declarationId) return path;
  try {
    const url = new URL(path, window.location.origin);
    url.searchParams.set('declarationId', String(declarationId));
    // Return pathname + search only
    return `${url.pathname}${url.search}`;
  } catch (_) {
    // Fallback naive approach
    const hasQuery = path.includes('?');
    const sep = hasQuery ? '&' : '?';
    return `${path}${sep}declarationId=${encodeURIComponent(String(declarationId))}`;
  }
}

export function removeDeclarationIdFromPath(path) {
  try {
    const url = new URL(path, window.location.origin);
    url.searchParams.delete('declarationId');
    return `${url.pathname}${url.search}` || url.pathname;
  } catch (_) {
    // Fallback: strip using regex
    return path
      .replace(/([?&])declarationId=[^&]*(&|$)/, (m, p1, p2) => (p1 === '?' && !p2 ? '' : p2 ? p2 : ''))
      .replace(/\?$/, '');
  }
}

const editContext = {
  getEditContext,
  saveEditContext,
  clearEditContext,
  appendDeclarationIdToPath,
  removeDeclarationIdFromPath,
};

export default editContext;
