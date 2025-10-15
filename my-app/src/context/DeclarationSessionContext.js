import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';

// Basic session model context (minimal skeleton for diff-based save integration)
const DeclarationSessionContext = createContext(null);

export const DeclarationSessionProvider = ({ declarationId, children }) => {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(!!declarationId);
  const [savingState, setSavingState] = useState({ busy: false, last: null, mode: null });
  const [error, setError] = useState(null);
  const baselineRef = useRef(null); // stores last full model snapshot for diffing

  useEffect(() => {
    let active = true;
    async function fetchDecl() {
      if (!declarationId) return;
      setLoading(true); setError(null);
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/declarations/${declarationId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!active) return;
        const decl = res.data?.declaration;
        setModel(normalizeModel(decl));
        baselineRef.current = normalizeModel(decl); // baseline copy
      } catch (e) {
        if (active) setError(e.message || 'Failed to load declaration');
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchDecl();
    return () => { active = false; };
  }, [declarationId]);

  // Normalize backend declaration into session shape (simplified placeholder)
  const normalizeModel = (decl) => {
    if (!decl) return null;
    return {
      id: decl.id,
      status: decl.status,
      user_edit_count: decl.user_edit_count || 0,
      profile: {
        first_name: decl.first_name || '',
        other_names: decl.other_names || '',
        surname: decl.surname || '',
        marital_status: decl.marital_status || decl.user?.marital_status || '',
      },
      members: {
        spouses: decl.spouses || [],
        children: decl.children || []
      },
      financial: {
        members: decl.financial_unified || []
      },
      witness: {
        signed: !!decl.witness_signed,
        name: decl.witness_name || '',
        address: decl.witness_address || '',
        phone: decl.witness_phone || ''
      },
      type: decl.declaration_type || ''
    };
  };

  // Compute a diff between baselineRef.current and an updated partial fields object
  const computePatchDiff = useCallback((partial) => {
    const baseline = baselineRef.current;
    if (!baseline) return { scalar: {}, collections: {} };
    const scalarKeys = ['marital_status','witness_signed','witness_name','witness_address','witness_phone'];
    const scalar = {};
    scalarKeys.forEach(k => {
      if (Object.prototype.hasOwnProperty.call(partial, k)) {
        // Compare to baseline root declaration analog (we only stored subset in model)
        const baseVal = k.startsWith('witness_') ? baseline.witness[k.replace('witness_','')] : (k === 'marital_status' ? baseline.profile.marital_status : baseline[k]);
        if (partial[k] !== baseVal) scalar[k] = partial[k];
      }
    });
    const collections = {};
    if (Object.prototype.hasOwnProperty.call(partial,'spouses')) {
      collections.spouses = partial.spouses; // full replace if provided
    }
    if (Object.prototype.hasOwnProperty.call(partial,'children')) {
      collections.children = partial.children;
    }
    // financial_declarations deprecated – ignore
    return { scalar, collections };
  }, []);

  // High-level save method decides PATCH vs PUT
  const buildFullPutPayload = (baseline) => {
    if (!baseline) return {};
    return {
      marital_status: baseline.profile.marital_status,
      spouses: (baseline.members.spouses || []).map(s => ({ first_name: s.first_name || '', other_names: s.other_names || '', surname: s.surname || '' })),
      children: (baseline.members.children || []).map(c => ({ first_name: c.first_name || '', other_names: c.other_names || '', surname: c.surname || '' })),
      // Unified financial data no longer sent as separate collection; root/spouses/children contain JSON fields
      witness_signed: baseline.witness.signed,
      witness_name: baseline.witness.name,
      witness_address: baseline.witness.address,
      witness_phone: baseline.witness.phone
    };
  };

  const MAX_PATCH_BYTES = 40 * 1024; // 40 KB threshold
  const saveChanges = useCallback(async (partial) => {
    if (!model?.id) throw new Error('No loaded declaration to save');
    const { scalar, collections } = computePatchDiff(partial);
    const patchBody = { ...scalar, ...collections };
    // Heuristic: patch if we touch <=1 collection and payload size under threshold
    let isPatch = Object.keys(patchBody).length > 0 && Object.keys(collections).length <= 1;
    if (isPatch) {
      try {
        const size = new Blob([JSON.stringify(patchBody)]).size;
        if (size > MAX_PATCH_BYTES) {
          isPatch = false; // escalate to PUT
        }
      } catch { /* ignore size calc errors */ }
    }
    const token = localStorage.getItem('token');
    setSavingState(s => ({ ...s, busy: true }));
    if (isPatch) {
      const res = await axios.patch(`/api/declarations/${model.id}`, patchBody, { headers: { Authorization: `Bearer ${token}` } });
      // Merge into baseline/model
      const newBaseline = JSON.parse(JSON.stringify(baselineRef.current));
      Object.entries(scalar).forEach(([k,v]) => {
        if (k === 'marital_status') newBaseline.profile.marital_status = v;
        else if (k.startsWith('witness_')) newBaseline.witness[k.replace('witness_','')] = v;
      });
      Object.entries(collections).forEach(([k,v]) => {
        if (k === 'spouses') newBaseline.members.spouses = v;
        if (k === 'children') newBaseline.members.children = v;
        // financial_declarations deprecated
      });
      baselineRef.current = newBaseline;
      setModel(newBaseline);
      setSavingState({ busy: false, last: new Date(), mode: 'PATCH' });
      return { mode: 'PATCH', response: res.data };
    } else {
      // Fallback: full PUT with comprehensive payload
      const merged = JSON.parse(JSON.stringify(baselineRef.current));
      // Apply partial to merged baseline prior to building payload
      if (scalar.marital_status) merged.profile.marital_status = scalar.marital_status;
      if (scalar.witness_signed !== undefined) merged.witness.signed = scalar.witness_signed;
      if (scalar.witness_name !== undefined) merged.witness.name = scalar.witness_name;
      if (scalar.witness_address !== undefined) merged.witness.address = scalar.witness_address;
      if (scalar.witness_phone !== undefined) merged.witness.phone = scalar.witness_phone;
      if (collections.spouses) merged.members.spouses = collections.spouses;
      if (collections.children) merged.members.children = collections.children;
  // financial_declarations deprecated – no merge needed
      const fullPayload = buildFullPutPayload(merged);
      const res = await axios.put(`/api/declarations/${model.id}`, fullPayload, { headers: { Authorization: `Bearer ${token}` } });
      baselineRef.current = merged;
      setModel(merged);
      setSavingState({ busy: false, last: new Date(), mode: 'PUT' });
      return { mode: 'PUT', response: res.data };
    }
  }, [model, computePatchDiff, MAX_PATCH_BYTES]);

  const value = { model, loading, error, saveChanges, computePatchDiff, savingState };
  return <DeclarationSessionContext.Provider value={value}>{children}</DeclarationSessionContext.Provider>;
};

export const useDeclarationSession = () => useContext(DeclarationSessionContext);
// Small utility hook to standardize debounced saveChanges usage across forms
export const useDebouncedPatch = (deps, builder, delay = 500) => {
  const { saveChanges } = useDeclarationSession();
  const timerRef = useRef();
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const partial = builder();
    if (!partial || typeof partial !== 'object' || Object.keys(partial).length === 0) return;
    timerRef.current = setTimeout(() => {
      saveChanges(partial).catch(e => console.warn('Debounced patch failed:', e.message));
    }, delay);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
};
export default DeclarationSessionContext;
