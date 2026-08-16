import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

console.log("Firebase: Initializing with config for project:", firebaseConfig.projectId);

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with settings
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
}, firebaseConfig.firestoreDatabaseId || '(default)');

// Enable Offline Persistence with graceful fallback
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open, persistence can only be enabled in one tab at a time.
    console.warn('Firestore persistence notice: Multiple tabs open in browser.');
  } else if (err.code === 'unimplemented') {
    // The current browser does not support all features required for persistence
    console.warn('Firestore persistence notice: Browser does not support IndexedDB persistence.');
  } else {
    console.warn('Firestore persistence notice:', err.message || err);
  }
});

// Initialize Auth
export const auth = getAuth(app);

export default app;
