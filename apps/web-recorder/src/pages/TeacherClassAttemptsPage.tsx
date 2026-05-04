import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
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
import SchoolRounded from '@mui/icons-material/SchoolRounded';
import GroupRounded from '@mui/icons-material/GroupRounded';
import MicRounded from '@mui/icons-material/MicRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import { useNavigate, useParams } from 'react-router-dom';
import { getAuthHeaders } from '../firebase';

interface AttemptItem {
  attemptId: string;
  userEmail?: string | null;
  updatedAt?: string;
  status?: string;
  transcript?: string | null;
  teacherFeedback?: {
    text?: string;
    grade?: number | null;
    updatedAt?: string;
    teacherEmail?: string;
  } | null;
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
  feedback?: {
    metrics?: {
      wordCount?: number;
    };
  } | null;
  audioUrl?: string | null;
}

type StudentItem = {
  name?: string | null;
  email?: string | null;
  classId?: string | null;
};

type MissionItem = {
  missionId: string;
  title: string;
  description: string;
  prompts: string[];
};

type StudentProgressItem = {
  email: string;
  name?: string | null;
  attemptsCount: number;
  lastUpdatedAt?: string | null;
  lastStatus?: string | null;
  improving: boolean | null;
  summary: string;
  averageWordsPerMinute?: number | null;
  averageTeacherGrade?: number | null;
  evaluationSource?: 'teacher' | 'ai' | 'insufficient';
};

type TeacherClass = {
  classId: string;
  name: string;
  year?: string | null;
  description?: string | null;
  icon?: string | null;
  aiFeedback?: boolean | null;
};

const classIcons = new Map<string, JSX.Element>([
  ['school', <SchoolRounded sx={{ fontSize: 18 }} />],
  ['group', <GroupRounded sx={{ fontSize: 18 }} />],
  ['mic', <MicRounded sx={{ fontSize: 18 }} />],
  ['star', <StarRounded sx={{ fontSize: 18 }} />],
  ['award', <EmojiEventsRounded sx={{ fontSize: 18 }} />],
]);

const getClassIcon = (iconId?: string | null) =>
  classIcons.get(iconId ?? '') ?? <SchoolRounded fontSize="small" />;

