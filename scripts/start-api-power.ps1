# Start the VoiceUp API in a new PowerShell window, keep it open, and save logs.
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiDir = Resolve-Path (Join-Path $scriptRoot '..\services\api')
$logFile = Join-Path $scriptRoot 'start-api-power.log'
$psCommand = "Set-Location '$apiDir'; npm.cmd run dev 2>&1 | Tee-Object -FilePath '$logFile' -Append"
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-Command',$psCommand -WindowStyle Normal
Write-Host "Started API in PowerShell window. Logs written to $logFile."