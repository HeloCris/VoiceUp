import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { getAuthToken } from '../firebase';

interface AttemptItem {
  attemptId: string;
  userEmail?: string | null;
  updatedAt?: string;
  status?: string;
  teacherFeedback?: {
    text?: string;
    updatedAt?: string;
    teacherEmail?: string;
  } | null;
  feedback?: {
    tags?: Record<string, string>;
  } | null;
  audioUrl?: string | null;
}

export default function TeacherClassAttemptsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [classId, setClassId] = useState(id ?? '');
  const [attempts, setAttempts] = useState<AttemptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const fetchAttempts = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = await getAuthToken();
        if (!token) {
          setError('Faca login para ver as turmas.');
          return;
        }
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/teacher/classes/${id}/attempts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Falha ao carregar tentativas.');
        }
        const data = (await response.json()) as { attempts: AttemptItem[] };
        setAttempts(data.attempts ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido.');
      } finally {
        setLoading(false);
      }
    };

    fetchAttempts();
  }, [id]);

  const handleFeedbackChange = (attemptId: string, value: string) => {
    setFeedbackDrafts((prev) => ({ ...prev, [attemptId]: value }));
  };

  const handleSaveFeedback = async (attemptId: string) => {
    try {
      setSavingId(attemptId);
      setError(null);
      const token = await getAuthToken();
      if (!token) {
        setError('Faca login para enviar feedback.');
        return;
      }
      const feedback = feedbackDrafts[attemptId]?.trim();
      if (!feedback) {
        setError('Informe um feedback antes de salvar.');
        return;
      }
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/teacher/attempts/${attemptId}/feedback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ feedback }),
        }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao salvar feedback.');
      }
      setFeedbackDrafts((prev) => ({ ...prev, [attemptId]: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader title="Turma" subheader="Consulte tentativas por classId." />
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Class ID"
              value={classId}
              fullWidth
              onChange={(event) => setClassId(event.target.value)}
            />
            <Button
              variant="contained"
              onClick={() => classId && navigate(`/teacher/classes/${classId}`)}
            >
              Buscar
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title={`Tentativas da turma`} />
        <CardContent>
          {loading && <LinearProgress />}
          {!loading && error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
          {!loading && !error && attempts.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Nenhuma tentativa encontrada.
            </Typography>
          )}
          {!loading && !error && attempts.length > 0 && (
            <Stack spacing={2}>
              {attempts.map((attempt) => (
                <Card key={attempt.attemptId} variant="outlined">
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Typography fontWeight={600}>Tentativa {attempt.attemptId}</Typography>
                      {attempt.userEmail && (
                        <Typography variant="body2" color="text.secondary">
                          Aluno: {attempt.userEmail}
                        </Typography>
                      )}
                      <Typography variant="body2" color="text.secondary">
                        Status: {attempt.status ?? 'desconhecido'}
                      </Typography>
                      {attempt.teacherFeedback?.text && (
                        <Typography variant="body2" color="text.secondary">
                          Feedback enviado: {attempt.teacherFeedback.text}
                        </Typography>
                      )}
                      <TextField
                        label="Feedback para o aluno"
                        value={feedbackDrafts[attempt.attemptId] ?? ''}
                        onChange={(event) => handleFeedbackChange(attempt.attemptId, event.target.value)}
                        multiline
                        minRows={2}
                      />
                      <Button
                        variant="outlined"
                        onClick={() => handleSaveFeedback(attempt.attemptId)}
                        disabled={savingId === attempt.attemptId}
                      >
                        Salvar feedback
                      </Button>
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
