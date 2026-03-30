import { Box, Button, Container, Stack, Typography } from '@mui/material';
import { Link, Outlet, Route, Routes } from 'react-router-dom';
import RecorderPage from './pages/RecorderPage';
import AttemptsPage from './pages/AttemptsPage';
import StudentAttemptsPage from './pages/StudentAttemptsPage';
import TeacherClassAttemptsPage from './pages/TeacherClassAttemptsPage';
import TeacherMissionsPage from './pages/TeacherMissionsPage';
import { useAuth } from './state/useAuth';

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
        {error ? <Typography color="error">{error}</Typography> : null}
        <Button variant="contained" onClick={signIn} disabled={loading}>
          Entrar com Google
        </Button>
      </Stack>
    </Box>
  );
}

function Layout() {
  const { user, signOutUser, loading, role, roleLoading } = useAuth();

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
                  <Button variant="text" color="inherit" onClick={signOutUser}>
                    Sair
                  </Button>
                </Box>
              ) : null}
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button component={Link} to="/" variant="text" color="inherit">
                Gravar
              </Button>
              {role === 'student' && (
                <Button component={Link} to="/student/attempts" variant="text" color="inherit">
                  Aluno
                </Button>
              )}
              {role === 'teacher' && (
                <>
                  <Button component={Link} to="/teacher/missions" variant="text" color="inherit">
                    Missoes
                  </Button>
                  <Button component={Link} to="/teacher/classes/demo" variant="text" color="inherit">
                    Professor
                  </Button>
                </>
              )}
            </Stack>
            {loading || roleLoading ? (
              <Typography color="text.secondary">Carregando...</Typography>
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

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<RecorderPage />} />
        <Route path="/attempts" element={<AttemptsPage />} />
        <Route path="/student/attempts" element={<RoleGate allow={['student']}><StudentAttemptsPage /></RoleGate>} />
        <Route path="/teacher/missions" element={<RoleGate allow={['teacher']}><TeacherMissionsPage /></RoleGate>} />
        <Route path="/teacher/classes/:id" element={<RoleGate allow={['teacher']}><TeacherClassAttemptsPage /></RoleGate>} />
      </Route>
    </Routes>
  );
}

function RoleGate({ allow, children }: { allow: Role[]; children: JSX.Element }) {
  const { role, roleLoading } = useAuth();
  if (roleLoading) {
    return <Typography color="text.secondary">Carregando perfil...</Typography>;
  }
  if (!role || !allow.includes(role)) {
    return <Typography color="error">Voce nao tem permissao para acessar esta pagina.</Typography>;
  }
  return children;
}
