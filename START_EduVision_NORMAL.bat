@echo off
title EduVision - Master Launcher (Normal Windows)
color 0A

REM ========================================
REM Change to script directory so it works from anywhere
REM ========================================
cd /d "%~dp0"

REM Get the directory where this batch file is located (absolute path)
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

echo ========================================
echo    EduVision - Master Launcher
echo ========================================
echo.
echo Script location: %SCRIPT_DIR%
echo.

REM Kill any existing processes on ports
echo [1/6] Cleaning up existing processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo [OK] Ports cleared

REM Check prerequisites
echo.
echo [2/6] Checking prerequisites...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed
    pause
    exit /b 1
)
py -3.13 --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python 3.13 is not installed
    pause
    exit /b 1
)
echo [OK] Prerequisites OK

REM Start MediaMTX (if configured)
echo.
echo [3/6] Starting MediaMTX...
set "MEDIAMTX_FOUND=0"
set "MEDIAMTX_PATH="

REM Try common MediaMTX locations
if exist "C:\Users\ALLEN\Downloads\mediartx\mediamtx.exe" (
    set "MEDIAMTX_PATH=C:\Users\ALLEN\Downloads\mediartx"
    set "MEDIAMTX_FOUND=1"
    goto :mediamtx_found
)
if exist "C:\mediamtx\mediamtx.exe" (
    set "MEDIAMTX_PATH=C:\mediamtx"
    set "MEDIAMTX_FOUND=1"
    goto :mediamtx_found
)
if exist "%ProgramFiles%\MediaMTX\mediamtx.exe" (
    set "MEDIAMTX_PATH=%ProgramFiles%\MediaMTX"
    set "MEDIAMTX_FOUND=1"
    goto :mediamtx_found
)
if exist "%LOCALAPPDATA%\MediaMTX\mediamtx.exe" (
    set "MEDIAMTX_PATH=%LOCALAPPDATA%\MediaMTX"
    set "MEDIAMTX_FOUND=1"
    goto :mediamtx_found
)

REM MediaMTX not found
echo [SKIP] MediaMTX not found. Please start it manually or install it.
echo        Common locations: C:\mediamtx, C:\Users\ALLEN\Downloads\mediartx
goto :mediamtx_done

:mediamtx_found
REM Copy config if needed
if exist "%SCRIPT_DIR%\backend\mediamtx.yml" (
    copy /Y "%SCRIPT_DIR%\backend\mediamtx.yml" "%MEDIAMTX_PATH%\mediamtx.yml" >nul 2>&1
)
cd /d "%MEDIAMTX_PATH%"
start "EduVision-MediaMTX" "mediamtx.exe"
timeout /t 3 /nobreak >nul
echo [OK] MediaMTX started from %MEDIAMTX_PATH%

:mediamtx_done

REM Start Backend API Server
echo.
echo [4/6] Starting Backend API Server...
cd /d "%SCRIPT_DIR%\backend"
start "EduVision-Backend-API" cmd /k "cd /d \"%SCRIPT_DIR%\backend\" && npm run dev"
timeout /t 3 /nobreak >nul
echo [OK] Backend API started

REM Start Face Recognition Service
echo.
echo [5/6] Starting Face Recognition Service...
cd /d "%SCRIPT_DIR%\backend"
start "EduVision-Face-Recognition" cmd /k "cd /d \"%SCRIPT_DIR%\backend\" && py -3.13 recognizer_arcface.py"
timeout /t 2 /nobreak >nul
echo [OK] Face Recognition started

REM Start Background Removal Service
echo.
echo Starting Background Removal Service...
cd /d "%SCRIPT_DIR%\streaming-server"
start "EduVision-Background-Removal" cmd /k "cd /d \"%SCRIPT_DIR%\streaming-server\" && py -3.13 simple_background_removal.py"
timeout /t 2 /nobreak >nul
echo [OK] Background Removal started

REM Start Node.js Streaming Server
echo.
echo Starting Node.js Streaming Server...
cd /d "%SCRIPT_DIR%\backend"
start "EduVision-Node-Server" cmd /k "cd /d \"%SCRIPT_DIR%\backend\" && node server.js"
timeout /t 2 /nobreak >nul
echo [OK] Node.js Server started

REM Start Frontend
echo.
echo [6/6] Starting Frontend...
cd /d "%SCRIPT_DIR%\frontend"

REM Check if node_modules exists
if not exist "node_modules" (
    echo [WARN] Frontend dependencies not installed!
    echo        Installing dependencies now...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install frontend dependencies
        echo         Please run: cd frontend ^&^& npm install
        goto :frontend_error
    )
    echo [OK] Dependencies installed
)

REM Start frontend (keep window open to see errors)
start "EduVision-Frontend" cmd /k "cd /d \"%SCRIPT_DIR%\frontend\" && echo Starting Frontend on http://localhost:5173 && npm run dev"
timeout /t 5 /nobreak >nul

REM Check if port 5173 is listening
set "FRONTEND_RUNNING=0"
for /f %%a in ('netstat -ano ^| findstr :5173') do (
    set "FRONTEND_RUNNING=1"
)

if %FRONTEND_RUNNING%==1 (
    echo [OK] Frontend started - http://localhost:5173
) else (
    echo [WARN] Frontend may not have started. Check the window for errors.
    echo        Common issues:
    echo        - Dependencies not installed (run: cd frontend ^&^& npm install)
    echo        - Port 5173 already in use
    echo        - Check the "EduVision-Frontend" window
)

:frontend_error

echo.
echo ========================================
echo   All Services Started!
echo ========================================
echo.
echo Services Running (all in normal windows):
echo   [OK] MediaMTX: http://localhost:8554
echo   [OK] Backend API: http://localhost:5000
echo   [OK] Node.js Server: http://localhost:3000
echo   [OK] Frontend: http://localhost:5173
echo   [OK] Face Recognition: Running
echo   [OK] Background Removal: Running
echo.
echo All windows are visible. Check each window for any errors.
echo.

REM ========================================
REM Auto-Sync: Update local cache from MongoDB
REM ========================================
echo ========================================
echo [SYNC] Auto-Syncing data to local cache...
echo ========================================
echo This ensures face detection has the latest data!
timeout /t 3 /nobreak >nul

curl -s -X POST http://localhost:5000/api/system/sync-to-offline > "%TEMP%\eduvision_sync.txt" 2>&1
findstr /C:"success" "%TEMP%\eduvision_sync.txt" >nul 2>&1
if %errorlevel%==0 (
    echo [SYNC] ✅ Cache synced successfully!
    echo        New faculty and schedules are ready for detection.
) else (
    echo [SYNC] ⚠️  Sync may have failed or skipped.
    echo        You can manually sync: backend\QUICK_SYNC.bat
)
del "%TEMP%\eduvision_sync.txt" >nul 2>&1
echo.

echo Opening Frontend in browser...
timeout /t 2 /nobreak >nul
start http://localhost:5173

echo.
echo ========================================
echo   EduVision is Ready!
echo ========================================
echo.
echo [INFO] Auto-sync ran on startup!
echo        Face detection will recognize all faculty.
echo.
echo To stop all services, run: STOP_EduVision.bat
echo Or close the individual windows.
echo.
echo To manually sync after adding data:
echo   backend\QUICK_SYNC.bat
echo.
pause

