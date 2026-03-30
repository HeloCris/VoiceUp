import type { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';

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
    console.error('Invalid auth token', error);
    return res.status(401).json({ error: 'Invalid auth token' });
  }
}
