@echo off
cd /d "%~dp0\..\apps\web-recorder"
echo Checking port 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":5173" ^| findstr LISTENING') do (
    echo Killing existing process on port 5173 PID %%a
    taskkill /PID %%a /F >nul 2>&1
)
echo Starting VoiceUp frontend...
call npm.cmd run dev
pause
