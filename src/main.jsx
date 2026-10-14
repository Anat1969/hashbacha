import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);

// Chrome offers "Install" only with a registered service worker; the prompt is kept for the in-app button.
window.__hbInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__hbInstall = e;
  window.dispatchEvent(new Event('hb-installable'));
});
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
