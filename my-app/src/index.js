import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
// Install global axios interceptors (auth + 404 handling)
import { installGlobalInterceptors } from './api';
import { clearEditContext } from './utilis/editContext';

installGlobalInterceptors(
  () => {
    const current = window.location.pathname + window.location.search;
    if (!current.startsWith('/login')) {
      window.location.href = `/login?next=${encodeURIComponent(current)}`;
    }
  },
  (err) => {
    if (err?.config?.url && /\/api\/declarations\//.test(err.config.url)) {
      try { clearEditContext(); } catch(_) {}
    }
  }
);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
