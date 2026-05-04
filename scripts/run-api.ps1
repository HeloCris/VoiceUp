Set-Location "C:\Users\crist_fja0mc1\OneDrive\Documentos\VoiceUp\services\api"

$env:GOOGLE_APPLICATION_CREDENTIALS="C:\Users\crist_fja0mc1\OneDrive\Documentos\js-ch4v3\voiceup-recordings-7ebd7-2ed98b085d80.json"
$env:GCP_PROJECT_ID="voiceup-recordings-7ebd7"
$env:STORAGE_BUCKET="voiceup-recordings-7ebd7"
$env:WORKER_URL="http://127.0.0.1:8081/tasks"
$env:API_BASE_URL="http://localhost:8080"
$env:PORT="8080"
$env:SUPERADMIN_EMAIL="cristinehelorrayne@gmail.com"

npm install
npm run dev
