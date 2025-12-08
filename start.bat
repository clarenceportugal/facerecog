@echo off
REM ========================================
REM EduVision - Optimized Start (Reduced Windows)
REM Offline mode enabled - no prompts
REM ========================================

setlocal enabledelayedexpansion

REM Get the script directory
set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%backend"
set "FRONTEND_DIR=%SCRIPT_DIR%frontend"
set "STREAMING_DIR=%SCRIPT_DIR%streaming-server"

echo.
echo ========================================
echo EduVision - Starting All Services (Optimized)
echo ========================================
echo.
echo This version uses fewer console windows
echo - Main console: Shows all service status
echo - Face Recognition: Separate window (for monitoring)
echo - Backend API: Separate window (for monitoring)
echo - Other services: Minimized or background
echo.

REM === Kill any process using ports ===
echo Checking and cleaning ports...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8554') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 2 /nobreak >nul

REM === Start MediaMTX (Minimized) ===
echo [1/6] Starting MediaMTX (minimized)...
copy /Y "%BACKEND_DIR%\mediamtx.yml" "C:\Users\ALLEN\Downloads\mediartx\mediamtx.yml" >nul 2>&1
cd /d "C:\Users\ALLEN\Downloads\mediartx"
start /min cmd /c "mediamtx.exe"
timeout /t 3 /nobreak >nul

REM === Start Background Removal (Minimized) ===
echo [2/6] Starting Background Removal Service (minimized)...
cd /d "%STREAMING_DIR%"
start /min cmd /c "py -3.13 simple_background_removal.py"

REM === Start Node.js Streaming Server (Minimized) ===
echo [3/6] Starting Node.js Streaming Server (minimized)...
cd /d "%BACKEND_DIR%"
start /min cmd /c "node server.js"

REM === Start Backend API (Visible - for monitoring) ===
echo [4/6] Starting Backend API Server...
cd /d "%BACKEND_DIR%"
start "EduVision - Backend API" cmd /k "npm run dev"

REM === Wait for backend to initialize ===
echo Waiting for backend to initialize...
timeout /t 8 /nobreak >nul

REM === Start Face Recognition (Visible - for monitoring) ===
echo [5/6] Starting Face Recognition Service...
cd /d "%BACKEND_DIR%"
start "EduVision - Face Recognition" cmd /k "py -3.13 recognizer_arcface.py"

REM === Start Frontend (Minimized) ===
echo [6/6] Starting Frontend (minimized)...
cd /d "%FRONTEND_DIR%"
start /min cmd /c "npm run dev"

REM === Wait a bit for services to start ===
echo.
echo Waiting for all services to initialize...
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo All Services Started!
echo ========================================
echo.
echo Services Status:
echo - MediaMTX: Running (minimized) - http://localhost:8554
echo - Backend API: Running (visible window) - http://localhost:5000
echo - Streaming Server: Running (minimized) - http://localhost:3000
echo - Face Recognition: Running (visible window)
echo - Background Removal: Running (minimized)
echo - Frontend: Running (minimized) - http://localhost:5173
echo.

REM ========================================
REM Auto-Sync: Update local cache from MongoDB
REM ========================================
echo ========================================
echo [SYNC] Syncing data to local cache...
echo ========================================
echo This ensures face detection has the latest data!
timeout /t 2 /nobreak >nul

curl -s -X POST http://localhost:5000/api/system/sync-to-offline > "%TEMP%\sync_result.txt" 2>&1
findstr /C:"success" "%TEMP%\sync_result.txt" >nul 2>&1
if %errorlevel%==0 (
    echo [SYNC] ✅ Cache synced! New faculty and schedules ready.
) else (
    echo [SYNC] ⚠️  Sync skipped or failed. Manual sync: backend\QUICK_SYNC.bat
)
del "%TEMP%\sync_result.txt" >nul 2>&1
echo.

echo ========================================
echo Window Management
echo ========================================
echo - 2 visible windows: Backend API and Face Recognition
echo - 4 minimized windows: MediaMTX, Streaming, Background Removal, Frontend
echo - Check taskbar for minimized windows if needed
echo.
echo ========================================
echo OFFLINE / HYBRID CAPABILITIES
echo ========================================
echo [OK] Face Detection: Works offline (uses local cache)
echo [OK] Face Recognition: Works offline (local SQLite)
echo [OK] Schedule Checking: Works offline (local SQLite)
echo [OK] Attendance Logging: Works offline (queued locally)
echo [OK] Auto-Sync: Ran automatically on startup!
echo.
echo ========================================
echo Quick Commands
echo ========================================
echo To manually sync data:
echo   backend\QUICK_SYNC.bat
echo.
echo To check system mode:
echo   GET http://localhost:5000/api/system/mode
echo.
echo To open frontend:
echo   http://localhost:5173
echo.
echo ========================================
echo.
echo Press any key to close this window (services will keep running)...
pause >nul

