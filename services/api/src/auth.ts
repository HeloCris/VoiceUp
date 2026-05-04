import type { Request, Response, NextFunction } from 'express';
import { createVerify } from 'crypto';
import { getAuth } from 'firebase-admin/auth';

const FIREBASE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let cachedCerts: Record<string, string> | null = null;
let certsExpiresAt = 0;

const base64UrlDecode = (value: string) => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
};

const parseJwt = (segment: string) => JSON.parse(base64UrlDecode(segment).toString('utf8')) as Record<string, unknown>;

const fetchFirebaseCerts = async () => {
  if (cachedCerts && Date.now() < certsExpiresAt) {
    return cachedCerts;
  }

  const response = await fetch(FIREBASE_CERTS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Firebase certs: ${response.status} ${response.statusText}`);
  }

  certsExpiresAt = Date.now() + 5 * 60 * 1000;
  const cacheControl = response.headers.get('cache-control');
  if (cacheControl) {
    const match = cacheControl.match(/max-age=(\d+)/);
    if (match) {
      certsExpiresAt = Date.now() + Number(match[1]) * 1000;
    }
  }

  cachedCerts = (await response.json()) as Record<string, string>;
  return cachedCerts;
};

const verifyFirebaseTokenDirectly = async (token: string) => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const header = parseJwt(parts[0]);
  const payload = parseJwt(parts[1]);
  const kid = header.kid as string | undefined;
  if (!kid) {
    throw new Error('JWT header missing kid');
  }

  const certs = await fetchFirebaseCerts();
  const cert = certs[kid];
  if (!cert) {
    throw new Error('Unknown Firebase cert kid');
  }

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const signature = base64UrlDecode(parts[2]);
  if (!verifier.verify(cert, signature)) {
    throw new Error('Invalid Firebase token signature');
  }

  const now = Math.floor(Date.now() / 1000);
  const aud = payload.aud as string | undefined;
  const iss = payload.iss as string | undefined;
  const exp = payload.exp as number | undefined;
  const iat = payload.iat as number | undefined;
  const sub = payload.sub as string | undefined;

  if (!aud || !iss || !exp || !iat || !sub) {
    throw new Error('Invalid Firebase token payload');
  }
  if (iss !== `https://securetoken.google.com/${aud}`) {
    throw new Error('Invalid Firebase token issuer');
  }
  if (exp <= now) {
    throw new Error('Firebase token expired');
  }
  if (iat > now) {
    throw new Error('Firebase token issued in the future');
  }

  return payload;
};

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const token = header.replace('Bearer ', '').trim();
  try {
    const decoded = await getAuth().verifyIdToken(token);
    (req as Request & { user?: typeof decoded }).user = decoded;
    return next();
  } catch (error) {
    console.warn('Firebase admin verify failed, trying direct verify:', error instanceof Error ? error.message : error);
  }

  try {
    const payload = await verifyFirebaseTokenDirectly(token);
    (req as Request & { user?: typeof payload }).user = payload;
    return next();
  } catch (error) {
    console.error('Invalid auth token fallback', error);
    return res.status(401).json({ error: 'Invalid auth token' });
  }
}
