# VoiceUp Speech Worker

Python worker triggered by Cloud Tasks to transcribe audio and compute feedback scores.

## Responsibilities
- Download audio from Cloud Storage signed URL
- Invoke Google Cloud Speech-to-Text with diarization disabled and enhanced model
- Generate mission KPIs: duration, pace, keyword coverage
- Call Vertex AI text model for feedback classification
- Persist results back to Firestore and notify Processing API via Pub/Sub
