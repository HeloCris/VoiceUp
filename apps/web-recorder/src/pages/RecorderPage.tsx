import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  LinearProgress,
  List,
  ListItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import RecorderControls from '../components/RecorderControls';
import useRecorder, { UploadResult } from '../state/useRecorder';
import { badges, chapters, missions } from '../data/linguatown';
import { useLocation } from 'react-router-dom';
import { getAuthHeaders } from '../firebase';
import { useAuth } from '../state/useAuth';

type FeedbackSnapshot = {
  transcript: string;
  lowConfidenceWords: string[];
  metrics: {
    wordCount?: number;
    wordsPerMinute: number;
    pauseCount: number;
    lexicalDiversity: number;
  };
  tips: string[];
};

type AiFeedbackSnapshot = {
  text: string;
  comprehensible: boolean;
  suggestions: {
    clarity: string;
    rhythm: string;
    organization: string;
  };
  details: {
    wordsPerMinute: number;
    pauseCount: number;
    makesSense: boolean;
    language: string;
  };
};

type AssignedMission = {
  missionId: string;
  title: string;
  description: string;
  prompts: string[];
  classId?: string | null;
  aiFeedback?: boolean | null;
};

type StudentClass = {
  classId?: string;
  name: string;
  aiFeedback?: boolean | null;
};

