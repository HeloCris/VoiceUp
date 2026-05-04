import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { ensureFirebase } from './firebase';
import { authenticate } from './auth';

type AccessContext = {
  email: string;
  role: 'student' | 'teacher';
  active: boolean;
  isSuperadmin: boolean;
  classId?: string;
  classIds?: string[];
};

type LocalMission = {
  id?: string;
  missionId?: string;
  title?: string;
  description?: string;
  prompts?: string[];
  classId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  teacherEmail?: string;
  [key: string]: unknown;
};

type MissionRecord = {
  missionId: string;
  title: string;
  description: string;
  prompts: string[];
  classId?: string | null;
  createdAt: string;
  updatedAt?: string;
  teacherEmail: string;
};

const PRIMARY_SUPERADMIN_EMAIL = process.env.PRIMARY_SUPERADMIN_EMAIL ?? 'superadmin@voiceup.dev';
const EXTRA_SUPERADMIN_EMAILS = (process.env.SUPERADMIN_EMAILS ?? process.env.SUPERADMIN_EMAIL ?? '')
  .split(/[,;]+/)
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const SUPERADMIN_EMAIL_SET = new Set<string>([
  PRIMARY_SUPERADMIN_EMAIL.trim().toLowerCase(),
  ...EXTRA_SUPERADMIN_EMAILS,
]);
const LOCAL_DATA_FILE = process.env.LOCAL_DATA_FILE
  ? path.resolve(process.cwd(), process.env.LOCAL_DATA_FILE)
  : path.resolve(process.cwd(), 'local-data.json');
const LOCAL_AUDIO_DIR = process.env.LOCAL_AUDIO_DIR
  ? path.resolve(process.cwd(), process.env.LOCAL_AUDIO_DIR)
  : path.resolve(process.cwd(), 'local-audio');
const LOCAL_AUTH_BYPASS = process.env.LOCAL_AUTH_BYPASS === 'true';
const LOCAL_ROLE = process.env.LOCAL_ROLE === 'teacher' ? 'teacher' : 'student';
const USERS_COLLECTION = 'users';


const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const { firestore } = ensureFirebase();

let localMissions: LocalMission[] = [];
let localAttempts: Array<Record<string, unknown>> = [];

const normalizeEmail = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  const [local, domain] = trimmed.split('@');
  if (!local || !domain) return trimmed;
  const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
  const localPart = normalizedDomain === 'gmail.com'
    ? local.split('+')[0].replace(/\./g, '')
    : local.split('+')[0];
  return `${localPart}@${normalizedDomain}`;
};

const getBaseUrl = (req: Request) => {
  const host = req.get('host') ?? 'localhost';
  const protocol = req.protocol || 'http';
  return `${protocol}://${host}`;
};

const ensureLocalAudioDir = () => {
  if (!fs.existsSync(LOCAL_AUDIO_DIR)) {
    fs.mkdirSync(LOCAL_AUDIO_DIR, { recursive: true });
  }
};

const getLocalAttempt = (attemptId: string) =>
  localAttempts.find((attempt) => attempt['id'] === attemptId);

const getUser = (req: Request) => (req as Request & { user?: { uid?: string; email?: string } }).user;

const getAccess = (req: Request) => (req as Request & { access?: AccessContext }).access;

const getUserEmail = (req: Request) => getUser(req)?.email ?? '';

const isSuperadminEmail = (email: string) => SUPERADMIN_EMAIL_SET.has(normalizeEmail(email));

let localAccessUsers: Array<{
  email: string;
  name: string;
  role: 'student' | 'teacher';
  school?: string;
  classroom?: string;
  classId?: string;
  classIds?: string[];
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}> = [
  {
    email: PRIMARY_SUPERADMIN_EMAIL,
    name: 'Superadmin',
    role: 'teacher',
    active: true,
    createdAt: new Date().toISOString(),
  },
];

let localClasses: Array<{
  classId: string;
  name: string;
  year?: string;
  description?: string;
  icon?: string;
  aiFeedback?: boolean;
  teacherEmail: string;
  createdAt?: string;
  updatedAt?: string;
}> = [];

const loadLocalData = () => {
  try {
    if (!fs.existsSync(LOCAL_DATA_FILE)) return;
    const raw = fs.readFileSync(LOCAL_DATA_FILE, 'utf8');
    const data = JSON.parse(raw) as {
      localMissions?: LocalMission[];
      localAttempts?: Array<Record<string, unknown>>;
      localAccessUsers?: typeof localAccessUsers;
      localClasses?: typeof localClasses;
    };
    if (Array.isArray(data.localMissions)) localMissions = data.localMissions;
    if (Array.isArray(data.localAttempts)) localAttempts = data.localAttempts;
    if (Array.isArray(data.localAccessUsers)) localAccessUsers = data.localAccessUsers;
    if (Array.isArray(data.localClasses)) localClasses = data.localClasses;
  } catch (error) {
    console.error('Failed to load local data', error);
  }
};

const persistLocalData = () => {
  try {
    const payload = JSON.stringify(
      {
        localMissions,
        localAttempts,
        localAccessUsers,
        localClasses,
      },
      null,
      2
    );
    fs.writeFileSync(LOCAL_DATA_FILE, payload, 'utf8');
  } catch (error) {
    console.error('Failed to persist local data', error);
  }
};

const isFirestoreUnavailableError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('cloud firestore api has not been used') ||
    message.includes('firestore api has not been used') ||
    message.includes('permission_denied') ||
    message.includes('permission denied') ||
    message.includes('not authorized') ||
    message.includes('not authenticated') ||
    message.includes('unauthenticated') ||
    message.includes('failed to connect') ||
    (message.includes('firestore') && message.includes('disabled')) ||
    message.includes('error: 7') ||
    message.includes('permission denied')
  );
};

