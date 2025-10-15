import React, { useState } from "react";
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';

const guidelines = [
  "A public officer should read these guidelines carefully and follow the instructions in the form before completing it.",
  "When completing the form, a public officer shall write legibly, type or print the required information.",
  "1. Where the responsible Commission has a web application for filing the declaration, a public officer may fill and submit the declaration online. In such a case, a physical signature or delivery acknowledgment slip will not be necessary.",
  "2. The declaration is for the income, assets and liabilities of a public official, his spouse or spouses and his dependent children under the age of 18 years.",
  "3. All public officers are required to complete and submit their declarations to their responsible Commission, unless their responsible Commission has delegated its functions to another body.",
  "4. The obligation to make declarations applies to all state and public officers including those on leave, under disciplinary action, secondment and overseas assignments, unless the Attorney General has granted a dispensation exempting an officer or a certain category of public official from filing their declarations, for reasons to be published in the Gazette.",
  "5. The responsibility of ensuring that a declaration has been received by the appropriate reporting authority or its agent lies on the public officer. Provided that where the officer sends the form under confidential cover directly to the responsible Commission, the officer should label the envelope with the words 'Declaration of Incomes, Assets and Liabilities'. The organization and job group of the officer should also be indicated on the envelope.",
  "6. A public officer is required to complete an initial declaration within thirty days of appointment and the statement date of the declaration will be the date the officer became a public officer.",
  "7. A public officer is required to make a biennial declaration on or before the 31st day of December every other year or as may be provided for under the Act. The statement date for the biennial declaration will be 1st of November of the year in which the declaration is required.",
  "8. A public officer is required to make a final declaration within thirty days of ceasing to be a public officer. The statement date of the final declaration shall be the date the public official ceased to be a public official.",
  "9. A person submitting a declaration or providing a clarification shall ensure that the declaration or clarification is correct to the best of their knowledge.",
  "10. If space on the form is not adequate, additional information may be included on separate sheets, while clearly indicating the number and paragraph being continued.",
  "11. For each form submitted, there will be an acknowledgment slip issued by the responsible Commission or its agent.",
  "12. Where a declaration is submitted electronically in accordance with the regulations made under this Act or administrative procedures adopted by the responsible Commission or any other competent authority, the declaration shall be valid notwithstanding the absence of a signature or acknowledgement stamp or receipt or slip.",
  "13. Income, assets and liabilities that a public officer may have outside Kenya, should be declared. Joint assets, properties, personal and business accounts within and outside Kenya should also be declared.",
  "14. Where a public officer has contravened the provisions of the Code of Conduct and Ethics relating to the declaration of Income, Assets and Liabilities, appropriate disciplinary action will be taken by the responsible Commission, or other appropriate authority, in accordance with the applicable disciplinary procedures."
];


const privacyNotice = [
  'This Privacy Notice is issued pursuant to Section 29 of the Data Protection Act, 2019 and in compliance with the Conflict of Interest Act, 2025. It explains how the County Government of Mombasa collects, uses, stores, and protects personal and sensitive personal data through the Online Declaration of Income, Assets and Liabilities (ODIAL) System.',
  'Purpose of Collection:',
  'The Mombasa County Public Service Board collects personal data and sensitive personal data through the Online Declaration of Income, Assets and Liablities System for the purpose of ensuring compliance with the Conflict of Interest Act, 2025, promoting transparency, accountability, and integrity in public service.',
  'Categories of Data Collected:',
  '1. Personal Identification Information (name, ID number, contact details)',
  '2. Employment Information (designation, department)',
  '3. Financial Information (income, assets, liabilities)',
  '4. Sensitive Personal Data (family relationships, beneficial interests)',
  'Legal Basis for Processing:',
  'The processing of personal data is based on the County Government’s legal obligation under the Data Protection Act, 2019 and the Conflict of Interest Act, 2025.',
  'Use of Data:',
  'The data collected will only be used for the purpose of verification, monitoring, compliance, and reporting under the Conflict of Interest Act, 2025. It will not be used for any unrelated purposes without your consent.',
  'Data Sharing:',
  'Data may be shared with authorized government agencies, oversight bodies, and law enforcement agencies strictly as provided by law.',
  'Data Security:',
  'The County Government of Mombasa applies appropriate organizational and technical measures to safeguard data against unauthorized access, disclosure, alteration, or destruction.',
  'Data Retention:',
  'Personal data will be retained only for as long as is necessary to fulfill the purposes stated and as required by law.',
  'Your Rights:',
  'In accordance with the Data Protection Act, 2019, you have the right to:',
  '- Be informed of the use of your personal data.',
  '- Access your personal data.',
  '- Request correction of inaccurate or misleading data.',
  '- Request deletion of personal data where applicable.',
  '- Object to processing under certain circumstances.',
  '- Lodge a complaint with the Office of the Data Protection Commissioner (ODPC).',
  'Contact Information:',
  'For any inquiries, concerns, or to exercise your rights under the Data Protection Act, please contact:',
  'Data Protection Officer,',
  'County Government of Mombasa,',
  'P.O. Box 90100 – 80100, Mombasa, Kenya.',
  'Email: dpo@mombasa.go.ke'
];


