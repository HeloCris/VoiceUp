import { Card, CardContent, CardHeader, Divider, List, ListItem, Typography } from '@mui/material';

const MOCK_ATTEMPTS = [
  {
    id: 'attempt-1',
    createdAt: '2026-02-16T10:15:00Z',
    duration: 78,
    feedback: 'Foi compreendido; continue praticando vocabulário.'
  },
  {
    id: 'attempt-2',
    createdAt: '2026-02-17T18:45:00Z',
    duration: 95,
    feedback: 'Precisa melhorar vocabulário específico da missão.'
  }
];

export default function AttemptsPage() {
  return (
    <Card>
      <CardHeader title="Suas tentativas" subheader="Histórico recente de envios" />
      <CardContent>
        <List disablePadding>
          {MOCK_ATTEMPTS.map((attempt, index) => {
            const created = new Date(attempt.createdAt).toLocaleString();
            return (
              <>
                <ListItem key={attempt.id} sx={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                  <Typography fontWeight={600}>Tentativa {index + 1}</Typography>
                  <Typography color="text.secondary">{created}</Typography>
                  <Typography mt={1}>Duração: {Math.round(attempt.duration)} segundos</Typography>
                  <Typography mt={1} color="primary.main">
                    Feedback: {attempt.feedback}
                  </Typography>
                </ListItem>
                {index < MOCK_ATTEMPTS.length - 1 && <Divider component="li" />}
              </>
            );
          })}
        </List>
      </CardContent>
    </Card>
  );
}
