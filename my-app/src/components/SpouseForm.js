
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Container, Row, Col, Card, Form, Button, ProgressBar, Alert, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { DeclarationSessionProvider, useDeclarationSession, useDebouncedPatch } from '../context/DeclarationSessionContext';
import { getEditContext, appendDeclarationIdToPath, clearEditContext, removeDeclarationIdFromPath } from '../utilis/editContext';
import { saveProgress, deriveUserKey, scheduleServerSync } from '../utilis/persistProgress';

const SpouseFormInner = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [spouses, setSpouses] = useState(() =>
    (location.state && location.state.spouses && Array.isArray(location.state.spouses) && location.state.spouses.length > 0)
      ? location.state.spouses
      : [{ surname: '', first_name: '', other_names: '' }]
  );
  const [children, setChildren] = useState(() =>
    (location.state && location.state.children && Array.isArray(location.state.children) && location.state.children.length > 0)
      ? location.state.children
      : [{ surname: '', first_name: '', other_names: '' }]
  );
  const userData = React.useMemo(() => location.state?.userData || {}, [location.state]);
  const { declarationDate, periodStart, periodEnd } = location.state || {};
  const [formError, setFormError] = useState('');

  const saveTimeout = useRef();

  useEffect(() => {
    // Show incoming navigation error (e.g., from Financial form guard)
    if (location.state?.error) {
      setFormError(location.state.error);
      // Clean the error from history state on next tick (avoid persisting alert)
      setTimeout(() => {
        navigate(window.location.pathname + window.location.search, { replace: true, state: { ...location.state, error: undefined } });
      }, 0);
    }
    const token = localStorage.getItem('token');
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      const key = deriveUserKey(userData);
      saveProgress({
        lastStep: 'spouse',
        stateSnapshot: { spouses, children, userData, declarationDate, periodStart, periodEnd }
      }, key);
      scheduleServerSync(key, token);
    }, 500);
    return () => clearTimeout(saveTimeout.current);
  }, [spouses, children, userData, declarationDate, periodStart, periodEnd, navigate, location.state]);

  const { model, savingState } = useDeclarationSession();
  const editContext = getEditContext({ locationState: location.state, locationSearch: location.search });
  const isEditingExisting = !!editContext.declarationId;
  useEffect(() => {
    if (model) {
      const sps = model.members.spouses.length ? model.members.spouses.map(s => ({ surname: s.surname || '', first_name: s.first_name || '', other_names: s.other_names || '' })) : [{ surname:'', first_name:'', other_names:'' }];
      const ch = model.members.children.length ? model.members.children.map(c => ({ surname: c.surname || '', first_name: c.first_name || '', other_names: c.other_names || '' })) : [{ surname:'', first_name:'', other_names:'' }];
      setSpouses(sps);
      setChildren(ch);
      return;
    }

    const hasSpouseData = location.state && Array.isArray(location.state.spouses) && location.state.spouses.length > 0;
    const hasChildData = location.state && Array.isArray(location.state.children) && location.state.children.length > 0;
    if (hasSpouseData || hasChildData) return;
    const token = localStorage.getItem('token');
    if (!token) { navigate('/login'); return; }
    fetch('/api/users/family', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : null)
      .then(fam => {
        setSpouses((fam && Array.isArray(fam.spouses) && fam.spouses.length > 0) ? fam.spouses : [{ surname: '', first_name: '', other_names: '' }]);
        setChildren((fam && Array.isArray(fam.children) && fam.children.length > 0) ? fam.children : [{ surname: '', first_name: '', other_names: '' }]);
      })
      .catch(() => {
        setSpouses([{ surname: '', first_name: '', other_names: '' }]);
        setChildren([{ surname: '', first_name: '', other_names: '' }]);
      });
  }, [model, navigate, location.state]);

  const addSpouse = () => {
    const updated = [...spouses, { surname: '', first_name: '', other_names: '' }];
    setSpouses(updated);
  };

  const removeSpouse = (index) => {
    if (spouses.length > 1) {
      const newSpouses = [...spouses];
      newSpouses.splice(index, 1);
      setSpouses(newSpouses);
    }
  };

  const handleSpouseChange = (index, field, value) => {
    const newSpouses = [...spouses];
    newSpouses[index][field] = value;
    setSpouses(newSpouses);
  };

  const addChild = () => {
    const updated = [...children, { surname: '', first_name: '', other_names: '' }];
    setChildren(updated);
  };

  const removeChild = (index) => {
    if (children.length > 1) {
      const newChildren = [...children];
      newChildren.splice(index, 1);
      setChildren(newChildren);
    }
  };

  const handleChildChange = (index, field, value) => {
    const newChildren = [...children];
    newChildren[index][field] = value;
    setChildren(newChildren);
  };

  // Debounced spouses patch
  useDebouncedPatch(
    [spouses, isEditingExisting, model?.id],
    () => {
      if (!isEditingExisting || !model?.id) return null;
      const cleaned = spouses.filter(s => (s.first_name||'').trim() || (s.other_names||'').trim() || (s.surname||'').trim());
      return { spouses: cleaned };
    },
    500
  );
  // Debounced children patch
  useDebouncedPatch(
    [children, isEditingExisting, model?.id],
    () => {
      if (!isEditingExisting || !model?.id) return null;
      const cleaned = children.filter(c => (c.first_name||'').trim() || (c.other_names||'').trim() || (c.surname||'').trim());
      return { children: cleaned };
    },
    500
  );

  const maritalStatus = (model?.profile?.marital_status || userData?.marital_status || '').toLowerCase();
  const hasNamedSpouse = Array.isArray(spouses) && spouses.some(s => (
    (s.first_name || '').trim() || (s.surname || '').trim() || (s.other_names || '').trim()
  ));
  const isNextDisabled = maritalStatus === 'married' && !hasNamedSpouse;

  const handleSubmit = (e) => {
    e.preventDefault();
    // Client-side guard: if married, require at least one spouse with a name
    if (maritalStatus === 'married' && !hasNamedSpouse) {
      setFormError('You selected Married. Please add at least one spouse before proceeding.');
      return;
    }
    const token = localStorage.getItem('token');
    const key = deriveUserKey(userData);
    saveProgress({
      lastStep: 'financial',
      stateSnapshot: { spouses, children, userData, declarationDate, periodStart, periodEnd }
    }, key);
    scheduleServerSync(key, token);
  const nextPath = appendDeclarationIdToPath('/financial-form', getEditContext({ locationState: location.state, locationSearch: location.search }).declarationId);
  navigate(nextPath, { state: { 
    ...location.state,
    userData: { ...userData, declarationDate, periodStart, periodEnd },
    spouses, 
    children, 
    declarationDate, 
    periodStart, 
    periodEnd 
  }});
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #e3f2fd 0%, #e8f5e8 100%)' }} 
         className="py-5">
      <Container>
        {formError && (
          <Alert variant="danger" className="mb-3">
            <i className="fas fa-exclamation-circle me-2"></i>
            {formError}
          </Alert>
        )}
        {isEditingExisting && (
          <div className="d-flex justify-content-end mb-2 small">
            {savingState.busy ? (
              <span className="badge bg-warning text-dark">Saving...</span>
            ) : savingState.last ? (
              <span className="badge bg-success">Saved {savingState.mode} at {savingState.last.toLocaleTimeString()}</span>
            ) : null}
          </div>
        )}
        {getEditContext({ locationState: location.state, locationSearch: location.search }).declarationId && (
          <div className="alert alert-info mb-3 d-flex justify-content-between align-items-start" role="alert" style={{ borderRadius: '10px' }}>
            <div>
              <strong>Editing existing declaration</strong>
              {(() => { const ctx = getEditContext({ locationState: location.state, locationSearch: location.search }); return ctx.declarationId ? (<> — ID: <code>{ctx.declarationId}</code></>) : null; })()}
              {(() => { const ctx = getEditContext({ locationState: location.state, locationSearch: location.search }); return ctx.editInfo?.reason ? (<><br />Reason: <em>{ctx.editInfo.reason}</em></>) : null; })()}
            </div>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => {
                  const ctx = getEditContext({ locationState: location.state, locationSearch: location.search });
                  const reviewPath = appendDeclarationIdToPath('/review', ctx.declarationId);
                  navigate(reviewPath, { state: { ...location.state } });
                }}
              >
                <i className="fas fa-eye me-1"></i>
                View declaration
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={() => {
                  clearEditContext();
                  const clean = removeDeclarationIdFromPath(window.location.pathname + window.location.search);
                  navigate(clean, { replace: true, state: { ...location.state, declarationId: undefined, editInfo: undefined } });
                }}
              >
                <i className="fas fa-times me-1"></i>
                Clear edit context
              </button>
            </div>
          </div>
        )}
        <Row className="justify-content-center">
          <Col lg={10}>
            <Card className="shadow-lg border-0">
              <Card.Body className="p-5">
                <div className="text-center mb-4">
                  <div className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                       style={{ width: '80px', height: '80px', 
                               background: 'linear-gradient(45deg, var(--primary-blue), var(--secondary-green))' }}>
                    <i className="fas fa-users text-white" style={{ fontSize: '2rem' }}></i>
                  </div>
                  <h2 className="fw-bold text-dark mb-2">Family Information</h2>
                  <p className="text-muted">Step 2 of 4</p>
                  <ProgressBar now={50} className="mb-4" style={{ height: '8px' }} />
                </div>

                {/* Disclaimer */}
                {maritalStatus === 'married' ? (
                  <Alert variant="warning" className="mb-4">
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    <strong>Note:</strong> Since you selected <b>Married</b>, you must add at least one spouse before proceeding.
                  </Alert>
                ) : (
                  <Alert variant="info" className="mb-4">
                    <i className="fas fa-info-circle me-2"></i>
                    <strong>Note:</strong> If you have no spouse and/or no children, you may leave the fields below empty and proceed to the next page.
                  </Alert>
                )}
                <Form onSubmit={handleSubmit}>
                  {/* Section A: Spouse Information */}
                  <Card className="mb-4">
                    <Card.Header className="bg-primary text-white">
                      <h5 className="mb-0">A. Spouse Information</h5>
                    </Card.Header>
                    <Card.Body>
                      {spouses.map((spouse, index) => (
                        <div key={index} className={index > 0 ? 'border-top pt-4 mt-4' : ''}>
                          {spouses.length > 1 && (
                            <div className="d-flex justify-content-between align-items-center mb-3">
                              <h6 className="text-muted mb-0">Spouse {index + 1}</h6>
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => removeSpouse(index)}
                                style={{ borderRadius: '8px' }}
                              >
                                <i className="fas fa-trash"></i> Remove
                              </Button>
                            </div>
                          )}
                          
                          <Row>
                            <Col md={4}>
                              <Form.Group className="mb-3">
                                <Form.Label htmlFor={`spouse-surname-${index}`} className="fw-semibold">Surname</Form.Label>
                                <Form.Control
                                  id={`spouse-surname-${index}`}
                                  autoComplete="family-name"
                                  type="text"
                                  name="surname"
                                  value={spouse.surname}
                                  onChange={(e) => handleSpouseChange(index, 'surname', e.target.value)}
                                  className="py-3"
                                  style={{ borderRadius: '12px' }}
                                  placeholder="Enter surname"
                                />
                              </Form.Group>
                            </Col>
                            <Col md={4}>
                              <Form.Group className="mb-3">
                                <Form.Label htmlFor={`spouse-first-name-${index}`} className="fw-semibold">First Name</Form.Label>
                                <Form.Control
                                  id={`spouse-first-name-${index}`}
                                  autoComplete="given-name"
                                  type="text"
                                  name="first_name"
                                  value={spouse.first_name}
                                  onChange={(e) => handleSpouseChange(index, 'first_name', e.target.value)}
                                  className="py-3"
                                  style={{ borderRadius: '12px' }}
                                  placeholder="Enter first name"
                                />
                              </Form.Group>
                            </Col>
                            <Col md={4}>
                              <Form.Group className="mb-3">
                                <Form.Label htmlFor={`spouse-other-names-${index}`} className="fw-semibold">Other Names</Form.Label>
                                <Form.Control
                                  id={`spouse-other-names-${index}`}
                                  autoComplete="additional-name"
                                  type="text"
                                  name="other_names"
                                  value={spouse.other_names}
                                  onChange={(e) => handleSpouseChange(index, 'other_names', e.target.value)}
                                  className="py-3"
                                  style={{ borderRadius: '12px' }}
                                  placeholder="Enter other names"
                                />
                              </Form.Group>
                            </Col>
                          </Row>
                        </div>
                      ))}
                      
                      <Button
                        type="button"
                        variant="outline-primary"
                        onClick={addSpouse}
                        className="mt-3"
                        style={{ borderRadius: '12px' }}
                      >
                        <i className="fas fa-plus"></i> Add Another Spouse
                      </Button>
                    </Card.Body>
                  </Card>

                  {/* Section B: Children Information */}
                  <Card className="mb-4">
                    <Card.Header className="bg-success text-white">
                      <h5 className="mb-0">B. Children Information</h5>
                    </Card.Header>
                    <Card.Body>
                      <Alert variant="info" className="mb-3">
                        <i className="fas fa-info-circle me-2"></i>
                        <strong>Note:</strong> Only include children under the age of 18 years. Adopted children should also be listed.
                      </Alert>
                      
                      {children.map((child, index) => (
                        <div key={index} className={index > 0 ? 'border-top pt-4 mt-4' : ''}>
                          {children.length > 1 && (
                            <div className="d-flex justify-content-between align-items-center mb-3">
                              <h6 className="text-muted mb-0">Child {index + 1}</h6>
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => removeChild(index)}
                                style={{ borderRadius: '8px' }}
                              >
                                <i className="fas fa-trash"></i> Remove
                              </Button>
                            </div>
                          )}
                          
                          <Row>
                            <Col md={4}>
                              <Form.Group className="mb-3">
                                <Form.Label htmlFor={`child-surname-${index}`} className="fw-semibold">Surname</Form.Label>
                                <Form.Control
                                  id={`child-surname-${index}`}
                                  autoComplete="family-name"
                                  type="text"
                                  name="surname"
                                  value={child.surname}
                                  onChange={(e) => handleChildChange(index, 'surname', e.target.value)}
                                  className="py-3"
                                  style={{ borderRadius: '12px' }}
                                  placeholder="Enter surname"
                                />
                              </Form.Group>
                            </Col>
                            <Col md={4}>
                              <Form.Group className="mb-3">
                                <Form.Label htmlFor={`child-first-name-${index}`} className="fw-semibold">First Name</Form.Label>
                                <Form.Control
                                  id={`child-first-name-${index}`}
                                  autoComplete="given-name"
                                  type="text"
                                  name="first_name"
                                  value={child.first_name}
                                  onChange={(e) => handleChildChange(index, 'first_name', e.target.value)}
                                  className="py-3"
                                  style={{ borderRadius: '12px' }}
                                  placeholder="Enter first name"
                                />
                              </Form.Group>
                            </Col>
                            <Col md={4}>
                              <Form.Group className="mb-3">
                                <Form.Label htmlFor={`child-other-names-${index}`} className="fw-semibold">Other Names</Form.Label>
                                <Form.Control
                                  id={`child-other-names-${index}`}
                                  autoComplete="additional-name"
                                  type="text"
                                  name="other_names"
                                  value={child.other_names}
                                  onChange={(e) => handleChildChange(index, 'other_names', e.target.value)}
                                  className="py-3"
                                  style={{ borderRadius: '12px' }}
                                  placeholder="Enter other names"
                                />
                              </Form.Group>
                            </Col>
                          </Row>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline-success"
                        onClick={addChild}
                        className="mt-3"
                        style={{ borderRadius: '12px' }}
                      >
                        <i className="fas fa-plus"></i> Add Another Child
                      </Button>
                    </Card.Body>
                  </Card>
                  <div className="d-flex justify-content-between pt-3">
                    <div>
                      <Button
                        variant="outline-secondary"
                        onClick={() => {
                          const ctx = getEditContext({ locationState: location.state, locationSearch: location.search });
                          const backPath = appendDeclarationIdToPath('/user-form', ctx.declarationId);
                          navigate(backPath, { state: { ...location.state } });
                        }}
                        className="px-4 py-3 me-2"
                        style={{ borderRadius: '12px' }}
                      >
                        <i className="fas fa-arrow-left me-2"></i>
                        Back
                      </Button>
                      {location.state?.fromReview && (
                        <Button
                          variant="outline-primary"
                          onClick={() => {
                            const ctx = getEditContext({ locationState: location.state, locationSearch: location.search });
                            const reviewPath = appendDeclarationIdToPath('/review', ctx.declarationId);
                            navigate(reviewPath, { state: { ...location.state } });
                          }}
                          className="px-4 py-3"
                          style={{ borderRadius: '12px' }}
                        >
                          <i className="fas fa-list me-2"></i>
                          Back to Review
                        </Button>
                      )}
                    </div>
                    {isNextDisabled ? (
                      <OverlayTrigger
                        placement="top"
                        overlay={
                          <Tooltip id="next-disabled-tooltip">
                            You selected Married. Please add at least one spouse to continue.
                          </Tooltip>
                        }
                      >
                        <span className="d-inline-block">
                          <Button
                            type="submit"
                            className="px-5 py-3 fw-semibold"
                            style={{ 
                              borderRadius: '12px',
                              background: 'linear-gradient(45deg, var(--primary-blue), #0056b3)',
                              border: 'none',
                              pointerEvents: 'none' // allow tooltip on wrapper while keeping button disabled
                            }}
                            disabled
                            aria-disabled="true"
                            aria-describedby="next-disabled-tooltip"
                          >
                            Next Step
                          </Button>
                        </span>
                      </OverlayTrigger>
                    ) : (
                      <Button
                        type="submit"
                        className="px-5 py-3 fw-semibold"
                        style={{ 
                          borderRadius: '12px',
                          background: 'linear-gradient(45deg, var(--primary-blue), #0056b3)',
                          border: 'none'
                        }}
                      >
                        Next Step
                      </Button>
                    )}
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

const SpouseForm = () => {
  const { declarationId } = getEditContext({ locationState: null, locationSearch: window.location.search });
  return (
    <DeclarationSessionProvider declarationId={declarationId}>
      <SpouseFormInner />
    </DeclarationSessionProvider>
  );
};

export default SpouseForm;