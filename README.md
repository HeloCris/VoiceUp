# VoiceUp
Uma extensão para o Chrome que transforma o Google Classroom em um laboratório de idiomas inteligente, automatizando a coleta e a avaliação de áudios.

## Downloads Oficiais
- APK Android: https://github.com/HeloCris/VoiceUp/releases/latest/download/VoiceUp.apk
- Extensão Chrome (ZIP): https://github.com/HeloCris/VoiceUp/releases/latest/download/voiceup-extension.zip

## Publicação automática no GitHub
O repositório agora possui workflow para build e release dos dois artefatos:
- Arquivo: `.github/workflows/release-mobile-and-extension.yml`
- Gera:
	- `VoiceUp.apk`
	- `voiceup-extension.zip`

### Como publicar uma nova versão
1. Faça push do branch com as alterações.
2. No GitHub, abra Actions e execute `Release VoiceUp Assets` via `Run workflow`.
3. Informe uma tag, por exemplo: `v1.0.0`.
4. Após concluir, os arquivos ficam disponíveis em `Releases`.

Alternativa: criar e subir uma tag `v*` (ex.: `git tag v1.0.0 && git push origin v1.0.0`) também dispara a publicação.
