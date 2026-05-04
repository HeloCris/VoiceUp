@echo off
cd /d "%~dp0\..\services\api"
set PORT=8080
set HOST=0.0.0.0
set API_BASE_URL=http://localhost:8080
echo Checking port %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%PORT%" ^| findstr LISTENING') do (
    echo Killing existing process on port %PORT% PID %%a
    taskkill /PID %%a /F >nul 2>&1
)
echo Installing API dependencies...
call npm.cmd install
if errorlevel 1 pause & exit /b 1
echo Starting VoiceUp API on port %PORT%...
call npm.cmd run dev
pause
