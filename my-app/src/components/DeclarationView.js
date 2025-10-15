import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Spinner, Alert, Button, Table, Badge } from 'react-bootstrap';
import { DeclarationSessionProvider, useDeclarationSession } from '../context/DeclarationSessionContext';

const DeclarationViewInner = () => {
  const navigate = useNavigate();
  const [declaration, setDeclaration] = useState(null);
  // Rely on session context loading flag instead of local state
  const [error, setError] = useState('');
  const { model, loading: sessionLoading, notFound } = useDeclarationSession();
  useEffect(() => {
    if (model) setDeclaration({ ...model, declaration_type: model.type });
  }, [model]);
  useEffect(() => {
    if (notFound) { setError('Declaration not found.'); }
  }, [notFound]);
  if (sessionLoading) return <Spinner animation="border" />;
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!declaration) return <Alert variant="info">Declaration not found.</Alert>;


  // Get first financial declaration for period and date
  const firstFinDecl = Array.isArray(declaration.financial_unified) && declaration.financial_unified.length > 0
    ? declaration.financial_unified[0]
    : null;
  return (
    <div className="container py-5">
      <Button variant="secondary" className="mb-3" onClick={() => navigate(-1)}>
        &larr; Back
      </Button>
      <Card className="shadow border-0 mb-4">
        <Card.Body>
          <h2 className="fw-bold mb-3 text-primary">Declaration Details</h2>
          <Table bordered>
            <tbody>
              <tr><th>Declaration Type</th><td>{declaration.declaration_type || 'N/A'}</td></tr>
              <tr>
                <th>Period</th>
                <td>{
                  firstFinDecl && firstFinDecl.period_start_date && firstFinDecl.period_end_date
                    ? `${firstFinDecl.period_start_date} to ${firstFinDecl.period_end_date}`
                    : 'N/A'
                }</td>
              </tr>
              <tr>
                <th>Date Submitted</th>
                <td>{
                  firstFinDecl && firstFinDecl.declaration_date
                    ? new Date(firstFinDecl.declaration_date).toLocaleDateString()
                    : 'N/A'
                }</td>
              </tr>
              <tr><th>Status</th><td><Badge bg={declaration.status === 'approved' ? 'success' : declaration.status === 'pending' ? 'warning' : declaration.status === 'rejected' ? 'danger' : 'secondary'}>{declaration.status ? (declaration.status === 'pending' ? 'Submitted' : (declaration.status === 'rejected' ? 'Requesting Clarification' : declaration.status.charAt(0).toUpperCase() + declaration.status.slice(1))) : 'N/A'}</Badge></td></tr>
              <tr><th>Correction Message</th><td>{declaration.correction_message || 'N/A'}</td></tr>
            </tbody>
          </Table>
          {/* You can add more detailed fields here as needed */}
        </Card.Body>
      </Card>
    </div>
  );
};

const DeclarationView = () => {
  const { id } = useParams();
  return (
    <DeclarationSessionProvider declarationId={id}>
      <DeclarationViewInner />
    </DeclarationSessionProvider>
  );
};

export default DeclarationView;
