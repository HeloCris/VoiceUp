import { useEffect, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardHeader,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import SchoolRounded from '@mui/icons-material/SchoolRounded';
import GroupRounded from '@mui/icons-material/GroupRounded';
import MicRounded from '@mui/icons-material/MicRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import BusinessRounded from '@mui/icons-material/BusinessRounded';
import { useNavigate } from 'react-router-dom';
import { getAuthHeaders } from '../firebase';

type StudentClass = {
  classId?: string;
  name: string;
  year?: string | null;
  description?: string | null;
  icon?: string | null;
  aiFeedback?: boolean | null;
};

const classIcons = [
  { id: 'school', label: 'Escola', icon: <SchoolRounded sx={{ fontSize: 18 }} /> },
  { id: 'group', label: 'Grupo', icon: <GroupRounded sx={{ fontSize: 18 }} /> },
  { id: 'mic', label: 'Voz', icon: <MicRounded sx={{ fontSize: 18 }} /> },
  { id: 'star', label: 'Estrela', icon: <StarRounded sx={{ fontSize: 18 }} /> },
  { id: 'award', label: 'Troféu', icon: <EmojiEventsRounded sx={{ fontSize: 18 }} /> },
  { id: 'gabinete', label: 'Gabinete', icon: <BusinessRounded sx={{ fontSize: 18 }} /> },
];

const getClassIcon = (iconId?: string | null) => {
  return classIcons.find((item) => item.id === iconId)?.icon ?? <SchoolRounded fontSize="small" />;
};

export default function StudentClassesPage() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        setLoading(true);
        setError(null);
        const headers = await getAuthHeaders();
        if (!headers.Authorization) {
          setError('Faca login para ver suas turmas.');
          return;
        }
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/student/classes`, {
          headers,
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Falha ao carregar turmas.');
        }
        const data = (await response.json()) as { classes: StudentClass[] };
        setClasses(data.classes ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido.');
      } finally {
        setLoading(false);
      }
    };

    fetchClasses();
  }, []);

  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader title="Turmas" subheader="Turmas vinculadas ao seu acesso." />
        <CardContent>
          {loading && <LinearProgress />}
          {!loading && error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
          {!loading && !error && classes.length === 0 && (
            <Typography color="text.secondary">
              Nenhuma turma atribuida ainda.
            </Typography>
          )}
          {!loading && !error && classes.length > 0 && (
            <Stack spacing={2}>
              {classes.map((item) => (
                <Card key={item.classId ?? item.name} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', color: '#fff' }}>
                          {getClassIcon(item.icon)}
                        </Avatar>
                        <Typography fontWeight={600}>{item.name}</Typography>
                      </Stack>
                      {item.year ? (
                        <Typography color="text.secondary" variant="body2">
                          Ano/serie: {item.year}
                        </Typography>
                      ) : null}
                      {item.description ? (
                        <Typography color="text.secondary" variant="body2">
                          {item.description}
                        </Typography>
                      ) : null}
                      {item.aiFeedback === false ? (
                        <Typography color="text.secondary" variant="caption">
                          Feedback de IA desativado
                        </Typography>
                      ) : null}
                      <Button
                        variant="outlined"
                        onClick={() => navigate(`/student/attempts?classId=${item.classId ?? ''}`)}
                      >
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