const shouldUseLocalFallback = (error: unknown) => {
  if (isFirestoreUnavailableError(error)) return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('permission denied') ||
    message.includes('not authorized') ||
    message.includes('unauthenticated') ||
    message.includes('failed to connect') ||
    message.includes('network error') ||
    message.includes('ecconnrefused') ||
    message.includes('connection refused') ||
    message.includes('connect timeout') ||
    message.includes('timeout')
  );
};

const getLocalAccessByEmail = (email: string) =>
  localAccessUsers.find((item) => normalizeEmail(item.email) === email);

const mergeLocalAccessUsers = (firestoreUsers: Array<{
  email: string;
  name: string;
  role: 'student' | 'teacher';
  school?: string | null;
  classroom?: string | null;
  active?: boolean;
  createdAt?: string;
}>) => {
  const mergedByEmail = new Map<string, typeof firestoreUsers[number]>();
  firestoreUsers.forEach((user) => {
    mergedByEmail.set(normalizeEmail(user.email), user);
  });
  localAccessUsers.forEach((localUser) => {
    const normalizedEmail = normalizeEmail(localUser.email);
    const existing = mergedByEmail.get(normalizedEmail);
    if (!existing) {
      mergedByEmail.set(normalizedEmail, localUser);
    }
  });
  return Array.from(mergedByEmail.values());
};

const getLocalStudentClassId = (email: string) => {
  const access = getLocalAccessByEmail(email);
  if (!access) return null;
  if (access.classId) return access.classId;
  if (access.classroom) {
    const match = localClasses.find((item) => item.name === access.classroom);
    return match?.classId ?? null;
  }
  return null;
};

const getStudentClassIds = (student: {
  classId?: string | null;
  classIds?: string[];
  classroom?: string;
}) => {
  const explicitClassIds = Array.isArray(student.classIds) ? student.classIds.filter(Boolean) : [];
  const classroomClassId = student.classroom
    ? localClasses.find((item) => item.name === student.classroom)?.classId ?? null
    : null;
  return Array.from(new Set([...(student.classId ? [student.classId] : []), ...explicitClassIds, ...(classroomClassId ? [classroomClassId] : [])]));
};

const getClassStudents = (classId: string) =>
  localAccessUsers
    .filter((student) => student.role === 'student')
    .filter((student) => getStudentClassIds(student).includes(classId))
    .map((student) => ({
      name: student.name,
      email: student.email,
      classId,
    }));

const getClassById = (classId: string) =>
  localClasses.find((cls) => (cls as any).classId === classId) as
    | {
        classId: string;
        name: string;
        year?: string;
        description?: string;
        icon?: string;
        aiFeedback?: boolean;
        teacherEmail: string;
      }
    | undefined;

const isClassAccessibleToTeacher = (classId: string, access: AccessContext) => {
  if (access.isSuperadmin) return true;
  if (access.role !== 'teacher') return false;
  const cls = getClassById(classId);
  return !!cls && normalizeEmail(cls.teacherEmail) === normalizeEmail(access.email);
};

const getAttemptEmail = (attempt: Record<string, unknown>) =>
  typeof attempt.userEmail === 'string'
    ? attempt.userEmail
    : typeof attempt.email === 'string'
      ? attempt.email
      : '';

const getAttemptClassId = (attempt: Record<string, unknown>) =>
  typeof attempt.classId === 'string'
    ? attempt.classId
    : typeof attempt.classroomId === 'string'
      ? attempt.classroomId
      : '';

const getAttemptMissionId = (attempt: Record<string, unknown>) =>
  typeof attempt.missionId === 'string' ? attempt.missionId : '';

const getAttemptUpdatedAt = (attempt: Record<string, unknown>) => {
  const value = attempt.updatedAt ?? attempt.createdAt;
  return typeof value === 'string' ? value : null;
};

const getAttemptWordsPerMinute = (attempt: Record<string, unknown>) => {
  const aiFeedback = attempt.aiFeedback as { details?: { wordsPerMinute?: number } } | undefined;
  const directFeedback = attempt.feedback as { metrics?: { wordsPerMinute?: number } } | undefined;
  return aiFeedback?.details?.wordsPerMinute ?? directFeedback?.metrics?.wordsPerMinute ?? null;
};

