import React, { useState } from 'react';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'sw', name: 'Swahili' },
  { code: 'hi', name: 'Hindi' },
  { code: 'ar', name: 'Arabic' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  // Add more as needed
];

function getGoogleTranslateUrl(lang) {
  // This will reload the current page with Google Translate web translation
  const url = encodeURIComponent(window.location.href);
  return `https://translate.google.com/translate?hl=${lang}&sl=auto&tl=${lang}&u=${url}`;
}

const CustomTranslateButton = () => {
  const [selected, setSelected] = useState('');

  const handleChange = (e) => {
    const lang = e.target.value;
    setSelected(lang);
    if (lang) {
      window.open(getGoogleTranslateUrl(lang), '_blank');
    }
  };

  return (
    <div style={{ position: 'fixed', top: 10, left: 10, zIndex: 9999, background: 'white', padding: 4, borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <select value={selected} onChange={handleChange} style={{ maxWidth: 180, minWidth: 80, fontSize: 14, padding: '2px 6px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
        <option value="">Translate page...</option>
        {LANGUAGES.map(lang => (
          <option key={lang.code} value={lang.code}>{lang.name}</option>
        ))}
      </select>
    </div>
  );
};

export default CustomTranslateButton;