export default function RecorderPage() {
  const { role } = useAuth();
  const location = useLocation();
  const {
    isSupported,
    status,
    recordingTime,
    audioUrl,
    startRecording,
    stopRecording,
    reset,
    upload,
  } = useRecorder();

  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastAttemptId, setLastAttemptId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState(chapters[0].id);
  const [selectedMissionId, setSelectedMissionId] = useState(missions[0].id);
  const [goals, setGoals] = useState<string[]>(() => {
    const stored = localStorage.getItem('voiceup_goals');
    return stored ? JSON.parse(stored) : [];
  });
  const [newGoal, setNewGoal] = useState('');
  const [completedMissions, setCompletedMissions] = useState<string[]>(() => {
    const stored = localStorage.getItem('voiceup_completed_missions');
    return stored ? JSON.parse(stored) : [];
  });
  const [feedback, setFeedback] = useState<FeedbackSnapshot | null>(null);
  const [aiFeedback, setAiFeedback] = useState<AiFeedbackSnapshot | null>(null);
  const [studentMissions, setStudentMissions] = useState<AssignedMission[]>([]);
  const [studentClasses, setStudentClasses] = useState<StudentClass[]>([]);
  const [studentSelectedMissionId, setStudentSelectedMissionId] = useState('');
  const [missionsLoading, setMissionsLoading] = useState(false);
  const [missionsError, setMissionsError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('voiceup_goals', JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem('voiceup_completed_missions', JSON.stringify(completedMissions));
  }, [completedMissions]);

  useEffect(() => {
    if (!audioUrl) {
      setFeedback(null);
      setAiFeedback(null);
      setLastAttemptId(null);
      setConfirmed(false);
    }
  }, [audioUrl]);

  const chapter = useMemo(
    () => chapters.find((item) => item.id === selectedChapterId) ?? chapters[0],
    [selectedChapterId]
  );

  const chapterMissions = useMemo(
    () => missions.filter((mission) => mission.chapterId === chapter.id).sort((a, b) => a.order - b.order),
    [chapter.id]
  );

  const activeMission = useMemo(() => {
    const nextMission = chapterMissions.find(
      (item) => !completedMissions.includes(item.id)
    );
    return nextMission ?? chapterMissions[chapterMissions.length - 1];
  }, [chapterMissions, completedMissions]);

  useEffect(() => {
    if (activeMission && activeMission.id !== selectedMissionId) {
      setSelectedMissionId(activeMission.id);
    }
  }, [activeMission, selectedMissionId]);

  const mission = useMemo(
    () => missions.find((item) => item.id === selectedMissionId) ?? chapterMissions[0],
    [selectedMissionId, chapterMissions]
  );

  const unlockedBadges = useMemo(() => {
    const completedCount = completedMissions.length;
    const completedChapters = new Set(
      completedMissions.map((missionId) => missions.find((item) => item.id === missionId)?.chapterId)
    );
    return badges.filter((badge) => {
      if (badge.id === 'badge-1') return completedCount >= 3;
      if (badge.id === 'badge-2') return completedCount >= 5;
      if (badge.id === 'badge-3') return completedChapters.size >= 1;
      return false;
    });
  }, [completedMissions]);

  const normalizeToken = (token: string) => token.toLowerCase().replace(/[^a-z']/g, '');

  const renderHighlightedTranscript = (text: string, lowWords: string[]) => {
    const lowSet = new Set(lowWords.map((word) => word.toLowerCase()));
    return text.split(/(\s+)/).map((token, index) => {
      if (token.trim().length === 0) {
        return token;
      }
      const cleaned = normalizeToken(token);
      if (cleaned && lowSet.has(cleaned)) {
        return (
          <Box
            key={`${token}-${index}`}
            component="span"
            sx={{
              bgcolor: 'rgba(158, 109, 247, 0.2)',
              borderRadius: 1,
              px: 0.5,
              mx: 0.25,
            }}
          >
            {token}
          </Box>
        );
      }
      return <Box key={`${token}-${index}`} component="span">{token}</Box>;
    });
  };

  const handleUpload = async (missionIdOverride?: string, classIdOverride?: string) => {
    if (!audioUrl) return;
    setUploading(true);
    setUploadMessage('Enviando tentativa para o processamento...');
    setUploadError(null);
    try {
      const result = (await upload(missionIdOverride ?? mission.id, classIdOverride)) as UploadResult | null;
      if (!result) {
        throw new Error('Sem retorno de feedback');
      }
      setLastAttemptId(result.attemptId ?? null);
      setConfirmed(false);
      setCompletedMissions((prev) =>
        prev.includes(mission.id) ? prev : [...prev, mission.id]
      );
      const feedbackPayload = result.feedback;
      const transcriptText = result.transcript ?? '';
      const focusSounds = feedbackPayload?.pronunciation.focusSounds ?? [];
      const tips = focusSounds.length
        ? focusSounds.map((sound) => `Preste atencao ao som ${sound}.`)
        : ['Revise a pronuncia das palavras destacadas.'];
      setFeedback({
        transcript: transcriptText,
        lowConfidenceWords: feedbackPayload?.pronunciation.lowConfidenceWords ?? [],
        metrics: {
          wordCount: feedbackPayload?.metrics.wordCount,
          wordsPerMinute: feedbackPayload?.metrics.wordsPerMinute ?? 0,
          pauseCount: feedbackPayload?.metrics.pauseCount ?? 0,
          lexicalDiversity: feedbackPayload?.metrics.lexicalDiversity ?? 0,
        },
        tips,
      });
      setAiFeedback(result.aiFeedback ?? null);
      setUploadMessage('Upload concluído! Aguarde o feedback.');
    } catch (error) {
      console.error(error);
      setUploadMessage('Falha ao enviar. Tente novamente.');
      setUploadError(error instanceof Error ? error.message : 'Erro desconhecido');
      setFeedback(null);
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!lastAttemptId) return;
    try {
      setConfirming(true);
      setUploadError(null);
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        setUploadError('Faca login para confirmar o envio.');
        return;
      }
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/attempts/${lastAttemptId}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao confirmar envio.');
      }
      setConfirmed(true);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Erro desconhecido');
    } finally {
      setConfirming(false);
    }
  };

  const handleAddGoal = () => {
    const trimmed = newGoal.trim();
    if (!trimmed) return;
    setGoals((prev) => [...prev, trimmed]);
    setNewGoal('');
  };

  const handleRemoveGoal = (goal: string) => {
    setGoals((prev) => prev.filter((item) => item !== goal));
  };

  if (!isSupported) {
    return (
      <Alert severity="error">
        Seu navegador não suporta gravação de áudio. Use uma versão mais recente do
        Chrome ou Edge.
      </Alert>
    );
  }

  useEffect(() => {
    if (role !== 'student') return;
    const fetchMissions = async () => {
      try {
        setMissionsLoading(true);
        setMissionsError(null);
        const headers = await getAuthHeaders();
        if (!headers.Authorization) {
          setMissionsError('Faca login para ver suas missoes.');
          return;
        }
        const [missionsResponse, classesResponse] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/v1/student/missions`, {
            headers,
          }),
          fetch(`${import.meta.env.VITE_API_URL}/v1/student/classes`, {
            headers,
          }),
        ]);
        if (!missionsResponse.ok) {
          const text = await missionsResponse.text();
          throw new Error(text || 'Falha ao carregar missoes.');
        }
        if (!classesResponse.ok) {
          const text = await classesResponse.text();
          throw new Error(text || 'Falha ao carregar turmas.');
        }
        const missionsData = (await missionsResponse.json()) as { missions: AssignedMission[] };
        const classesData = (await classesResponse.json()) as { classes: StudentClass[] };
        setStudentMissions(missionsData.missions ?? []);
        setStudentClasses(classesData.classes ?? []);
      } catch (err) {
        setMissionsError(err instanceof Error ? err.message : 'Erro desconhecido.');
      } finally {
        setMissionsLoading(false);
      }
    };

    fetchMissions();
  }, [role]);

  const requestedMissionId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('missionId') ?? '';
  }, [location.search]);

  useEffect(() => {
    if (role !== 'student') return;
    if (requestedMissionId && studentMissions.some((item) => item.missionId === requestedMissionId)) {
      setStudentSelectedMissionId(requestedMissionId);
      return;
    }
    if (!studentSelectedMissionId && studentMissions.length > 0) {
      setStudentSelectedMissionId(studentMissions[0].missionId);
    }
  }, [role, requestedMissionId, studentMissions, studentSelectedMissionId]);

  const activeStudentMission =
    studentMissions.find((item) => item.missionId === studentSelectedMissionId) ?? studentMissions[0];
  const classAiFeedback = activeStudentMission?.classId
    ? studentClasses.find((item) => item.classId === activeStudentMission.classId)?.aiFeedback
    : undefined;
  const allowAiFeedback =
    activeStudentMission?.aiFeedback !== false && classAiFeedback !== false;

  if (role === 'student') {
    const classLabel = studentClasses.length > 0 ? studentClasses.map((item) => item.name).join(', ') : null;

    if (missionsLoading) {
      return (
        <Stack spacing={3}>
          <Card>
            <CardHeader title="Turma" subheader="Carregando sua turma e missoes..." />
            <CardContent>
              <LinearProgress />
            </CardContent>
          </Card>
        </Stack>
      );
    }

    if (missionsError) {
      return (
        <Stack spacing={3}>
          <Card>
            <CardHeader title="Turma" />
            <CardContent>
              <Typography color="error">{missionsError}</Typography>
            </CardContent>
          </Card>
        </Stack>
      );
    }

    if (!activeStudentMission) {
      return (
        <Stack spacing={3}>
          <Card>
            <CardHeader title="Turma" subheader="Aguardando atribuicao do professor." />
            <CardContent>
              <Typography color="text.secondary">
                Nenhuma missao atribuida ainda. Converse com seu professor.
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      );
    }

    return (
      <Stack spacing={3}>
        <Card>
          <CardHeader
            title="Turma"
            subheader={classLabel ?? 'Sua turma atribuida'}
          />
          <CardContent>
            {classLabel ? (
              <Typography color="text.secondary">Você está inscrito em: {classLabel}</Typography>
            ) : (
              <Typography color="text.secondary">
                Nenhuma turma encontrada para este aluno.
              </Typography>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Missões da turma" subheader="Selecione uma missão para gravar." />
          <CardContent>
            {studentMissions.length === 0 ? (
              <Typography color="text.secondary">
                Nenhuma missão atribuída pela turma ainda.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {studentMissions.map((item) => (
                  <Button
                    key={item.missionId}
                    variant={item.missionId === activeStudentMission.missionId ? 'contained' : 'outlined'}
                    fullWidth
                    onClick={() => setStudentSelectedMissionId(item.missionId)}
                  >
                    {item.title}
                  </Button>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title={activeStudentMission.title} subheader="Missão selecionada" />
          <CardContent>
            <Typography color="text.secondary">{activeStudentMission.description}</Typography>
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Perguntas da missão" subheader="Leia antes de gravar." />
          <CardContent>
            <Stack spacing={2}>
              {activeStudentMission.prompts.map((prompt, index) => (
                <Typography key={`${prompt}-${index}`}>{prompt}</Typography>
              ))}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Gravação"
            subheader="Grave até 2 minutos. Você pode revisar antes de enviar."
          />
          <CardContent>
            <RecorderControls
              status={status}
              duration={recordingTime}
              audioUrl={audioUrl}
              onStart={startRecording}
              onStop={stopRecording}
              onReset={reset}
            />
            <Box mt={3} display="flex" gap={2} flexWrap="wrap">
              <Button
                variant="contained"
                disabled={!audioUrl || uploading}
                onClick={() => handleUpload(activeStudentMission.missionId, activeStudentMission.classId ?? undefined)}
              >
                Enviar tentativa
              </Button>
              <Button
                variant="text"
                color="inherit"
                disabled={!audioUrl || status === 'recording' || uploading}
                onClick={reset}
              >
                Regravar
              </Button>
            </Box>
            {uploading && <LinearProgress sx={{ mt: 3 }} />}
            {uploadMessage && (
              <Typography mt={2} color="text.secondary">
                {uploadMessage}
              </Typography>
            )}
            {uploadError && (
              <Typography mt={1} color="error">
                {uploadError}
              </Typography>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Feedback" subheader="Veja a transcrição e os pontos de melhoria." />
          <CardContent>
            {!allowAiFeedback ? (
              <Typography color="text.secondary">
                Envie uma tentativa para receber o feedback do(a) professor(a).
              </Typography>
            ) : feedback ? (
              <Stack spacing={2}>
                <Typography>
                  {feedback.transcript
                    ? renderHighlightedTranscript(feedback.transcript, feedback.lowConfidenceWords)
                    : 'Transcrição indisponível.'}
                </Typography>
                {aiFeedback ? (
                  <Stack spacing={1}>
                    <Typography fontWeight={600}>
                      {aiFeedback.comprehensible ? 'Deu para entender' : 'Vamos melhorar'}
                    </Typography>
                    <Typography color="text.secondary">{aiFeedback.text}</Typography>
                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        bgcolor: 'rgba(255, 236, 210, 0.55)',
                        border: '1px solid rgba(255, 180, 120, 0.4)',
                      }}
                    >
                      <Typography fontWeight={600} mb={1}>
                        Resumo rápido
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Chip
                          label={`Palavras: ${feedback.metrics.wordCount ?? feedback.transcript.split(/\s+/).filter(Boolean).length}`}
                          sx={{ bgcolor: 'rgba(255, 255, 255, 0.85)' }}
                        />
                        <Chip
                          label={`Palavras/min: ${aiFeedback.details.wordsPerMinute}`}
                          color="primary"
                        />
                        <Chip label={`Pausas longas: ${aiFeedback.details.pauseCount}`} />
                        <Chip label={aiFeedback.details.makesSense ? 'Frase faz sentido' : 'Frase confusa'} />
                        <Chip label="Inglês americano (en-US)" variant="outlined" />
                      </Stack>
                    </Box>
                    <Stack spacing={0.5}>
                      <Typography variant="body2">Clareza: {aiFeedback.suggestions.clarity}</Typography>
                      <Typography variant="body2">Ritmo: {aiFeedback.suggestions.rhythm}</Typography>
                      <Typography variant="body2">Organização: {aiFeedback.suggestions.organization}</Typography>
                    </Stack>
                  </Stack>
                ) : (
                  <Typography color="text.secondary">
                    Envie uma tentativa e aguarde o feedback do(a) professor(a).
                  </Typography>
                )}
                <Box mt={1} display="flex" justifyContent="flex-end">
                  <Button
                    variant="contained"
                    disabled={!lastAttemptId || confirming || confirmed}
                    onClick={handleConfirm}
                  >
                    {confirmed ? 'Enviado ao professor' : 'Confirmar envio'}
                  </Button>
                </Box>
              </Stack>
            ) : (
              <Typography color="text.secondary">
                Envie uma tentativa para receber um feedback.
              </Typography>
            )}
          </CardContent>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader title="LinguaTown" subheader={chapter.scenario} />
        <CardContent>
          <Typography color="text.secondary">{chapter.narrative}</Typography>
          <Stack direction="row" spacing={1} mt={2} flexWrap="wrap">
            {chapters.map((item) => (
              <Chip
                key={item.id}
                label={item.title}
                color={item.id === chapter.id ? 'primary' : 'default'}
                onClick={() => setSelectedChapterId(item.id)}
                sx={{ mb: 1 }}
              />
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Missão atual" subheader="Complete para desbloquear a próxima." />
        <CardContent>
          {activeMission ? (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label={`Missão ${activeMission.order}`} color="primary" />
                {completedMissions.includes(activeMission.id) && (
                  <Chip label="Concluída" size="small" color="secondary" />
                )}
              </Stack>
              <Typography fontWeight={600}>{activeMission.title}</Typography>
              <Typography color="text.secondary">{activeMission.description}</Typography>
            </Stack>
          ) : (
            <Typography color="text.secondary">Nenhuma missão disponível.</Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Prompt da missão" subheader={mission.title} />
        <CardContent>
          <Stack spacing={2}>
            {mission.prompts.map((prompt) => (
              <Typography key={prompt.id}>{prompt.text}</Typography>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Missão atual"
          subheader="Grave até 2 minutos. Você pode revisar antes de enviar."
        />
        <CardContent>
          <RecorderControls
            status={status}
            duration={recordingTime}
            audioUrl={audioUrl}
            onStart={startRecording}
            onStop={stopRecording}
            onReset={reset}
          />
          <Box mt={3} display="flex" gap={2}>
            <Button
              variant="contained"
              disabled={!audioUrl || uploading}
              onClick={() => handleUpload()}
            >
              Enviar tentativa
            </Button>
            <Button
              variant="text"
              color="inherit"
              disabled={!audioUrl || status === 'recording' || uploading}
              onClick={reset}
            >
              Regravar
            </Button>
          </Box>
          {uploading && <LinearProgress sx={{ mt: 3 }} />}
          {uploadMessage && (
            <Typography mt={2} color="text.secondary">
              {uploadMessage}
            </Typography>
          )}
          {uploadError && (
            <Typography mt={1} color="error">
              {uploadError}
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Feedback imediato" subheader="Veja a transcricao e os pontos de melhoria." />
        <CardContent>
          {feedback ? (
            <Stack spacing={2}>
              <Typography>{renderHighlightedTranscript(feedback.transcript, feedback.lowConfidenceWords)}</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Chip label={`WPM: ${feedback.metrics.wordsPerMinute}`} color="primary" />
                <Chip label={`Pausas >2s: ${feedback.metrics.pauseCount}`} />
                <Chip label={`Diversidade: ${feedback.metrics.lexicalDiversity}`} />
              </Stack>
              <Stack spacing={1}>
                {feedback.tips.map((tip) => (
                  <Typography key={tip} color="text.secondary">
                    {tip}
                  </Typography>
                ))}
              </Stack>
            </Stack>
          ) : (
            <Typography color="text.secondary">
              Envie uma tentativa para ver o feedback automatico.
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Conquistas" subheader="Badges desbloqueadas pelo seu progresso" />
        <CardContent>
          {unlockedBadges.length > 0 ? (
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {unlockedBadges.map((badge) => (
                <Chip
                  key={badge.id}
                  label={badge.title}
                  color="secondary"
                  sx={{ mb: 1 }}
                />
              ))}
            </Stack>
          ) : (
            <Typography color="text.secondary">
              Nenhuma conquista ainda. Complete missões para desbloquear.
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Metas pessoais" subheader="Defina objetivos para sua pronúncia e fluência" />
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Nova meta"
                value={newGoal}
                fullWidth
                onChange={(event) => setNewGoal(event.target.value)}
              />
              <Button variant="contained" onClick={handleAddGoal}>
                Adicionar
              </Button>
            </Stack>
            {goals.length === 0 ? (
              <Typography color="text.secondary">Nenhuma meta adicionada ainda.</Typography>
            ) : (
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {goals.map((goal) => (
                  <Chip key={goal} label={goal} onDelete={() => handleRemoveGoal(goal)} sx={{ mb: 1 }} />
                ))}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
