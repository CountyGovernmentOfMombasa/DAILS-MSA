import React, { useState } from 'react';
import axios from 'axios';
import { useLocation, useNavigate, Link } from 'react-router-dom';

export default function ConsentForm() {
  const navigate = useNavigate();
  const location = useLocation();
  // Pre-fill from location.state.profile if available
  const profile = location.state?.profile || {};
  const [fullName, setFullName] = useState(() => {
    if (profile.first_name || profile.surname) {
      return `${profile.first_name || ''} ${profile.other_names || ''} ${profile.surname || ''}`.replace(/\s+/g, ' ').trim();
    }
    return '';
  });
  const [nationalId, setNationalId] = useState(profile.national_id || '');
  const [designation, setDesignation] = useState(profile.designation || profile.department || '');
  const [signed, setSigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async () => {
    if (!signed) {
      setError('Please check the signature box to consent.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const fn = fullName.trim().replace(/\s+/g, ' ');
      const nid = nationalId.trim();
      if (fn.length < 2 || fn.length > 150) {
        setError('Full name must be between 2 and 150 characters.');
        setSubmitting(false);
        return;
      }
      if (nid.length < 4 || nid.length > 30) {
        setError('National ID must be between 4 and 30 characters.');
        setSubmitting(false);
        return;
      }
      await axios.post('/api/consent/consent', {
        full_name: fn,
        national_id: nid,
        designation,
        signed
      });
      navigate('/user-form', { state: { ...location.state } });
    } catch (e) {
      setError('Failed to log consent. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 24, margin: 0 }}>Consent Form</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link to="/privacy-notice" style={{ color: '#0056b3', textDecoration: 'underline', fontWeight: 600 }}>View Privacy Notice</Link>
        </div>
      </div>
      <div style={{
        background: '#f9f9f9',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        padding: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
      }}>
        <p style={{ marginBottom: 10, fontSize: 15 }}>
          This Consent Form is issued pursuant to the Kenya Data Protection Act, 2019 and in compliance with the Kenya Conflict of Interest Act, 2025. By signing this form, you provide consent to the County Government of Mombasa to collect and process your personal and sensitive personal data through the Online Declaration of Income, Assets and Liabilities (ODIAL) System.
        </p>
        <p style={{ marginBottom: 10, fontSize: 15 }}><b>Purpose of Data Collection:</b><br />
          Your personal and sensitive personal data will be collected and processed solely for the purposes of compliance, verification, monitoring, and reporting under the Conflict of Interest Act, 2025, and to promote transparency and accountability in public service.
        </p>
        <p style={{ marginBottom: 10, fontSize: 15 }}><b>Categories of Data to be Collected:</b></p>
        <ol style={{ marginBottom: 10, fontSize: 15, paddingLeft: 24 }}>
          <li>Personal Identification Information (e.g., full name, national ID, contact details)</li>
          <li>Employment Information (e.g., designation, department)</li>
          <li>Financial Information (e.g., income, assets, liabilities)</li>
          <li>Sensitive Personal Data (e.g., family relationships, beneficial interests)</li>
        </ol>
        <p style={{ marginBottom: 10, fontSize: 15 }}><b>Your Rights:</b><br />
          Under the Data Protection Act, 2019, you have the right to be informed, access your data, request correction or deletion, restrict processing, object to processing, and lodge a complaint with the Office of the Data Protection Commissioner (ODPC).
        </p>
        <p style={{ marginBottom: 10, fontSize: 15 }}><b>Consent Declaration:</b><br />
          I hereby voluntarily provide my consent to the County Government of Mombasa for the collection, processing, and storage of my personal and sensitive personal data through the ODIAL System for the purposes stated above. I understand my rights under the Data Protection Act, 2019 and the Conflict of Interest Act, 2025.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 16 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontWeight: 500 }}>Full Name:</label>
            <input
              type="text"
              style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
              value={fullName}
              onChange={e => setFullName(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontWeight: 500 }}>National ID Number:</label>
            <input
              type="text"
              style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
              value={nationalId}
              onChange={e => setNationalId(e.target.value)}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontWeight: 500 }}>Designation/Department:</label>
            <input
              type="text"
              style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
              value={designation}
              onChange={e => setDesignation(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontWeight: 500, marginRight: 8 }}>Signature:</label>
            <input
              type="checkbox"
              checked={signed}
              onChange={e => setSigned(e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
            <span style={{ fontSize: 15 }}>I agree</span>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label style={{ fontWeight: 500 }}>Date:</label>
            <input
              type="text"
              style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
              value={new Date().toLocaleDateString('en-GB')}
              disabled
              aria-label="Consent Date"
            />
          </div>
        </div>
        {error && <div style={{ color: 'red', marginTop: 12 }}>{error}</div>}
        <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
          <button
            onClick={onSubmit}
            disabled={submitting}
            style={{ padding: '10px 20px', background: '#007bff', color: '#fff', border: 'none', borderRadius: 4, cursor: submitting ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? 'Submitting…' : 'Submit Consent'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{ padding: '10px 20px', background: '#f1f3f5', color: '#333', border: '1px solid #ced4da', borderRadius: 4, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
