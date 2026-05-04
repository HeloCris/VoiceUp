# Restart the VoiceUp development services: backend API, worker, and frontend.
# Run this from the repository root with PowerShell.

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $scriptRoot '..')
$apiDir = Resolve-Path (Join-Path $projectRoot 'services\api')
$workerDir = Resolve-Path (Join-Path $projectRoot 'services\worker')
$frontendDir = Resolve-Path (Join-Path $projectRoot 'apps\web-recorder')

$services = [ordered]@{
    'API' = @{ Port = 8080; Dir = $apiDir; Command = 'npm.cmd run dev'; Log = Join-Path $scriptRoot 'restart-api.log' }
    'Worker' = @{ Port = 8081; Dir = $workerDir; Command = 'python main.py'; Log = Join-Path $scriptRoot 'restart-worker.log' }
    'Frontend' = @{ Port = 5173; Dir = $frontendDir; Command = 'npm.cmd run dev'; Log = Join-Path $scriptRoot 'restart-frontend.log' }
}

foreach ($service in $services.GetEnumerator()) {
    $port = $service.Value.Port
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
    foreach ($conn in $conns) {
        try {
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction Stop
            Write-Host "Stopped service $($service.Key) on port $port (PID $($conn.OwningProcess))"
        } catch {
            Write-Host "Could not stop process on port ${port}: $($_.Exception.Message)"
        }
    }
}

function Start-ServiceWindow($name, $dir, $command, $logFile) {
    Write-Host "Starting $name..."
    if (-not (Test-Path $logFile)) {
        New-Item -Path $logFile -ItemType File -Force | Out-Null
    }
    "$(Get-Date -Format o) - Starting $name in $dir" | Out-File -FilePath $logFile -Encoding utf8 -Append
    $cmdLine = "cd /d `"$dir`" && $command"
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $cmdLine -WorkingDirectory $dir -WindowStyle Normal
    Write-Host "$name started; logs are available at $logFile"
}

Start-ServiceWindow 'API' $services['API'].Dir $services['API'].Command $services['API'].Log
Start-ServiceWindow 'Worker' $services['Worker'].Dir $services['Worker'].Command $services['Worker'].Log
Start-ServiceWindow 'Frontend' $services['Frontend'].Dir $services['Frontend'].Command $services['Frontend'].Log

Write-Host 'Restart commands sent. Check the log files and the opened terminal windows for startup state.'
