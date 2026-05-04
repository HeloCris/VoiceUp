Set-Location "c:\Users\crist_fja0mc1\OneDrive\Documentos\VoiceUp\services\worker"
$env:WORKER_PORT = "8083"
Get-Content "worker_env.txt" | ForEach-Object {
  if ($_ -match '^(?<name>[^=]+)=(?<value>.*)$') {
    Set-Item -Path "Env:$($matches['name'])" -Value $matches['value']
  }
}
Stop-Process -Id 3972 -Force -ErrorAction SilentlyContinue
cmd /c "set WORKER_PORT=8083&& set GOOGLE_APPLICATION_CREDENTIALS=%GOOGLE_APPLICATION_CREDENTIALS%&& set STORAGE_BUCKET=%STORAGE_BUCKET%&& py -3.11 main.py"
Write-Host "Started worker with env file."
