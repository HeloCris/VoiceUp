import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';

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
    firebaseConfig.messagingSenderId &&
    firebaseConfig.measurementId
);

export const localAuthBypass = localAuthBypassEnv || !isFirebaseConfigValid;
export const firebaseConfigValid = isFirebaseConfigValid;

const app = isFirebaseConfigValid && (getApps().length ? getApps()[0] : initializeApp(firebaseConfig));

export const auth: Auth | null = localAuthBypass || !app ? null : getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function getAuthToken(forceRefresh = false): Promise<string | null> {
  if (localAuthBypass) return 'local-token';
  if (!auth) return null;
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const token = await getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (localAuthBypass && typeof window !== 'undefined') {
    const localEmail = window.localStorage.getItem('voiceup_local_email');
    const localRole = window.localStorage.getItem('voiceup_local_role');
    if (localEmail) headers['X-Local-User-Email'] = localEmail;
    if (localRole) headers['X-Local-Role'] = localRole;
  }
  return headers;
}