const summarizeClassProgress = (classId: string, missionId?: string) => {
  const attempts = localAttempts.filter((attempt) => getAttemptClassId(attempt) === classId && (!missionId || getAttemptMissionId(attempt) === missionId));
  const byEmail = new Map<string, Record<string, unknown>[]>();

  attempts.forEach((attempt) => {
    const email = getAttemptEmail(attempt).toLowerCase();
    if (!email) return;
    const list = byEmail.get(email) ?? [];
    list.push(attempt);
    byEmail.set(email, list);
  });

  return Array.from(byEmail.entries()).map(([email, items]) => {
    const ordered = [...items].sort((left, right) => {
      const leftDate = new Date(getAttemptUpdatedAt(left) ?? 0).getTime();
      const rightDate = new Date(getAttemptUpdatedAt(right) ?? 0).getTime();
      return rightDate - leftDate;
    });
    const recent = ordered[0];
    const gradeValues = ordered
      .map((attempt) => (attempt.teacherFeedback as { grade?: number | null } | undefined)?.grade)
      .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));
    const wpmValues = ordered
      .map((attempt) => getAttemptWordsPerMinute(attempt))
      .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));

    const first = ordered[ordered.length - 1];
    const last = ordered[0];
    const firstGrade = (first?.teacherFeedback as { grade?: number | null } | undefined)?.grade;
    const lastGrade = (last?.teacherFeedback as { grade?: number | null } | undefined)?.grade;
    const firstWpm = getAttemptWordsPerMinute(first ?? {});
    const lastWpm = getAttemptWordsPerMinute(last ?? {});

    return {
      email,
      name: getLocalAccessByEmail(email)?.name ?? recent.userEmail ?? 'Aluno',
      attemptsCount: ordered.length,
      lastUpdatedAt: getAttemptUpdatedAt(recent),
      lastStatus: typeof recent.status === 'string' ? recent.status : null,
      improving:
        typeof firstGrade === 'number' && typeof lastGrade === 'number'
          ? lastGrade > firstGrade
          : typeof firstWpm === 'number' && typeof lastWpm === 'number'
            ? lastWpm > firstWpm
            : null,
      summary:
        ordered.length === 0
          ? 'Nenhuma tentativa encontrada.'
          : ordered.length === 1
            ? 'Uma tentativa registrada. Ainda não há histórico suficiente para comparar.'
            : 'Comparando as tentativas mais recentes para medir evolução.',
      averageWordsPerMinute: wpmValues.length
        ? Math.round((wpmValues.reduce((sum, value) => sum + value, 0) / wpmValues.length) * 10) / 10
        : null,
      averageTeacherGrade: gradeValues.length
        ? Math.round((gradeValues.reduce((sum, value) => sum + value, 0) / gradeValues.length) * 10) / 10
        : null,
      evaluationSource: gradeValues.length > 0 ? 'teacher' : wpmValues.length > 0 ? 'ai' : 'insufficient',
    };
  });
};

loadLocalData();

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.put('/v1/local-upload/:id', express.raw({ type: '*/*', limit: '20mb' }), (req: Request, res: Response) => {
  try {
    ensureLocalAudioDir();
    const attemptId = req.params.id;
    const filePath = path.join(LOCAL_AUDIO_DIR, `${attemptId}.webm`);
    fs.writeFileSync(filePath, req.body as Buffer);

    const attempt = getLocalAttempt(attemptId);
    if (attempt) {
      attempt.localAudioPath = filePath;
      attempt.audioUrl = `${getBaseUrl(req)}/v1/local-audio/${attemptId}`;
      attempt.updatedAt = new Date().toISOString();
      persistLocalData();
    }

    res.status(204).end();
  } catch (error) {
    console.error('Failed to save local audio', error);
    res.status(500).json({ error: 'Failed to save local audio' });
  }
});

app.get('/v1/local-audio/:id', (req: Request, res: Response) => {
  const attemptId = req.params.id;
  const filePath = path.join(LOCAL_AUDIO_DIR, `${attemptId}.webm`);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Audio not found' });
    return;
  }
  res.setHeader('Content-Type', 'audio/webm');
  fs.createReadStream(filePath).pipe(res);
});

// Authentication wrapper for /v1 routes. It supports three cases:
// 1. If `X-Local-User-Email` header is present, treat request as local test user.
// 2. If `LOCAL_AUTH_BYPASS` is true, set a local user from env/header.
// 3. Otherwise delegate to the `authenticate` middleware (Firebase).
app.use('/v1', (req: Request, res: Response, next: NextFunction) => {
  const headerEmail = typeof req.headers['x-local-user-email'] === 'string' ? req.headers['x-local-user-email'] : null;
  if (headerEmail && headerEmail.trim()) {
    const localEmail = headerEmail.trim();
    (req as Request & { user?: { uid?: string; email?: string } }).user = { uid: 'local-user', email: localEmail };
    next();
    return;
  }

  if (LOCAL_AUTH_BYPASS) {
    const authHeader = req.headers['authorization'];
    let token = '';
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim();
      console.log('DEBUG AUTH TOKEN:', JSON.stringify(token));
      if (token && token !== 'local-token' && token !== 'undefined') {
        return res.status(401).json({ error: 'Invalid auth token', received: token });
      }
    }
    const headerEmail2 = typeof req.headers['x-local-user-email'] === 'string' ? req.headers['x-local-user-email'] : null;
    const localEmail = headerEmail2?.trim() || process.env.LOCAL_USER_EMAIL || 'local@voiceup.dev';
    (req as Request & { user?: { uid?: string; email?: string } }).user = {
      uid: 'local-user',
      email: localEmail,
    };
    next();
    return;
  }

  // Default: use Firebase authenticate middleware
  return authenticate(req, res, next);
});

