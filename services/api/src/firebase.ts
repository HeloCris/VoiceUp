import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getApp, getApps, initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const envPaths = [
  path.resolve(__dirname, '../.env'),
  path.resolve(process.cwd(), '.env'),
];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`Loaded .env from ${envPath}`);
    break;
  }
}

let initialized = false;

const parseServiceAccount = (): ServiceAccount | undefined => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw) {
    return undefined;
  }

  const tryParseJson = (value: string): ServiceAccount | undefined => {
    try {
      const parsed = JSON.parse(value) as ServiceAccount;
      return parsed;
    } catch {
      return undefined;
    }
  };

  const maybeJson = tryParseJson(raw);
  if (maybeJson) return maybeJson;

  const maybeFile = raw.trim();
  const pathsToTry = [
    maybeFile,
    path.isAbsolute(maybeFile) ? maybeFile : path.resolve(maybeFile),
    path.resolve(process.cwd(), maybeFile),
  ];
  for (const filePath of pathsToTry) {
    if (!filePath || !fs.existsSync(filePath)) continue;
    const contents = fs.readFileSync(filePath, 'utf8');
    const parsed = tryParseJson(contents);
    if (parsed) return parsed;
  }

  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf8');
    return tryParseJson(decoded);
  } catch {
    return undefined;
  }
};

const getProjectId = (serviceAccount?: ServiceAccount) => {
  if (!serviceAccount) return undefined;
  return (serviceAccount as { projectId?: string; project_id?: string }).projectId ??
    (serviceAccount as { projectId?: string; project_id?: string }).project_id;
};

const getDefaultStorageBucket = (projectId?: string) =>
  projectId ? `${projectId}.appspot.com` : undefined;

export const DEFAULT_STORAGE_BUCKET = (() => {
  const envServiceAccount = parseServiceAccount();
  const projectId = getProjectId(envServiceAccount) ?? process.env.GCP_PROJECT_ID;
  return (
    process.env.STORAGE_BUCKET ??
    process.env.FIREBASE_STORAGE_BUCKET ??
    getDefaultStorageBucket(projectId)
  );
})();

export function ensureFirebase(serviceAccount?: ServiceAccount) {
  if (!initialized) {
    if (!getApps().length) {
      const envServiceAccount = parseServiceAccount();
      const projectId = getProjectId(envServiceAccount) ?? process.env.GCP_PROJECT_ID;
      const storageBucket =
        process.env.STORAGE_BUCKET ??
        process.env.FIREBASE_STORAGE_BUCKET ??
        getDefaultStorageBucket(projectId);
      const options = {
        storageBucket,
      } as { storageBucket?: string; credential?: ReturnType<typeof cert> };

      if (serviceAccount) {
        options.credential = cert(serviceAccount);
      } else if (envServiceAccount) {
        options.credential = cert(envServiceAccount);
      }

      if (!options.credential && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.warn(
          'Firebase Admin SDK initialized without explicit credentials. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_KEY in services/api/.env.'
        );
      }
      if (!options.storageBucket) {
        console.warn(
          'Firebase Admin SDK initialized without storageBucket. Set STORAGE_BUCKET or FIREBASE_STORAGE_BUCKET in services/api/.env, or ensure GCP project ID is available.'
        );
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
