import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner, InputGroup } from 'react-bootstrap';
import PasswordStrength from './PasswordStrength';

const ChangePasswordPage = () => {
    const [passwords, setPasswords] = useState({
        newPassword: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [show, setShow] = useState({ new: false, confirm: false });
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { token } = location.state || {};

    const handleChange = (e) => {
        setPasswords({
            ...passwords,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        if (passwords.newPassword !== passwords.confirmPassword) {
            setError('Passwords do not match');
            setIsLoading(false);
            return;
        }


        // Password policy: min 8 chars, upper, lower, number, symbol
        const policy = {
            minLength: 8,
            upper: /[A-Z]/,
            lower: /[a-z]/,
            number: /[0-9]/,
            symbol: /[^A-Za-z0-9]/
        };
        if (
            passwords.newPassword.length < policy.minLength ||
            !policy.upper.test(passwords.newPassword) ||
            !policy.lower.test(passwords.newPassword) ||
            !policy.number.test(passwords.newPassword) ||
            !policy.symbol.test(passwords.newPassword)
        ) {
            setError('Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.');
            setIsLoading(false);
            return;
        }

        try {
            const response = await fetch('/api/auth/change-password', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    newPassword: passwords.newPassword
                })
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('token', data.token);
                if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
                if (data.accessExpiresInMs) localStorage.setItem('tokenExpiresAt', String(Date.now() + data.accessExpiresInMs));
                // After password change, proceed to consent
                navigate('/consent');
            } else {
                setError(data.message || 'Failed to change password');
            }
        } catch (error) {
            setError('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #e3f2fd 0%, #e8f5e8 100%)' }} 
             className="d-flex align-items-center justify-content-center">
            <Container>
                <Row className="justify-content-center">
                    <Col lg={6}>
                        <Card className="shadow-lg border-0">
                            <Card.Body className="p-5">
                                <div className="text-center mb-4">
                                    <div className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                                         style={{ width: '80px', height: '80px', 
                                                 background: 'linear-gradient(45deg, var(--primary-blue), var(--secondary-green))' }}>
                                        <i className="fas fa-lock text-white" style={{ fontSize: '2rem' }}></i>
                                    </div>
                                    <h2 className="fw-bold text-dark mb-2">Change Password</h2>
                                    <p className="text-muted">Please set a new password for your account</p>
                                </div>

                                <Form onSubmit={handleSubmit}>
                                    <Form.Group className="mb-3">
                                        <Form.Label className="fw-semibold">New Password</Form.Label>
                                        <InputGroup>
                                            <Form.Control
                                                type={show.new ? 'text' : 'password'}
                                                name="newPassword"
                                                placeholder="Enter your new password"
                                                value={passwords.newPassword}
                                                onChange={handleChange}
                                                required
                                                className="py-3"
                                                autoComplete="new-password"
                                                style={{ borderTopLeftRadius: '12px', borderBottomLeftRadius: '12px', borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                                                aria-label="New password"
                                            />
                                            <Button
                                                variant="outline-secondary"
                                                type="button"
                                                onClick={() => setShow(s => ({ ...s, new: !s.new }))}
                                                aria-label={show.new ? 'Hide new password' : 'Show new password'}
                                                style={{ borderTopRightRadius: '12px', borderBottomRightRadius: '12px', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                                            >
                                                <i className={`fas ${show.new ? 'fa-eye-slash' : 'fa-eye'}`} />
                                            </Button>
                                        </InputGroup>
                                        <small className="text-muted">
                                            Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.<br/>
                                            You cannot reuse your previous password.
                                        </small>
                                        <PasswordStrength password={passwords.newPassword} small />
                                    </Form.Group>

                                    <Form.Group className="mb-3">
                                        <Form.Label className="fw-semibold">Confirm Password</Form.Label>
                                        <InputGroup>
                                            <Form.Control
                                                type={show.confirm ? 'text' : 'password'}
                                                name="confirmPassword"
                                                placeholder="Confirm your new password"
                                                value={passwords.confirmPassword}
                                                onChange={handleChange}
                                                required
                                                className="py-3"
                                                autoComplete="new-password"
                                                style={{ borderTopLeftRadius: '12px', borderBottomLeftRadius: '12px', borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                                                aria-label="Confirm new password"
                                            />
                                            <Button
                                                variant="outline-secondary"
                                                type="button"
                                                onClick={() => setShow(s => ({ ...s, confirm: !s.confirm }))}
                                                aria-label={show.confirm ? 'Hide confirm password' : 'Show confirm password'}
                                                style={{ borderTopRightRadius: '12px', borderBottomRightRadius: '12px', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                                            >
                                                <i className={`fas ${show.confirm ? 'fa-eye-slash' : 'fa-eye'}`} />
                                            </Button>
                                        </InputGroup>
                                    </Form.Group>

                                    {error && (
                                        <Alert variant="danger" className="mb-3">
                                            {error}
                                        </Alert>
                                    )}

                                    <Button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-100 py-3 fw-semibold"
                                        style={{ 
                                            borderRadius: '12px',
                                            background: 'linear-gradient(45deg, var(--primary-blue), #0056b3)',
                                            border: 'none'
                                        }}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Spinner size="sm" className="me-2" />
                                                Changing Password...
                                            </>
                                        ) : (
                                            'Change Password'
                                        )}
                                    </Button>
                                </Form>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </Container>
        </div>
    );
};

export default ChangePasswordPage;