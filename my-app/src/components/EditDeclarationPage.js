import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Container, Row, Col, Card, Button, Form, Alert, ProgressBar, Table } from 'react-bootstrap';
import { useLocation, useNavigate } from 'react-router-dom';
import { DeclarationSessionProvider, useDeclarationSession, useDebouncedPatch } from '../context/DeclarationSessionContext';
import { getEditContext, appendDeclarationIdToPath } from '../utilis/editContext';
import { modelToSubmissionPayload } from '../models/submissionTransformer';
import { validateDeclarationPayload } from '../util/validateDeclarationPayload';
import { normalizeDeclarationType } from '../util/normalizeDeclarationType';
import { patchDeclarationFields } from '../api/patchDeclaration';
import { toISODate } from '../util/date';
import { deriveUserKey, saveProgress, clearProgress, scheduleServerSync } from '../utilis/persistProgress';

// NOTE: This page is a specialized variant of ReviewPage intended for inline editing.
// Initial implementation supports inline edit for: Personal Info, Spouses, Children (basic fields), Witness + Declaration.
// Financial section still routes to the dedicated Financial Form due to its complexity (future enhancement can inline it).

const InlineEditReviewInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { model, savingState } = useDeclarationSession();
  const isLocked = model && model.status === 'approved' && (model.user_edit_count || 0) >= 1;
  const editContext = getEditContext({ locationState: location.state, locationSearch: location.search });
  const isEditingExisting = !!editContext.declarationId;

  const initialState = location.state || {};
  const [prefilled, setPrefilled] = useState({
    userData: initialState.userData || initialState.profile || null,
    spouses: initialState.spouses || [],
    children: initialState.children || [],
    allFinancialData: initialState.allFinancialData || []
  });

  const [sectionEdit, setSectionEdit] = useState({
    personal: false,
    spouses: false,
    children: false,
    financialMember: null
  });
  const [sectionSaving, setSectionSaving] = useState({ personal:false, spouses:false, children:false, financial:null });
  const [sectionError, setSectionError] = useState({ personal:'', spouses:'', children:'', financial:'' });

  // Snapshots for cancel
  const snapshotRef = useRef({});
  const takeSnapshot = (key) => {
    snapshotRef.current[key] = JSON.parse(JSON.stringify(prefilled[key]));
  };
  const restoreSnapshot = (key) => {
    if (snapshotRef.current[key] !== undefined) {
      setPrefilled(prev => ({ ...prev, [key]: snapshotRef.current[key] }));
    }
  };

  // Declaration & witness state
  const [declarationChecked, setDeclarationChecked] = useState(false);
  const [witnessChecked, setWitnessChecked] = useState(false);
  const [witnessName, setWitnessName] = useState('');
  const [witnessAddress, setWitnessAddress] = useState('');
  const [witnessPhone, setWitnessPhone] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const token = localStorage.getItem('token');

  // Populate from session model if not already provided
  useEffect(() => {
    if (model) {
      (async () => {
        const { mapDeclarationToUserForm, mapDeclarationToSpousesChildren, mapDeclarationToFinancial } = await import('../utilis/declarationMapper');
        const base = { ...model.profile, declaration_type: model.type };
        const userMapped = mapDeclarationToUserForm(base);
        const { spouses: sps, children: ch } = mapDeclarationToSpousesChildren({ spouses: model.members.spouses, children: model.members.children });
        const fin = mapDeclarationToFinancial({
          first_name: model.profile.first_name,
            other_names: model.profile.other_names,
            surname: model.profile.surname,
            financial_unified: model.financial.members
        });
        setPrefilled(prev => ({ ...prev, userData: prev.userData || userMapped, spouses: prev.spouses.length ? prev.spouses : sps, children: prev.children.length ? prev.children : ch, allFinancialData: prev.allFinancialData.length ? prev.allFinancialData : fin }));
        setWitnessChecked(model.witness.signed);
        setWitnessName(model.witness.name);
        setWitnessAddress(model.witness.address);
        setWitnessPhone(model.witness.phone);
      })();
    }
  }, [model]);

  // Debounced witness patch (reuse logic from ReviewPage)
  useDebouncedPatch(
    [witnessChecked, declarationChecked, witnessName, witnessAddress, witnessPhone, isEditingExisting, model?.id],
    () => {
      if (!isEditingExisting || !model?.id) return null;
      const phone = witnessPhone.trim();
      if (!phone || !/^\+?\d{7,15}$/.test(phone)) return null;
      return {
        witness_signed: witnessChecked && declarationChecked,
        witness_name: witnessName.trim(),
        witness_address: witnessAddress.trim(),
        witness_phone: phone
      };
    },
    600
  );

  const userData = prefilled.userData;
  const spouses = React.useMemo(() => prefilled.spouses || [], [prefilled.spouses]);
  const children = React.useMemo(() => prefilled.children || [], [prefilled.children]);
  const allFinancialData = React.useMemo(() => prefilled.allFinancialData || [], [prefilled.allFinancialData]);

  // Use correct plural 'other_names' (previously other_name caused filtering out existing rows)
  const validSpouses = spouses.filter(s => s.first_name?.trim() || s.other_names?.trim() || s.surname?.trim());
  const validChildren = children.filter(c => c.first_name?.trim() || c.other_names?.trim() || c.surname?.trim());

  // Deduplicate display (some entries may appear twice: one with full_name and one reconstructed)
  const dedupe = (arr, type) => {
    const seen = new Set();
    const out = [];
    for (const item of arr) {
      const displayName = (item.full_name || `${item.first_name || ''} ${item.other_names || ''} ${item.surname || ''}`)
        .replace(/\s+/g, ' ').trim();
      if (!displayName) continue;
      const key = type + '|' + displayName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };
  const displaySpouses = React.useMemo(()=> dedupe(validSpouses, 'spouse'), [validSpouses]);
  const displayChildren = React.useMemo(()=> dedupe(validChildren, 'child'), [validChildren]);

  // Build financial payloads (spouses / children) combining identity + inline financial arrays
  const buildSpousesFinancialPayload = () => {
    return spouses.map(s => {
      const fin = (prefilled.allFinancialData||[]).find(f=>f.type==='spouse' && (f.name===`${s.first_name||''} ${s.surname||''}`.trim() || f.name===s.full_name));
      return {
        first_name: s.first_name || '',
        other_names: s.other_names || '',
        surname: s.surname || '',
        biennial_income: fin ? (fin.data?.biennial_income||[]).filter(r=>r.description||r.value) : [],
        assets: fin ? (fin.data?.assets||[]).filter(r=>r.description||r.value) : [],
        liabilities: fin ? (fin.data?.liabilities||[]).filter(r=>r.description||r.value) : [],
        other_financial_info: fin ? (fin.data?.other_financial_info||'') : ''
      };
    });
  };
  const buildChildrenFinancialPayload = () => {
    return children.map(c => {
      const fin = (prefilled.allFinancialData||[]).find(f=>f.type==='child' && (f.name===`${c.first_name||''} ${c.surname||''}`.trim() || f.name===c.full_name));
      return {
        first_name: c.first_name || '',
        other_names: c.other_names || '',
        surname: c.surname || '',
        biennial_income: fin ? (fin.data?.biennial_income||[]).filter(r=>r.description||r.value) : [],
        assets: fin ? (fin.data?.assets||[]).filter(r=>r.description||r.value) : [],
        liabilities: fin ? (fin.data?.liabilities||[]).filter(r=>r.description||r.value) : [],
        other_financial_info: fin ? (fin.data?.other_financial_info||'') : ''
      };
    });
  };

  // Helpers for accurate financial description composition
  const getAssetDescription = (item = {}) => {
    // Combine several optional fields used historically in assets
    const parts = [];
    if (item.description) parts.push(item.description);
    if (item.asset_other_type && item.type === 'Other') parts.push(item.asset_other_type);
    // Vehicle / property extended metadata
    ['make','model','licence_no','title_deed','location'].forEach(f => { if (item[f]) parts.push(item[f]); });
    return parts.filter(Boolean).join(', ');
  };
  const getLiabilityLabel = (item = {}) => {
    if (!item) return '';
    if (item.description === 'Other' && item.liability_other_description) return item.liability_other_description;
    if ((!item.description || !item.description.trim()) && item.liability_other_description) return item.liability_other_description;
    return item.description || item.liability_other_description || '';
  };

  // Basic safe render helper
  const safe = (v) => (v === null || v === undefined || v === '' ? '—' : v);

  // Inline field change handlers for personal info
  const updateUserField = (field, value) => {
    setPrefilled(prev => ({ ...prev, userData: { ...prev.userData, [field]: value } }));
  };
  const userValidation = React.useMemo(()=>{
    if (!userData) return { valid:false, errors:['Missing user data'] };
    const errors = [];
    if (!userData.first_name?.trim()) errors.push('First name required');
    if (!userData.surname?.trim()) errors.push('Surname required');
    if (!userData.marital_status?.trim()) errors.push('Marital status required');
    if (userData.email && !/^([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+)\.[A-Za-z]{2,}$/.test(userData.email)) errors.push('Invalid email');
    return { valid: errors.length===0, errors };
  }, [userData]);

  // Spouse & child editing handlers
  const updateSpouseField = (index, field, value) => {
    setPrefilled(prev => ({ ...prev, spouses: prev.spouses.map((s, i) => i === index ? { ...s, [field]: value } : s) }));
  };
  const updateChildField = (index, field, value) => {
    setPrefilled(prev => ({ ...prev, children: prev.children.map((c, i) => i === index ? { ...c, [field]: value } : c) }));
  };
  const addSpouse = () => setPrefilled(prev => ({ ...prev, spouses: [...prev.spouses, { first_name: '', other_names: '', surname: '' }] }));
  const addChild = () => setPrefilled(prev => ({ ...prev, children: [...prev.children, { first_name: '', other_names: '', surname: '' }] }));
  const removeSpouse = (i) => setPrefilled(prev => ({ ...prev, spouses: prev.spouses.filter((_, idx) => idx !== i) }));
  const removeChild = (i) => setPrefilled(prev => ({ ...prev, children: prev.children.filter((_, idx) => idx !== i) }));
  const spousesValidation = React.useMemo(()=>{
    const errs=[]; spouses.forEach((s,idx)=>{ if([s.first_name,s.other_names,s.surname].some(v=>v&&v.trim()) && !s.first_name?.trim() && !s.surname?.trim()) errs.push(`Spouse ${idx+1}: first or surname required`); });
    return { valid: errs.length===0, errors: errs };
  },[spouses]);
  const childrenValidation = React.useMemo(()=>{
    const errs=[]; children.forEach((c,idx)=>{ if([c.first_name,c.other_names,c.surname].some(v=>v&&v.trim()) && !c.first_name?.trim() && !c.surname?.trim()) errs.push(`Child ${idx+1}: first or surname required`); });
    return { valid: errs.length===0, errors: errs };
  },[children]);

  // Draft persistence (simplified for inline edits)
  const persistDraft = useCallback(() => {
    if (!userData) return;
    const key = deriveUserKey(userData || {});
    saveProgress({
      // Use an allowed lastStep value accepted by backend validator
      lastStep: 'review',
      stateSnapshot: { userData, spouses, children, allFinancialData, review: { declarationChecked, witnessChecked, witnessName, witnessAddress, witnessPhone } }
    }, key);
    scheduleServerSync(key, token);
  }, [userData, spouses, children, allFinancialData, declarationChecked, witnessChecked, witnessName, witnessAddress, witnessPhone, token]);

  // Ensure financial placeholders for each spouse/child even if they have no financial entries yet
  useEffect(() => {
    setPrefilled(prev => {
      if (!prev.userData) return prev;
      const existing = prev.allFinancialData || [];
      const ensureEntry = (type, name) => {
        const found = existing.find(e => e.type === type && e.name === name);
        if (found) return null;
        return { type, name, data: { declaration_date: prev.userData.declaration_date || '', period_start_date: prev.userData.period_start_date || '', period_end_date: prev.userData.period_end_date || '', biennial_income: [{ type:'', description:'', value:'' }], assets: [{ type:'', description:'', value:'' }], liabilities: [{ type:'', description:'', value:'' }], other_financial_info: '' } };
      };
      const additions = [];
      // user primary
      if (!existing.find(e => e.type === 'user')) {
        additions.push({ type: 'user', name: `${prev.userData.first_name||''} ${prev.userData.surname||''}`.trim() || 'You', data: { declaration_date: prev.userData.declaration_date || '', period_start_date: prev.userData.period_start_date || '', period_end_date: prev.userData.period_end_date || '', biennial_income: [{ type:'', description:'', value:'' }], assets: [{ type:'', description:'', value:'' }], liabilities: [{ type:'', description:'', value:'' }], other_financial_info: '' } });
      }
      prev.spouses.forEach(s => {
        const n = `${s.first_name||''} ${s.surname||''}`.trim() || 'Spouse';
        const add = ensureEntry('spouse', n);
        if (add) additions.push(add);
      });
      prev.children.forEach(c => {
        const n = `${c.first_name||''} ${c.surname||''}`.trim() || 'Child';
        const add = ensureEntry('child', n);
        if (add) additions.push(add);
      });
      if (!additions.length) return prev;
      return { ...prev, allFinancialData: [...existing, ...additions] };
    });
  }, [prefilled.spouses, prefilled.children, prefilled.userData]);

  // Financial totals summary (live preview)
  const summaryTotals = React.useMemo(() => {
    const totals = { income:0, assets:0, liabilities:0 };
    (prefilled.allFinancialData||[]).forEach(m => {
      (m.data?.biennial_income||[]).forEach(i => { const v=parseFloat(i.value); if(!isNaN(v)) totals.income+=v; });
      (m.data?.assets||[]).forEach(a => { const v=parseFloat(a.value); if(!isNaN(v)) totals.assets+=v; });
      (m.data?.liabilities||[]).forEach(l => { const v=parseFloat(l.value); if(!isNaN(v)) totals.liabilities+=v; });
    });
    totals.net = totals.assets - totals.liabilities;
    return totals;
  }, [prefilled.allFinancialData]);

  // --- PATCH helpers & save handlers ---
  const declarationId = editContext.declarationId;
  const diffObject = (before, after) => {
    const diff={}; if(!before) return after; const keys=new Set([...Object.keys(before), ...Object.keys(after)]);
    keys.forEach(k=>{ const a=after[k]; const b=before[k]; if (JSON.stringify(a)!==JSON.stringify(b)) diff[k]=a; }); return diff;
  };
  const handleSavePersonal = async () => {
    setSectionError(e=>({...e, personal:''})); setSectionSaving(s=>({...s, personal:true}));
    try {
      if(!userValidation.valid) throw new Error(userValidation.errors[0]);
      const original = snapshotRef.current.userData || {};
      const diff = diffObject(original, userData);
      const payload = {};
      if (diff.marital_status!==undefined) payload.marital_status = diff.marital_status;
      if (!Object.keys(payload).length) { setSectionEdit(se=>({...se, personal:false})); return; }
      await patchDeclarationFields(declarationId, payload, token);
      takeSnapshot('userData');
      setSectionEdit(se=>({...se, personal:false}));
    } catch(e){ setSectionError(er=>({...er, personal:e.message})); } finally { setSectionSaving(s=>({...s, personal:false})); }
  };
  const handleSaveSpouses = async () => {
    setSectionError(e=>({...e, spouses:''})); setSectionSaving(s=>({...s, spouses:true}));
    try {
      if(!spousesValidation.valid) throw new Error(spousesValidation.errors[0]);
      const cleaned = spouses.filter(s => (s.first_name||'').trim() || (s.other_names||'').trim() || (s.surname||'').trim());
      await patchDeclarationFields(declarationId, { spouses: cleaned }, token);
      takeSnapshot('spouses');
      setSectionEdit(se=>({...se, spouses:false}));
    } catch(e){ setSectionError(er=>({...er, spouses:e.message})); } finally { setSectionSaving(s=>({...s, spouses:false})); }
  };
  const handleSaveChildren = async () => {
    setSectionError(e=>({...e, children:''})); setSectionSaving(s=>({...s, children:true}));
    try {
      if(!childrenValidation.valid) throw new Error(childrenValidation.errors[0]);
      const cleaned = children.filter(c => (c.first_name||'').trim() || (c.other_names||'').trim() || (c.surname||'').trim());
      await patchDeclarationFields(declarationId, { children: cleaned }, token);
      takeSnapshot('children');
      setSectionEdit(se=>({...se, children:false}));
    } catch(e){ setSectionError(er=>({...er, children:e.message})); } finally { setSectionSaving(s=>({...s, children:false})); }
  };
  // Financial editing helpers
  const addRow = (memberIndex, collection) => {
    setPrefilled(prev => {
      const af=[...prev.allFinancialData]; const m={...af[memberIndex]}; const data={...m.data};
      data[collection] = [...(data[collection]||[]), { type:'', description:'', value:'' }];
      m.data=data; af[memberIndex]=m; return { ...prev, allFinancialData: af };
    });
  };
  const updateFinCell = (memberIndex, collection, rowIndex, field, value) => {
    setPrefilled(prev => {
      const af=[...prev.allFinancialData]; const m={...af[memberIndex]}; const data={...m.data};
      const rows=[...(data[collection]||[])]; rows[rowIndex]={ ...rows[rowIndex], [field]: value };
      data[collection]=rows; m.data=data; af[memberIndex]=m; return { ...prev, allFinancialData: af };
    });
  };
  const removeFinRow = (memberIndex, collection, rowIndex) => {
    setPrefilled(prev => {
      const af=[...prev.allFinancialData]; const m={...af[memberIndex]}; const data={...m.data};
      data[collection]=(data[collection]||[]).filter((_,i)=>i!==rowIndex); m.data=data; af[memberIndex]=m; return { ...prev, allFinancialData: af };
    });
  };
  const financialValidation = (m) => {
    const errs=[]; ['biennial_income','assets','liabilities'].forEach(col=>{
      (m.data[col]||[]).forEach((r,i)=>{ const any=r.description?.trim() || r.value?.toString().trim(); if (any){ if(!r.description?.trim()) errs.push(`${col} row ${i+1}: description required`); const num=parseFloat(r.value); if(isNaN(num)||num<0) errs.push(`${col} row ${i+1}: value must be >= 0`);} });
    }); return errs;
  };
  const handleSaveFinancialMember = async (memberIndex) => {
    setSectionError(e=>({...e, financial:''})); setSectionSaving(s=>({...s, financial:memberIndex}));
    try {
      const member = prefilled.allFinancialData[memberIndex]; const errs=financialValidation(member); if (errs.length) throw new Error(errs[0]);
      if (member.type==='user') {
        await patchDeclarationFields(declarationId, {
          biennial_income: member.data.biennial_income.filter(r=>r.description||r.value),
          assets: member.data.assets.filter(r=>r.description||r.value),
          liabilities: member.data.liabilities.filter(r=>r.description||r.value),
          other_financial_info: member.data.other_financial_info||''
        }, token);
      } else if (member.type==='spouse') {
        const spousesPayload = buildSpousesFinancialPayload();
        await patchDeclarationFields(declarationId, { spouses: spousesPayload }, token);
      } else if (member.type==='child') {
        const childrenPayload = buildChildrenFinancialPayload();
        await patchDeclarationFields(declarationId, { children: childrenPayload }, token);
      }
      setSectionEdit(se=>({...se, financialMember:null}));
    } catch(e){ setSectionError(er=>({...er, financial:e.message})); } finally { setSectionSaving(s=>({...s, financial:null})); }
  };

  // Auto persist on critical changes (debounced via simple timeout)
  const autoPersistRef = useRef();
  useEffect(() => {
    if (autoPersistRef.current) clearTimeout(autoPersistRef.current);
    autoPersistRef.current = setTimeout(() => persistDraft(), 800);
    return () => clearTimeout(autoPersistRef.current);
  }, [persistDraft]);

  const handleSubmit = async () => {
    setSubmitError('');
    if (!declarationChecked) {
      setSubmitError('You must confirm your declaration before submitting.');
      return;
    }
    if (!witnessChecked || !witnessName.trim() || !witnessAddress.trim() || !witnessPhone.trim()) {
      setSubmitError('Witness section must be completed and signed.');
      return;
    }
    // Declaration type normalization handled centrally now
    try {
      setIsSubmitting(true);
      // --- Persist any inline financial edits for existing declaration BEFORE final navigation ---
      if (isEditingExisting && declarationId && Array.isArray(allFinancialData)) {
        try {
          const userMember = allFinancialData.find(m=>m.type==='user');
          const rootPatch = userMember ? {
            biennial_income: (userMember.data?.biennial_income||[]).filter(r=>r.description||r.value),
            assets: (userMember.data?.assets||[]).filter(r=>r.description||r.value),
            liabilities: (userMember.data?.liabilities||[]).filter(r=>r.description||r.value),
            other_financial_info: userMember.data?.other_financial_info || ''
          } : {};
          const spousesPayload = buildSpousesFinancialPayload();
          const childrenPayload = buildChildrenFinancialPayload();
          // Always include spouses/children to ensure financial arrays persisted even if names unchanged
          await patchDeclarationFields(declarationId, { ...rootPatch, spouses: spousesPayload, children: childrenPayload }, token);
        } catch (persistErr) {
          console.warn('Inline final financial persist failed:', persistErr.message);
          // Do not block submission UI if financial persist fails; show warning
        }
      }
      const witness = { signed: witnessChecked && declarationChecked, name: witnessName.trim(), address: witnessAddress.trim(), phone: witnessPhone.trim() };
      const payload = modelToSubmissionPayload({
        model,
  userData: { ...userData, declaration_type: normalizeDeclarationType(userData?.declaration_type) },
        spouses,
        children,
        financialData: allFinancialData,
        witness
      });
      payload.signature_path = declarationChecked ? 1 : 0;
  const { valid, errors, normalizedType } = validateDeclarationPayload(payload);
  payload.declaration_type = normalizedType;
  if (!valid) throw new Error(errors.join('; '));
      if (payload.marital_status) payload.marital_status = payload.marital_status.toLowerCase();
      payload.declaration_date = toISODate(payload.declaration_date);
      payload.period_start_date = toISODate(payload.period_start_date);
      payload.period_end_date = toISODate(payload.period_end_date);
      if (payload.birthdate) payload.birthdate = toISODate(payload.birthdate);
      if (!payload.declaration_date) throw new Error('Declaration date is required before submission.');
      if (!payload.marital_status) throw new Error('Marital status is required.');
      if (!payload.declaration_type) throw new Error('Please select a valid declaration type (First, Biennial, or Final).');
      // (POST or PATCH distinction handled server-side via declarationId in query/context)
      // For now treat as final review submit just like ReviewPage.
      const key = deriveUserKey(userData || {});
      clearProgress(key);
      scheduleServerSync(key, token);
      navigate('/confirmation', { state: { declaration_type: payload.declaration_type } });
    } catch (e) {
      setSubmitError(e.message || 'Failed to submit declaration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!userData) {
    return <div className="container py-5"><p>Loading...</p></div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#eef5ff,#f2fff2)' }} className="py-5">
      <Container>
        <Row className="justify-content-center mb-3">
          <Col lg={10}>
            <div className="alert alert-info d-flex justify-content-between align-items-start" style={{ borderRadius: '10px' }}>
              <div>
                <strong>Edit Declaration</strong> — ID: <code>{editContext.declarationId}</code>
                {isLocked && <><br/><span className="badge bg-danger mt-2">Locked: One-time edit already used</span></>}
                {editContext.editInfo?.reason && (<><br />Reason: <em>{editContext.editInfo.reason}</em></>)}
              </div>
              <div className="d-flex gap-2">
                <Button size="sm" variant="outline-primary" onClick={() => navigate(appendDeclarationIdToPath('/edit-selection', editContext.declarationId), { state: { ...location.state } })}>Edit Reason</Button>
                <Button size="sm" variant="outline-secondary" onClick={() => navigate(appendDeclarationIdToPath('/review', editContext.declarationId), { state: { ...location.state } })}>Classic Review</Button>
                {savingState.busy ? (
                  <span className="badge bg-warning text-dark">Saving witness...</span>
                ) : savingState.last ? (
                  <span className="badge bg-success">Saved {savingState.mode} at {savingState.last.toLocaleTimeString()}</span>
                ) : null}
              </div>
            </div>
          </Col>
        </Row>
        <Row className="justify-content-center mb-4">
          <Col lg={10}>
            <Card className="shadow-sm border-0">
              <Card.Body className="py-3 d-flex flex-wrap gap-4">
                <div><strong>Total Income:</strong><br/><span className="text-success">Ksh {summaryTotals.income.toLocaleString()}</span></div>
                <div><strong>Total Assets:</strong><br/><span className="text-primary">Ksh {summaryTotals.assets.toLocaleString()}</span></div>
                <div><strong>Total Liabilities:</strong><br/><span className="text-danger">Ksh {summaryTotals.liabilities.toLocaleString()}</span></div>
                <div><strong>Net Worth:</strong><br/><span className={summaryTotals.net>=0? 'text-success':'text-danger'}>Ksh {summaryTotals.net.toLocaleString()}</span></div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
        <Row className="justify-content-center">
          <Col lg={10}>
            <Card className="shadow border-0">
              <Card.Body className="p-5">
                <div className="text-center mb-4">
                  <h2 className="fw-bold mb-1">Inline Edit & Review</h2>
                  <p className="text-muted mb-2">Modify sections directly, then submit.</p>
                  <ProgressBar now={90} className="mb-3" style={{ height: '6px' }} />
                </div>

                {/* Personal Information */}
                <Card className="mb-4">
                  <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">Personal Information</h5>
                    {!sectionEdit.personal ? (
                      <Button size="sm" variant="light" onClick={() => { takeSnapshot('userData'); setSectionEdit(s => ({ ...s, personal: true })); }} disabled={isLocked}>Edit</Button>
                    ) : (
                      <div className="d-flex gap-2">
                        <Button size="sm" variant="success" disabled={sectionSaving.personal || !userValidation.valid || isLocked} onClick={handleSavePersonal}>{sectionSaving.personal ? 'Saving...' : 'Save'}</Button>
                        <Button size="sm" variant="outline-light" onClick={() => { restoreSnapshot('userData'); setSectionEdit(s => ({ ...s, personal: false })); }}>Cancel</Button>
                      </div>
                    )}
                  </Card.Header>
                  <Card.Body>
                    {sectionError.personal && <Alert variant="danger" className="py-2 mb-3 small">{sectionError.personal}</Alert>}
                    {!sectionEdit.personal ? (
                      <Row>
                        <Col md={6}>
                          <p><strong>Name:</strong> {safe(userData.first_name)} {safe(userData.other_names)} {safe(userData.surname)}</p>
                          <p><strong>Email:</strong> {safe(userData.email)}</p>
                          <p><strong>Marital Status:</strong> {safe(userData.marital_status)}</p>
                        </Col>
                        <Col md={6}>
                          <p><strong>Birth Date:</strong> {toISODate(userData.birthdate)}</p>
                          <p><strong>Place of Birth:</strong> {safe(userData.place_of_birth)}</p>
                          <p><strong>Payroll Number:</strong> {safe(userData.payroll_number)}</p>
                          <p><strong>Department:</strong> {safe(userData.department)}</p>
                        </Col>
                      </Row>
                    ) : (
                      <Form>
                        <Row className="g-3">
                          <Col md={4}><Form.Group><Form.Label>First Name</Form.Label><Form.Control value={userData.first_name||''} isInvalid={sectionEdit.personal && !userData.first_name?.trim()} onChange={e=>updateUserField('first_name', e.target.value)} /></Form.Group></Col>
                          <Col md={4}><Form.Group><Form.Label>Other Names</Form.Label><Form.Control value={userData.other_names||''} onChange={e=>updateUserField('other_names', e.target.value)} /></Form.Group></Col>
                          <Col md={4}><Form.Group><Form.Label>Surname</Form.Label><Form.Control value={userData.surname||''} isInvalid={sectionEdit.personal && !userData.surname?.trim()} onChange={e=>updateUserField('surname', e.target.value)} /></Form.Group></Col>
                          <Col md={4}><Form.Group><Form.Label>Email</Form.Label><Form.Control type="email" value={userData.email||''} isInvalid={!!userData.email && !/^([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+)\.[A-Za-z]{2,}$/.test(userData.email)} onChange={e=>updateUserField('email', e.target.value)} /></Form.Group></Col>
                          <Col md={4}><Form.Group><Form.Label>Marital Status</Form.Label><Form.Control value={userData.marital_status||''} isInvalid={!userData.marital_status?.trim()} onChange={e=>updateUserField('marital_status', e.target.value)} /></Form.Group></Col>
                          <Col md={4}><Form.Group><Form.Label>Birth Date</Form.Label><Form.Control type="date" value={userData.birthdate||''} onChange={e=>updateUserField('birthdate', e.target.value)} /></Form.Group></Col>
                          <Col md={4}><Form.Group><Form.Label>Place of Birth</Form.Label><Form.Control value={userData.place_of_birth||''} onChange={e=>updateUserField('place_of_birth', e.target.value)} /></Form.Group></Col>
                          <Col md={4}><Form.Group><Form.Label>Payroll Number</Form.Label><Form.Control value={userData.payroll_number||''} onChange={e=>updateUserField('payroll_number', e.target.value)} /></Form.Group></Col>
                          <Col md={4}><Form.Group><Form.Label>Department</Form.Label><Form.Control value={userData.department||''} onChange={e=>updateUserField('department', e.target.value)} /></Form.Group></Col>
                        </Row>
                      </Form>
                    )}
                  </Card.Body>
                </Card>

                {/* Spouses */}
                <Card className="mb-4">
                  <Card.Header className="bg-success text-white d-flex justify-content-between align-items-center">
                    <h5 className="mb-0 d-flex align-items-center gap-2">Spouse(s) <span className="badge bg-light text-dark">{displaySpouses.length}</span></h5>
                    {!sectionEdit.spouses ? (
                      <Button size="sm" variant="light" onClick={() => { takeSnapshot('spouses'); setSectionEdit(s => ({ ...s, spouses: true })); }} disabled={isLocked}>Edit</Button>
                    ) : (
                      <div className="d-flex gap-2">
                        <Button size="sm" variant="success" disabled={sectionSaving.spouses || !spousesValidation.valid || isLocked} onClick={handleSaveSpouses}>{sectionSaving.spouses ? 'Saving...' : 'Save'}</Button>
                        <Button size="sm" variant="outline-light" onClick={() => { restoreSnapshot('spouses'); setSectionEdit(s => ({ ...s, spouses: false })); }}>Cancel</Button>
                      </div>
                    )}
                  </Card.Header>
                  <Card.Body>
                    {sectionError.spouses && <Alert variant="danger" className="py-2 mb-3 small">{sectionError.spouses}</Alert>}
                    {!sectionEdit.spouses ? (
                      displaySpouses.length ? displaySpouses.map((s,i)=>(<div key={i} className="mb-2"><strong>Name:</strong> {s.full_name || `${s.first_name} ${s.other_names||''} ${s.surname}`}</div>)) : (
                        spouses.length > 0 ? (
                          <p className="text-warning mb-0 small">Spouse entries exist but names are incomplete. Click Edit to complete them.</p>
                        ) : <p className="text-muted mb-0">No spouse information.</p>
                      )
                    ) : (
                      <div>
                        {spouses.map((s,i)=>(
                          <Row key={i} className="g-2 align-items-end mb-2">
                            <Col md={3}><Form.Control placeholder="First" value={s.first_name||''} onChange={e=>updateSpouseField(i,'first_name',e.target.value)} /></Col>
                            <Col md={3}><Form.Control placeholder="Other" value={s.other_names||''} onChange={e=>updateSpouseField(i,'other_names',e.target.value)} /></Col>
                            <Col md={3}><Form.Control placeholder="Surname" value={s.surname||''} onChange={e=>updateSpouseField(i,'surname',e.target.value)} /></Col>
                            <Col md={2}><Button variant="outline-danger" size="sm" onClick={()=>removeSpouse(i)}>Remove</Button></Col>
                          </Row>
                        ))}
                        <Button size="sm" variant="outline-primary" onClick={addSpouse}>Add Spouse</Button>
                      </div>
                    )}
                  </Card.Body>
                </Card>

                {/* Children */}
                <Card className="mb-4">
                  <Card.Header className="bg-warning d-flex justify-content-between align-items-center">
                    <h5 className="mb-0 d-flex align-items-center gap-2">Children <span className="badge bg-dark bg-opacity-25 text-dark">{displayChildren.length}</span></h5>
                    {!sectionEdit.children ? (
                      <Button size="sm" variant="light" onClick={() => { takeSnapshot('children'); setSectionEdit(s => ({ ...s, children: true })); }} disabled={isLocked}>Edit</Button>
                    ) : (
                      <div className="d-flex gap-2">
                        <Button size="sm" variant="success" disabled={sectionSaving.children || !childrenValidation.valid || isLocked} onClick={handleSaveChildren}>{sectionSaving.children ? 'Saving...' : 'Save'}</Button>
                        <Button size="sm" variant="outline-light" onClick={() => { restoreSnapshot('children'); setSectionEdit(s => ({ ...s, children: false })); }}>Cancel</Button>
                      </div>
                    )}
                  </Card.Header>
                  <Card.Body>
                    {sectionError.children && <Alert variant="danger" className="py-2 mb-3 small">{sectionError.children}</Alert>}
                    {!sectionEdit.children ? (
                      displayChildren.length ? displayChildren.map((c,i)=>(<div key={i} className="mb-2"><strong>Name:</strong> {c.full_name || `${c.first_name} ${c.other_names||''} ${c.surname}`}</div>)) : (
                        children.length > 0 ? (
                          <p className="text-warning mb-0 small">Child entries exist but names are incomplete. Click Edit to complete them.</p>
                        ) : <p className="text-muted mb-0">No children information.</p>
                      )
                    ) : (
                      <div>
                        {children.map((c,i)=>(
                          <Row key={i} className="g-2 align-items-end mb-2">
                            <Col md={3}><Form.Control placeholder="First" value={c.first_name||''} onChange={e=>updateChildField(i,'first_name',e.target.value)} /></Col>
                            <Col md={3}><Form.Control placeholder="Other" value={c.other_names||''} onChange={e=>updateChildField(i,'other_names',e.target.value)} /></Col>
                            <Col md={3}><Form.Control placeholder="Surname" value={c.surname||''} onChange={e=>updateChildField(i,'surname',e.target.value)} /></Col>
                            <Col md={2}><Button variant="outline-danger" size="sm" onClick={()=>removeChild(i)}>Remove</Button></Col>
                          </Row>
                        ))}
                        <Button size="sm" variant="outline-primary" onClick={addChild}>Add Child</Button>
                      </div>
                    )}
                  </Card.Body>
                </Card>

                {/* Financial Section with inline editing */}
                <Card className="mb-4">
                  <Card.Header className="bg-info text-white d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">Financial Information</h5>
                    <div className="d-flex gap-2">
                      <Button size="sm" variant="light" onClick={() => {
                        const path = appendDeclarationIdToPath('/financial-form', editContext.declarationId);
                        navigate(path, { state: { ...location.state, allFinancialData } });
                      }}>Full Screen Editor</Button>
                    </div>
                  </Card.Header>
                  <Card.Body>
                    {sectionError.financial && <Alert variant="danger" className="py-2 mb-3 small">{sectionError.financial}</Alert>}
                    {(!allFinancialData || !allFinancialData.length) && <p className="text-muted mb-0">No financial data provided.</p>}
                    {allFinancialData && allFinancialData.map((member,i)=>{
                      const editing = sectionEdit.financialMember === i;
                      return (
                        <Card key={i} className="mb-3 border">
                          <Card.Header className="d-flex justify-content-between align-items-center">
                            <div>
                              <strong>{member.name}</strong> {member.type==='user' && '(You)'} <small className="text-muted ms-2">{member.type}</small>
                            </div>
                            {!editing ? (
                              <Button size="sm" variant="outline-primary" onClick={()=> setSectionEdit(se=>({...se, financialMember:i}))} disabled={isLocked}>Edit</Button>
                            ) : (
                              <div className="d-flex gap-2">
                                <Button size="sm" variant="success" disabled={sectionSaving.financial===i || isLocked} onClick={()=>handleSaveFinancialMember(i)}>{sectionSaving.financial===i ? 'Saving...' : 'Save'}</Button>
                                <Button size="sm" variant="outline-secondary" onClick={()=> setSectionEdit(se=>({...se, financialMember:null}))}>Cancel</Button>
                              </div>
                            )}
                          </Card.Header>
                          <Card.Body>
                            <small className="text-muted d-block mb-2">Declaration Date: {toISODate(member.data?.declaration_date)} | Period: {toISODate(member.data?.period_start_date)} – {toISODate(member.data?.period_end_date)}</small>
                            {!editing && (
                              <div className="row">
                                <div className="col-md-4">
                                  <strong>Income</strong>
                                  <ul className="small mb-0 mt-2 list-unstyled">
                                    {(member.data?.biennial_income||[])
                                      .filter(r=> (r.description||'').trim() || r.value)
                                      .map((r,ri)=>(
                                        <li key={ri}>{r.description || r.type || '—'}: <span className="text-success">Ksh {parseFloat(r.value||0).toLocaleString()}</span></li>
                                      ))}
                                  </ul>
                                </div>
                                <div className="col-md-4">
                                  <strong className="d-flex align-items-center gap-2">Assets <button type="button" className="btn btn-link btn-sm p-0" onClick={()=> setSectionEdit(se=>({...se, financialMember:i}))} title="Edit assets"><i className="fas fa-pen"></i></button></strong>
                                  <ul className="small mb-0 mt-2 list-unstyled">
                                    {(member.data?.assets||[])
                                      .filter(r=> getAssetDescription(r) || r.value)
                                      .map((r,ri)=>{ const desc=getAssetDescription(r); const typeLabel = (r.type === 'Other' && r.asset_other_type) ? r.asset_other_type : (r.type || ''); return (
                                        <li key={ri}>{typeLabel}{desc?': ':''}{desc}<span className="text-primary ms-1">Ksh {parseFloat(r.value||0).toLocaleString()}</span></li>
                                      ); })}
                                  </ul>
                                </div>
                                <div className="col-md-4">
                                  <strong className="d-flex align-items-center gap-2">Liabilities <button type="button" className="btn btn-link btn-sm p-0" onClick={()=> setSectionEdit(se=>({...se, financialMember:i}))} title="Edit liabilities"><i className="fas fa-pen"></i></button></strong>
                                  <ul className="small mb-0 mt-2 list-unstyled">
                                    {(member.data?.liabilities||[])
                                      .filter(r=> getLiabilityLabel(r) || r.value)
                                      .map((r,ri)=>{ const label=getLiabilityLabel(r); return (
                                        <li key={ri}>{r.type || ''}{label?': ':''}{label}<span className="text-danger ms-1">Ksh {parseFloat(r.value||0).toLocaleString()}</span></li>
                                      ); })}
                                  </ul>
                                </div>
                              </div>
                            )}
                            {editing && (
                              <div>
                                {['biennial_income','assets','liabilities'].map(collection => (
                                  <div key={collection} className="mb-3">
                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                      <strong className="text-capitalize">{collection.replace('_',' ')}</strong>
                                      <Button size="sm" variant="outline-secondary" onClick={()=>addRow(i, collection)}>Add Row</Button>
                                    </div>
                                    <Table size="sm" responsive bordered className="mb-1">
                                      <thead><tr><th style={{width:'25%'}}>Type</th><th>Description</th><th style={{width:'18%'}}>Value (Ksh)</th><th style={{width:'1%'}}></th></tr></thead>
                                      <tbody>
                                        {(member.data?.[collection]||[]).map((row,ri)=>(
                                          <tr key={ri}>
                                            <td><Form.Control value={row.type||''} onChange={e=>updateFinCell(i, collection, ri, 'type', e.target.value)} placeholder="Category" /></td>
                                            <td><Form.Control value={row.description||''} onChange={e=>updateFinCell(i, collection, ri, 'description', e.target.value)} isInvalid={row.value && !row.description} placeholder="Description" /></td>
                                            <td><Form.Control value={row.value||''} onChange={e=>updateFinCell(i, collection, ri, 'value', e.target.value)} isInvalid={row.value!=='' && (isNaN(parseFloat(row.value)) || parseFloat(row.value)<0)} placeholder="0" /></td>
                                            <td><Button variant="outline-danger" size="sm" onClick={()=>removeFinRow(i, collection, ri)}>&times;</Button></td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </Table>
                                  </div>
                                ))}
                                <Form.Group className="mb-3">
                                  <Form.Label>Additional Information</Form.Label>
                                  <Form.Control as="textarea" rows={2} value={member.data.other_financial_info||''} onChange={e=> setPrefilled(prev=>{ const af=[...prev.allFinancialData]; const m={...af[i]}; m.data={...m.data, other_financial_info:e.target.value}; af[i]=m; return { ...prev, allFinancialData: af }; }) } placeholder="Notes" />
                                </Form.Group>
                              </div>
                            )}
                          </Card.Body>
                        </Card>
                      );
                    })}
                  </Card.Body>
                </Card>

                {/* Declaration & Witness */}
                <Card className="mb-4">
                  <Card.Header className="bg-warning text-dark"><h5 className="mb-0">Declaration</h5></Card.Header>
                  <Card.Body>
                    <div className="alert alert-light border-start border-warning border-4 ps-4">
                      <Form.Check type="checkbox" id="declCheck" checked={declarationChecked} onChange={e=>setDeclarationChecked(e.target.checked)} className="mb-2" disabled={isLocked} />
                      <p className="mb-0 small">I declare that the information provided is true and complete to the best of my knowledge.</p>
                    </div>
                  </Card.Body>
                </Card>

                <Card className="mb-4">
                  <Card.Header className="bg-info text-white"><h5 className="mb-0">Witness</h5></Card.Header>
                  <Card.Body>
                    <Form.Check type="checkbox" id="witCheck" checked={witnessChecked} onChange={e=>setWitnessChecked(e.target.checked)} className="mb-3" label="Witness Signature (Check to sign)" disabled={isLocked} />
                    <Row className="g-3">
                      <Col md={4}><Form.Group><Form.Label>Name</Form.Label><Form.Control value={witnessName} onChange={e=>setWitnessName(e.target.value)} disabled={isLocked} /></Form.Group></Col>
                      <Col md={4}><Form.Group><Form.Label>Phone</Form.Label><Form.Control value={witnessPhone} onChange={e=>setWitnessPhone(e.target.value)} disabled={isLocked} /></Form.Group></Col>
                      <Col md={4}><Form.Group><Form.Label>Address</Form.Label><Form.Control value={witnessAddress} onChange={e=>setWitnessAddress(e.target.value)} disabled={isLocked} /></Form.Group></Col>
                    </Row>
                  </Card.Body>
                </Card>

                {submitError && <Alert variant="danger" className="mb-4">{submitError}</Alert>}

                <div className="d-flex justify-content-between">
                  <Button variant="outline-secondary" onClick={() => navigate(-1)} disabled={isSubmitting}>Back</Button>
                  <div className="d-flex gap-2">
                    <Button variant="outline-primary" onClick={persistDraft} disabled={isSubmitting || isLocked}>Save Draft</Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting || isLocked} className="fw-semibold" style={{ minWidth: '180px' }}>
                      {isLocked ? 'Locked' : (isSubmitting ? 'Submitting…' : 'Submit Declaration')}
                    </Button>
                  </div>
                </div>

              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

const EditDeclarationPage = () => {
  const { declarationId } = getEditContext({ locationState: null, locationSearch: window.location.search });
  return (
    <DeclarationSessionProvider declarationId={declarationId}>
      <InlineEditReviewInner />
    </DeclarationSessionProvider>
  );
};

export default EditDeclarationPage;
