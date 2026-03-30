# VoiceUp Processing API

Node.js REST API deployed to Cloud Run that manages audio uploads and feedback retrieval.

## Endpoints
- `POST /v1/attempts`: Accepts mission metadata and returns signed upload URL
- `POST /v1/attempts/{id}/complete`: Confirms upload and enqueues transcription job
- `GET /v1/attempts/{id}`: Returns attempt status, transcription, feedback summary
- `GET /v1/missions/{missionId}/attempts`: Teacher listing with pagination

## Stack
- Express.js with OpenAPI validation
- Firestore for metadata persistence
- Cloud Storage for audio files
- Cloud Tasks for async transcription jobs
- Firebase Authentication token verification