app.use('/v1', async (req: Request, res: Response, next) => {
  // Allow a local header to act as a test bypass even when LOCAL_AUTH_BYPASS is false.
  const user = getUser(req);
  let email = user?.email ? normalizeEmail(user.email) : '';
  if (!email) {
    const headerEmail = typeof req.headers['x-local-user-email'] === 'string' ? req.headers['x-local-user-email'] : null;
    if (headerEmail && headerEmail.trim()) {
      (req as Request & { user?: { uid?: string; email?: string } }).user = { uid: 'local-user', email: headerEmail.trim() };
      email = normalizeEmail(headerEmail.trim());
    }
  }
  if (!email) {
    res.status(401).json({ error: 'Missing user' });
    return;
  }

  const isSuperadmin = isSuperadminEmail(email);
  if (LOCAL_AUTH_BYPASS) {
    const headerRole = typeof req.headers['x-local-role'] === 'string'
      ? req.headers['x-local-role']
      : null;
    const localAccess = getLocalAccessByEmail(email);
    let role = headerRole === 'student' || headerRole === 'teacher'
      ? headerRole
      : localAccess?.role ?? LOCAL_ROLE;
    // Allow a special 'superadmin' header value in local bypass to force superadmin
    let effectiveIsSuper = isSuperadmin;
    if (headerRole === 'superadmin') {
      role = 'teacher';
      effectiveIsSuper = true;
    }
    (req as Request & { access?: AccessContext }).access = {
      email,
      role,
      active: true,
      isSuperadmin: role !== 'student' && effectiveIsSuper,
      classId: localAccess?.classId ?? localAccess?.classroom ?? undefined,
      classIds: Array.isArray(localAccess?.classIds) ? localAccess!.classIds : undefined,
    };
    next();
    return;
  }

  if (isSuperadmin) {
    (req as Request & { access?: AccessContext }).access = {
      email,
      role: 'teacher',
      active: true,
      isSuperadmin: true,
    };
    console.log(`AUTH: ${email} isSuperadmin=true role=teacher path=${req.path}`);
    next();
    return;
  }

  let accessDoc;
  try {
    accessDoc = await firestore.collection(USERS_COLLECTION).doc(email).get();
  } catch (error: unknown) {
    if (isFirestoreUnavailableError(error)) {
      const localUser = getLocalAccessByEmail(email);
      if (localUser) {
        const localRole = localUser.role === 'teacher' ? 'teacher' : 'student';
        const active = localUser.active !== false;
        (req as Request & { access?: AccessContext }).access = {
          email,
          role: localRole,
          active,
          isSuperadmin: isSuperadminEmail(email),
          classId: localUser.classId ?? localUser.classroom ?? undefined,
          classIds: Array.isArray(localUser.classIds) ? localUser.classIds : undefined,
        };
        console.log(`AUTH: ${email} local fallback role=${localRole} active=${active} path=${req.path}`);
        if (!active && req.path !== '/me') {
          res.status(403).json({ error: 'Acesso nao autorizado' });
          return;
        }
        next();
        return;
      }
      const fallbackLocal = getLocalAccessByEmail(email);
      (req as Request & { access?: AccessContext }).access = {
        email,
        role: 'student',
        active: true,
        isSuperadmin: false,
        classId: fallbackLocal?.classId ?? fallbackLocal?.classroom ?? undefined,
        classIds: Array.isArray(fallbackLocal?.classIds) ? fallbackLocal!.classIds : undefined,
      };
      console.log(`AUTH: ${email} local fallback missing path=${req.path} => student active`);
      next();
      return;
    }
    console.error('Failed to read access user', error);
    res.status(500).json({ error: 'Failed to verify access' });
    return;
  }

  if (!accessDoc.exists) {
    const localUser = getLocalAccessByEmail(email);
    const isSuperadmin = isSuperadminEmail(email);
    const localRole = localUser?.role === 'teacher' ? 'teacher' : 'student';
    const role = isSuperadmin ? 'teacher' : localRole;
    const active = localUser?.active !== false;
    (req as Request & { access?: AccessContext }).access = {
      email,
      role,
      active: true,
      isSuperadmin,
      classId: localUser?.classId ?? localUser?.classroom ?? undefined,
      classIds: Array.isArray(localUser?.classIds) ? localUser!.classIds : undefined,
    };
    console.log(`AUTH: ${email} accessDoc missing path=${req.path} => role=${role} isSuperadmin=${isSuperadmin} active=true`);
    next();
    return;
  }

  const data = accessDoc.data() as {
    role?: string;
    active?: boolean;
    classId?: string;
    classIds?: string[];
  };
  const localUser = getLocalAccessByEmail(email);
  const role = localUser?.role === 'teacher'
    ? 'teacher'
    : data?.role === 'teacher'
    ? 'teacher'
    : 'student';
  const active = typeof localUser?.active === 'boolean'
    ? localUser.active
    : data?.active !== false;
  const classId = localUser?.classId ?? localUser?.classroom ?? (typeof (data as any)?.classId === 'string' ? (data as any).classId : undefined);
  const classIds = Array.from(new Set([
    ...(Array.isArray((data as any)?.classIds) ? (data as any).classIds : []),
    ...(Array.isArray(localUser?.classIds) ? localUser!.classIds : []),
    ...(localUser?.classId ? [localUser.classId] : []),
  ]));

  (req as Request & { access?: AccessContext }).access = {
    email,
    role,
    active,
    isSuperadmin: isSuperadminEmail(email),
    classId,
    classIds: classIds.length ? classIds : undefined,
  };
  console.log(`AUTH: ${email} role=${role} active=${active} isSuperadmin=${isSuperadminEmail(email)} path=${req.path}`);

  // Allow superadmin to access /me even if inactive; only block other endpoints
  const docIsSuperadmin = isSuperadminEmail(email);
  if (!active && !docIsSuperadmin && req.path !== '/me') {
    res.status(403).json({ error: 'Acesso nao autorizado' });
    return;
  }
  next();
});

app.get('/v1/me', (req: Request, res: Response) => {
  const user = getUser(req);
  const access = getAccess(req);
  if (!user?.uid) {
    res.status(401).json({ error: 'Missing user' });
    return;
  }
  console.log(`ME: ${user.email ?? 'unknown'} role=${access?.role ?? 'student'} active=${access?.active ?? false} isSuperadmin=${access?.isSuperadmin ?? false}`);
  res.json({
    uid: user.uid,
    email: user.email ?? null,
    role: access?.role ?? 'student',
    active: access?.active ?? false,
    isSuperadmin: access?.isSuperadmin ?? false,
  });
});

const getMissionById = (missionId: string) =>
  localMissions.find((mission) => mission.missionId === missionId) as MissionRecord | undefined;

