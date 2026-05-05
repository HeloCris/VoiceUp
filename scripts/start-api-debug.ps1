# Start the VoiceUp API in a new PowerShell window and keep it open for debugging.
$apiDir = Resolve-Path "$(Split-Path -Parent $MyInvocation.MyCommand.Path)\..\services\api"
$logFile = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'start-api-debug.log'
"Starting API debug at $(Get-Date -Format o)" | Out-File -FilePath $logFile -Encoding utf8 -Append
$command = "Set-Location '$apiDir'; npm.cmd run dev 2>&1 | Tee-Object -FilePath '$logFile' -Append"
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-NoExit','-ExecutionPolicy','Bypass','-Command',$command -WindowStyle Normal
Write-Host "Started API debug window. Check $logFile for logs."