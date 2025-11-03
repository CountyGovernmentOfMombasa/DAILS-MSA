import React, { useState } from "react";
import { useNavigate, useLocation, Link } from 'react-router-dom';

const guidelines = [
  "A public officer should read these guidelines carefully and follow the instructions in the form before completing it.",
  "When completing the form, a public officer shall write legibly, type or print the required information.",
  "Where the responsible Commission has a web application for filing the declaration, a public officer may fill and submit the declaration online. In such a case, a physical signature or delivery acknowledgment slip will not be necessary.",
  "The declaration is for the income, assets and liabilities of a public official, his spouse or spouses and his dependent children under the age of 18 years.",
  "All public officers are required to complete and submit their declarations to their responsible Commission, unless their responsible Commission has delegated its functions to another body.",
  "The obligation to make declarations applies to all state and public officers including those on leave, under disciplinary action, secondment and overseas assignments, unless the Attorney General has granted a dispensation exempting an officer or a certain category of public official from filing their declarations, for reasons to be published in the Gazette.",
  "The responsibility of ensuring that a declaration has been received by the appropriate reporting authority or its agent lies on the public officer. Provided that where the officer sends the form under confidential cover directly to the responsible Commission, the officer should label the envelope with the words 'Declaration of Incomes, Assets and Liabilities'. The organization and job group of the officer should also be indicated on the envelope.",
  "A public officer is required to complete an initial declaration within thirty days of appointment and the statement date of the declaration will be the date the officer became a public officer.",
  "A public officer is required to make a biennial declaration on or before the 31st day of December every other year or as may be provided for under the Act. The statement date for the biennial declaration will be 1st of November of the year in which the declaration is required.",
  "A public officer is required to make a final declaration within thirty days of ceasing to be a public officer. The statement date of the final declaration shall be the date the public official ceased to be a public official.",
  "A person submitting a declaration or providing a clarification shall ensure that the declaration or clarification is correct to the best of their knowledge.",
  "If space on the form is not adequate, additional information may be included on separate sheets, while clearly indicating the number and paragraph being continued.",
  "For each form submitted, there will be an acknowledgment slip issued by the responsible Commission or its agent.",
  "Where a declaration is submitted electronically in accordance with the regulations made under this Act or administrative procedures adopted by the responsible Commission or any other competent authority, the declaration shall be valid notwithstanding the absence of a signature or acknowledgement stamp or receipt or slip.",
  "Income, assets and liabilities that a public officer may have outside Kenya, should be declared. Joint assets, properties, personal and business accounts within and outside Kenya should also be declared.",
  "Where a public officer has contravened the provisions of the Code of Conduct and Ethics relating to the declaration of Income, Assets and Liabilities, appropriate disciplinary action will be taken by the responsible Commission, or other appropriate authority, in accordance with the applicable disciplinary procedures."
];


function GuidNotes() {
  const [checked, setChecked] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleChange = (e) => {
    setChecked(e.target.checked);
  };

  const handleContinue = () => {
    if (checked) {
      navigate('/user-form', { state: { ...location.state } });
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "40px auto", padding: 24 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
        {/* Guidelines only */}
        <div style={{ flex: 1, minWidth: 340, background: '#fff', padding: 24, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          <h1 style={{ fontSize: 28, marginBottom: 16 }}>Guidelines on the Completion of the Declaration of Income, Assets and Liabilities</h1>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <Link to="/privacy-notice" state={{ from: 'guidnotes' }} style={{ color: '#0056b3', textDecoration: 'underline', fontWeight: 600 }}>View Privacy Notice</Link>
          </div>
          <ol style={{ paddingLeft: 20 }}>
            {guidelines.map((note, idx) => (
              <li key={idx} style={{ marginBottom: 12, fontSize: 16 }}>{note}</li>
            ))}
          </ol>
          <div style={{ marginBottom: 24, textAlign: 'right' }}>
            <a
              href={require('../files/SAMPLE OF A FILLED DIALs FORM..pdf')}
              download
              style={{
                color: '#007bff',
                fontWeight: 'bold',
                textDecoration: 'underline',
                fontSize: 16,
                padding: '8px 16px',
                borderRadius: 4,
                background: '#f8f9fa',
                border: '1px solid #e0e0e0',
                display: 'inline-block'
              }}
            >
              Download Sample DAILs Form (PDF)
            </a>
          </div>
        </div>
      </div>
      {/* Checkbox and Continue button below */}
      <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <div style={{ marginBottom: 16 }}>
          <label>
            <input type="checkbox" checked={checked} onChange={handleChange} />{' '}
            I have read and understood the guidelines
          </label>
        </div>
        <button
          onClick={handleContinue}
          disabled={!checked}
          style={{ padding: '10px 24px', fontSize: 16, background: '#007bff', color: '#fff', border: 'none', borderRadius: 4, cursor: checked ? 'pointer' : 'not-allowed' }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

export default GuidNotes;
