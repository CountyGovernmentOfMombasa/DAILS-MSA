import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Row, Col, Alert, Spinner } from 'react-bootstrap';
import useAdminSession from '../hooks/useAdminSession';

const AdminAccessChoice = () => {
  const navigate = useNavigate();
  const { elevating, error, elevateAndGo } = useAdminSession();
  return (
    <div className="container py-5">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <Card className="shadow-lg border-0">
            <Card.Body className="p-5 text-center">
              <h2 className="mb-4">Admin Access</h2>
              <p className="mb-4">Elevate your current user session to an admin session.</p>
              {error && <Alert variant="danger" className="py-2">{error}</Alert>}
              <div className="d-flex justify-content-center gap-3">
                <Button variant="secondary" size="lg" disabled={elevating} onClick={() => navigate('/landing')}>Back</Button>
                <Button variant="primary" size="lg" disabled={elevating} onClick={elevateAndGo}>
                  {elevating ? (<><Spinner animation="border" size="sm" className="me-2"/>Requesting...</>) : 'Elevate & Continue'}
                </Button>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AdminAccessChoice;
