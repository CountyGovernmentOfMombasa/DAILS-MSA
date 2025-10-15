import React, { useEffect, useState } from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';
import { useUser } from '../context/UserContext';
import './animations.css';

export default function ProfileErrorToast() {
  const { error, lastErrorAt, refreshProfile } = useUser();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (error && lastErrorAt) {
      setShow(true);
    }
  }, [error, lastErrorAt]);

  if (!error) return null;

  return (
    <ToastContainer position="top-center" className={`p-3 profile-error-toast-wrapper ${show ? 'in' : 'out'}`} style={{ zIndex: 2000 }}>
      <Toast bg="danger" onClose={() => setShow(false)} show={show} delay={6000} autohide animation={false}>
        <Toast.Header closeButton={true}>
          <strong className="me-auto">Profile Load Failed</strong>
        </Toast.Header>
        <Toast.Body className="text-white">
          {error}
          <div className="mt-2">
            <button className="btn btn-sm btn-light" onClick={() => { setShow(false); refreshProfile(); }}>Retry</button>
          </div>
        </Toast.Body>
      </Toast>
    </ToastContainer>
  );
}
