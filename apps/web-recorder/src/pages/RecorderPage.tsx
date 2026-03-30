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

type FeedbackSnapshot = {
  transcript: string;
  lowConfidenceWords: string[];
  metrics: {
    wordsPerMinute: number;
    pauseCount: number;
    lexicalDiversity: number;
  };
  tips: string[];
};

export default function RecorderPage() {
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

  useEffect(() => {
    localStorage.setItem('voiceup_goals', JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem('voiceup_completed_missions', JSON.stringify(completedMissions));
  }, [completedMissions]);

  useEffect(() => {
    if (!audioUrl) {
      setFeedback(null);
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

  const handleUpload = async () => {
    if (!audioUrl) return;
    setUploading(true);
    setUploadMessage('Enviando tentativa para o processamento...');
    setUploadError(null);
    try {
      const result = (await upload(mission.id)) as UploadResult | null;
      if (!result) {
        throw new Error('Sem retorno de feedback');
      }
      setCompletedMissions((prev) =>
        prev.includes(mission.id) ? prev : [...prev, mission.id]
      );
      const feedbackPayload = result.feedback;
      const focusSounds = feedbackPayload?.pronunciation.focusSounds ?? [];
      const tips = focusSounds.length
        ? focusSounds.map((sound) => `Preste atencao ao som ${sound}.`)
        : ['Revise a pronuncia das palavras destacadas.'];
      setFeedback({
        transcript: result.transcript ?? '',
        lowConfidenceWords: feedbackPayload?.pronunciation.lowConfidenceWords ?? [],
        metrics: {
          wordsPerMinute: feedbackPayload?.metrics.wordsPerMinute ?? 0,
          pauseCount: feedbackPayload?.metrics.pauseCount ?? 0,
          lexicalDiversity: feedbackPayload?.metrics.lexicalDiversity ?? 0,
        },
        tips,
      });
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
              onClick={handleUpload}
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