app.get('/v1/missions', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || access.role !== 'teacher') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }
  const classId = typeof req.query.classId === 'string' ? req.query.classId : '';
  if (classId && !isClassAccessibleToTeacher(classId, access)) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }
  const missions = localMissions.filter((mission) => {
    const record = mission as MissionRecord;
    if (!access.isSuperadmin && normalizeEmail(record.teacherEmail) !== normalizeEmail(access.email)) {
      return false;
    }
    return !classId || record.classId === classId;
  });
  res.json({ missions });
});

app.get('/v1/teacher/classes/:classId/missions', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || access.role !== 'teacher') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }
  const { classId } = req.params;
  if (!isClassAccessibleToTeacher(classId, access)) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }
  const missions = localMissions.filter((mission) => {
    const record = mission as MissionRecord;
    return record.classId === classId && (access.isSuperadmin || normalizeEmail(record.teacherEmail) === normalizeEmail(access.email));
  });
  res.json({ missions });
});

app.post('/v1/missions', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || access.role !== 'teacher') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const { title, description, prompts, classId } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'Titulo da missao obrigatorio' });
    return;
  }
  if (typeof description !== 'string' || !description.trim()) {
    res.status(400).json({ error: 'Descricao da missao obrigatoria' });
    return;
  }
  if (!Array.isArray(prompts) || prompts.length === 0 || prompts.some((item) => typeof item !== 'string' || !item.trim())) {
    res.status(400).json({ error: 'Pelo menos um prompt valido e obrigatorio' });
    return;
  }

  const missionId = `mission_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const now = new Date().toISOString();
  const newMission: MissionRecord = {
    missionId,
    title: title.trim(),
    description: description.trim(),
    prompts: prompts.map((item: string) => item.trim()).filter(Boolean),
    classId: typeof classId === 'string' && classId.trim() ? classId.trim() : null,
    createdAt: now,
    updatedAt: now,
    teacherEmail: access.email,
  };

  localMissions.push(newMission);
  persistLocalData();
  res.status(201).json({ mission: newMission });
});

app.patch('/v1/missions/:missionId', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || access.role !== 'teacher') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const mission = getMissionById(req.params.missionId);
  if (!mission) {
    res.status(404).json({ error: 'Missao nao encontrada' });
    return;
  }

  const { title, description, prompts, classId } = req.body ?? {};
  if (typeof title === 'string' && title.trim()) mission.title = title.trim();
  if (typeof description === 'string' && description.trim()) mission.description = description.trim();
  if (Array.isArray(prompts) && prompts.length > 0) {
    const nextPrompts = prompts.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
    if (nextPrompts.length > 0) {
      mission.prompts = nextPrompts;
    }
  }
  if (typeof classId === 'string') {
    mission.classId = classId.trim() ? classId.trim() : null;
  }
  mission.updatedAt = new Date().toISOString();
  persistLocalData();
  res.json({ mission });
});

app.delete('/v1/missions/:missionId', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || access.role !== 'teacher') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const index = localMissions.findIndex((mission) => (mission as MissionRecord).missionId === req.params.missionId);
  if (index === -1) {
    res.status(404).json({ error: 'Missao nao encontrada' });
    return;
  }

  localMissions.splice(index, 1);
  persistLocalData();
  res.status(204).end();
});

// --- ATTEMPTS ENDPOINTS ---
app.post('/v1/attempts', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access) {
    res.status(401).json({ error: 'Nao autenticado' });
    return;
  }

  const { missionId, classId, duration } = req.body ?? {};
  if (typeof missionId !== 'string' || !missionId.trim()) {
    res.status(400).json({ error: 'missionId obrigatorio' });
    return;
  }

  const attemptId = `attempt_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const now = new Date().toISOString();

  const newAttempt = {
    id: attemptId,
    attemptId,
    missionId: missionId.trim(),
    classId: typeof classId === 'string' ? classId.trim() : undefined,
    studentEmail: access.email,
    duration: typeof duration === 'number' ? duration : 0,
    status: 'recording',
    transcript: null,
    feedback: null,
    aiFeedback: null,
    createdAt: now,
    updatedAt: now,
  };

  localAttempts.push(newAttempt);
  persistLocalData();

  const uploadUrl = `${getBaseUrl(req)}/v1/local-upload/${attemptId}`;
  res.status(201).json({
    attemptId,
    uploadUrl,
    contentType: 'audio/webm',
  });
});

app.get('/v1/attempts/:attemptId', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access) {
    res.status(401).json({ error: 'Nao autenticado' });
    return;
  }

  const attempt = getLocalAttempt(req.params.attemptId);
  if (!attempt) {
    res.status(404).json({ error: 'Attempt nao encontrado' });
    return;
  }

  if (attempt.studentEmail !== access.email && access.role !== 'teacher') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  res.json({
    attemptId: attempt.id ?? attempt.attemptId,
    status: attempt.status ?? 'recording',
    transcript: attempt.transcript ?? null,
    feedback: attempt.feedback ?? null,
    aiFeedback: attempt.aiFeedback ?? null,
  });
});

