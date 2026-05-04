import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { getAuthHeaders } from '../firebase';
import { useAuth } from '../state/useAuth';

type AccessUser = {
  email: string;
  name: string;
  role: 'student' | 'teacher';
  school?: string | null;
  classroom?: string | null;
  active?: boolean;
  createdAt?: string;
};

export default function AdminAccessPage() {
  const { isSuperadmin } = useAuth();
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [currentTab, setCurrentTab] = useState<'student' | 'teacher'>('student');
  const [school, setSchool] = useState('');
  const [classroom, setClassroom] = useState('');
  const [active, setActive] = useState(true);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);

  const canManageTeachers = isSuperadmin;

  useEffect(() => {
    if (!isSuperadmin) {
      setCurrentTab('student');
      setRole('student');
    }
  }, [isSuperadmin]);

  const parseApiError = async (response: Response) => {
    const text = await response.text();
    if (!text) {
      return 'Falha ao conectar com o servidor.';
    }
    try {
      const json = JSON.parse(text) as { error?: unknown };
      if (!json.error) {
        return text;
      }
      if (typeof json.error === 'string') {
        return json.error;
      }
      if (Array.isArray(json.error)) {
        return json.error.map(String).join('; ');
      }
      if (typeof json.error === 'object') {
        const errorObj = json.error as Record<string, unknown>;
        const messages: string[] = [];
        if (Array.isArray(errorObj.formErrors)) {
          messages.push(...errorObj.formErrors.map(String));
        }
        if (errorObj.fieldErrors && typeof errorObj.fieldErrors === 'object') {
          Object.entries(errorObj.fieldErrors).forEach(([field, value]) => {
            if (Array.isArray(value)) {
              messages.push(...value.map((item) => `${field}: ${String(item)}`));
            }
          });
        }
        return messages.length > 0 ? messages.join('; ') : JSON.stringify(json.error);
      }
      return String(json.error);
    } catch {
      return text;
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        setError('Faca login para ver os acessos.');
        return;
      }
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/admin/users`, {
        headers,
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }
      const data = (await response.json()) as { users: AccessUser[] };
      setUsers(data.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = users.filter((user) => user.role === currentTab);

  const resetForm = () => {
    setName('');
    setEmail('');
    setRole('student');
    setCurrentTab('student');
    setSchool('');
    setClassroom('');
    setActive(true);
    setEditingEmail(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        setError('Faca login para salvar acessos.');
        return;
      }
      const method = editingEmail ? 'PATCH' : 'POST';
      const url = editingEmail
        ? `${import.meta.env.VITE_API_URL}/v1/admin/users/${encodeURIComponent(editingEmail)}`
        : `${import.meta.env.VITE_API_URL}/v1/admin/users`;
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          name,
          email,
          role: canManageTeachers ? role : 'student',
          school: school.trim() || undefined,
          classroom: classroom.trim() || undefined,
          active,
        }),
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }
      resetForm();
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader
          title={isSuperadmin ? 'Cadastro de professores e alunos' : 'Cadastro de alunos'}
          subheader={isSuperadmin
            ? 'Use este painel para cadastrar e liberar acesso de professores e alunos.'
            : 'Use este painel para cadastrar e liberar acesso apenas de alunos.'}
          action={
            <Button component={Link} to="/teacher/missions" variant="outlined" size="small">
              Voltar para missões
            </Button>
          }
        />
        <CardContent>
          <Stack spacing={2}>
            {canManageTeachers ? (
              <>
                <Tabs
                  value={currentTab}
                  onChange={(_, value) => {
                    setCurrentTab(value);
                    setRole(value);
                  }}
                  textColor="primary"
                  indicatorColor="primary"
                >
                  <Tab label="Professores" value="teacher" />
                  <Tab label="Alunos" value="student" />
                </Tabs>
                <Typography variant="body2" color="text.secondary">
                  Cadastro atual: {currentTab === 'teacher' ? 'Professor' : 'Aluno'}
                </Typography>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Cadastro atual: Aluno
              </Typography>
            )}
            <TextField label="Nome" value={name} onChange={(event) => setName(event.target.value)} />
            <TextField
              label="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={Boolean(editingEmail)}
            />
            {canManageTeachers ? (
              <TextField
                select
                label="Perfil"
                value={role}
                onChange={(event) => setRole(event.target.value as 'student' | 'teacher')}
              >
                <MenuItem value="student">Aluno</MenuItem>
                <MenuItem value="teacher">Professor</MenuItem>
              </TextField>
            ) : (
              <TextField
                label="Perfil"
                value="Aluno"
                disabled
              />
            )}
            <TextField label="Escola" value={school} onChange={(event) => setSchool(event.target.value)} />
            <TextField
              label="Turma (ex: 3A, 2B)"
              value={classroom}
              onChange={(event) => setClassroom(event.target.value)}
            />
            <FormControlLabel
              control={<Switch checked={active} onChange={(event) => setActive(event.target.checked)} />}
              label="Acesso ativo"
            />
            {editingEmail ? (
              <Button variant="text" onClick={resetForm}>
                Cancelar edição
              </Button>
            ) : null}
            {error ? (
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            ) : null}
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              Salvar acesso
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Acessos liberados" />
        <CardContent>
          {loading && <LinearProgress />}
          {!loading && error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
          {!loading && !error && users.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Nenhum acesso cadastrado ainda.
            </Typography>
          )}
          {!loading && !error && users.length > 0 && filteredUsers.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Nenhum acesso cadastrado para esta categoria.
            </Typography>
          )}
          {!loading && !error && filteredUsers.length > 0 && (
            <Stack spacing={2}>
              {filteredUsers.map((user) => (
                <Card key={user.email} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="center">
                        <Typography fontWeight={600}>{user.name}</Typography>
                        <Chip
                          size="small"
                          color={user.role === 'teacher' ? 'primary' : 'default'}
                          label={user.role === 'teacher' ? 'Professor' : 'Aluno'}
                        />
                        <Chip
                          size="small"
                          color={user.active === false ? 'default' : 'success'}
                          label={user.active === false ? 'Inativo' : 'Ativo'}
                        />
                      </Stack>
                      <Typography color="text.secondary" variant="body2">
                        {user.email}
                      </Typography>
                      {(user.school || user.classroom) && (
                        <Typography color="text.secondary" variant="body2">
                          {user.school ? `Escola: ${user.school}` : ''}
                          {user.school && user.classroom ? ' • ' : ''}
                          {user.classroom ? `Turma: ${user.classroom}` : ''}
                        </Typography>
                      )}
                      <Stack direction="row" spacing={1}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => {
                            setEditingEmail(user.email);
                            setName(user.name);
                            setEmail(user.email);
                            setRole(user.role);
                            setCurrentTab(user.role);
                            setSchool(user.school ?? '');
                            setClassroom(user.classroom ?? '');
                            setActive(user.active !== false);
                          }}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={async () => {
                            if (!window.confirm(`Excluir ${user.email}?`)) return;
                            try {
                              setError(null);
                              const headers = await getAuthHeaders();
                              if (!headers.Authorization) {
                                setError('Faca login para excluir acessos.');
                                return;
                              }
                              const response = await fetch(
                                `${import.meta.env.VITE_API_URL}/v1/admin/users/${encodeURIComponent(user.email)}`,
                                {
                                  method: 'DELETE',
                                  headers,
                                }
                              );
                              if (!response.ok) {
                                throw new Error(await parseApiError(response));
                              }
                              await fetchUsers();
                              if (editingEmail === user.email) {
                                resetForm();
                              }
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Erro desconhecido.');
                            }
                          }}
                        >
                          Excluir
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
