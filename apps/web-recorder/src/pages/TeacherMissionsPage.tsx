import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { getAuthToken } from '../firebase';

type MissionItem = {
  missionId: string;
  title: string;
  description: string;
  prompts: string[];
  createdAt?: string;
};

export default function TeacherMissionsPage() {
  const [missions, setMissions] = useState<MissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [promptsText, setPromptsText] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchMissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAuthToken();
      if (!token) {
        setError('Faca login para ver as missoes.');
        return;
      }
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/missions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao carregar missoes.');
      }
      const data = (await response.json()) as { missions: MissionItem[] };
      setMissions(data.missions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMissions();
  }, []);

  const handleCreate = async () => {
    try {
      setSaving(true);
      setError(null);
      const token = await getAuthToken();
      if (!token) {
        setError('Faca login para criar missoes.');
        return;
      }
      const prompts = promptsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/missions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title, description, prompts }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao criar missao.');
      }
      setTitle('');
      setDescription('');
      setPromptsText('');
      await fetchMissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader title="Criar missao" subheader="Defina titulo, descricao e prompts." />
        <CardContent>
          <Stack spacing={2}>
            <TextField label="Titulo" value={title} onChange={(event) => setTitle(event.target.value)} />
            <TextField
              label="Descricao"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              multiline
              minRows={2}
            />
            <TextField
              label="Prompts (uma linha por prompt)"
              value={promptsText}
              onChange={(event) => setPromptsText(event.target.value)}
              multiline
              minRows={3}
            />
            {error ? (
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            ) : null}
            <Button variant="contained" onClick={handleCreate} disabled={saving}>
              Criar missao
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Missoes criadas" />
        <CardContent>
          {loading && <LinearProgress />}
          {!loading && error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
          {!loading && !error && missions.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Nenhuma missao criada ainda.
            </Typography>
          )}
          {!loading && !error && missions.length > 0 && (
            <Stack spacing={2}>
              {missions.map((mission) => (
                <Card key={mission.missionId} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography fontWeight={600}>{mission.title}</Typography>
                      <Typography color="text.secondary" variant="body2">
                        {mission.description}
                      </Typography>
                      <Typography color="text.secondary" variant="caption">
                        Prompts: {mission.prompts?.length ?? 0}
                      </Typography>
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