app.post('/v1/attempts/:attemptId/complete', async (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access) {
    res.status(401).json({ error: 'Nao autenticado' });
    return;
  }

  const attempt = getLocalAttempt(req.params.attemptId);
  if (!attempt) {
    res.status(404).json({ error: 'Attempt nao encontrado' });
    return;
  }

  if (attempt.studentEmail !== access.email) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  // Find the mission to check if aiFeedback is enabled
  const mission = getMissionById((attempt as any).missionId);
  const missionHasAiFeedback = mission ? (mission as any).aiFeedback !== false : true;
  
  // Find the class to check if aiFeedback is disabled
  const classData = localClasses.find((cls) => (cls as any).classId === (attempt as any).classId);
  const classHasAiFeedback = classData ? (classData as any).aiFeedback !== false : true;
  
  // Generate AI feedback if both mission and class allow it
  if (missionHasAiFeedback && classHasAiFeedback) {
    // If a worker URL is configured and a local audio file exists, send the
    // audio to the worker for transcription/feedback instead of local heuristics.
    const workerUrl = process.env.WORKER_URL ?? process.env.WORKER_ENDPOINT ?? '';
    const localAudioPath = typeof (attempt as any).localAudioPath === 'string' ? (attempt as any).localAudioPath : '';
    if (workerUrl && localAudioPath && fs.existsSync(localAudioPath)) {
      try {
        const audioBuffer = fs.readFileSync(localAudioPath);
        const audioBase64 = audioBuffer.toString('base64');
        const payload = {
          attemptId: attempt.id ?? attempt.attemptId,
          missionId: (attempt as any).missionId,
          audioContent: audioBase64,
          audioEncoding: 'WEBM_OPUS',
          sampleRateHertz: 48000,
          languageCode: 'en-US',
          returnFeedback: true,
        };
        console.log(`[DEBUG] calling worker ${workerUrl} for attempt=${attempt.id}`);
        // Use global fetch when available
        const globalFetch = (global as any).fetch;
        let workerResp: any = null;
        if (typeof globalFetch === 'function') {
          const rr = await globalFetch(workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (rr.ok) {
            workerResp = await rr.json();
          } else {
            console.warn('[WARN] worker responded with status', rr.status);
          }
        } else {
          // fallback: try require('node-fetch') dynamically
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const nodeFetch = require('node-fetch');
            const rr = await nodeFetch(workerUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (rr.ok) workerResp = await rr.json();
          } catch (err) {
            console.warn('[WARN] fetch not available and node-fetch not installed');
          }
        }

        if (workerResp && typeof workerResp === 'object') {
          // Worker may wrap results under {transcript, aiFeedback}
          if (typeof workerResp.transcript === 'string') (attempt as any).transcript = workerResp.transcript;
          if (workerResp.aiFeedback) (attempt as any).aiFeedback = workerResp.aiFeedback;
          (attempt as any).updatedAt = new Date().toISOString();
          persistLocalData();
        }
      } catch (error) {
        console.error('Failed to call worker for transcription', error);
      }
    }
    const duration = Number((attempt as any).duration ?? 0);
    const transcript = typeof (attempt as any).transcript === 'string' ? (attempt as any).transcript.trim() : '';
    const hasTranscript = transcript.length > 0;
    const audioBytes = localAudioPath && fs.existsSync(localAudioPath) ? fs.statSync(localAudioPath).size : 0;

    // In local mode, be more permissive when deciding if speech is present.
    // Rationale: some browsers/blobs produce small files; use smaller thresholds
    // so short recordings are not treated as "no speech".
    const hasAudioFile = audioBytes > 2048; // >~2KB
    const hasSpeechLikely = hasTranscript || hasAudioFile || duration >= 1;

    // Debug info to help trace detection issues in local dev
    try {
      console.log(`[DEBUG] attempt=${attempt.id} duration=${duration} audioBytes=${audioBytes} hasTranscript=${hasTranscript} hasAudioFile=${hasAudioFile} hasSpeechLikely=${hasSpeechLikely}`);
    } catch (e) {
      // ignore logging errors
    }

    let aiFeedback;
    if (!hasSpeechLikely) {
      aiFeedback = {
        text: 'O aluno precisa falar para receber feedback. Grave uma resposta clara e completa.',
        comprehensible: false,
        suggestions: {
          clarity: 'Fale com voz clara e audível.',
          rhythm: 'Evite silêncio antes de enviar a tentativa.',
          organization: 'Organize as ideias e grave novamente.',
        },
        details: {
          wordsPerMinute: 0,
          pauseCount: 0,
          makesSense: false,
          language: 'en-US',
        },
        generatedAt: new Date().toISOString(),
      };
    } else if (!hasTranscript) {
      aiFeedback = {
        text: 'Detectamos áudio, mas ainda não há transcrição para medir pausas longas com precisão.',
        comprehensible: false,
        suggestions: {
          clarity: 'Fale de forma mais nítida para melhorar a análise.',
          rhythm: 'Mantenha um ritmo constante durante a resposta.',
          organization: 'Estruture início, meio e fim da resposta.',
        },
        details: {
          wordsPerMinute: 0,
          pauseCount: 0,
          makesSense: false,
          language: 'en-US',
        },
        generatedAt: new Date().toISOString(),
      };
    } else {
      const words = transcript.split(/\s+/).filter(Boolean).length;
      const wpm = duration > 0 ? Math.round((words / duration) * 60) : 0;
      aiFeedback = {
        text: 'Fala detectada e transcrição disponível. Continue praticando para melhorar clareza e ritmo.',
        comprehensible: wpm >= 90,
        suggestions: {
          clarity: 'Pronuncie cada palavra de forma completa.',
          rhythm: 'Mantenha um ritmo confortável e constante.',
          organization: 'Conecte melhor as ideias entre as frases.',
        },
        details: {
          wordsPerMinute: wpm,
          pauseCount: 0,
          makesSense: words > 0,
          language: 'en-US',
        },
        generatedAt: new Date().toISOString(),
      };
    }

    (attempt as any).aiFeedback = aiFeedback;
  }

  attempt.status = 'completed';
  attempt.updatedAt = new Date().toISOString();
  persistLocalData();

  res.json({
    attemptId: attempt.id ?? attempt.attemptId,
    status: 'completed',
  });
});

