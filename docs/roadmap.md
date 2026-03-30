# VoiceUp Roadmap

## Milestone 1 – Proof of Concept
- [ ] Configurar projeto Google Cloud (Firestore, Storage, Speech-to-Text)
- [ ] Implementar protótipo do gravador web com upload manual
- [ ] Integrar autenticação Google OAuth e Classroom courseWork fetch
- [ ] Processar transcrição básica via API REST e exibir feedback gerado manualmente

## Milestone 2 – MVP
- [ ] Automatizar pipeline de transcrição com Cloud Tasks e worker Python
- [ ] Calcular métricas pedagógicas (duração, palavras-chave, confiança)
- [ ] Exibir feedback estruturado (foi compreendido, melhorar vocabulário, praticar)
- [ ] Permitir regravação e seleção de tentativa final para anexar ao Classroom

## Milestone 3 – Teacher Dashboard
- [ ] Construir painel Next.js com lista de tentativas e filtros
- [ ] Implementar player de áudio com transcrição sincronizada
- [ ] Disponibilizar histórico por aluno e exportação CSV
- [ ] Conectar com rubrica e feedback editável pelo professor

## Milestone 4 – Produção
- [ ] Hardenizar segurança (limitar domínios, CMEK, logs)
- [ ] Configurar observabilidade (Logging, Error Reporting, BigQuery export)
- [ ] Criar fluxo CI/CD (GitHub Actions + Cloud Build)
- [ ] Realizar piloto com turma e coletar NPS
