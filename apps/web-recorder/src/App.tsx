import { useEffect, useRef } from 'react';
import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { Link, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import RecorderPage from './pages/RecorderPage';
import AttemptsPage from './pages/AttemptsPage';
import StudentAttemptsPage from './pages/StudentAttemptsPage';
import StudentClassesPage from './pages/StudentClassesPage';
import TeacherClassAttemptsPage from './pages/TeacherClassAttemptsPage';
import TeacherMissionsPage from './pages/TeacherMissionsPage';
import AdminAccessPage from './pages/AdminAccessPage';
import TeacherClassesPage from './pages/TeacherClassesPage';
import TeacherStudentsPage from './pages/TeacherStudentsPage';
import { useAuth } from './state/useAuth';
import { firebaseConfigValid, localAuthBypass } from './firebase';

type Role = 'student' | 'teacher';

function SignInGate() {
  const { signIn, loading, error } = useAuth();

  return (
    <Box
      sx={{
        borderRadius: 3,
        border: '1px solid rgba(109, 50, 162, 0.12)',
        padding: { xs: 3, sm: 4 },
        background: '#fff',
      }}
    >
      <Stack spacing={2} alignItems="flex-start">
        <Typography variant="h5" fontWeight={700}>
          Entre para continuar
        </Typography>
        <Typography color="text.secondary">
          Use sua conta Google para acessar as missoes e o feedback.
        </Typography>
        {!firebaseConfigValid ? (
          <Typography color="warning.main">
            Firebase não está configurado. O login operará em modo local de fallback.
          </Typography>
        ) : null}
        {error ? <Typography color="error">{error}</Typography> : null}
        <Button variant="contained" onClick={signIn} disabled={loading}>
          Entrar com Google
        </Button>
      </Stack>
    </Box>
  );
}

function Layout() {
  const { user, signOutUser, loading, role, roleLoading, isSuperadmin, accessDenied } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const previousUserRef = useRef<typeof user>(null);

  useEffect(() => {
    if (loading || roleLoading) return;

    previousUserRef.current = user;

    if (!user || accessDenied) {
      if (location.pathname !== '/') {
        navigate('/', { replace: true });
      }
      return;
    }

    if (location.pathname === '/') {
      const targetPath = isSuperadmin ? '/admin/access' : role === 'teacher' ? '/teacher/missions' : '/student/attempts';
      navigate(targetPath, { replace: true });
    }
  }, [user, accessDenied, loading, role, roleLoading, isSuperadmin, location.pathname, navigate]);

  return (
    <Container maxWidth="md">
      <Stack spacing={3} py={6}>
        <Box className="app-shell">
          <Stack spacing={3}>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              gap={3}
              flexWrap="wrap"
              position="relative"
            >
              <Box
                component="img"
                src="/logo.png"
                alt="Icone VoiceUp"
                sx={{ width: { xs: 220, sm: 300 }, height: { xs: 110, sm: 150 }, objectFit: 'contain' }}
              />
              {user ? (
                <Box position="absolute" right={0} top={0}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {role === 'student' ? (
                      <Button component={Link} to="/student/classes" variant="outlined" color="inherit">
                        Turmas
                      </Button>
                    ) : null}
                    {(role === 'teacher' || isSuperadmin) ? (
                      <Button component={Link} to="/teacher/classes" variant="outlined" color="inherit">
                        Turmas
                      </Button>
                    ) : null}
                    {(role === 'teacher' || isSuperadmin) ? (
                      <Button component={Link} to="/admin/access" variant="outlined" color="inherit">
                        Admin
                      </Button>
                    ) : null}
                    <Button variant="text" color="inherit" onClick={signOutUser}>
                      Sair
                    </Button>
                  </Stack>
                </Box>
              ) : null}
            </Box>
            {/* Navigation hidden to keep the home page focused on Google login */}
            {loading || roleLoading ? (
              <Typography color="text.secondary">Carregando...</Typography>
            ) : accessDenied ? (
              <Stack spacing={2}>
                <Typography color="error">
                  Acesso nao autorizado. Fale com a administracao para liberar seu email.
                </Typography>
                <Typography color="text.secondary" variant="caption">
                  Debug: user={user?.email ?? 'null'}, role={role ?? 'null'}, isSuperadmin={String(isSuperadmin)}, accessDenied={String(accessDenied)}
                </Typography>
              </Stack>
            ) : user ? (
              <Outlet />
            ) : (
              <SignInGate />
            )}
          </Stack>
        </Box>
      </Stack>
    </Container>
  );
}

function HomePage() {
  const { user, role, roleLoading, accessDenied } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || accessDenied || roleLoading) return;
    if (localAuthBypass) {
      navigate('/recorder', { replace: true });
      return;
    }
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
    const superadminEmails = (String(import.meta.env.VITE_SUPERADMIN_EMAIL ?? ''))
      .split(/[,;]+/)
      .map((value: string) => normalizeEmail(value))
      .filter(Boolean);
    const currentEmail = user?.email ? normalizeEmail(user.email) : null;
    const isSuperadminEmail = Boolean(currentEmail && superadminEmails.includes(currentEmail));
    const targetPath = role
      ? role === 'teacher'
        ? '/teacher/missions'
        : '/student/attempts'
      : isSuperadminEmail
      ? '/teacher/missions'
      : '/student/attempts';
    navigate(targetPath, { replace: true });
  }, [user, role, roleLoading, accessDenied, navigate]);

  return (
    <Stack
      spacing={3}
      alignItems="center"
      textAlign="center"
      sx={{ width: '100%', minHeight: '60vh', justifyContent: 'center' }}
    >
      <Typography variant="h2" fontWeight={900} letterSpacing={2} sx={{ textTransform: 'uppercase' }}>
        Hello
      </Typography>
      <Typography variant="h4" fontWeight={700}>
        Bem-vindo ao VoiceUp
      </Typography>
      <Box
        sx={{
          position: 'relative',
          width: { xs: 240, sm: 320 },
          height: { xs: 240, sm: 320 },
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(109,50,162,0.18), rgba(156,39,176,0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 18px 40px rgba(109, 50, 162, 0.12)',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.45), transparent 40%), radial-gradient(circle at 70% 70%, rgba(255,255,255,0.22), transparent 30%)',
          },
          animation: 'float 6s ease-in-out infinite',
        }}
      >
        <Box
          component="img"
          src="/logo.png"
          alt="VoiceUp GIF hero"
          sx={{ width: { xs: 140, sm: 180 }, height: 'auto', position: 'relative', zIndex: 1 }}
        />
      </Box>
      <Box sx={{ maxWidth: 520 }}>
        <Typography color="text.secondary">
          Faça login com sua conta Google para acessar a plataforma e começar a gravar suas missões.
        </Typography>
      </Box>
      {user ? (
        <Button variant="contained" size="large" onClick={() => navigate('/recorder')}>
          Abrir gravador
        </Button>
      ) : null}
      {!user ? (
        <SignInGate />
      ) : (
        <Typography color="text.secondary" sx={{ maxWidth: 520 }}>
          Redirecionando para o seu painel...
        </Typography>
      )}
      <Typography color="text.secondary" variant="caption" sx={{ mt: 2 }}>
        © 2026 VoiceUp. Todos os Direitos Reservados.
      </Typography>
      <style>{`@keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-14px); } }`}</style>
    </Stack>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/attempts" element={<AttemptsPage />} />
        <Route path="/student/attempts" element={<RoleGate allow={['student']}><StudentAttemptsPage /></RoleGate>} />
        <Route path="/student/classes" element={<RoleGate allow={['student']}><StudentClassesPage /></RoleGate>} />
        <Route path="/teacher/missions" element={<RoleGate allow={['teacher']}><TeacherMissionsPage /></RoleGate>} />
        <Route path="/teacher/classes" element={<RoleGate allow={['teacher']}><TeacherClassesPage /></RoleGate>} />
        <Route path="/teacher/classes/:id" element={<RoleGate allow={['teacher']}><TeacherClassAttemptsPage /></RoleGate>} />
        <Route path="/teacher/students" element={<RoleGate allow={['teacher']}><TeacherStudentsPage /></RoleGate>} />
        <Route path="/recorder" element={<RecorderPage />} />
        <Route path="/admin/access" element={<TeacherOrSuperAdminGate><AdminAccessPage /></TeacherOrSuperAdminGate>} />
      </Route>
    </Routes>
  );
}

function RoleGate({ allow, children }: { allow: Role[]; children: JSX.Element }) {
  const { role, roleLoading, isSuperadmin } = useAuth();
  if (roleLoading) {
    return <Typography color="text.secondary">Carregando perfil...</Typography>;
  }
  if (isSuperadmin) {
    return children;
  }
  if (!role || !allow.includes(role)) {
    return <Typography color="error">Voce nao tem permissao para acessar esta pagina.</Typography>;
  }
  return children;
}

function TeacherOrSuperAdminGate({ children }: { children: JSX.Element }) {
  const { role, isSuperadmin, roleLoading } = useAuth();
  if (roleLoading) {
    return <Typography color="text.secondary">Carregando perfil...</Typography>;
  }
  if (!isSuperadmin && role !== 'teacher') {
    return <Typography color="error">Voce nao tem permissao para acessar esta pagina.</Typography>;
  }
  return children;
}
