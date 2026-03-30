import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useMemo } from 'react';

export type RecorderStatus = 'idle' | 'recording' | 'review';

interface RecorderControlsProps {
  status: RecorderStatus;
  duration: number;
  audioUrl: string | null;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${secs}`;
}

export default function RecorderControls({
  status,
  duration,
  audioUrl,
  onStart,
  onStop,
  onReset,
}: RecorderControlsProps) {
  const statusLabel = useMemo(() => {
    switch (status) {
      case 'recording':
        return 'Gravando';
      case 'review':
        return 'Em revisão';
      default:
        return 'Pronto para gravar';
    }
  }, [status]);

  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={2} alignItems="center">
            <Chip
              label={statusLabel}
              color={status === 'recording' ? 'secondary' : 'default'}
              sx={status === 'recording' ? { bgcolor: '#9e6df7', color: '#fff' } : undefined}
            />
            <Typography variant="body1" fontWeight={600}>
              {formatDuration(duration)}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1}>
            <IconButton
              color="primary"
              size="large"
              onClick={onStart}
              disabled={status === 'recording'}
              aria-label="Iniciar gravação"
              sx={{ bgcolor: 'rgba(109, 50, 162, 0.08)' }}
            >
              <PlayArrowIcon fontSize="inherit" />
            </IconButton>
            <IconButton
              color="secondary"
              size="large"
              onClick={onStop}
              disabled={status !== 'recording'}
              aria-label="Parar gravação"
              sx={{ bgcolor: 'rgba(158, 109, 247, 0.12)' }}
            >
              <StopIcon fontSize="inherit" />
            </IconButton>
            <IconButton
              color="default"
              size="large"
              onClick={onReset}
              disabled={!audioUrl || status === 'recording'}
              aria-label="Descartar gravação"
              sx={{ bgcolor: 'rgba(34, 18, 47, 0.06)' }}
            >
              <RestartAltIcon fontSize="inherit" />
            </IconButton>
          </Stack>
        </Box>
        <audio controls src={audioUrl ?? undefined} style={{ width: '100%' }} />
        <Typography variant="body2" color="text.secondary">
          Dica: pratique quantas vezes quiser antes de enviar. Limite recomendado: 2 minutos.
        </Typography>
        <Button
          variant="outlined"
          onClick={() => window.open('/attempts', '_self')}
          sx={{ alignSelf: 'flex-start' }}
        >
          Ver histórico
        </Button>
      </Stack>
    </Paper>
  );
}
