import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toISODate } from '../util/date';
import { modelToSubmissionPayload } from '../models/submissionTransformer';
import { validateDeclarationPayload } from '../util/validateDeclarationPayload';
import { normalizeDeclarationType } from '../util/normalizeDeclarationType';
import { useLocation, useNavigate } from 'react-router-dom';
import { Container, Row, Col, Card, Button, ProgressBar, Alert, Form } from 'react-bootstrap';
import { patchDeclarationFields } from '../api/patchDeclaration';
import { loadProgress, deriveUserKey } from '../utilis/persistProgress';
import { DeclarationSessionProvider, useDeclarationSession, useDebouncedPatch } from '../context/DeclarationSessionContext';
import { getEditContext, appendDeclarationIdToPath } from '../utilis/editContext';
import { saveProgress, clearProgress, scheduleServerSync, markProgressSuppressed } from '../utilis/persistProgress';
import { deleteProgress as deleteServerProgress } from '../api';

const ReviewPageInner = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [declarationChecked, setDeclarationChecked] = useState(false);
  const [witnessChecked, setWitnessChecked] = useState(false);
  const [witnessName, setWitnessName] = useState('');
  const [witnessAddress, setWitnessAddress] = useState('');
  const [witnessPhone, setWitnessPhone] = useState('');
  const token = localStorage.getItem('token');
  const { model, savingState } = useDeclarationSession();
  const editContext = getEditContext({ locationState: location.state, locationSearch: location.search });
  const isEditingExisting = !!editContext.declarationId;
  const [toast, setToast] = useState({ show: false, variant: 'info', message: '' });
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [baselineSerialized, setBaselineSerialized] = useState('');
  const initialContext = getEditContext({ locationState: location.state, locationSearch: location.search });
  const initialState = location.state || {};
  const [prefilled, setPrefilled] = useState({
    userData: initialState.userData || initialState.profile || null,
    spouses: initialState.spouses || [],
    children: initialState.children || [],
    allFinancialData: initialState.allFinancialData || []
  });

  function getAssetDescription(item = {}) {
    const fields = [item.description, item.asset_other_type, item.make, item.model, item.licence_no, item.title_deed, item.location];
    return fields.filter(Boolean).join(', ');
  }
  function getLiabilityLabel(item = {}) {
    if (!item) return '';
    if (item.description === 'Other' && item.liability_other_description) return item.liability_other_description;
    if ((!item.description || !item.description.trim()) && item.liability_other_description) return item.liability_other_description;
    return item.description || item.liability_other_description || '';
  }

  const stableSerialize = useCallback(() => {
    return JSON.stringify({
      declarationChecked,
      witnessChecked,
      witnessName: witnessName.trim(),
      witnessAddress: witnessAddress.trim(),
      witnessPhone: witnessPhone.trim()
    });
  }, [declarationChecked, witnessChecked, witnessName, witnessAddress, witnessPhone]);
  const userData = prefilled.userData;
  const spouses = prefilled.spouses;
  const children = prefilled.children;
  const allFinancialData = prefilled.allFinancialData;

  useEffect(() => {
    if (location.state && Array.isArray(location.state.allFinancialData)) {
      const incoming = location.state.allFinancialData;
      if (incoming !== prefilled.allFinancialData) {
        try {
          const prevSer = JSON.stringify(prefilled.allFinancialData || []);
          const nextSer = JSON.stringify(incoming);
          if (prevSer !== nextSer) {
            setPrefilled(prev => ({ ...prev, allFinancialData: incoming }));
          }
        } catch (_) {
          setPrefilled(prev => ({ ...prev, allFinancialData: incoming }));
        }
      }
    }
  }, [location.state, prefilled.allFinancialData]);

  useEffect(() => {
    if (userData && !baselineSerialized) {
      setBaselineSerialized(stableSerialize());
    }
  }, [userData, baselineSerialized, stableSerialize]);

  const currentSerialized = stableSerialize();
  const hasUnsaved = baselineSerialized && currentSerialized !== baselineSerialized;
  const [manualSaving, setManualSaving] = useState(false);

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
        setPrefilled(prev => ({ ...prev, userData: userMapped, spouses: sps, children: ch, allFinancialData: fin }));
        setWitnessChecked(model.witness.signed);
        setWitnessName(model.witness.name);
        setWitnessAddress(model.witness.address);
        setWitnessPhone(model.witness.phone);
      })();
    }
  }, [model]);

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

  const saveTimeout = useRef();
  const lastSaved = useRef(0);
  const autosaveDraft = useCallback(async () => {
    if (!userData || !hasUnsaved) return;
    const draftData = {
      declarationChecked,
      witnessChecked,
      witnessName,
      witnessAddress,
      witnessPhone
    };
    const optimistic = currentSerialized;
    setBaselineSerialized(optimistic);
    setToast({ show: true, variant: 'info', message: 'Saving draft...' });
    try {
      setLastSavedAt(new Date());
      setToast({ show: true, variant: 'success', message: 'Saved.' });
      const key = deriveUserKey(userData || {});
      saveProgress({
        lastStep: 'review',
        stateSnapshot: { userData, spouses, children, allFinancialData, review: draftData }
      }, key);
      scheduleServerSync(key, token);
    } catch (e) {
      console.error('Draft autosave failed:', e);
      setBaselineSerialized('');
      setToast({ show: true, variant: 'danger', message: 'Save failed.' });
    }
  }, [userData, hasUnsaved, declarationChecked, witnessChecked, witnessName, witnessAddress, witnessPhone, token, currentSerialized, spouses, children, allFinancialData]);

  // Manual save (forces a draft save regardless of debounce)
  const handleManualSave = async () => {
    if (!userData || !hasUnsaved || manualSaving) return;
    setManualSaving(true);
    const draftData = {
      declarationChecked,
      witnessChecked,
      witnessName,
      witnessAddress,
      witnessPhone
    };
    const optimistic = currentSerialized;
    setBaselineSerialized(optimistic);
    setToast({ show: true, variant: 'info', message: 'Saving draft...' });
    try {
      setLastSavedAt(new Date());
      setToast({ show: true, variant: 'success', message: 'Saved.' });
      const key = deriveUserKey(userData || {});
      saveProgress({
        lastStep: 'review',
        stateSnapshot: { userData, spouses, children, allFinancialData, review: draftData }
      }, key);
      scheduleServerSync(key, token);
    } catch (e) {
      console.error('Manual draft save failed:', e);
      setBaselineSerialized('');
      setToast({ show: true, variant: 'danger', message: 'Save failed.' });
    } finally {
      setManualSaving(false);
    }
  };

  // Autosave on declaration/witness change
  useEffect(() => {
    if (!hasUnsaved) return; 
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    const now = Date.now();
    const timeSinceLastSave = now - lastSaved.current;
    const delay = 800;
    if (timeSinceLastSave > delay) {
      autosaveDraft();
      lastSaved.current = now;
    } else {
      saveTimeout.current = setTimeout(() => {
        autosaveDraft();
        lastSaved.current = Date.now();
      }, delay - timeSinceLastSave);
    }
    return () => clearTimeout(saveTimeout.current);
  }, [hasUnsaved, declarationChecked, witnessChecked, witnessName, witnessAddress, witnessPhone, autosaveDraft]);

  // Helper function to safely render data
  const safeRender = (data) => {
    if (data === null || data === undefined) return 'Not provided';
    if (typeof data === 'object') {
      if (data.value !== undefined) return data.value;
      if (data.description !== undefined) return data.description;
      return JSON.stringify(data);
    }
    return String(data);
  };

  if (process.env.NODE_ENV !== 'production') {
    if (!window.__reviewLogCount) window.__reviewLogCount = 0;
    if (window.__reviewLogCount < 20) { // cap to first 20 renders
      console.log('ReviewPage data:', { userData, spouses, children, allFinancialData });
      window.__reviewLogCount += 1;
    }
  }

  const handleSubmit = async () => {
  setIsSubmitting(true);
  setSubmitError('');
    try {
      // Final guard: ensure profile required fields are present before submission
      const requiredProfileFields = ['surname','first_name','other_names','birthdate','place_of_birth','marital_status','physical_address','email','phone_number','national_id','payroll_number','designation','sub_department','department','nature_of_employment'];
      const missingProfile = requiredProfileFields.filter(f => {
        const val = userData && userData[f];
        return !val || (typeof val === 'string' && !val.trim());
      });
      if (missingProfile.length) {
        throw new Error('Profile incomplete. Missing: ' + missingProfile.join(', '));
      }

        const witness = {
        signed: witnessChecked && declarationChecked,
        name: witnessName.trim(),
        address: witnessAddress.trim(),
        phone: witnessPhone.trim()
      };
      // Ensure we have financial data; if lost (navigation state cleared), attempt recovery from local persisted progress
      let effectiveFinancialData = allFinancialData;
      if ((!effectiveFinancialData || !effectiveFinancialData.length) && userData) {
        try {
          const progress = loadProgress(deriveUserKey(userData));
          if (progress?.stateSnapshot?.allFinancialData?.length) {
            effectiveFinancialData = progress.stateSnapshot.allFinancialData;
            console.warn('[ReviewPage] Recovered financial data from local progress store for initial submission.');
          }
        } catch (e) {}
      }
      // Guarantee a user financial member exists for initial submission
      if (isEditingExisting === false) {
        const hasUserMember = Array.isArray(effectiveFinancialData) && effectiveFinancialData.some(m => m.type === 'user');
        if (!hasUserMember) {
          const synthesized = {
            type: 'user',
            name: `${userData.first_name || ''} ${userData.surname || ''}`.trim() || 'User',
            data: {
              declaration_date: userData.declaration_date || '',
              period_start_date: userData.period_start_date || '',
              period_end_date: userData.period_end_date || '',
              biennial_income: [{ type:'', description:'', value:'' }],
              assets: [{ type:'', description:'', value:'' }],
              liabilities: [{ type:'', description:'', value:'' }],
              other_financial_info: ''
            }
          };
          effectiveFinancialData = [synthesized, ...(effectiveFinancialData || [])];
          console.warn('[ReviewPage] Synthesized missing user financial member for initial submission.');
        }
      }
      let payload = modelToSubmissionPayload({
        model, 
        userData: { ...userData, declaration_type: normalizeDeclarationType(userData?.declaration_type) },
        spouses,
        children,
        financialData: effectiveFinancialData,
        witness
      });
      // If declaration_type is missing or not canonical, try recover from sessionStorage
      try {
        const raw = sessionStorage.getItem('declarationPeriod');
        if (raw) {
          const stored = JSON.parse(raw);
          const fallback = stored?.declaration_type || stored?.declarationType || '';
          const canonical = normalizeDeclarationType(payload.declaration_type || fallback);
          payload.declaration_type = canonical;
        } else {
          payload.declaration_type = normalizeDeclarationType(payload.declaration_type);
        }
      } catch (_) {
        payload.declaration_type = normalizeDeclarationType(payload.declaration_type);
      }
       payload.signature_path = declarationChecked ? 1 : 0;
       const { valid, errors, normalizedType } = validateDeclarationPayload(payload);
       payload.declaration_type = normalizedType;
      if (!valid) {
        throw new Error(errors.join('; '));
      }
      if (payload.marital_status) payload.marital_status = payload.marital_status.toLowerCase();
      payload.declaration_date = toISODate(payload.declaration_date);
      payload.period_start_date = toISODate(payload.period_start_date);
      payload.period_end_date = toISODate(payload.period_end_date);
      if (payload.birthdate) payload.birthdate = toISODate(payload.birthdate);
      if (!payload.declaration_date) {
        throw new Error('Declaration date is required before submission. Please return and set it.');
      }
      payload.witness = {
        signed: !!payload.witness_signed,
        name: payload.witness_name,
        address: payload.witness_address,
        phone: payload.witness_phone
      };

    // Extract user's financial data (find by type for robustness)
    const userMember = Array.isArray(allFinancialData) ? allFinancialData.find(m => m.type === 'user') : null;
    const userFinancialData = userMember?.data || {};

      let totalBiennialIncome = 0;
      if (userFinancialData?.biennial_income && Array.isArray(userFinancialData.biennial_income)) {
        totalBiennialIncome = userFinancialData.biennial_income.reduce((sum, item) => {
          const val = parseFloat(item.value);
          return sum + (isNaN(val) ? 0 : val);
        }, 0);
      }
      // Fallback if not array, try direct value
      if (!totalBiennialIncome && userFinancialData?.biennial_income && typeof userFinancialData.biennial_income === 'string') {
        const val = parseFloat(userFinancialData.biennial_income);
        totalBiennialIncome = isNaN(val) ? 0 : val;
      }
      if (!payload.marital_status) {
        throw new Error('Marital status is required.');
      }
      if (!payload.declaration_type) {
        throw new Error('Please select a valid declaration type (First, Biennial, or Final).');
      }
      if (payload.declaration_type === 'Biennial') {
  const decISO = toISODate(userFinancialData?.declaration_date) || '';
        if (decISO) {
          const dObj = new Date(decISO);
          const year = dObj.getFullYear();
            const month = dObj.getMonth() + 1;
            const day = dObj.getDate();
            const windowOk = year >= 2025 && year % 2 === 1 && ((month === 11 && day >= 1) || (month === 12 && day <= 31));
            if (!windowOk) {
              throw new Error('Biennial declaration only allowed Nov 1 - Dec 31 of an odd year starting 2025.');
            }
        }
      }
      
      const pruneRows = (arr=[]) => arr.filter(r => r && (String(r.description||'').trim() || String(r.value||'').trim()));
      payload.biennial_income = pruneRows(payload.biennial_income);
      payload.assets = pruneRows(payload.assets);
      payload.liabilities = pruneRows(payload.liabilities);
      payload.spouses = (payload.spouses||[]).map(s => ({
        ...s,
        biennial_income: pruneRows(s.biennial_income),
        assets: pruneRows(s.assets),
        liabilities: pruneRows(s.liabilities)
      }));
      payload.children = (payload.children||[]).map(c => ({
        ...c,
        biennial_income: pruneRows(c.biennial_income),
        assets: pruneRows(c.assets),
        liabilities: pruneRows(c.liabilities)
      }));
      if (!isEditingExisting) {
        const authToken = localStorage.getItem('token');
        if (!authToken) throw new Error('Authentication expired. Please log in again.');
        // Best-effort: upsert user's profile before submitting the declaration so details persist to DB
        try {
          const profileUpdate = {};
          const pick = (key, val) => {
            if (val === undefined || val === null) return;
            const s = typeof val === 'string' ? val.trim() : val;
            if (s === '') return; // avoid overwriting with empty strings
            profileUpdate[key] = s;
          };
          const source = userData || model?.profile || {};
          pick('surname', source.surname);
          pick('first_name', source.first_name);
          pick('other_names', source.other_names);
          pick('birthdate', toISODate(source.birthdate));
          pick('place_of_birth', source.place_of_birth);
          pick('marital_status', source.marital_status);
          pick('postal_address', source.postal_address);
          pick('physical_address', source.physical_address);
          pick('email', source.email);
          pick('payroll_number', source.payroll_number);
          pick('designation', source.designation);
          pick('department', source.department);
          pick('sub_department', source.sub_department);
          pick('nature_of_employment', source.nature_of_employment || source.employment_nature);
          pick('phone_number', source.phone_number);
          if (Object.keys(profileUpdate).length) {
            await axios.put('/api/auth/me', profileUpdate, { headers: { Authorization: `Bearer ${authToken}` } });
          }
        } catch (profileErr) {
          // Do not block submission if profile upsert fails; log and continue
          console.warn('Profile update before submission failed:', profileErr?.response?.data || profileErr.message);
        }
        const res = await axios.post('/api/declarations', payload, { headers: { Authorization: `Bearer ${authToken}` } });
        if (!res.data?.success) {
          throw new Error(res.data?.message || 'Server did not confirm declaration save.');
        }
        } else {
        try {
          const declarationId = editContext.declarationId;
          if (declarationId) {
            // Build root financial patch
            const rootPatch = {
              biennial_income: (userFinancialData.biennial_income || []).filter(r => r && (r.description || r.value)),
              assets: (userFinancialData.assets || []).filter(r => r && (r.description || r.value)),
              liabilities: (userFinancialData.liabilities || []).filter(r => r && (r.description || r.value)),
              other_financial_info: userFinancialData.other_financial_info || ''
            };
            // Helper to locate financial member for a spouse/child
            const findFinFor = (type, s) => {
              const simpleName = `${(s.first_name||'').trim()} ${(s.surname||'').trim()}`.trim();
              return (allFinancialData||[]).find(f => f.type === type && (f.name === s.full_name || f.name === simpleName));
            };
            const spousesPayload = (spouses||[]).map(s => {
              const fin = findFinFor('spouse', s);
              return {
                first_name: s.first_name || '',
                other_names: s.other_names || '',
                surname: s.surname || '',
                biennial_income: fin ? (fin.data?.biennial_income||[]).filter(r=>r && (r.description||r.value)) : [],
                assets: fin ? (fin.data?.assets||[]).filter(r=>r && (r.description||r.value)) : [],
                liabilities: fin ? (fin.data?.liabilities||[]).filter(r=>r && (r.description||r.value)) : [],
                other_financial_info: fin ? (fin.data?.other_financial_info||'') : ''
              };
            });
            const childrenPayload = (children||[]).map(c => {
              const fin = findFinFor('child', c);
              return {
                first_name: c.first_name || '',
                other_names: c.other_names || '',
                surname: c.surname || '',
                biennial_income: fin ? (fin.data?.biennial_income||[]).filter(r=>r && (r.description||r.value)) : [],
                assets: fin ? (fin.data?.assets||[]).filter(r=>r && (r.description||r.value)) : [],
                liabilities: fin ? (fin.data?.liabilities||[]).filter(r=>r && (r.description||r.value)) : [],
                other_financial_info: fin ? (fin.data?.other_financial_info||'') : ''
              };
            });
            await patchDeclarationFields(declarationId, { ...rootPatch, spouses: spousesPayload, children: childrenPayload }, token);
          }
        } catch (finPersistErr) {
          console.warn('Final financial persistence (review page) failed:', finPersistErr.message);
        }
      }
      const key = deriveUserKey(userData || {});
      clearProgress(key);
      try {
        // Ensure server-side backup is removed after submission so the in-progress banner disappears
        await deleteServerProgress(key, token);
      } catch (_) { /* ignore delete failure; the submitted declaration is persisted separately */ }
      // Prevent immediate re-fetch of stale server progress on landing
      markProgressSuppressed(key);
      navigate('/confirmation', { state: { declaration_type: payload.declaration_type } });
    } catch (error) {
      // Surface server-provided message if available
      const serverMsg = error?.response?.data?.message;
      setSubmitError(serverMsg || error.message || 'Failed to submit declaration. Please try again.');
      console.error('Submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if data exists before rendering (simple loading state)
  if (!userData) {
    return <div className="container py-5"><p>Loading...</p></div>;
  }

  // Helper to filter valid spouses/children
  const validSpouses = spouses ? spouses.filter(s => s.first_name?.trim() || s.other_name?.trim() || s.surname?.trim()) : [];
  const validChildren = children ? children.filter(c => c.first_name?.trim() || c.other_name?.trim() || c.surname?.trim()) : [];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #e3f2fd 0%, #e8f5e8 100%)' }} 
         className="py-5">
      <Container>
        {toast.show && (
          <div className={`alert alert-${toast.variant} shadow-sm`} style={{ borderRadius: '10px' }}>
            <div className="d-flex justify-content-between align-items-center">
              <span>{toast.message} {lastSavedAt && toast.variant === 'success' && (<small className="text-muted">(at {lastSavedAt.toLocaleTimeString()})</small>)}</span>
              <button type="button" className="btn-close" aria-label="Close" onClick={() => setToast(t => ({ ...t, show: false }))}></button>
            </div>
          </div>
        )}
        {isEditingExisting && (
          <div className="d-flex justify-content-end mb-3 small">
            {savingState.busy ? (
              <span className="badge bg-warning text-dark">Saving witness...</span>
            ) : savingState.last ? (
              <span className="badge bg-success">Saved {savingState.mode} at {savingState.last.toLocaleTimeString()}</span>
            ) : null}
          </div>
        )}
        {initialContext.declarationId && (
          <Row className="justify-content-center mb-3">
            <Col lg={10}>
              <div className="alert alert-info d-flex justify-content-between align-items-start" role="alert" style={{ borderRadius: '10px' }}>
                <div>
                  <strong>Editing existing declaration</strong>
                  <> — ID: <code>{initialContext.declarationId}</code></>
                  {initialContext.editInfo?.reason && (
                    <>
                      <br />Reason: <em>{initialContext.editInfo.reason}</em>
                    </>
                  )}
                </div>
                <div className="d-flex gap-2">
                  <Button size="sm" variant="outline-danger" onClick={() => {
                    // Clear context and reload page without declarationId query
                    try { localStorage.removeItem('editContext'); } catch {}
                    const url = new URL(window.location.href);
                    url.searchParams.delete('declarationId');
                    navigate(`${url.pathname}${url.search}`, { replace: true, state: { ...location.state, declarationId: undefined, editInfo: undefined } });
                  }}>
                    <i className="fas fa-times me-1"></i>
                    Clear edit context
                  </Button>
                </div>
              </div>
            </Col>
          </Row>
        )}
        <Row className="justify-content-center">
          <Col lg={10}>
            <Card className="shadow-lg border-0">
              <Card.Body className="p-5">
                <div className="text-center mb-4">
                  <div className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                       style={{ width: '80px', height: '80px', 
                               background: 'linear-gradient(45deg, var(--primary-blue), var(--secondary-green))' }}>
                    <i className="fas fa-check-circle text-white" style={{ fontSize: '2rem' }}></i>
                  </div>
                  <h2 className="fw-bold text-dark mb-2">Review Your Declaration</h2>
                  <p className="text-muted mb-1">Step 4 of 4 - Final Review</p>
                  {baselineSerialized && (
                    <div className="small text-muted">
                      {hasUnsaved ? 'Unsaved changes' : lastSavedAt ? `All changes saved at ${lastSavedAt.toLocaleTimeString()}` : 'No changes'}
                    </div>
                  )}
                  <ProgressBar now={100} className="mb-4" style={{ height: '8px' }} />
                </div>

                {/* Personal Information Section */}
                <Card className="mb-4">
                  <Card.Header className="bg-primary text-white d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">Personal Information</h5>
                    <Button size="sm" variant="light" onClick={() => {
                      const ctx = getEditContext({ locationState: location.state, locationSearch: location.search });
                      const path = appendDeclarationIdToPath('/user-form', ctx.declarationId);
                      navigate(path, { state: { ...location.state, profile: userData, fromReview: true } });
                    }}>
                      <i className="fas fa-edit me-1"></i> Edit
                    </Button>
                  </Card.Header>
                  <Card.Body>
                    <Row>
                      <Col md={6}>
                        <p><strong>Name:</strong> {safeRender(userData.first_name)} {safeRender(userData.other_names)} {safeRender(userData.surname)}</p>
                        <p><strong>Email:</strong> {safeRender(userData.email)}</p>
                        <p><strong>Marital Status:</strong> {userData.marital_status === 'separated' ? 'Separated' : safeRender(userData.marital_status)}</p>
                      </Col>
                      <Col md={6}>
                        <p><strong>Birth Date:</strong> {toISODate(userData.birthdate)}</p>
                        <p><strong>Place of Birth:</strong> {safeRender(userData.place_of_birth)}</p>
                        <p><strong>Payroll Number:</strong> {safeRender(userData.payroll_number)}</p>
                        <p><strong>Department:</strong> {safeRender(userData.department)}</p>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>

                {/* Family Information Section */}
                {validSpouses.length > 0 && (
                  <Card className="mb-4">
                    <Card.Header className="bg-success text-white d-flex justify-content-between align-items-center">
                      <h5 className="mb-0">Spouse(s) Information</h5>
                      <Button size="sm" variant="light" onClick={() => {
                        const ctx = getEditContext({ locationState: location.state, locationSearch: location.search });
                        const path = appendDeclarationIdToPath('/spouse-form', ctx.declarationId);
                        navigate(path, { state: { ...location.state, spouses: validSpouses, children: validChildren, fromReview: true } });
                      }}>
                        <i className="fas fa-edit me-1"></i> Edit
                      </Button>
                    </Card.Header>
                    <Card.Body>
                      {validSpouses.map((spouse, i) => (
                        <div key={i} className="mb-2">
                          <strong>Name:</strong> {spouse.full_name || `${spouse.first_name} ${spouse.other_names} ${spouse.surname}`}
                        </div>
                      ))}
                    </Card.Body>
                  </Card>
                )}

                {validChildren.length > 0 && (
                  <Card className="mb-4">
                    <Card.Header className="bg-warning text-dark d-flex justify-content-between align-items-center">
                      <h5 className="mb-0">Children Information</h5>
                      <Button size="sm" variant="light" onClick={() => {
                        const ctx = getEditContext({ locationState: location.state, locationSearch: location.search });
                        const path = appendDeclarationIdToPath('/spouse-form', ctx.declarationId);
                        navigate(path, { state: { ...location.state, spouses: validSpouses, children: validChildren } });
                      }}>
                        <i className="fas fa-edit me-1"></i> Edit
                      </Button>
                    </Card.Header>
                    <Card.Body>
                      {validChildren.map((child, i) => (
                        <div key={i} className="mb-2">
                          <strong>Name:</strong> {child.full_name || `${child.first_name} ${child.other_names} ${child.surname}`}
                        </div>
                      ))}
                    </Card.Body>
                  </Card>
                )}
        
                {/* Financial Information Section */}
                <Card className="mb-4">
                  <Card.Header className="bg-info text-white d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">Financial Information</h5>
                    <Button size="sm" variant="light" onClick={() => {
                      const ctx = getEditContext({ locationState: location.state, locationSearch: location.search });
                      const path = appendDeclarationIdToPath('/financial-form', ctx.declarationId);
                      // Pass along spouses/children and period dates for full prefill
                      let primaryUser = Array.isArray(allFinancialData) ? allFinancialData.find(m => m.type === 'user') : null;
                      const navigationState = {
                        ...location.state,
                        allFinancialData,
                        spouses: validSpouses.length ? validSpouses : (location.state?.spouses || []),
                        children: validChildren.length ? validChildren : (location.state?.children || []),
                        declarationDate: primaryUser?.data?.declaration_date,
                        periodStart: primaryUser?.data?.period_start_date,
                        periodEnd: primaryUser?.data?.period_end_date,
                        fromReview: true
                      };
                      navigate(path, { state: navigationState });
                    }}>
                      <i className="fas fa-edit me-1"></i> Edit
                    </Button>
                  </Card.Header>
                  <Card.Body>
                    {allFinancialData && Array.isArray(allFinancialData) && allFinancialData.length > 0 ? (
                      allFinancialData.map((member, index) => (
                        <div key={index} className="border-bottom pb-4 mb-4">
                          <h6 className="text-primary mb-3">
                            {member.name} {member.type === 'user' && '(You)'}{' '}
                            {member.merged_from_root && (
                              <span className="badge bg-secondary ms-2" title="Includes financial data merged from original declaration record">Merged</span>
                            )}
                          </h6>
                          
                          <Row>
                            <Col md={12}>
                              <p><strong>Declaration Date:</strong> {toISODate(member.data?.declaration_date)}</p>
                              <p><strong>Period:</strong> {toISODate(member.data?.period_start_date)} to {toISODate(member.data?.period_end_date)}</p>
                            </Col>
                          </Row>
                          
                          <Row>
                            <Col md={4}>
                              {member.data?.biennial_income && member.data.biennial_income.length > 0 && (
                                <div className="mb-3">
                                  <strong className="text-success"> Income Statement:</strong>{' '}
                                  {member.data.biennial_income.length === 1 && member.data.biennial_income[0].type === 'Nil' && member.data.biennial_income[0].description === 'Nil' && (
                                    <span className="badge bg-secondary ms-1" title="Section declared Nil">Nil</span>
                                  )}
                                  <ul className="list-unstyled mt-2">
                                    {member.data.biennial_income.map((item, i) => (
                                      item.description && item.value ? (
                                        <li key={i} className="small">
                                          {item.type && <span className="fw-bold">{item.type} </span>}
                                          {item.description}: <span className="text-success fw-bold">Ksh {parseFloat(item.value).toLocaleString()}</span>
                                        </li>
                                      ) : null
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </Col>
                            
                            <Col md={4}>
                              {member.data?.assets && member.data.assets.length > 0 && (
                                <div className="mb-3">
                                  <strong className="text-primary">Assets:</strong>{' '}
                                  {member.data.assets.length === 1 && member.data.assets[0].type === 'Nil' && member.data.assets[0].description === 'Nil' && (
                                    <span className="badge bg-secondary ms-1" title="Section declared Nil">Nil</span>
                                  )}
                                  <ul className="list-unstyled mt-2">
                                    {member.data.assets.map((item, i) => {
                                      const desc = getAssetDescription(item);
                                      if (!desc || !item.value) return null;
                                      // If asset type is 'Other' and custom provided, prepend custom
                                      const typeLabel = item.type === 'Other' && item.asset_other_type ? item.asset_other_type : item.type;
                                      return (
                                        <li key={i} className="small">
                                          {typeLabel && <span className="fw-bold">{typeLabel} </span>}
                                          {desc}: <span className="text-primary fw-bold">Ksh {parseFloat(item.value).toLocaleString()}</span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              )}
                            </Col>
                            
                            <Col md={4}>
                              {member.data?.liabilities && member.data.liabilities.length > 0 && (
                                <div className="mb-3">
                                  <strong className="text-danger">Liabilities:</strong>{' '}
                                  {member.data.liabilities.length === 1 && member.data.liabilities[0].type === 'Nil' && member.data.liabilities[0].description === 'Nil' && (
                                    <span className="badge bg-secondary ms-1" title="Section declared Nil">Nil</span>
                                  )}
                                  <ul className="list-unstyled mt-2">
                                    {member.data.liabilities.map((item, i) => {
                                      const label = getLiabilityLabel(item);
                                      if (!label || !item.value) return null;
                                      return (
                                        <li key={i} className="small">
                                          {item.type && <span className="fw-bold">{item.type} </span>}
                                          {label}: <span className="text-danger fw-bold">Ksh {parseFloat(item.value).toLocaleString()}</span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              )}
                            </Col>
                          </Row>
                          
                          {member.data?.other_financial_info && (
                            <div className="mt-3">
                              <strong>Additional Information:</strong>
                              <p className="text-muted small mt-1">{safeRender(member.data.other_financial_info)}</p>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-muted">No financial information provided</p>
                    )}
                  </Card.Body>
                </Card>

                {/* Declaration Section */}
                <Card className="mb-4">
                  <Card.Header className="bg-warning text-dark">
                    <h5 className="mb-0">Declaration</h5>
                  </Card.Header>
                  <Card.Body>
                    <div className="alert alert-light border-start border-warning border-4 ps-4">
                      <Form.Check
                        type="checkbox"
                        id="declarationCheckbox"
                        data-testid="declaration-checkbox"
                        checked={declarationChecked}
                        onChange={e => setDeclarationChecked(e.target.checked)}
                        required
                        className="mb-2"
                      />
                      <p className="mb-0">
                        <strong>I solemly declare that:</strong> the information provided in this declaration is, to the best of my knowledge, true and complete.<br />
                        I understand that providing false information may result in disciplinary action in accordance with MCPSB's policies and procedures and/or a fine/jail term or both in accordance to the Conflict of Interest Act 2025.
                      </p>
                    </div>
                  </Card.Body>
                </Card>

                {submitError && (
                  <Alert variant="danger" className="mb-4">
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    {submitError}
                  </Alert>
                )}
                
                <Form onSubmit={e => {
                  e.preventDefault();
                  if (!declarationChecked) {
                    setSubmitError('You must confirm your declaration before submitting.');
                    return;
                  }
                  if (!witnessChecked || !witnessName.trim() || !witnessAddress.trim() || !witnessPhone.trim()) {
                    setSubmitError('Witness section must be completed and signed.');
                    return;
                  }
                  handleSubmit();
                }}>
                  {/* Witness Section */}
                  <Card className="mb-4">
                    <Card.Header className="bg-info text-white">
                      <h5 className="mb-0">Witness</h5>
                      <p className="mb-0 text-white">The witness is any willing adult of sound mind. Do not use a child or your spouse as a witness. The witness need not be your supervisor or a colleague at work. The Declarant must provide a working phone number for their witness. Kindly inform the witnesses before submitting.</p>
                    </Card.Header>
                    <Card.Body>
                      <Form.Check
                        type="checkbox"
                        id="witnessCheckbox"
                        data-testid="witness-checkbox"
                        checked={witnessChecked}
                        onChange={e => setWitnessChecked(e.target.checked)}
                        required
                        className="mb-2"
                        label="Witness Signature (Check to sign)"
                      />
                      <Form.Group className="mb-3">
                        <Form.Label className="fw-semibold">Witness Name</Form.Label>
                        <Form.Control
                          type="text"
                          value={witnessName}
                          onChange={e => setWitnessName(e.target.value)}
                          required
                          className="py-3"
                          style={{ borderRadius: '12px' }}
                          placeholder="Enter witness name"
                        />
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label className="fw-semibold">Witness Phone Number</Form.Label>
                        <Form.Control
                          type="tel"
                          value={witnessPhone}
                          onChange={e => setWitnessPhone(e.target.value)}
                          required
                          className="py-3"
                          style={{ borderRadius: '12px' }}
                          placeholder="Enter witness phone number"
                        />
                      </Form.Group>
                      <Form.Group className="mb-3">
                        <Form.Label className="fw-semibold">Witness Physical Address</Form.Label>
                        <Form.Control
                          type="text"
                          value={witnessAddress}
                          onChange={e => setWitnessAddress(e.target.value)}
                          required
                          className="py-3"
                          style={{ borderRadius: '12px' }}
                          placeholder="Enter witness physical address"
                        />
                      </Form.Group>
                    </Card.Body>
                  </Card>
                  <div className="d-flex justify-content-between pt-3">
                    <Button
                      variant="outline-secondary"
                      onClick={() => {
                        const ctx = getEditContext({ locationState: location.state, locationSearch: location.search });
                        const path = appendDeclarationIdToPath('/financial-form', ctx.declarationId);
                        navigate(path);
                      }}
                      disabled={isSubmitting}
                      className="px-4 py-3"
                      style={{ borderRadius: '12px' }}
                    >
                      <i className="fas fa-arrow-left me-2"></i>
                      Back
                    </Button>
                    <div className="d-flex gap-2">
                      <Button
                        type="button"
                        variant="outline-primary"
                        disabled={!hasUnsaved || manualSaving || isSubmitting}
                        onClick={handleManualSave}
                        className="px-4 py-3"
                        style={{ borderRadius: '12px' }}
                      >
                        {manualSaving ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" />Saving...
                          </>
                        ) : hasUnsaved ? (
                          <>Save Draft</>
                        ) : (
                          <>Saved</>
                        )}
                      </Button>
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        aria-busy={isSubmitting ? 'true' : 'false'}
                        data-testid="submit-declaration"
                        className="px-5 py-3 fw-semibold"
                        style={{ 
                          borderRadius: '12px',
                          background: isSubmitting 
                            ? 'linear-gradient(45deg, #6c757d, #5a6268)' 
                            : 'linear-gradient(45deg, var(--primary-blue), #0056b3)',
                          border: 'none'
                        }}
                      >
                        {isSubmitting ? (
                          <>
                            <div className="spinner-border spinner-border-sm me-2" role="status">
                              <span className="visually-hidden">Loading...</span>
                            </div>
                            Submitting...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-paper-plane me-2"></i>
                            Submit Declaration
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

const ReviewPage = () => {
  const { declarationId } = getEditContext({ locationState: null, locationSearch: window.location.search });
  return (
    <DeclarationSessionProvider declarationId={declarationId}>
      <ReviewPageInner />
    </DeclarationSessionProvider>
  );
};

export default ReviewPage;