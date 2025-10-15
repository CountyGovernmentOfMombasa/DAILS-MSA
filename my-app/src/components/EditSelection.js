import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Card, Button, Form, Alert, Container, Row, Col, Spinner } from 'react-bootstrap';
import { getDeclarationById } from '../api';
import { mapDeclarationToUserForm, mapDeclarationToSpousesChildren, mapDeclarationToFinancial } from '../utilis/declarationMapper';
import { saveEditContext, appendDeclarationIdToPath } from '../utilis/editContext';

const EditSelection = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const [reason, setReason] = useState(location.state?.editInfo?.reason || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [decl, setDecl] = useState(null);
  // Simplified workflow: always route straight to Review page after saving reason
  const [reasonTouched, setReasonTouched] = useState(false);
  const MIN_REASON_LEN = 10; // adjustable requirement
  const MAX_REASON_LEN = 500;
  const trimmedReason = reason.trim();
  const reasonTooShort = trimmedReason.length > 0 && trimmedReason.length < MIN_REASON_LEN;
  const reasonTooLong = trimmedReason.length > MAX_REASON_LEN;
  const reasonInvalid = !trimmedReason || reasonTooShort || reasonTooLong;

  // Fetch declaration once to enable preview & centralized mapping
  useEffect(() => {
    let cancelled = false;
    const fetchDecl = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        if (!token) { navigate('/login'); return; }
        const res = await getDeclarationById(id, `Bearer ${token}`);
        if (!cancelled && res?.data?.declaration) {
          setDecl(res.data.declaration);
          // If no existing reason in state (e.g. deep link) try pulling most recent edit request if present later (could extend)
        }
      } catch (e) {
        if (!cancelled) setError('Failed to load declaration data for editing.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchDecl();
    return () => { cancelled = true; };
  }, [id, navigate]);

  const handleNext = async () => {
    setError('');
    setReasonTouched(true);
    if (reasonInvalid) return; // client-side guard
    if (!decl) { setError('Declaration data still loading. Please wait a moment.'); return; }
    try {
      setSaving(true);
      const payload = { reason: trimmedReason, date: new Date().toISOString() };
      // Persist reason
      const res = await fetch(`/api/declarations/${id}/edit-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to record edit request');

      // Map all relevant declaration data so Review page can display & enable per-section edits
      let userData, spouses, children, allFinancialData;
      let witnessExtras = {};
      if (decl) {
        userData = mapDeclarationToUserForm(decl);
        const mappedSC = mapDeclarationToSpousesChildren(decl);
        spouses = mappedSC.spouses;
        children = mappedSC.children;
        allFinancialData = mapDeclarationToFinancial(decl);
        // Include witness + declaration meta if present
        if (typeof decl.witness_name === 'string') witnessExtras.witness_name = decl.witness_name;
        if (typeof decl.witness_address === 'string') witnessExtras.witness_address = decl.witness_address;
        if (typeof decl.witness_phone === 'string') witnessExtras.witness_phone = decl.witness_phone;
        if (typeof decl.witness_signed !== 'undefined') witnessExtras.witness_signed = !!decl.witness_signed;
        if (typeof decl.declaration_checked !== 'undefined') witnessExtras.declaration_checked = !!decl.declaration_checked;
      }

      // Persist edit context
      saveEditContext({ declarationId: id, editInfo: payload });
  // Navigate to new inline edit declaration page instead of classic review
  const reviewPath = appendDeclarationIdToPath('/edit-declaration', id);
      const navigationState = {
        declarationId: id,
        editInfo: payload,
        fromEditSelection: true,
        userData,
        profile: userData, // alias for components expecting profile
        spouses,
        children,
        allFinancialData,
        // pass witness state forward so Review can pick it up without refetch
        witness_name: witnessExtras.witness_name,
        witness_address: witnessExtras.witness_address,
        witness_phone: witnessExtras.witness_phone,
        witness_signed: witnessExtras.witness_signed,
        declaration_checked: witnessExtras.declaration_checked
      };
      navigate(reviewPath, { state: navigationState });
    } catch (e) {
      setError(e.message || 'Could not proceed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container className="py-4">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <Card>
            <Card.Header className="bg-primary text-white">Edit Declaration</Card.Header>
            <Card.Body>
              <p className="text-muted mb-3">Provide a reason for editing this declaration. After saving you will be taken to the Review page where you can edit any section.</p>
              {loading && (
                <div className="d-flex align-items-center gap-2 mb-3">
                  <Spinner animation="border" size="sm" />
                  <span className="text-muted">Loading declaration data...</span>
                </div>
              )}
              {error && <Alert variant="danger">{error}</Alert>}
              <Form onSubmit={(e) => e.preventDefault()}>
                <Form.Group className="mb-3">
                  <Form.Label>Reason for editing</Form.Label>
                   <Form.Control
                     as="textarea"
                     rows={3}
                     value={reason}
                     onChange={(e) => setReason(e.target.value)}
                     onBlur={() => setReasonTouched(true)}
                     placeholder="Explain why you need to edit this application"
                     isInvalid={reasonTouched && reasonInvalid}
                     maxLength={MAX_REASON_LEN + 1}
                   />
                   <div className="d-flex justify-content-between mt-1">
                     <Form.Text muted>
                       {reasonTooShort && `Minimum ${MIN_REASON_LEN} characters (currently ${trimmedReason.length}).`}
                       {reasonTooLong && `Too long by ${trimmedReason.length - MAX_REASON_LEN} characters.`}
                       {!reasonTouched && !trimmedReason && `At least ${MIN_REASON_LEN} characters.`}
                     </Form.Text>
                     <Form.Text muted>{trimmedReason.length}/{MAX_REASON_LEN}</Form.Text>
                   </div>
                   <Form.Control.Feedback type="invalid">
                     { !trimmedReason ? 'Reason is required.' : reasonTooShort ? `Please provide at least ${MIN_REASON_LEN} characters.` : reasonTooLong ? `Reason must be ${MAX_REASON_LEN} characters or fewer.` : 'Invalid reason.' }
                   </Form.Control.Feedback>
                </Form.Group>
                <div className="d-flex justify-content-between align-items-center">
                  <div className="small text-muted">
                    {loading ? 'Preparing declaration data...' : decl ? 'Declaration data ready.' : ''}
                  </div>
                  <Button disabled={saving || loading || reasonInvalid || !decl} onClick={handleNext} variant="primary">
                    {saving ? 'Saving...' : 'Next'}
                  </Button>
                </div>
              </Form>
              {decl && !loading && (
                <div className="mt-4">
                  <h6 className="text-muted">Quick Info</h6>
                  <small className="d-block">Type: {decl.declaration_type || '-'}</small>
                  <small className="d-block">Status: {decl.status || '-'}</small>
                  <small className="d-block">Submitted: {decl.submitted_at ? new Date(decl.submitted_at).toLocaleDateString() : '-'}</small>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default EditSelection;
