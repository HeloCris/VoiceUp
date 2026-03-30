# VoiceUp Architecture

## Overview
VoiceUp is a Google Classroom add-on that supports English speaking practice missions. Students record audio responses inside Classroom, receive automated feedback, and submit the best attempt for teacher review. Teachers monitor progress through dashboards with transcripts and analytics.

## Core Components
1. **Google Workspace Add-on** (Apps Script + CardService)
   - Extends Classroom assignment UI
   - Launches the VoiceUp web recorder in an iframe
   - Shows feedback summary and submission status inside Classroom sidebar
2. **Voice Recorder Web App** (React + TypeScript hosted on Firebase Hosting)
   - Authenticates users with Google OAuth
   - Records audio via WebRTC MediaRecorder
   - Collects mission context (assignment, attempt number)
   - Uploads audio to the processing API
   - Displays transcription and feedback in real time
3. **Processing API** (Node.js on Cloud Run)
   - Receives audio uploads (signed URL or multipart)
   - Stores raw files in Cloud Storage
   - Publishes transcription jobs to Cloud Tasks
   - Returns attempt metadata to the web app
4. **Speech Processing Worker** (Python on Cloud Run Jobs)
   - Uses Google Cloud Speech-to-Text for transcription
   - Runs vocabulary coverage checks against mission keywords
   - Calls Vertex AI text models to classify pedagogy tags (comprehension, vocabulary, practice)
   - Persists structured feedback in Firestore
5. **Data Layer** (Firestore + Cloud Storage)
   - Collections: `missions`, `assignments`, `attempts`, `feedback`, `users`
   - Storage buckets: `recordings/raw`, `recordings/processed`
6. **Teacher Dashboard** (Next.js, served inside add-on and standalone)
   - Filters by class, mission, student
   - Streams audio with signed URLs
   - Displays transcripts with editable comments
   - Plots progress metrics (attempt counts, average scores, recurrence)
7. **Analytics & Monitoring**
   - Cloud Logging & Error Reporting for backend
   - BigQuery export for long-term analytics
   - Data Studio dashboard for aggregate KPIs

## Key Flows
### Student Attempt
1. Student opens Classroom assignment and launches VoiceUp recorder
2. Recorder obtains Google access token and mission metadata
3. Student records audio (1-2 minutes) and reviews waveform playback
4. Recorder uploads audio to Processing API and shows "processing" status
5. Worker generates transcription + feedback, stores results
6. Recorder polls API; once ready, displays transcription and feedback with action choices: record again or submit
7. On submission, add-on posts selected attempt to Classroom assignment response and marks mission complete

### Teacher Review
1. Teacher opens assignment or dashboard view inside add-on
2. Dashboard queries Firestore for attempts with feedback
3. Teacher plays audio, edits feedback if needed, and adds comments back to Classroom gradebook

## Security & Compliance
- Enforce Google Sign-In with Workspace domain restriction
- Use OAuth scopes limited to Classroom coursework.readonly/writeonly as required
- Store audio in region-compliant buckets with CMEK if mandated
- Respect student privacy: configurable retention policy with Cloud Scheduler cleanup job
- Audit logging for access to recordings and feedback changes

## Deployment
- Infrastructure defined with Terraform (Google provider)
- Environments: `dev`, `staging`, `prod` with separate GCP projects
- CI/CD via GitHub Actions deploying to Firebase Hosting and Cloud Run

## Future Enhancements
- Offline-ready mobile recording UI (PWA)
- Pronunciation scoring using Speech-to-Text word level confidences
- Integrate rubric-based teacher feedback templates
