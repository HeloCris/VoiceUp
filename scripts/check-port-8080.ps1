$port = 8080
$result = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess,State
$result | ConvertTo-Csv -NoTypeInformation | Out-File 'C:\Users\crist_fja0mc1\OneDrive\Documentos\VoiceUp\scripts\check-port-8080.csv' -Encoding utf8
