import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Chip,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { getAuthToken } from '../firebase';

interface AttemptItem {
  attemptId: string;
  updatedAt?: string;
  status?: string;
  transcript?: string | null;
  teacherFeedback?: {
    text?: string;
    updatedAt?: string;
    teacherEmail?: string;
  } | null;
  feedback?: {
    pronunciation?: {
      lowConfidenceWords?: string[];
    };
    metrics?: {
      wordsPerMinute?: number;
      pauseCount?: number;
      lexicalDiversity?: number;
    };
  } | null;
  audioUrl?: string | null;
}

interface MissionItem {
  missionId: string;
  title: string;
  description: string;
}

export default function StudentAttemptsPage() {
  const [attempts, setAttempts] = useState<AttemptItem[]>([]);
  const [missions, setMissions] = useState<MissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAttempts = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await getAuthToken();
        if (!token) {
          setError('Faca login para ver seu historico.');
          return;
        }
        const [attemptsResponse, missionsResponse] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/v1/student/attempts`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${import.meta.env.VITE_API_URL}/v1/missions`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (!attemptsResponse.ok) {
          const text = await attemptsResponse.text();
          throw new Error(text || 'Falha ao carregar tentativas.');
        }
        if (!missionsResponse.ok) {
          const text = await missionsResponse.text();
          throw new Error(text || 'Falha ao carregar missoes.');
        }
        const attemptsData = (await attemptsResponse.json()) as { attempts: AttemptItem[] };
        const missionsData = (await missionsResponse.json()) as { missions: MissionItem[] };
        setAttempts(attemptsData.attempts ?? []);
        setMissions(missionsData.missions ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido.');
      } finally {
        setLoading(false);
      }
    };

    fetchAttempts();
  }, []);

  const wordStats = useMemo(() => {
    const counts = new Map<string, number>();
    attempts.forEach((attempt) => {
      attempt.feedback?.pronunciation?.lowConfidenceWords?.forEach((word) => {
        const key = word.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [attempts]);

  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader title="Missoes disponiveis" subheader="Escolha uma missao para praticar." />
        <CardContent>
          {loading && <LinearProgress />}
          {!loading && error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
          {!loading && !error && missions.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Nenhuma missao cadastrada ainda.
            </Typography>
          )}
          {!loading && !error && missions.length > 0 && (
            <Stack spacing={1.5}>
              {missions.map((mission) => (
                <Card key={mission.missionId} variant="outlined">
                  <CardContent>
                    <Typography fontWeight={600}>{mission.title}</Typography>
                    <Typography color="text.secondary" variant="body2">
                      {mission.description}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Historico do aluno" subheader="Resumo das suas tentativas recentes." />
        <CardContent>
          {loading && <LinearProgress />}
          {!loading && error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
          {!loading && !error && attempts.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Nenhuma tentativa registrada ainda.
            </Typography>
          )}
          {!loading && !error && attempts.length > 0 && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {wordStats.length > 0 ? (
                  wordStats.map(([word, count]) => (
                    <Chip key={word} label={`${word} (${count})`} size="small" />
                  ))
                ) : (
                  <Typography color="text.secondary" variant="body2">
                    Sem palavras de baixa confianca.
                  </Typography>
                )}
              </Stack>
              {attempts.map((attempt) => (
                <Card key={attempt.attemptId} variant="outlined">
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Typography fontWeight={600}>Tentativa {attempt.attemptId}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Status: {attempt.status ?? 'desconhecido'}
                      </Typography>
                      {attempt.feedback?.metrics && (
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          <Chip
                            label={`WPM: ${attempt.feedback.metrics.wordsPerMinute ?? 0}`}
                            size="small"
                            color="primary"
                          />
                          <Chip
                            label={`Pausas >2s: ${attempt.feedback.metrics.pauseCount ?? 0}`}
                            size="small"
                          />
                          <Chip
                            label={`Diversidade: ${attempt.feedback.metrics.lexicalDiversity ?? 0}`}
                            size="small"
                          />
                        </Stack>
                      )}
                      {attempt.teacherFeedback?.text && (
                        <Box>
                          <Typography variant="subtitle2">Feedback do professor</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {attempt.teacherFeedback.text}
                          </Typography>
                        </Box>
                      )}
                      {attempt.audioUrl && (
                        <Box>
                          <audio controls src={attempt.audioUrl} style={{ width: '100%' }} />
                        </Box>
                      )}
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
