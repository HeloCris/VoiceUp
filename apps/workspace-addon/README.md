# VoiceUp Workspace Add-on

Prototype Google Classroom add-on that embeds the VoiceUp recorder inside assignments and displays feedback summaries.

## Structure
- `appsscript.json`: Manifest defining add-on configuration
- `src/main.ts`: Apps Script entry point (CardService)
- `src/auth.ts`: Helper for Classroom API access

## Setup
1. Install clasp globally: `npm install -g @google/clasp`
2. Run `npm install` inside this folder
3. Authenticate with `clasp login`
4. Create a new Apps Script project: `clasp create --type webapp`
5. Deploy using `npm run push` and configure Classroom add-on scopes
