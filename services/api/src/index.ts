import express, { Request, Response } from 'express';
import cors from 'cors';
import { z } from 'zod';
import { CloudTasksClient } from '@google-cloud/tasks';
import { ensureFirebase } from './firebase';
import { authenticate } from './auth';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '20mb' }));

const { firestore, storage } = ensureFirebase();
const tasksClient = new CloudTasksClient();

const PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'voiceup-recordings';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET ?? 'voiceup-recordings';
const TASKS_LOCATION = process.env.TASKS_LOCATION ?? 'us-central1';
const TASKS_QUEUE = process.env.TASKS_QUEUE ?? 'voiceup-tasks';
const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:8081/tasks';
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:8080';
const TEACHER_EMAILS = (process.env.TEACHER_EMAILS ?? '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const ATTEMPTS_COLLECTION = 'attempts';
const MISSIONS_COLLECTION = 'missions';

const getUser = (req: Request) => (req as Request & { user?: { uid?: string; email?: string } }).user;
const isTeacher = (req: Request) => {
  if (!TEACHER_EMAILS.length) return false;
  const email = getUser(req)?.email?.toLowerCase() ?? '';
  return TEACHER_EMAILS.includes(email);
};

const parseGsUri = (uri: string) => {
  if (!uri.startsWith('gs://')) return null;
  const withoutScheme = uri.replace('gs://', '');
  const [bucket, ...rest] = withoutScheme.split('/');
  if (!bucket || rest.length === 0) return null;
  return { bucket, objectName: rest.join('/') };
};

const signReadUrl = async (uri: string) => {
  const parsed = parseGsUri(uri);
  if (!parsed) return null;
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const [signedUrl] = await storage
    .bucket(parsed.bucket)
    .file(parsed.objectName)
    .getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresAt,
    });
  return signedUrl;
};

const attemptPayloadSchema = z.object({
  missionId: z.string(),
  classId: z.string().optional(),
  courseworkId: z.string().optional(),
  submissionId: z.string().optional(),
  duration: z.number().optional(),
});

const missionPayloadSchema = z.object({
  title: z.string().min(2),
  description: z.string().min(2),
  prompts: z.array(z.string().min(1)).min(1),
  classId: z.string().optional(),
});

const teacherFeedbackSchema = z.object({
  feedback: z.string().min(2),
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/v1', authenticate);

app.get('/v1/me', (req: Request, res: Response) => {
  const user = getUser(req);
  if (!user?.uid) {
    res.status(401).json({ error: 'Missing user' });
    return;
  }
  res.json({
    uid: user.uid,
    email: user.email ?? null,
    role: isTeacher(req) ? 'teacher' : 'student',
  });
});

app.post('/v1/attempts', (req: Request, res: Response) => {
  const parseResult = attemptPayloadSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.flatten() });
  }

  const attemptId = `att_${Date.now()}`;
  const payload = parseResult.data;
  const now = new Date().toISOString();
  const objectName = `recordings/raw/${attemptId}.webm`;
  const bucket = storage.bucket(STORAGE_BUCKET);
  const file = bucket.file(objectName);
  const expiresAt = Date.now() + 10 * 60 * 1000;

  return file
    .getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expiresAt,
      contentType: 'audio/webm',
    })
    .then(async ([uploadUrl]) => {
      const user = getUser(req);
      const userId = user?.uid ?? null;
      const userEmail = user?.email ?? null;
      await firestore.collection(ATTEMPTS_COLLECTION).doc(attemptId).set(
        {
          attemptId,
          missionId: payload.missionId,
          userId,
          userEmail,
          classId: payload.classId ?? null,
          courseworkId: payload.courseworkId ?? null,
          submissionId: payload.submissionId ?? null,
          duration: payload.duration ?? null,
          status: 'created',
          storageUri: `gs://${STORAGE_BUCKET}/${objectName}`,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      res.status(201).json({
        attemptId,
        uploadUrl,
        expiresAt: new Date(expiresAt).toISOString(),
        uploadMethod: 'PUT',
        contentType: 'audio/webm',
      });
    })
    .catch((error) => {
      console.error('Failed to create attempt', error);
      res.status(500).json({ error: 'Failed to create attempt' });
    });
});