export default function TeacherClassAttemptsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const classId = id ?? '';
  const [classInfo, setClassInfo] = useState<TeacherClass | null>(null);
  const [attempts, setAttempts] = useState<AttemptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [studentSaving, setStudentSaving] = useState(false);
  const [studentError, setStudentError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [progress, setProgress] = useState<StudentProgressItem[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [missionTitle, setMissionTitle] = useState('');
  const [missionDescription, setMissionDescription] = useState('');
  const [missionPrompts, setMissionPrompts] = useState('');
  const [missionSaving, setMissionSaving] = useState(false);
  const [missionError, setMissionError] = useState<string | null>(null);
  const [missionValidationError, setMissionValidationError] = useState<string | null>(null);
  const [missions, setMissions] = useState<MissionItem[]>([]);
  const [missionsLoading, setMissionsLoading] = useState(false);
  const [selectedMissionId, setSelectedMissionId] = useState('');
  const attemptsRef = useRef<HTMLDivElement | null>(null);
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null);

  const missionPromptList = useMemo(
    () => missionPrompts.split('\n').map((line) => line.trim()).filter(Boolean),
    [missionPrompts]
  );

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    const fetchClass = async () => {
      try {
        const headers = await getAuthHeaders();
        if (!headers.Authorization) return;
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/teacher/classes`, {
          headers,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { classes: TeacherClass[] };
        const found = (data.classes ?? []).find((item) => item.classId === classId) ?? null;
        setClassInfo(found);
      } catch {
        setClassInfo(null);
      }
    };

    const fetchAttempts = async () => {
      try {
        setLoading(true);
        setAttemptsError(null);
        const headers = await getAuthHeaders();
        if (!headers.Authorization) {
          setAttemptsError('Faca login para ver as turmas.');
          return;
        }
        const query = selectedMissionId ? `?missionId=${encodeURIComponent(selectedMissionId)}` : '';
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/v1/teacher/classes/${classId}/attempts${query}`,
          { headers }
        );
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Falha ao carregar tentativas.');
        }
        const data = (await response.json()) as { attempts: AttemptItem[] };
        setAttempts(data.attempts ?? []);
      } catch (err) {
        setAttemptsError(err instanceof Error ? err.message : 'Erro desconhecido.');
      } finally {
        setLoading(false);
      }
    };

    const fetchStudents = async () => {
      try {
        setStudentsLoading(true);
        setStudentError(null);
        const headers = await getAuthHeaders();
        if (!headers.Authorization) {
          setStudentError('Faca login para ver alunos.');
          return;
        }
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/v1/teacher/classes/${classId}/students`,
          { headers }
        );
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Falha ao carregar alunos.');
        }
        const data = (await response.json()) as { students: StudentItem[] };
        setStudents(data.students ?? []);
      } catch (err) {
        setStudentError(err instanceof Error ? err.message : 'Erro desconhecido.');
      } finally {
        setStudentsLoading(false);
      }
    };

    const fetchProgress = async () => {
      try {
        setProgressLoading(true);
        setProgressError(null);
        const headers = await getAuthHeaders();
        if (!headers.Authorization) {
          setProgressError('Faca login para ver o relatorio de progresso.');
          return;
        }
        const query = selectedMissionId ? `?missionId=${encodeURIComponent(selectedMissionId)}` : '';
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/v1/teacher/classes/${classId}/progress${query}`,
          { headers }
        );
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Falha ao carregar o relatorio de progresso.');
        }
        const data = (await response.json()) as { progress: StudentProgressItem[] };
        setProgress(data.progress ?? []);
      } catch (err) {
        setProgressError(err instanceof Error ? err.message : 'Erro desconhecido.');
      } finally {
        setProgressLoading(false);
      }
    };

    const fetchMissions = async () => {
      try {
        setMissionsLoading(true);
        setMissionError(null);
        const headers = await getAuthHeaders();
        if (!headers.Authorization) {
          setMissionError('Faca login para ver missoes.');
          return;
        }
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/v1/teacher/classes/${classId}/missions`,
          { headers }
        );
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || 'Falha ao carregar missoes.');
        }
        const data = (await response.json()) as { missions: MissionItem[] };
        setMissions(data.missions ?? []);
      } catch (err) {
        setMissionError(err instanceof Error ? err.message : 'Erro desconhecido.');
      } finally {
        setMissionsLoading(false);
      }
    };

    fetchClass();
    fetchAttempts();
    fetchStudents();
    fetchProgress();
    fetchMissions();
  }, [classId, selectedMissionId]);

  const handleFeedbackChange = (attemptId: string, value: string) => {
    setFeedbackDrafts((prev) => ({ ...prev, [attemptId]: value }));
  };

  const handleSaveFeedback = async (attemptId: string) => {
    try {
      setSavingId(attemptId);
      setAttemptsError(null);
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        setAttemptsError('Faca login para enviar feedback.');
        return;
      }
      const feedback = feedbackDrafts[attemptId]?.trim();
      if (!feedback) {
        setAttemptsError('Informe um feedback antes de salvar.');
        return;
      }
      const gradeValue = gradeDrafts[attemptId]?.trim();
      const grade = gradeValue ? Number(gradeValue) : null;
      if (gradeValue && Number.isNaN(grade)) {
        setAttemptsError('Nota invalida.');
        return;
      }
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/teacher/attempts/${attemptId}/feedback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify({ feedback, grade: grade ?? undefined }),
        }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao salvar feedback.');
      }
      setFeedbackDrafts((prev) => ({ ...prev, [attemptId]: '' }));
      setGradeDrafts((prev) => ({ ...prev, [attemptId]: '' }));
    } catch (err) {
      setAttemptsError(err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      setSavingId(null);
    }
  };

  const handleAddStudent = async () => {
    try {
      setStudentSaving(true);
      setStudentError(null);
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        setStudentError('Faca login para cadastrar alunos.');
        return;
      }
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/teacher/students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ name: studentName, email: studentEmail, classId }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao cadastrar aluno.');
      }
      setStudentName('');
      setStudentEmail('');
      const listResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/teacher/classes/${classId}/students`,
        { headers }
      );
      if (listResponse.ok) {
        const data = (await listResponse.json()) as { students: StudentItem[] };
        setStudents(data.students ?? []);
      }
    } catch (err) {
      setStudentError(err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      setStudentSaving(false);
    }
  };

  const handleCreateMission = async () => {
    setMissionValidationError(null);
    if (!missionTitle.trim() || !missionDescription.trim() || missionPromptList.length === 0) {
      setMissionValidationError('Preencha titulo, descricao e pelo menos um prompt.');
      return;
    }
    try {
      setMissionSaving(true);
      setMissionError(null);
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        setMissionError('Faca login para criar missoes.');
        return;
      }
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/missions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          title: missionTitle,
          description: missionDescription,
          prompts: missionPromptList,
          classId,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao criar missao.');
      }
      setMissionTitle('');
      setMissionDescription('');
      setMissionPrompts('');
      const listResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/teacher/classes/${classId}/missions`,
        { headers }
      );
      if (listResponse.ok) {
        const data = (await listResponse.json()) as { missions: MissionItem[] };
        setMissions(data.missions ?? []);
      }
    } catch (err) {
      setMissionError(err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      setMissionSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Card>
        <CardHeader
          title={classInfo?.name ?? 'Turma'}
          subheader={classInfo?.description ?? undefined}
          avatar={
            <Avatar sx={{ bgcolor: 'primary.main', color: '#fff' }}>
              {getClassIcon(classInfo?.icon)}
            </Avatar>
          }
        />
        <CardContent>
          <Stack spacing={1}>
            {classInfo?.year && (
              <Typography color="text.secondary" variant="body2">
                Ano/serie: {classInfo.year}
              </Typography>
            )}
            <Button variant="text" color="inherit" onClick={() => navigate('/teacher/classes')}>
              Voltar para turmas
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Adicionar alunos" subheader="Cadastre alunos nesta turma." />
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="Nome completo"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
            />
            <TextField
              label="Email"
              value={studentEmail}
              onChange={(event) => setStudentEmail(event.target.value)}
            />
            {studentError ? (
              <Typography color="error" variant="body2">
                {studentError}
              </Typography>
            ) : null}
            <Button variant="contained" onClick={handleAddStudent} disabled={studentSaving}>
              Adicionar aluno
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Alunos da turma" />
        <CardContent>
          {studentsLoading && <LinearProgress />}
          {!studentsLoading && studentError && (
            <Typography color="error" variant="body2">
              {studentError}
            </Typography>
          )}
          {!studentsLoading && !studentError && students.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Nenhum aluno cadastrado ainda.
            </Typography>
          )}
          {!studentsLoading && !studentError && students.length > 0 && (
            <Stack spacing={1}>
              {students.map((student) => (
                <Typography key={student.email ?? Math.random()}>
                  {student.name ?? 'Aluno'}{student.email ? ` - ${student.email}` : ''}
                </Typography>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Relatório de progresso" subheader="Veja se os alunos estão melhorando nas últimas tentativas." />
        <CardContent>
          {progressLoading && <LinearProgress />}
          {!progressLoading && progressError && (
            <Typography color="error" variant="body2">
              {progressError}
            </Typography>
          )}
          {!progressLoading && !progressError && progress.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Nenhum progresso encontrado para esta turma ainda.
            </Typography>
          )}
          {!progressLoading && !progressError && progress.length > 0 && (
            <Stack spacing={2}>
              {progress.map((item) => (
                <Card key={item.email} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography fontWeight={600}>
                        {item.name ?? 'Aluno'}
                        {item.email ? ` (${item.email})` : ''}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Tentativas: {item.attemptsCount}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Última tentativa: {item.lastUpdatedAt ?? 'sem dados'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Tendência: {item.improving === null ? 'Aguardando mais tentativas' : item.improving ? 'Melhorando' : 'Sem melhora recente'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Avaliação baseada em: {item.evaluationSource === 'teacher' ? 'notas do professor' : item.evaluationSource === 'ai' ? 'feedback de IA' : 'dados ainda insuficientes'}
                      </Typography>
                      {item.averageTeacherGrade !== null && (
                        <Typography variant="body2" color="text.secondary">
                          Nota média do professor nas últimas tentativas: {item.averageTeacherGrade}
                        </Typography>
                      )}
                      {item.averageWordsPerMinute !== null && (
                        <Typography variant="body2" color="text.secondary">
                          Velocidade média de fala nas últimas tentativas: {item.averageWordsPerMinute} palavras por minuto
                        </Typography>
                      )}
                      <Typography variant="body2" color="text.secondary">
                        {item.summary}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Nova missao" subheader="Crie missoes para esta turma." />
        <CardContent>
          <Stack spacing={2}>
            <TextField
              label="Titulo"
              value={missionTitle}
              onChange={(event) => setMissionTitle(event.target.value)}
              error={!!missionValidationError && !missionTitle.trim()}
              helperText={!missionTitle.trim() && missionValidationError ? 'Campo obrigatorio' : undefined}
            />
            <TextField
              label="Descricao"
              value={missionDescription}
              onChange={(event) => setMissionDescription(event.target.value)}
              multiline
              minRows={2}
              error={!!missionValidationError && !missionDescription.trim()}
              helperText={!missionDescription.trim() && missionValidationError ? 'Campo obrigatorio' : undefined}
            />
            <TextField
              label="Perguntas da missao"
              value={missionPrompts}
              onChange={(event) => setMissionPrompts(event.target.value)}
              multiline
              minRows={3}
              error={!!missionValidationError && missionPromptList.length === 0}
              helperText={
                missionPromptList.length === 0 && missionValidationError
                  ? 'Campo obrigatorio'
                  : 'Escreva as perguntas/instrucoes que o aluno vai ler antes de gravar. Uma por linha.'
              }
            />
            {missionError ? (
              <Typography color="error" variant="body2">
                {missionError}
              </Typography>
            ) : null}
            <Button variant="contained" onClick={handleCreateMission} disabled={missionSaving}>
              Criar missao
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Missoes da turma" />
        <CardContent>
          {missionsLoading && <LinearProgress />}
          {!missionsLoading && missionError && (
            <Typography color="error" variant="body2">
              {missionError}
            </Typography>
          )}
          {!missionsLoading && !missionError && missions.length === 0 && (
            <Typography color="text.secondary" variant="body2">
              Nenhuma missao cadastrada ainda.
            </Typography>
          )}
          {!missionsLoading && !missionError && missions.length > 0 && (
            <Stack spacing={1}>
              {missions.map((mission) => (
                <Card key={mission.missionId} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography fontWeight={600}>{mission.title}</Typography>
                      <Typography color="text.secondary" variant="body2">
                        {mission.description}
                      </Typography>
                      <Button
                        variant="text"
                        onClick={() => {
                          setSelectedMissionId((prev) => (prev === mission.missionId ? '' : mission.missionId));
                          attemptsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                      >
                        {selectedMissionId === mission.missionId
                          ? 'Ocultar tentativas'
                          : 'Ver tentativas desta missao'}
                      </Button>
                      {selectedMissionId === mission.missionId && (
                        <Box ref={attemptsRef}>
                          {loading && <LinearProgress />}
                          {!loading && attemptsError && (
                            <Typography color="error" variant="body2">
                              {attemptsError}
                            </Typography>
                          )}
                          {!loading && !attemptsError && attempts.length === 0 && (
                            <Typography color="text.secondary" variant="body2">
                              Nenhuma tentativa encontrada.
                            </Typography>
                          )}
                          {!loading && !attemptsError && attempts.length > 0 && (
                            <Stack spacing={2} mt={2}>
                              {attempts.map((attempt, index) => (
                                <Card key={attempt.attemptId} variant="outlined">
                                  <CardContent>
                                    <Stack spacing={1.5}>
                                      <Typography fontWeight={600}>Tentativa {index + 1}</Typography>
                                      {attempt.userEmail && (
                                        <Typography variant="body2" color="text.secondary">
                                          Aluno: {attempt.userEmail}
                                        </Typography>
                                      )}
                                      <Typography variant="body2" color="text.secondary">
                                        Status: {attempt.status ?? 'desconhecido'}
                                      </Typography>
                                      {attempt.transcript && (
                                        <Typography variant="body2" color="text.secondary">
                                          Transcricao: {attempt.transcript}
                                        </Typography>
                                      )}
                                      {attempt.aiFeedback && (
                                        <Stack spacing={0.5}>
                                          <Typography variant="body2" fontWeight={600}>
                                            {attempt.aiFeedback.comprehensible ? 'Deu para entender' : 'Vamos melhorar'}
                                          </Typography>
                                          {attempt.aiFeedback.text && (
                                            <Typography variant="body2" color="text.secondary">
                                              {attempt.aiFeedback.text}
                                            </Typography>
                                          )}
                                          {attempt.aiFeedback.details && (
                                            <Box
                                              sx={{
                                                px: 1.5,
                                                py: 1,
                                                borderRadius: 2,
                                                bgcolor: 'rgba(197, 225, 255, 0.35)',
                                                border: '1px solid rgba(120, 170, 255, 0.35)',
                                              }}
                                            >
                                              <Stack direction="row" spacing={1} flexWrap="wrap">
                                                <Typography variant="body2">
                                                  Palavras: {attempt.feedback?.metrics?.wordCount ??
                                                    (attempt.transcript
                                                      ? attempt.transcript.split(/\s+/).filter(Boolean).length
                                                      : 0)}
                                                </Typography>
                                                {typeof attempt.aiFeedback.details.wordsPerMinute === 'number' && (
                                                  <Typography variant="body2">
                                                    Palavras por minuto: {attempt.aiFeedback.details.wordsPerMinute}
                                                  </Typography>
                                                )}
                                                {typeof attempt.aiFeedback.details.pauseCount === 'number' && (
                                                  <Typography variant="body2">
                                                    Pausas longas: {attempt.aiFeedback.details.pauseCount}
                                                  </Typography>
                                                )}
                                                {typeof attempt.aiFeedback.details.makesSense === 'boolean' && (
                                                  <Typography variant="body2">
                                                    {attempt.aiFeedback.details.makesSense ? 'Frase faz sentido' : 'Frase confusa'}
                                                  </Typography>
                                                )}
                                              </Stack>
                                            </Box>
                                          )}
                                          {attempt.aiFeedback.suggestions && (
                                            <Stack spacing={0.25}>
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
                                      )}
                                      <Box display="flex" justifyContent="flex-end">
                                        <Button
                                          variant="outlined"
                                          onClick={() =>
                                            setOpenAttemptId((prev) =>
                                              prev === attempt.attemptId ? null : attempt.attemptId
                                            )
                                          }
                                        >
                                          Feedback
                                        </Button>
                                      </Box>
                                      {openAttemptId === attempt.attemptId && (
                                        <Stack spacing={1}>
                                          {attempt.teacherFeedback?.text && (
                                            <Typography variant="body2" color="text.secondary">
                                              Feedback enviado: {attempt.teacherFeedback.text}
                                            </Typography>
                                          )}
                                          {attempt.teacherFeedback?.grade !== null &&
                                            attempt.teacherFeedback?.grade !== undefined && (
                                              <Typography variant="body2" color="text.secondary">
                                                Nota: {attempt.teacherFeedback.grade}
                                              </Typography>
                                            )}
                                          {attempt.aiFeedback && (
                                            <Box
                                              sx={{
                                                p: 1.5,
                                                borderRadius: 2,
                                                bgcolor: 'rgba(255, 243, 220, 0.6)',
                                                border: '1px solid rgba(255, 199, 145, 0.5)',
                                              }}
                                            >
                                              <Typography variant="body2" fontWeight={600}>
                                                Feedback da IA
                                              </Typography>
                                              {attempt.aiFeedback.text && (
                                                <Typography variant="body2" color="text.secondary">
                                                  {attempt.aiFeedback.text}
                                                </Typography>
                                              )}
                                            </Box>
                                          )}
                                          <TextField
                                            label="Feedback para o aluno"
                                            value={feedbackDrafts[attempt.attemptId] ?? ''}
                                            onChange={(event) =>
                                              handleFeedbackChange(attempt.attemptId, event.target.value)
                                            }
                                            multiline
                                            minRows={2}
                                          />
                                          <TextField
                                            label="Nota (0 a 100)"
                                            type="number"
                                            value={gradeDrafts[attempt.attemptId] ?? ''}
                                            onChange={(event) =>
                                              setGradeDrafts((prev) => ({
                                                ...prev,
                                                [attempt.attemptId]: event.target.value,
                                              }))
                                            }
                                            inputProps={{ min: 0, max: 100 }}
                                          />
                                          <Button
                                            variant="contained"
                                            onClick={() => handleSaveFeedback(attempt.attemptId)}
                                            disabled={savingId === attempt.attemptId}
                                          >
                                            Salvar feedback
                                          </Button>
                                        </Stack>
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
