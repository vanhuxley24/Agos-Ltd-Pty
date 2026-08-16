import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Catch and recover from any browser IndexedDB corruption rejections gracefully
window.addEventListener('unhandledrejection', (event) => {
  if (
    event.reason?.message?.includes('IndexedDB') ||
    event.reason?.name === 'CorruptionError' ||
    event.reason?.name === 'VersionError'
  ) {
    console.warn('Recovered from IndexedDB storage warning:', event.reason);
    event.preventDefault();
  }
});

// Clean up any old offline service workers
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
