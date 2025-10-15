import React, { useState, useEffect, useRef, useCallback } from 'react';

const EmailValidator = ({ 
    email, 
    userId = null, 
    onValidation, 
    className = '',
    placeholder = "Enter email address",
    required = false 
}) => {
    const [isValidating, setIsValidating] = useState(false);
    const [validationStatus, setValidationStatus] = useState({
        isValid: null,
        message: '',
        available: null
    });
    // Use a ref for debounce timer so it doesn't become a hook dependency
    const debounceRef = useRef(null);

    // Stable validator function so effect deps are well-defined
    const validateEmail = useCallback(async (emailToValidate) => {
        setIsValidating(true);

        try {
            // Client-side validation first
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const isFormatValid = emailRegex.test(emailToValidate);

            if (!isFormatValid) {
                const status = {
                    isValid: false,
                    message: 'Please enter a valid email format',
                    available: null
                };
                setValidationStatus(status);
                if (onValidation) onValidation(status);
                return;
            }

            // Server-side validation for uniqueness
            const response = await fetch('/api/users/validate-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    email: emailToValidate,
                    userId: userId
                })
            });

            if (response.ok) {
                const result = await response.json();
                const status = {
                    isValid: result.available,
                    message: result.message,
                    available: result.available
                };
                setValidationStatus(status);
                if (onValidation) onValidation(status);
            } else {
                const status = {
                    isValid: false,
                    message: 'Unable to validate email. Please try again.',
                    available: null
                };
                setValidationStatus(status);
                if (onValidation) onValidation(status);
            }
        } catch (error) {
            console.error('Email validation error:', error);
            const status = {
                isValid: false,
                message: 'Network error during validation',
                available: null
            };
            setValidationStatus(status);
            if (onValidation) onValidation(status);
        } finally {
            setIsValidating(false);
        }
    }, [onValidation, userId]);

    useEffect(() => {
        // Clear previous timer (if any)
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }

        if (email && email.length > 0) {
            debounceRef.current = setTimeout(() => {
                validateEmail(email);
            }, 500); // 500ms debounce
        } else {
            const emptyStatus = {
                isValid: required ? false : true,
                message: required ? 'Email is required' : '',
                available: null
            };
            setValidationStatus(emptyStatus);
            if (onValidation) onValidation(emptyStatus);
        }

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
                debounceRef.current = null;
            }
        };
    }, [email, required, validateEmail, onValidation]);

    const getValidationClass = () => {
        if (isValidating) return 'validating';
        if (validationStatus.isValid === null) return '';
        return validationStatus.isValid ? 'valid' : 'invalid';
    };

    const getValidationMessage = () => {
        if (isValidating) return 'Validating...';
        return validationStatus.message;
    };

    const getValidationIcon = () => {
        if (isValidating) {
            return <span className="validation-icon loading">⏳</span>;
        }
        if (validationStatus.isValid === true) {
            return <span className="validation-icon success">✅</span>;
        }
        if (validationStatus.isValid === false) {
            return <span className="validation-icon error">❌</span>;
        }
        return null;
    };

    return (
        <div className={`email-validator ${className}`}>
            <div className={`email-input-container ${getValidationClass()}`}>
                <input
                    type="email"
                    value={email}
                    placeholder={placeholder}
                    className={`email-input ${getValidationClass()}`}
                    readOnly
                />
                {getValidationIcon()}
            </div>
            
            {validationStatus.message && (
                <div className={`validation-message ${getValidationClass()}`}>
                    {getValidationMessage()}
                </div>
            )}

            <style jsx>{`
                .email-validator {
                    position: relative;
                }

                .email-input-container {
                    position: relative;
                    display: flex;
                    align-items: center;
                }

                .email-input {
                    width: 100%;
                    padding: 8px 35px 8px 12px;
                    border: 2px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    transition: all 0.3s ease;
                }

                .email-input:focus {
                    outline: none;
                    border-color: #007bff;
                }

                .email-input.validating {
                    border-color: #ffc107;
                }

                .email-input.valid {
                    border-color: #28a745;
                    background-color: #f8fff9;
                }

                .email-input.invalid {
                    border-color: #dc3545;
                    background-color: #fff5f5;
                }

                .validation-icon {
                    position: absolute;
                    right: 10px;
                    font-size: 16px;
                }

                .validation-icon.loading {
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                .validation-message {
                    margin-top: 5px;
                    font-size: 12px;
                    transition: all 0.3s ease;
                }

                .validation-message.validating {
                    color: #ffc107;
                }

                .validation-message.valid {
                    color: #28a745;
                }

                .validation-message.invalid {
                    color: #dc3545;
                }
            `}</style>
        </div>
    );
};

// Hook for email validation in forms
export const useEmailValidation = (initialEmail = '', userId = null, required = false) => {
    const [email, setEmail] = useState(initialEmail);
    const [validation, setValidation] = useState({
        isValid: null,
        message: '',
        available: null
    });

    const handleEmailChange = (newEmail) => {
        setEmail(newEmail);
    };

    const handleValidation = (validationResult) => {
        setValidation(validationResult);
    };

    const isEmailValid = () => {
        if (!required && !email) return true;
        return validation.isValid === true;
    };

    return {
        email,
        setEmail: handleEmailChange,
        validation,
        isValid: isEmailValid(),
        EmailValidator: (props) => (
            <EmailValidator
                email={email}
                userId={userId}
                onValidation={handleValidation}
                required={required}
                {...props}
            />
        )
    };
};

export default EmailValidator;
