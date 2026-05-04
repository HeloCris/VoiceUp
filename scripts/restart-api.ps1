$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$apiDir = Join-Path $scriptRoot '..\services\api'
$apiDir = Resolve-Path $apiDir
$logFile = Join-Path $scriptRoot 'restart-api.log'
"Restart API started: $(Get-Date -Format o)" | Out-File -FilePath $logFile -Encoding utf8
$connections = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }
foreach ($conn in $connections) {
    try {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction Stop
        "Stopped process $($conn.OwningProcess) on port 8080" | Out-File -FilePath $logFile -Append -Encoding utf8
    } catch {
        "Failed to stop process $($conn.OwningProcess): $($_.Exception.Message)" | Out-File -FilePath $logFile -Append -Encoding utf8
    }
}
$cmdLine = "cd /d `"$apiDir`" && npm.cmd run dev"
Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', $cmdLine -WorkingDirectory $apiDir -WindowStyle Normal
"Started API dev server command; logs are being written to $logFile" | Out-File -FilePath $logFile -Append -Encoding utf8
