Set-Location "C:\Users\momo\OneDrive - mail.uft.edu.br\Documentos\VoiceUp\services\api"

$env:GOOGLE_APPLICATION_CREDENTIALS="C:\Users\momo\OneDrive - mail.uft.edu.br\Documentos\js-js-js\voiceup-recordings-7ebd7-2a5731fceca9.json"
$env:GCP_PROJECT_ID="voiceup-recordings-7ebd7"
$env:STORAGE_BUCKET="voiceup-recordings-7ebd7"
$env:WORKER_URL="http://127.0.0.1:8082/tasks"
$env:PORT="8083"
$env:TEACHER_EMAILS="oliveiraquirino@gmail.com,cristinehelorrayne@gmail.com"

npm install
npm run dev