function GuidNotes() {
  const [checked, setChecked] = useState(false);
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

  const handleChange = (e) => {
    setChecked(e.target.checked);
  };

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = async () => {
    if (checked && signed) {
      setSubmitting(true);
      setError('');
      try {
  const fn = fullName.trim().replace(/\s+/g,' ');
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
      } catch (err) {
        setError('Failed to log consent. Please try again.');
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "40px auto", padding: 24 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
        {/* Privacy Notice */}
        <div style={{ flex: 1, minWidth: 400, background: '#f8f9fa', padding: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
          <h2 style={{ fontSize: 22, marginBottom: 16, color: '#0056b3' }}>Privacy Notice</h2>
          {privacyNotice.map((line, idx) => (
            <p key={idx} style={{ marginBottom: 10, fontSize: 15, whiteSpace: 'pre-line' }}>{line}</p>
          ))}
        </div>
        {/* Guidelines */}

        <div style={{ flex: 2, minWidth: 340, background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h1 style={{ fontSize: 28, marginBottom: 16 }}>Guidelines on the Completion of the Declaration of Income, Assets and Liabilities</h1>
          <ol style={{ paddingLeft: 20 }}>
            {guidelines.map((note, idx) => (
              <li key={idx} style={{ marginBottom: 12, fontSize: 16 }}>{note}</li>
            ))}
          </ol>
        </div>
      </div>
      {/* Consent Form, Checkbox and Continue button below both containers */}
      <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <div style={{
          background: '#f9f9f9',
          border: '1px solid #e0e0e0',
          borderRadius: 8,
          padding: 24,
          maxWidth: 700,
          marginBottom: 24,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}>
          <h2 style={{ fontSize: 22, marginBottom: 12, textAlign: 'center', fontWeight: 600 }}>Consent Form for Collection and Processing of Personal Data</h2>
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
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontWeight: 500 }}>Full Name:</label>
              <input
                type="text"
                style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
                value={fullName}
                onChange={e => setFullName(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
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
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontWeight: 500 }}>Designation/Department:</label>
              <input
                type="text"
                style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
                value={designation}
                onChange={e => setDesignation(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, minWidth: 180, display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontWeight: 500, marginRight: 8 }}>Signature:</label>
              <input
                type="checkbox"
                checked={signed}
                onChange={e => setSigned(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontSize: 15 }}>I agree</span>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontWeight: 500 }}>Date:</label>
              {/** Display today's date in DD/MM/YYYY (user example used 18/09/2025) */}
              <input
                type="text"
                style={{ width: '100%', padding: 6, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
                value={new Date().toLocaleDateString('en-GB')}
                disabled
                aria-label="Consent Date"
              />
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>
            <input type="checkbox" checked={checked} onChange={handleChange} />{' '}
            I have read and understood the guidelines
          </label>
        </div>
        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
        <button
          onClick={handleContinue}
          disabled={!checked || !signed || submitting}
          style={{ padding: '10px 24px', fontSize: 16, background: '#007bff', color: '#fff', border: 'none', borderRadius: 4, cursor: checked && signed && !submitting ? 'pointer' : 'not-allowed' }}
        >
          {submitting ? 'Submitting...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

export default GuidNotes;
