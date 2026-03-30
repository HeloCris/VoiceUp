import { getApp, getApps, initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

let initialized = false;

export function ensureFirebase(serviceAccount?: ServiceAccount) {
  if (!initialized) {
    if (!getApps().length) {
      const options = {
        storageBucket: process.env.STORAGE_BUCKET,
      } as { storageBucket?: string; credential?: ReturnType<typeof cert> };
      if (serviceAccount) {
        options.credential = cert(serviceAccount);
      }
      initializeApp(options);
    } else {
      getApp();
    }
    initialized = true;
  }
  return {
    firestore: getFirestore(),
    storage: getStorage(),
  };
}
