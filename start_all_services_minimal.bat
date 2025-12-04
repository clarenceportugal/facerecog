@echo off
REM ========================================
REM EduVision - Minimal Windows (Only 2 visible)
REM ========================================

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%backend"
set "FRONTEND_DIR=%SCRIPT_DIR%frontend"
set "STREAMING_DIR=%SCRIPT_DIR%streaming-server"

echo.
echo ========================================
echo EduVision - Starting (Minimal Windows)
echo ========================================
echo Only 2 windows will be visible:
echo - Backend API (for monitoring)
echo - Face Recognition (for monitoring)
echo All other services run minimized
echo.

REM === Clean ports ===
echo Cleaning ports...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8554') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul

REM === Start all services minimized except 2 ===
echo Starting services...

REM MediaMTX (minimized)
copy /Y "%BACKEND_DIR%\mediamtx.yml" "C:\Users\ALLEN\Downloads\mediartx\mediamtx.yml" >nul 2>&1
cd /d "C:\Users\ALLEN\Downloads\mediartx"
start /min cmd /c "mediamtx.exe"

REM Background Removal (minimized)
cd /d "%STREAMING_DIR%"
start /min cmd /c "py -3.13 simple_background_removal.py"

REM Streaming Server (minimized)
cd /d "%BACKEND_DIR%"
start /min cmd /c "node server.js"

REM Frontend (minimized)
cd /d "%FRONTEND_DIR%"
start /min cmd /c "npm run dev"

REM Backend API (VISIBLE)
cd /d "%BACKEND_DIR%"
start "EduVision - Backend API" cmd /k "npm run dev"

timeout /t 5 /nobreak >nul

REM Face Recognition (VISIBLE)
cd /d "%BACKEND_DIR%"
start "EduVision - Face Recognition" cmd /k "py -3.13 recognizer_arcface.py"

timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo ========================================
echo Services Started!
echo ========================================
echo Only 2 windows visible (Backend API and Face Recognition)
echo Check taskbar for minimized windows
echo.
echo To sync schedules, run: sync_schedules_standalone.bat
echo.
timeout /t 3 /nobreak >nul

