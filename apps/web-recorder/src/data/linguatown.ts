export type Chapter = {
  id: string;
  title: string;
  scenario: string;
  order: number;
  level: 'basic' | 'intermediate';
  narrative: string;
};

export type Mission = {
  id: string;
  chapterId: string;
  title: string;
  description: string;
  order: number;
  level: 'basic' | 'intermediate';
  prompts: { id: string; text: string }[];
};

export const chapters: Chapter[] = [
  {
    id: 'chapter-1',
    title: 'Welcome to LinguaTown!',
    scenario: 'Imigracao no aeroporto',
    order: 1,
    level: 'basic',
    narrative: 'Voce chegou ao aeroporto de LinguaTown. O oficial de imigracao quer saber quem voce e o motivo da viagem.'
  },
  {
    id: 'chapter-2',
    title: 'Finding Your Way',
    scenario: 'Pedir informacoes de transporte',
    order: 2,
    level: 'basic',
    narrative: 'Agora voce precisa se locomover pela cidade e perguntar sobre rotas e meios de transporte.'
  },
  {
    id: 'chapter-3',
    title: 'Checking In at the Hotel',
    scenario: 'Fazer check-in',
    order: 3,
    level: 'intermediate',
    narrative: 'Hora de fazer check-in. Fale sobre sua reserva e suas preferencias de quarto.'
  }
];

export const missions: Mission[] = [
  {
    id: 'mission-1-1',
    chapterId: 'chapter-1',
    title: 'Apresentacao na imigracao',
    description: 'Diga seu nome, de onde voce vem e o motivo da viagem. Use 2 a 3 frases.',
    order: 1,
    level: 'basic',
    prompts: [
      { id: 'p-1', text: 'Welcome to LinguaTown. What is your name and why are you visiting?' }
    ]
  },
  {
    id: 'mission-1-2',
    chapterId: 'chapter-1',
    title: 'Tempo de estadia',
    description: 'Informe quantos dias vai ficar e o nome do hotel ou bairro onde vai se hospedar.',
    order: 2,
    level: 'basic',
    prompts: [
      { id: 'p-2', text: 'How long will you stay and where will you be lodging?' }
    ]
  },
  {
    id: 'mission-2-1',
    chapterId: 'chapter-2',
    title: 'Como chegar ao centro',
    description: 'Pergunte qual transporte usar para chegar ao centro e em quanto tempo chega.',
    order: 1,
    level: 'basic',
    prompts: [
      { id: 'p-3', text: 'How can I get to the city center using public transport?' }
    ]
  },
  {
    id: 'mission-2-2',
    chapterId: 'chapter-2',
    title: 'Confirmar direcoes',
    description: 'Peça para repetir as direcoes e confirme qual e o ponto de parada final.',
    order: 2,
    level: 'basic',
    prompts: [
      { id: 'p-4', text: 'Could you repeat the directions and confirm the stop?' }
    ]
  },
  {
    id: 'mission-3-1',
    chapterId: 'chapter-3',
    title: 'Solicitar check-in',
    description: 'Diga que tem reserva, informe seu sobrenome e pergunte se pode fazer check-in.',
    order: 1,
    level: 'intermediate',
    prompts: [
      { id: 'p-5', text: 'Hello, I have a reservation. Can I check in, please?' }
    ]
  },
  {
    id: 'mission-3-2',
    chapterId: 'chapter-3',
    title: 'Preferencias do quarto',
    description: 'Peça um quarto silencioso, confirme Wi-Fi e pergunte se o cafe da manha esta incluso.',
    order: 2,
    level: 'intermediate',
    prompts: [
      { id: 'p-6', text: 'Do you have a quiet room with Wi-Fi and breakfast included?' }
    ]
  }
];

export const badges = [
  {
    id: 'badge-1',
    title: 'Viajante Fluente',
    description: 'Conclua 3 missoes com sucesso.'
  },
  {
    id: 'badge-2',
    title: 'Pronuncia Avancada',
    description: 'Conclua 5 missoes com foco em clareza.'
  },
  {
    id: 'badge-3',
    title: 'Explorador de LinguaTown',
    description: 'Finalize um capitulo completo.'
  }
];
