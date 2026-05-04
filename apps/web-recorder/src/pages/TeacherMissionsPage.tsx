import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAuth } from '../state/useAuth';
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
import { useLocation } from 'react-router-dom';
import { getAuthHeaders } from '../firebase';

type MissionItem = {
  missionId: string;
  title: string;
  description: string;
  prompts: string[];
  classId?: string | null;
  createdAt?: string;
};

type TeacherClass = {
  classId: string;
  name: string;
};

export default function TeacherMissionsPage() {
  const [missions, setMissions] = useState<MissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [promptsText, setPromptsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [classId, setClassId] = useState('');
  const location = useLocation();
  const [validationError, setValidationError] = useState<string | null>(null);
  const { loading: authLoading, user } = useAuth();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editMission, setEditMission] = useState<MissionItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPromptsText, setEditPromptsText] = useState('');
  const [editClassId, setEditClassId] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const handleDelete = async (missionId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta missão?')) return;
    try {
      setLoading(true);
      setError(null);
      const headers = await getAuthHeaders();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/missions/${missionId}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao excluir missão.');
      }
      await fetchMissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (mission: MissionItem) => {
    setEditMission(mission);
    setEditTitle(mission.title);
    setEditDescription(mission.description);
    setEditPromptsText((mission.prompts || []).join('\n'));
    setEditClassId(mission.classId || '');
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editMission) return;
    if (!editTitle.trim() || !editDescription.trim() || editPromptsText.trim().length === 0) {
      setValidationError('Preencha titulo, descricao e pelo menos um prompt.');
      return;
    }
    try {
      setEditSaving(true);
      setError(null);
      const headers = await getAuthHeaders();
      const prompts = editPromptsText.split('\n').map((line) => line.trim()).filter(Boolean);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/missions/${editMission.missionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          prompts,
          classId: editClassId || undefined,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao editar missão.');
      }
      setEditDialogOpen(false);
      setEditMission(null);
      await fetchMissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleEditDialogClose = () => {
    setEditDialogOpen(false);
    setEditMission(null);
    setValidationError(null);
  };

  const classLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach((item) => map.set(item.classId, item.name));
    return map;
  }, [classes]);

  const promptList = useMemo(
    () =>
      promptsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [promptsText]
  );

  const queryClassId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('classId') ?? '';
  }, [location.search]);

  const fetchMissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        setError('Faca login para ver as missoes.');
        return;
      }
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/missions`, {
        headers,
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
    if (authLoading) return;
    if (!user) return;
    fetchMissions();
  }, [authLoading, user]);

  useEffect(() => {
    if (!queryClassId) return;
    setClassId(queryClassId);
  }, [queryClassId]);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        const headers = await getAuthHeaders();
        if (!headers.Authorization) return;
        const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/teacher/classes`, {
          headers,
        });
        if (!response.ok) return;
        const data = (await response.json()) as { classes: TeacherClass[] };
        setClasses(data.classes ?? []);
      } catch {
        setClasses([]);
      }
    };

    if (authLoading) return;
    if (!user) return;
    fetchClasses();
  }, [authLoading, user]);

  const handleCreate = async () => {
    setValidationError(null);
    if (!title.trim() || !description.trim() || promptList.length === 0) {
      setValidationError('Preencha titulo, descricao e pelo menos um prompt.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const headers = await getAuthHeaders();
      if (!headers.Authorization) {
        setError('Faca login para criar missoes.');
        return;
      }
      const prompts = promptList;
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/missions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ title, description, prompts, classId: classId || undefined }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Falha ao criar missao.');
      }
      setTitle('');
      setDescription('');
      setPromptsText('');
      setClassId('');
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
            <TextField
              label="Titulo"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              error={!!validationError && !title.trim()}
              helperText={!title.trim() && validationError ? 'Campo obrigatorio' : undefined}
            />
            <TextField
              label="Descricao"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              multiline
              minRows={2}
              error={!!validationError && !description.trim()}
              helperText={!description.trim() && validationError ? 'Campo obrigatorio' : undefined}
            />
            <TextField
              select
              label="Turma"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
              helperText="Selecione a turma que recebera esta missao."
            >
              <MenuItem value="">Sem turma</MenuItem>
              {classes.map((item) => (
                <MenuItem key={item.classId} value={item.classId}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Perguntas da missao"
              helperText={
                validationError && promptList.length === 0
                  ? 'Campo obrigatorio'
                  : 'Escreva aqui as perguntas/instrucoes que o aluno vai ler antes de gravar. Uma por linha.'
              }
              value={promptsText}
              onChange={(event) => setPromptsText(event.target.value)}
              multiline
              minRows={3}
              error={!!validationError && promptList.length === 0}
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
                    <Stack spacing={1} direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Stack spacing={1}>
                        <Typography fontWeight={600}>{mission.title}</Typography>
                        <Typography color="text.secondary" variant="body2">
                          {mission.description}
                        </Typography>
                        {mission.classId && (
                          <Typography color="text.secondary" variant="caption">
                            Turma: {classLabelMap.get(mission.classId) ?? mission.classId}
                          </Typography>
                        )}
                        <Typography color="text.secondary" variant="caption">
                          Prompts: {mission.prompts?.length ?? 0}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <IconButton aria-label="Editar" onClick={() => openEditDialog(mission)} size="small">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton aria-label="Excluir" onClick={() => handleDelete(mission.missionId)} size="small" color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
                  {/* Edit Mission Dialog */}
                  <Dialog open={editDialogOpen} onClose={handleEditDialogClose} maxWidth="sm" fullWidth>
                    <DialogTitle>Editar missão</DialogTitle>
                    <DialogContent>
                      <Stack spacing={2} mt={1}>
                        <TextField
                          label="Titulo"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          error={!!validationError && !editTitle.trim()}
                          helperText={!editTitle.trim() && validationError ? 'Campo obrigatorio' : undefined}
                        />
                        <TextField
                          label="Descricao"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          multiline
                          minRows={2}
                          error={!!validationError && !editDescription.trim()}
                          helperText={!editDescription.trim() && validationError ? 'Campo obrigatorio' : undefined}
                        />
                        <TextField
                          select
                          label="Turma"
                          value={editClassId}
                          onChange={(e) => setEditClassId(e.target.value)}
                          helperText="Selecione a turma que recebera esta missao."
                        >
                          <MenuItem value="">Sem turma</MenuItem>
                          {classes.map((item) => (
                            <MenuItem key={item.classId} value={item.classId}>
                              {item.name}
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          label="Perguntas da missao"
                          value={editPromptsText}
                          onChange={(e) => setEditPromptsText(e.target.value)}
                          multiline
                          minRows={3}
                          error={!!validationError && editPromptsText.trim().length === 0}
                          helperText={
                            validationError && editPromptsText.trim().length === 0
                              ? 'Campo obrigatorio'
                              : 'Uma pergunta/instrucao por linha.'
                          }
                        />
                      </Stack>
                    </DialogContent>
                    <DialogActions>
                      <Button onClick={handleEditDialogClose} disabled={editSaving}>Cancelar</Button>
                      <Button onClick={handleEditSave} variant="contained" disabled={editSaving}>Salvar</Button>
                    </DialogActions>
                  </Dialog>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
