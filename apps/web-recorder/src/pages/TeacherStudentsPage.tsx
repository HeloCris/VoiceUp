import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { getAuthHeaders } from '../firebase';

type TeacherClass = {
  classId: string;
  name: string;
};

export default function TeacherStudentsPage() {
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [classId, setClassId] = useState('');

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        setLoading(true);
        const headers = await getAuthHeaders();
        if (!headers.Authorization) {
          setError('Faca login para carregar turmas.');
          return;
        }
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/teacher/classes`, {
          headers,
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Falha ao carregar turmas.');
        }
        const data = (await response.json()) as { classes: TeacherClass[] };
        setClasses(data.classes ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido.');
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        setError('Faca login para cadastrar alunos.');
        return;
      }
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/teacher/students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ name, email, classId }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao cadastrar aluno.');
      }
      setName('');
      setEmail('');
      setClassId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader title="Cadastro de aluno" subheader="Cadastre alunos e associe a uma turma." />
        <CardContent>
          {loading && <LinearProgress />}
          <Stack spacing={2}>
            <TextField label="Nome completo" value={name} onChange={(event) => setName(event.target.value)} />
            <TextField label="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <TextField
              select
              label="Turma"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
            >
              <MenuItem value="">Selecione</MenuItem>
              {classes.map((item) => (
                <MenuItem key={item.classId} value={item.classId}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>
            {error ? (
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            ) : null}
            <Button variant="contained" onClick={handleSave} disabled={saving}>
              Cadastrar aluno
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