app.post('/v1/attempts/:attemptId/confirm', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access) {
    res.status(401).json({ error: 'Nao autenticado' });
    return;
  }

  const attempt = getLocalAttempt(req.params.attemptId);
  if (!attempt) {
    res.status(404).json({ error: 'Attempt nao encontrado' });
    return;
  }

  if (attempt.studentEmail !== access.email) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  attempt.studentConfirmed = true;
  attempt.updatedAt = new Date().toISOString();
  persistLocalData();

  res.json({ status: 'confirmed' });
});

// --- STUDENT ENDPOINTS ---
app.get('/v1/student/attempts', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || access.role !== 'student') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const studentEmail = access.email;
  const attempts = localAttempts
    .filter((attempt) => getAttemptEmail(attempt) === studentEmail)
    .sort((left, right) => {
      const leftDate = new Date(getAttemptUpdatedAt(left) ?? 0).getTime();
      const rightDate = new Date(getAttemptUpdatedAt(right) ?? 0).getTime();
      return rightDate - leftDate;
    });

  res.json({ attempts });
});

app.get('/v1/student/missions', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || access.role !== 'student') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const missions = localMissions.map((mission) => ({
    missionId: (mission as MissionRecord).missionId,
    title: (mission as MissionRecord).title,
    description: (mission as MissionRecord).description,
    prompts: (mission as MissionRecord).prompts ?? [],
    classId: (mission as MissionRecord).classId,
    aiFeedback: (mission as any).aiFeedback ?? undefined,
  }));

  res.json({ missions });
});

app.get('/v1/student/classes', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || access.role !== 'student') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const classIds = access.classIds ?? [];
  let classes = localClasses.filter((cls) => classIds.includes((cls as any).classId));

  // If no localClasses are defined (e.g., using Firestore), build fallback
  // class objects from the student's `classIds` so the frontend can show a name.
  if ((!classes || classes.length === 0) && classIds.length > 0) {
    classes = classIds.map((id) => {
      // Try to find a local class entry first
      const found = localClasses.find((c) => (c as any).classId === id);
      if (found) return found as any;
      // Try to derive a friendly name from localAccessUsers (classroom) if available
      const student = localAccessUsers.find((u) => Array.isArray(u.classIds) ? u.classIds.includes(id) : u.classId === id);
      const derivedName = student?.classroom ?? (student?.name ? `${student.name}'s turma` : undefined);
      return {
        classId: id,
        name: derivedName ?? id,
        aiFeedback: undefined,
      };
    });
  }

  res.json({ classes });
});

app.get('/v1/teacher/classes/:classId/students', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || access.role !== 'teacher') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }
  const classId = req.params.classId;
  if (!isClassAccessibleToTeacher(classId, access)) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  res.json({ students: getClassStudents(classId) });
});

app.get('/v1/teacher/classes/:classId/attempts', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || access.role !== 'teacher') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const { classId } = req.params;
  if (!isClassAccessibleToTeacher(classId, access)) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }
  const missionId = typeof req.query.missionId === 'string' ? req.query.missionId : '';
  const attempts = localAttempts
    .filter((attempt) => getAttemptClassId(attempt) === classId)
    .filter((attempt) => !missionId || getAttemptMissionId(attempt) === missionId)
    .sort((left, right) => {
      const leftDate = new Date(getAttemptUpdatedAt(left) ?? 0).getTime();
      const rightDate = new Date(getAttemptUpdatedAt(right) ?? 0).getTime();
      return rightDate - leftDate;
    });

  res.json({ attempts });
});

app.get('/v1/teacher/classes/:classId/progress', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || access.role !== 'teacher') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }
  const classId = req.params.classId;
  if (!isClassAccessibleToTeacher(classId, access)) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const missionId = typeof req.query.missionId === 'string' ? req.query.missionId : '';
  res.json({ progress: summarizeClassProgress(classId, missionId || undefined) });
});

app.post('/v1/teacher/students', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || access.role !== 'teacher') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const { name, email, classId } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Nome do aluno obrigatorio' });
    return;
  }
  if (typeof email !== 'string' || !email.trim()) {
    res.status(400).json({ error: 'Email do aluno obrigatorio' });
    return;
  }
  if (typeof classId !== 'string' || !classId.trim()) {
    res.status(400).json({ error: 'Turma obrigatoria' });
    return;
  }
  if (!access.isSuperadmin && !isClassAccessibleToTeacher(classId.trim(), access)) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const normalizedEmail = normalizeEmail(email);
  const now = new Date().toISOString();
  const existing = localAccessUsers.find((item) => normalizeEmail(item.email) === normalizedEmail);
  if (existing) {
    existing.name = name.trim();
    existing.role = 'student';
    existing.active = true;
    existing.classId = classId.trim();
    existing.classIds = Array.from(new Set([...(existing.classIds ?? []), classId.trim()]));
    existing.updatedAt = now;
  } else {
    localAccessUsers.push({
      email: normalizedEmail,
      name: name.trim(),
      role: 'student',
      active: true,
      classId: classId.trim(),
      classIds: [classId.trim()],
      createdAt: now,
      updatedAt: now,
    });
  }

  persistLocalData();
  res.status(201).json({ student: getLocalAccessByEmail(normalizedEmail) ?? { email: normalizedEmail, name: name.trim(), classId: classId.trim() } });
});

