import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAuthHeaders } from '../firebase';

interface AttemptItem {
  attemptId: string;
  missionId?: string | null;
  updatedAt?: string;
  status?: string;
  studentConfirmed?: boolean;
  transcript?: string | null;
  aiFeedback?: {
    text?: string;
    comprehensible?: boolean;
    suggestions?: {
      clarity?: string;
      rhythm?: string;
      organization?: string;
    };
    details?: {
      wordsPerMinute?: number;
      pauseCount?: number;
      makesSense?: boolean;
      language?: 'en-US';
    };
  } | null;
  teacherFeedback?: {
    text?: string;
    updatedAt?: string;
    teacherEmail?: string;
    grade?: number | null;
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
  classId?: string;
}

interface StudentClass {
  classId?: string;
  name: string;
}

export default function StudentAttemptsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [attempts, setAttempts] = useState<AttemptItem[]>([]);
  const [missions, setMissions] = useState<MissionItem[]>([]);
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMissionId, setSelectedMissionId] = useState('');
  const [classFilter, setClassFilter] = useState<string>('');
  const selectedClass = classes.find((item) => item.classId === classFilter);
  const attemptsRef = useRef<HTMLDivElement | null>(null);
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const classId = params.get('classId') ?? '';
    setClassFilter(classId);
  }, [location.search]);

  useEffect(() => {
    const fetchAttempts = async () => {
      try {
        setLoading(true);
        setError(null);
        const headers = await getAuthHeaders();
        if (!headers.Authorization) {
          setError('Faca login para ver seu historico.');
          return;
        }
        const [attemptsResponse, missionsResponse, classesResponse] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/v1/student/attempts`, {
            headers,
          }),
          fetch(`${import.meta.env.VITE_API_URL}/v1/student/missions`, {
            headers,
          }),
          fetch(`${import.meta.env.VITE_API_URL}/v1/student/classes`, {
            headers,
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
        if (!classesResponse.ok) {
          const text = await classesResponse.text();
          throw new Error(text || 'Falha ao carregar turmas.');
        }
        const attemptsData = (await attemptsResponse.json()) as { attempts: AttemptItem[] };
        const missionsData = (await missionsResponse.json()) as { missions: MissionItem[] };
        const classesData = (await classesResponse.json()) as { classes: StudentClass[] };
        setAttempts(attemptsData.attempts ?? []);
        setMissions(missionsData.missions ?? []);
        setClasses(classesData.classes ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido.');
      } finally {
        setLoading(false);
      }
    };

    fetchAttempts();
  }, [location.search]);

  const filteredMissions = useMemo(() => {
    if (!classFilter) return missions;
    return missions.filter((mission) => mission.classId === classFilter);
  }, [missions, classFilter]);

  useEffect(() => {
    if (!selectedMissionId && filteredMissions.length > 0) {
      setSelectedMissionId(filteredMissions[0].missionId);
    }
  }, [filteredMissions, selectedMissionId]);

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

  const missionMap = useMemo(() => {
    const map = new Map<string, MissionItem>();
    missions.forEach((mission) => map.set(mission.missionId, mission));
    return map;
  }, [missions]);

  const filteredAttempts = useMemo(() => {
    if (!selectedMissionId) return attempts;
    return attempts.filter((attempt) => attempt.missionId === selectedMissionId);
  }, [attempts, selectedMissionId]);

  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader
          title="Turmas"
          subheader={
            classFilter && selectedClass
              ? `Turma selecionada: ${selectedClass.name}`
              : 'Sua turma atribuida para ver as missoes.'
          }
        />
        <CardContent>
          {loading && <LinearProgress />}
          {!loading && error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
          {!loading && !error && classes.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Nenhuma turma atribuida ainda. Verifique com o professor.
            </Typography>
          )}
          {!loading && !error && classes.length > 0 && (
            <Stack spacing={1}>
              {classes.map((item, index) => (
                <Typography key={`${item.name}-${index}`} fontWeight={600}>
                  {item.name}
                </Typography>
              ))}
            </Stack>
          )}
          {!loading && !error && classes.length > 0 && (
            <Button variant="text" color="inherit" onClick={() => navigate('/student/classes')}>
              Ver turmas completas
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Missoes" subheader="Escolha uma missao para ver suas tentativas." />
        <CardContent>
          {loading && <LinearProgress />}
          {!loading && error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
          {!loading && !error && filteredMissions.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Nenhuma missao cadastrada ainda.
            </Typography>
          )}
          {!loading && !error && filteredMissions.length > 0 && (
            <Stack spacing={1.5}>
              {filteredMissions.map((mission) => (
                <Card key={mission.missionId} variant="outlined">
                  <CardContent>
                    <Typography fontWeight={600}>{mission.title}</Typography>
                    <Typography color="text.secondary" variant="body2">
                      {mission.description}
                    </Typography>
                    <Box mt={2} display="flex" gap={2} flexWrap="wrap">
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setSelectedMissionId(mission.missionId);
                          attemptsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                      >
                        Ver tentativas
                      </Button>
                      <Typography
                        component="button"
                        onClick={() => navigate(`/recorder?missionId=${mission.missionId}`)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#6d32a2',
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        Abrir missao
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Tentativas" subheader="Veja suas tentativas por missao." />
        <CardContent>
          <Box ref={attemptsRef} />
          {loading && <LinearProgress />}
          {!loading && error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
          {!loading && !error && filteredAttempts.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Nenhuma tentativa registrada ainda.
            </Typography>
          )}
          {!loading && !error && filteredAttempts.length > 0 && (
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
              {filteredAttempts.map((attempt, index) => (
                <Card key={attempt.attemptId} variant="outlined">
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Typography fontWeight={600}>Tentativa {index + 1}</Typography>
                      {attempt.missionId && missionMap.get(attempt.missionId) && (
                        <Typography variant="body2" color="text.secondary">
                          Missao: {missionMap.get(attempt.missionId)?.title}
                        </Typography>
                      )}
                      <Typography variant="body2" color="text.secondary">
                        Status: {attempt.studentConfirmed ? 'Enviado ao professor' : 'Rascunho'}
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
                      <Box display="flex" justifyContent="flex-end">
                        <Button
                          variant="outlined"
                          onClick={() =>
                            setOpenAttemptId((prev) => (prev === attempt.attemptId ? null : attempt.attemptId))
                          }
                        >
                          Feedback
                        </Button>
                      </Box>
                      {openAttemptId === attempt.attemptId && (
                        <Box
                          sx={{
                            p: 2,
                            borderRadius: 2,
                            bgcolor: 'rgba(247, 242, 255, 0.6)',
                            border: '1px solid rgba(210, 188, 255, 0.5)',
                          }}
                        >
                          {attempt.aiFeedback ? (
                            <Stack spacing={1}>
                              <Typography fontWeight={600}>
                                {attempt.aiFeedback.comprehensible ? 'Deu para entender' : 'Vamos melhorar'}
                              </Typography>
                              {attempt.aiFeedback.text && (
                                <Typography color="text.secondary">{attempt.aiFeedback.text}</Typography>
                              )}
                              {attempt.aiFeedback.suggestions && (
                                <Stack spacing={0.5}>
                                  {attempt.aiFeedback.suggestions.clarity && (
                                    <Typography variant="body2">
                                      Clareza: {attempt.aiFeedback.suggestions.clarity}
                                    </Typography>
                                  )}
                                  {attempt.aiFeedback.suggestions.rhythm && (
                                    <Typography variant="body2">
                                      Ritmo: {attempt.aiFeedback.suggestions.rhythm}
                                    </Typography>
                                  )}
                                  {attempt.aiFeedback.suggestions.organization && (
                                    <Typography variant="body2">
                                      Organizacao: {attempt.aiFeedback.suggestions.organization}
                                    </Typography>
                                  )}
                                </Stack>
                              )}
                            </Stack>
                          ) : (
                            <Typography color="text.secondary">
                              Envie uma tentativa e aguarde o feedback do(a) professor(a).
                            </Typography>
                          )}
                          {attempt.teacherFeedback?.text && (
                            <Box mt={2}>
                              <Typography variant="subtitle2">Feedback do professor</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {attempt.teacherFeedback.text}
                              </Typography>
                              {attempt.teacherFeedback.grade !== null &&
                                attempt.teacherFeedback.grade !== undefined && (
                                  <Typography variant="body2" color="text.secondary">
                                    Nota: {attempt.teacherFeedback.grade}
                                  </Typography>
                                )}
                            </Box>
                          )}
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
