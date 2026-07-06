import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  type Auth,
} from 'firebase/auth';

const localAuthBypassEnv = import.meta.env.VITE_LOCAL_AUTH_BYPASS === 'true';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const isFirebaseConfigValid = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId &&
    firebaseConfig.storageBucket &&
    firebaseConfig.messagingSenderId
);

export const localAuthBypass = true;
export const firebaseConfigValid = false;
const extensionEmailStorageKey = 'voiceup_extension_google_email';

const app = null;

export const auth: Auth | null = null;
export const googleProvider = null;

if (googleProvider) {
  googleProvider.setCustomParameters({ prompt: 'select_account' });
}

if (auth) {
  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.warn('Failed to set Firebase auth persistence', error);
  });
}

export async function getAuthToken(forceRefresh = false): Promise<string | null> {
  if (localAuthBypass) return 'local-token';
  if (!auth?.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken(forceRefresh);
  } catch (error) {
    console.error('Failed to get Firebase auth token', error);
    return null;
  }
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const token = await getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  // In extension context, allow API auth fallback via Chrome profile email.
  if (!token && typeof window !== 'undefined' && window.location.protocol === 'chrome-extension:') {
    const extensionEmail = (window.localStorage.getItem(extensionEmailStorageKey) ?? '').trim().toLowerCase();
    if (extensionEmail) {
      headers['X-Local-User-Email'] = extensionEmail;
    }
  }

  if (localAuthBypass && typeof window !== 'undefined') {
    const localEmail = window.localStorage.getItem('voiceup_local_email');
    const localRole = window.localStorage.getItem('voiceup_local_role');
    if (localEmail) headers['X-Local-User-Email'] = localEmail;
    if (localRole) headers['X-Local-Role'] = localRole;
  }
  return headers;
}
