import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const privacyNotice = [
  'This Privacy Notice is issued pursuant to Section 29 of the Data Protection Act, 2019 and in compliance with the Conflict of Interest Act, 2025. It explains how the County Government of Mombasa collects, uses, stores, and protects personal and sensitive personal data through the Online Declaration of Income, Assets and Liabilities (ODIAL) System.',
  'Purpose of Collection:',
  'The Mombasa County Public Service Board collects personal data and sensitive personal data through the Online Declaration of Income, Assets and Liablities System for the purpose of ensuring compliance with the Conflict of Interest Act, 2025, promoting transparency, accountability, and integrity in public service.',
  'Categories of Data Collected:',
  'Personal Identification Information (name, ID number, contact details)',
  'Employment Information (designation, department)',
  'Financial Information (income, assets, liabilities)',
  'Sensitive Personal Data (family relationships, beneficial interests)',
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

export default function PrivacyNotice() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const backDest = from === 'consent' ? '/consent' : from === 'guidnotes' ? '/guidnotes' : '/guidnotes';
  const backLabel = from === 'consent' ? 'Back to Consent Form' : 'Back to Guidelines';
  const sectionHeaders = [
    'Purpose of Collection:',
    'Categories of Data Collected:',
    'Legal Basis for Processing:',
    'Use of Data:',
    'Data Sharing:',
    'Data Security:',
    'Data Retention:',
    'Your Rights:',
    'Contact Information:'
  ];

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 24, margin: 0 }}>Privacy Notice</h2>
        <button
          type="button"
          onClick={() => navigate(backDest, { state: { ...location.state } })}
          style={{
            color: '#0056b3',
            textDecoration: 'underline',
            fontWeight: 600,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          {backLabel}
        </button>
      </div>
      <div style={{ background: '#f8f9fa', padding: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
        {privacyNotice.map((line, idx) => {
          const isHeader = sectionHeaders.includes(line.trim());
          return (
            <p key={idx} style={{ marginBottom: 10, fontSize: 15, whiteSpace: 'pre-line' }}>
              {isHeader ? <b>{line}</b> : line}
            </p>
          );
        })}
      </div>
    </div>
  );
}
