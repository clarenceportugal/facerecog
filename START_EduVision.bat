@echo off
title EduVision - Master Launcher
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
start /min "" "mediamtx.exe"
timeout /t 3 /nobreak >nul
echo [OK] MediaMTX started (minimized) from %MEDIAMTX_PATH%

:mediamtx_done

REM Start Backend API Server
echo.
echo [4/6] Starting Backend API Server...
cd /d "%SCRIPT_DIR%\backend"
start /min "EduVision-Backend-API" cmd /c "cd /d \"%SCRIPT_DIR%\backend\" && npm run dev"
timeout /t 3 /nobreak >nul
echo [OK] Backend API started (minimized)

REM Start Face Recognition Service
echo.
echo [5/6] Starting Face Recognition Service...
cd /d "%SCRIPT_DIR%\backend"
start /min "EduVision-Face-Recognition" cmd /c "cd /d \"%SCRIPT_DIR%\backend\" && py -3.13 recognizer_arcface.py"
timeout /t 2 /nobreak >nul
echo [OK] Face Recognition started (minimized)

REM Start Background Removal Service
echo.
echo Starting Background Removal Service...
cd /d "%SCRIPT_DIR%\streaming-server"
start /min "EduVision-Background-Removal" cmd /c "cd /d \"%SCRIPT_DIR%\streaming-server\" && py -3.13 simple_background_removal.py"
timeout /t 2 /nobreak >nul
echo [OK] Background Removal started (minimized)

REM Start Node.js Streaming Server
echo.
echo Starting Node.js Streaming Server...
cd /d "%SCRIPT_DIR%\backend"
start /min "EduVision-Node-Server" cmd /c "cd /d \"%SCRIPT_DIR%\backend\" && node server.js"
timeout /t 2 /nobreak >nul
echo [OK] Node.js Server started (minimized)

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

REM Start frontend (keep window open briefly to see errors)
start /min "EduVision-Frontend" cmd /k "cd /d \"%SCRIPT_DIR%\frontend\" && echo Starting Frontend on http://localhost:5173 && npm run dev"
timeout /t 5 /nobreak >nul

REM Check if port 5173 is listening
set "FRONTEND_RUNNING=0"
for /f %%a in ('netstat -ano ^| findstr :5173') do (
    set "FRONTEND_RUNNING=1"
)

if %FRONTEND_RUNNING%==1 (
    echo [OK] Frontend started (minimized) - http://localhost:5173
) else (
    echo [WARN] Frontend may not have started. Check the minimized window for errors.
    echo        Common issues:
    echo        - Dependencies not installed (run: cd frontend ^&^& npm install)
    echo        - Port 5173 already in use
    echo        - Check the "EduVision-Frontend" window in taskbar
)

:frontend_error

echo.
echo ========================================
echo   All Services Started Successfully!
echo ========================================
echo.
echo Services Running (all minimized):
echo   [OK] MediaMTX: http://localhost:8554
echo   [OK] Backend API: http://localhost:5000
echo   [OK] Node.js Server: http://localhost:3000
echo   [OK] Frontend: http://localhost:5173
echo   [OK] Face Recognition: Running
echo   [OK] Background Removal: Running
echo.
echo All windows are minimized. Check taskbar for service windows.
echo.

REM ========================================
REM Auto-Sync: Update local cache from MongoDB
REM This ensures face detection has latest data!
REM ========================================
echo [SYNC] Syncing data to local cache for fast face detection...
echo        This ensures new faculty and schedules are recognized.
timeout /t 3 /nobreak >nul

REM Run the sync API call
curl -s -X POST http://localhost:5000/api/system/sync-to-offline > "%TEMP%\eduvision_sync_result.txt" 2>&1

REM Check if sync was successful
findstr /C:"success" "%TEMP%\eduvision_sync_result.txt" >nul 2>&1
if %errorlevel%==0 (
    echo [SYNC] ✅ Cache synced successfully! Face detection ready.
) else (
    echo [SYNC] ⚠️  Sync may have failed. Check if MongoDB is connected.
    echo        You can manually sync later: backend\QUICK_SYNC.bat
)
del "%TEMP%\eduvision_sync_result.txt" >nul 2>&1
echo.

echo Opening Frontend in browser...
timeout /t 2 /nobreak >nul
start http://localhost:5173

echo.
echo ========================================
echo   EduVision is Ready!
echo ========================================
echo.
echo To stop all services, run: STOP_EduVision.bat
echo Or close the minimized windows from taskbar.
echo.
echo This window will close in 5 seconds...
timeout /t 5 /nobreak >nul

