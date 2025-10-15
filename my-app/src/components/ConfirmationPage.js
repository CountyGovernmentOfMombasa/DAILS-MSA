import React from 'react';
import { Link } from 'react-router-dom';
import { Container, Row, Col, Card, Button, Alert } from 'react-bootstrap';

const ConfirmationPage = () => {
  // navigate hook removed (was unused)

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #e3f2fd 0%, #e8f5e8 100%)' }} 
         className="d-flex align-items-center">
      <Container>
        <Row className="justify-content-center">
          <Col md={6} lg={5}>
            <Card className="shadow-lg border-0 text-center">
              <Card.Body className="p-5">
                <div className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-4"
                     style={{ width: '100px', height: '100px', 
                             background: 'linear-gradient(45deg, var(--secondary-green), #1e7e34)' }}>
                  <i className="fas fa-check text-white" style={{ fontSize: '3rem' }}></i>
                </div>
                
                <h2 className="fw-bold text-dark mb-4">
                  Declaration Submitted Successfully!
                </h2>
                
                <Alert variant="success" className="mb-4">
                  <Alert.Heading className="h6">Success!</Alert.Heading>
                  <p className="mb-2">Your financial declaration has been submitted and saved.</p>
                  <small className="text-muted">You will receive a confirmation email shortly.</small>
                </Alert>
                
                <div className="d-grid gap-3">
                  <Button
                    as={Link}
                    to="/landing"
                    size="lg"
                    className="fw-semibold"
                    style={{ 
                      borderRadius: '12px',
                      background: 'linear-gradient(45deg, var(--primary-blue), #0056b3)',
                      border: 'none'
                    }}
                  >
                    Return to Home
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default ConfirmationPage;