app.post('/v1/attempts/:id/complete', (req: Request, res: Response) => {
  const attemptId = req.params.id;
  const languageCode = typeof req.body?.languageCode === 'string' ? req.body.languageCode : 'en-US';
  const attemptsRef = firestore.collection(ATTEMPTS_COLLECTION).doc(attemptId);

  return attemptsRef
    .get()
    .then(async (snapshot) => {
      if (!snapshot.exists) {
        res.status(404).json({ error: 'Attempt not found' });
        return;
      }

      const attemptData = snapshot.data() as { storageUri?: string; missionId?: string };
      const storageUri = attemptData.storageUri ?? '';
      const missionId = attemptData.missionId ?? '';
      const payload = {
        attemptId,
        storageUri,
        missionId,
        languageCode,
      };

      await attemptsRef.set(
        {
          status: 'queued',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      if (WORKER_URL.includes('localhost') || WORKER_URL.includes('127.0.0.1')) {
        const workerResponse = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!workerResponse.ok) {
          const errorText = await workerResponse.text();
          res.status(500).json({ error: errorText || 'Worker call failed' });
          return;
        }
        res.json({ attemptId, status: 'queued', worker: 'direct' });
        return;
      }

      const queuePath = tasksClient.queuePath(PROJECT_ID, TASKS_LOCATION, TASKS_QUEUE);
      const task = {
        httpRequest: {
          httpMethod: 'POST' as const,
          url: WORKER_URL,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        },
      };

      await tasksClient.createTask({ parent: queuePath, task });
      res.json({ attemptId, status: 'queued', worker: 'cloud-tasks' });
    })
    .catch((error) => {
      console.error('Failed to enqueue attempt', error);
      res.status(500).json({ error: 'Failed to enqueue attempt' });
    });
});

app.get('/v1/attempts/:id', (req: Request, res: Response) => {
  const attemptId = req.params.id;
  return firestore
    .collection(ATTEMPTS_COLLECTION)
    .doc(attemptId)
    .get()
    .then((snapshot) => {
      if (!snapshot.exists) {
        res.status(404).json({ error: 'Attempt not found' });
        return;
      }
      const data = snapshot.data();
      res.json({
        attemptId,
        status: data?.status ?? 'unknown',
        transcript: data?.transcript ?? null,
        feedback: data?.feedback ?? null,
        exportUri: data?.exportUri ?? null,
        updatedAt: data?.updatedAt ?? null,
      });
    })
    .catch((error) => {
      console.error('Failed to fetch attempt', error);
      res.status(500).json({ error: 'Failed to fetch attempt' });
    });
});

app.get('/v1/student/attempts', async (req: Request, res: Response) => {
  try {
    const userId = getUser(req)?.uid;
    if (!userId) {
      res.status(401).json({ error: 'Missing user' });
      return;
    }
    const snapshot = await firestore
      .collection(ATTEMPTS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    const attempts = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();
        const audioUrl = data?.storageUri ? await signReadUrl(data.storageUri) : null;
        return { ...data, audioUrl };
      })
    );

    res.json({ attempts });
  } catch (error) {
    console.error('Failed to fetch student attempts', error);
    res.status(500).json({ error: 'Failed to fetch student attempts' });
  }
});

app.get('/v1/teacher/classes/:id/attempts', async (req: Request, res: Response) => {
  try {
    if (!isTeacher(req)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const { id } = req.params;
    const snapshot = await firestore
      .collection(ATTEMPTS_COLLECTION)
      .where('classId', '==', id)
      .orderBy('updatedAt', 'desc')
      .limit(100)
      .get();

    const attempts = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();
        const audioUrl = data?.storageUri ? await signReadUrl(data.storageUri) : null;
        return { ...data, audioUrl };
      })
    );

    res.json({ classId: id, attempts });
  } catch (error) {
    console.error('Failed to fetch class attempts', error);
    res.status(500).json({ error: 'Failed to fetch class attempts' });
  }
});

app.post('/v1/teacher/attempts/:id/feedback', async (req: Request, res: Response) => {
  try {
    if (!isTeacher(req)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const parseResult = teacherFeedbackSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: parseResult.error.flatten() });
      return;
    }
    const attemptId = req.params.id;
    const now = new Date().toISOString();
    const user = getUser(req);
    await firestore.collection(ATTEMPTS_COLLECTION).doc(attemptId).set(
      {
        teacherFeedback: {
          text: parseResult.data.feedback,
          updatedAt: now,
          teacherId: user?.uid ?? null,
          teacherEmail: user?.email ?? null,
        },
        updatedAt: now,
      },
      { merge: true }
    );
    res.json({ attemptId, status: 'feedback_saved' });
  } catch (error) {
    console.error('Failed to save teacher feedback', error);
    res.status(500).json({ error: 'Failed to save teacher feedback' });
  }
});

app.get('/v1/missions', async (_req: Request, res: Response) => {
  try {
    const snapshot = await firestore
      .collection(MISSIONS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();
    const missions = snapshot.docs.map((doc) => doc.data());
    res.json({ missions });
  } catch (error) {
    console.error('Failed to fetch missions', error);
    res.status(500).json({ error: 'Failed to fetch missions' });
  }
});

app.post('/v1/missions', async (req: Request, res: Response) => {
  if (!isTeacher(req)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const parseResult = missionPayloadSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: parseResult.error.flatten() });
    return;
  }
  try {
    const missionId = `mission_${Date.now()}`;
    const now = new Date().toISOString();
    const user = getUser(req);
    await firestore.collection(MISSIONS_COLLECTION).doc(missionId).set({
      missionId,
      ...parseResult.data,
      createdAt: now,
      updatedAt: now,
      createdBy: user?.uid ?? null,
      createdByEmail: user?.email ?? null,
    });
    res.status(201).json({ missionId });
  } catch (error) {
    console.error('Failed to create mission', error);
    res.status(500).json({ error: 'Failed to create mission' });
  }
});

app.get('/v1/missions/:missionId/attempts', (req: Request, res: Response) => {
  const { missionId } = req.params;
  return firestore
    .collection(ATTEMPTS_COLLECTION)
    .where('missionId', '==', missionId)
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get()
    .then((snapshot) => {
      const attempts = snapshot.docs.map((doc) => doc.data());
      res.json({ missionId, attempts });
    })
    .catch((error) => {
      console.error('Failed to fetch attempts', error);
      res.status(500).json({ error: 'Failed to fetch attempts' });
    });
});

const PORT = process.env.PORT ?? 8080;
app.listen(PORT, () => {
  console.log(`VoiceUp API listening on port ${PORT}`);
  console.log(`API base: ${API_BASE_URL}`);
});
