import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardHeader,
  FormControlLabel,
  LinearProgress,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import SchoolRounded from '@mui/icons-material/SchoolRounded';
import GroupRounded from '@mui/icons-material/GroupRounded';
import MicRounded from '@mui/icons-material/MicRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAuthHeaders } from '../firebase';

type TeacherClass = {
  classId: string;
  name: string;
  year?: string | null;
  description?: string | null;
  icon?: string | null;
  aiFeedback?: boolean | null;
  createdAt?: string;
};

import BusinessRounded from '@mui/icons-material/BusinessRounded';
const classIcons = [
  { id: 'school', label: 'Escola', icon: <SchoolRounded sx={{ fontSize: 18 }} /> },
  { id: 'group', label: 'Grupo', icon: <GroupRounded sx={{ fontSize: 18 }} /> },
  { id: 'mic', label: 'Voz', icon: <MicRounded sx={{ fontSize: 18 }} /> },
  { id: 'star', label: 'Estrela', icon: <StarRounded sx={{ fontSize: 18 }} /> },
  { id: 'award', label: 'Trofeu', icon: <EmojiEventsRounded sx={{ fontSize: 18 }} /> },
  { id: 'gabinete', label: 'Gabinete', icon: <BusinessRounded sx={{ fontSize: 18 }} /> },
];

const getClassIcon = (iconId?: string | null) => {
  return classIcons.find((item) => item.id === iconId)?.icon ?? <SchoolRounded fontSize="small" />;
};

export default function TeacherClassesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const createRef = useRef<HTMLDivElement | null>(null);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('school');
  const [aiFeedback, setAiFeedback] = useState(true);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        setError('Faca login para ver suas turmas.');
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

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (location.hash === '#new' && createRef.current) {
      createRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  const handleCreate = async () => {
    try {
      setSaving(true);
      setError(null);
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        setError('Faca login para criar turmas.');
        return;
      }
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/teacher/classes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          name,
          year: year || undefined,
          description: description || undefined,
          icon,
          aiFeedback,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao criar turma.');
      }
      setName('');
      setYear('');
      setDescription('');
      setIcon('school');
      setAiFeedback(true);
      await fetchClasses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Card ref={createRef}>
        <CardHeader
          title="Criar turma"
          subheader="Cadastre suas turmas para vincular tentativas."
        />
        <CardContent>
          <Stack spacing={2}>
            <TextField label="Nome da turma" value={name} onChange={(event) => setName(event.target.value)} />
            <TextField
              label="Ano/serie (ex: 2026, 3o ano)"
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
            <TextField
              select
              label="Icone da turma"
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
            >
              {classIcons.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {item.icon}
                    <span>{item.label}</span>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Descricao (opcional)"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              multiline
              minRows={2}
            />
            <FormControlLabel
              control={<Switch checked={aiFeedback} onChange={(event) => setAiFeedback(event.target.checked)} />}
              label="Feedback de IA ativo"
            />
            {error ? (
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            ) : null}
            <Button variant="contained" onClick={handleCreate} disabled={saving}>
              Criar turma
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Minhas turmas" />
        <CardContent>
          {loading && <LinearProgress />}
          {!loading && error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
          {!loading && !error && classes.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Nenhuma turma cadastrada ainda.
            </Typography>
          )}
          {!loading && !error && classes.length > 0 && (
            <Stack spacing={2}>
              {classes.map((item) => (
                <Card key={item.classId} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', color: '#fff' }}>
                          {getClassIcon(item.icon)}
                        </Avatar>
                        <Typography fontWeight={600}>{item.name}</Typography>
                      </Stack>
                      {item.year && (
                        <Typography color="text.secondary" variant="body2">
                          Ano/serie: {item.year}
                        </Typography>
                      )}
                      {item.description && (
                        <Typography color="text.secondary" variant="body2">
                          {item.description}
                        </Typography>
                      )}
                      {item.aiFeedback === false && (
                        <Typography color="text.secondary" variant="caption">
                          Feedback de IA desativado
                        </Typography>
                      )}
                      <Button variant="outlined" onClick={() => navigate(`/teacher/classes/${item.classId}`)}>
                        Abrir turma
                      </Button>
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
