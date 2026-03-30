export function buildRecorderHomePage(e: GoogleAppsScript.Addons.EventObject) {
  const card = CardService.newCardBuilder();

  card.setHeader(CardService.newCardHeader().setTitle('VoiceUp Missions'));

  const section = CardService.newCardSection();
  section.addWidget(
    CardService.newTextParagraph().setText(
      'Grave sua resposta de até 2 minutos, revise o feedback automático e envie a melhor tentativa para o professor.'
    )
  );

  const openRecorderAction = CardService.newAction().setFunctionName('launchRecorder');
  section.addWidget(
    CardService.newDecoratedText()
      .setText('Abrir gravador VoiceUp')
      .setBottomLabel('Será aberto em uma nova aba segura com o contexto da missão.')
      .setOnClickAction(openRecorderAction)
  );

  section.addWidget(
    CardService.newTextButton()
      .setText('Ver tentativas recentes')
      .setOpenLink(
        CardService.newOpenLink()
          .setUrl('https://voiceup.example.com/student/attempts')
          .setOpenAs(CardService.OpenAs.FULL_SIZE)
          .setOnClose(CardService.OnClose.NOTHING)
      )
  );

  card.addSection(section);
  return card.build();
}

export function buildTeacherDashboardCard(classId: string) {
  const card = CardService.newCardBuilder();
  card.setHeader(CardService.newCardHeader().setTitle('Painel VoiceUp'));

  const section = CardService.newCardSection();
  section.addWidget(
    CardService.newTextParagraph().setText(`Turma selecionada: ${classId}`)
  );
  section.addWidget(
    CardService.newDecoratedText()
      .setText('Abrir painel em tela cheia')
      .setOpenLink(
        CardService.newOpenLink()
          .setUrl(`https://voiceup.example.com/teacher/classes/${classId}`)
          .setOpenAs(CardService.OpenAs.FULL_SIZE)
          .setOnClose(CardService.OnClose.NOTHING)
      )
  );

  card.addSection(section);
  return card.build();
}
