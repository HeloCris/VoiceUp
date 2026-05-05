# Start the VoiceUp API in a visible PowerShell window and log output.
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiDir = Resolve-Path (Join-Path $scriptRoot '..\services\api')
$logFile = Join-Path $scriptRoot 'start-api-direct.log'
$psCommand = "Set-Location '$apiDir'; npm.cmd install; npm.cmd run dev 2>&1 | Tee-Object -FilePath '$logFile' -Append"
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-Command',$psCommand -WindowStyle Normal
Write-Host "API start command launched. Check the new PowerShell window and $logFile for errors."
