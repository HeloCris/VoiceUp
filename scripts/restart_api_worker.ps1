$ports = @(8080, 8081)
foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 -and $_.State -eq 'Listen' }
    foreach ($conn in $conns) {
        try {
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction Stop
            Write-Host "Stopped port $port PID $($conn.OwningProcess)"
        } catch {
            Write-Host "Failed to stop port $port PID $($conn.OwningProcess): $($_.Exception.Message)"
        }
    }
}
Set-Location -Path 'c:\Users\crist_fja0mc1\OneDrive\Documentos\VoiceUp\services\api'
$env:API_BASE_URL = 'http://localhost:8080'
$env:PORT = '8080'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'cd /d C:\Users\crist_fja0mc1\OneDrive\Documentos\VoiceUp\services\api && npm run dev' -WindowStyle Hidden
Set-Location -Path 'c:\Users\crist_fja0mc1\OneDrive\Documentos\VoiceUp\services\worker'
Get-Content worker_env.txt | ForEach-Object {
    if ($_ -match '^(?<name>[^=]+)=(?<value>.*)$') {
        Set-Item -Path "Env:$($matches['name'])" -Value $($matches['value'])
    }
}
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'cd /d C:\Users\crist_fja0mc1\OneDrive\Documentos\VoiceUp\services\worker && py -3.11 main.py' -WindowStyle Hidden
Write-Host 'Restart commands executed.'