app.post('/v1/teacher/attempts/:attemptId/feedback', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || access.role !== 'teacher') {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const attempt = getLocalAttempt(req.params.attemptId);
  if (!attempt) {
    res.status(404).json({ error: 'Tentativa nao encontrada' });
    return;
  }

  const { feedback, grade } = req.body ?? {};
  if (typeof feedback !== 'string' || !feedback.trim()) {
    res.status(400).json({ error: 'Feedback obrigatorio' });
    return;
  }

  const now = new Date().toISOString();
  attempt.teacherFeedback = {
    text: feedback.trim(),
    grade: typeof grade === 'number' && !Number.isNaN(grade) ? grade : null,
    updatedAt: now,
    teacherEmail: access.email,
  };
  attempt.updatedAt = now;
  persistLocalData();
  res.status(204).end();
});

  // --- CLASSES ENDPOINTS ---
  // Estrutura localClasses já existe no topo do arquivo

  // GET /v1/teacher/classes - lista as turmas do professor
  app.get('/v1/teacher/classes', (req: Request, res: Response) => {
    const access = getAccess(req);
    if (!access || access.role !== 'teacher') {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    const classes = access.isSuperadmin
      ? localClasses
      : localClasses.filter((cls) => normalizeEmail((cls as any).teacherEmail) === normalizeEmail(access.email));
    res.json({ classes });
  });

  // POST /v1/teacher/classes - cria uma nova turma
  app.post('/v1/teacher/classes', (req: Request, res: Response) => {
    const access = getAccess(req);
    if (!access || access.role !== 'teacher') {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    const { name, year, description, icon, aiFeedback } = req.body;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Nome da turma obrigatório' });
      return;
    }
    const classId = `class_${Date.now()}_${Math.floor(Math.random()*10000)}`;
    const newClass = {
      classId,
      name,
      year: year || null,
      description: description || null,
      icon: icon || 'school',
      aiFeedback: aiFeedback !== false,
      teacherEmail: access.email, // Corrigido: adiciona teacherEmail obrigatório
      createdAt: new Date().toISOString(),
    };
    localClasses.push(newClass);
    persistLocalData();
    res.status(201).json({ class: newClass });
  });

// --- ADMIN ENDPOINTS ---
app.get('/v1/admin/users', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || (!access.isSuperadmin && access.role !== 'teacher')) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const users = access.isSuperadmin
    ? localAccessUsers
    : localAccessUsers.filter((user) => user.role === 'student');

  res.json({ users });
});

app.post('/v1/admin/users', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || (!access.isSuperadmin && access.role !== 'teacher')) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const { name, email: newEmail, role, school, classroom, active } = req.body ?? {};
  if (typeof newEmail !== 'string' || !newEmail.trim()) {
    res.status(400).json({ error: 'Email obrigatorio' });
    return;
  }
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'Nome obrigatorio' });
    return;
  }
  const normalizedEmail = normalizeEmail(newEmail);
  const existing = localAccessUsers.find((user) => normalizeEmail(user.email) === normalizedEmail);
  if (existing) {
    res.status(400).json({ error: 'Email ja existe' });
    return;
  }

  const targetRole = access.isSuperadmin ? role : 'student';
  if (!access.isSuperadmin && role !== 'student') {
    res.status(403).json({ error: 'Professores nao podem cadastrar outros professores' });
    return;
  }
  if (!['student', 'teacher'].includes(targetRole)) {
    res.status(400).json({ error: 'Role invalida' });
    return;
  }

  const now = new Date().toISOString();
  localAccessUsers.push({
    email: normalizedEmail,
    name: name.trim(),
    role: targetRole,
    school: typeof school === 'string' ? school : undefined,
    classroom: typeof classroom === 'string' ? classroom : undefined,
    active: typeof active === 'boolean' ? active : true,
    createdAt: now,
    updatedAt: now,
  });

  persistLocalData();
  res.status(201).json({ user: localAccessUsers[localAccessUsers.length - 1] });
});

app.patch('/v1/admin/users/:email', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || (!access.isSuperadmin && access.role !== 'teacher')) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const normalizedEmail = normalizeEmail(req.params.email);
  const user = localAccessUsers.find((u) => normalizeEmail(u.email) === normalizedEmail);
  if (!user) {
    res.status(404).json({ error: 'Usuario nao encontrado' });
    return;
  }

  if (!access.isSuperadmin && user.role === 'teacher') {
    res.status(403).json({ error: 'Professores nao podem editar outros professores' });
    return;
  }

  const { name, role, school, classroom, active } = req.body ?? {};
  if (typeof name === 'string' && name.trim()) user.name = name.trim();
  if (access.isSuperadmin && ['student', 'teacher'].includes(role)) user.role = role;
  if (typeof school === 'string') user.school = school || undefined;
  if (typeof classroom === 'string') user.classroom = classroom || undefined;
  if (typeof active === 'boolean') user.active = active;
  user.updatedAt = new Date().toISOString();

  persistLocalData();
  res.json({ user });
});

app.delete('/v1/admin/users/:email', (req: Request, res: Response) => {
  const access = getAccess(req);
  if (!access || (!access.isSuperadmin && access.role !== 'teacher')) {
    res.status(403).json({ error: 'Acesso negado' });
    return;
  }

  const normalizedEmail = normalizeEmail(req.params.email);
  const index = localAccessUsers.findIndex((u) => normalizeEmail(u.email) === normalizedEmail);
  if (index === -1) {
    res.status(404).json({ error: 'Usuario nao encontrado' });
    return;
  }

  const target = localAccessUsers[index];
  if (!access.isSuperadmin && target.role === 'teacher') {
    res.status(403).json({ error: 'Professores nao podem excluir outros professores' });
    return;
  }

  localAccessUsers.splice(index, 1);
  persistLocalData();
  res.status(204).end();
});

const requireSuperadmin = (req: Request, res: Response) => {
  const access = getAccess(req);
  const userEmail = getUserEmail(req);
  if (!access?.isSuperadmin && !isSuperadminEmail(userEmail)) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
};

// Inicie o servidor na porta 8080 por padrão
const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});
