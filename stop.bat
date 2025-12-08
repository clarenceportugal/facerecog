@echo off
REM ========================================
REM EduVision - Stop All Services
REM Stops all services started by start.bat
REM ========================================

setlocal enabledelayedexpansion

echo.
echo ========================================
echo EduVision - Stopping All Services
echo ========================================
echo.

REM === Kill processes by port ===
echo [1/6] Stopping services on ports...

REM Stop Backend API (port 5000)
echo Stopping Backend API (port 5000)...
set COUNT=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
    taskkill /F /PID %%a >nul 2>&1
    set /a COUNT+=1
)
if !COUNT! gtr 0 (
    echo   [OK] Backend API stopped
) else (
    echo   [INFO] Backend API was not running
)

REM Stop MediaMTX (port 8554)
echo Stopping MediaMTX (port 8554)...
set COUNT=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8554') do (
    taskkill /F /PID %%a >nul 2>&1
    set /a COUNT+=1
)
if !COUNT! gtr 0 (
    echo   [OK] MediaMTX stopped
) else (
    echo   [INFO] MediaMTX was not running
)

REM Stop Node.js Streaming Server (port 3000)
echo Stopping Streaming Server (port 3000)...
set COUNT=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    taskkill /F /PID %%a >nul 2>&1
    set /a COUNT+=1
)
if !COUNT! gtr 0 (
    echo   [OK] Streaming Server stopped
) else (
    echo   [INFO] Streaming Server was not running
)

REM Stop Frontend (port 5173)
echo Stopping Frontend (port 5173)...
set COUNT=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do (
    taskkill /F /PID %%a >nul 2>&1
    set /a COUNT+=1
)
if !COUNT! gtr 0 (
    echo   [OK] Frontend stopped
) else (
    echo   [INFO] Frontend was not running
)

REM === Kill Python processes ===
echo.
echo [2/6] Stopping Python services...

REM Stop Face Recognition (recognizer_arcface.py)
echo Stopping Face Recognition Service...
taskkill /F /FI "WINDOWTITLE eq EduVision - Face Recognition*" >nul 2>&1
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq python.exe" /FO CSV ^| findstr /I "recognizer_arcface"') do (
    taskkill /F /PID %%a >nul 2>&1
)
REM Also kill by process name if window title doesn't work
wmic process where "CommandLine like '%%recognizer_arcface.py%%'" delete >nul 2>&1
echo   [OK] Face Recognition stopped (if it was running)

REM Stop Background Removal (simple_background_removal.py)
echo Stopping Background Removal Service...
wmic process where "CommandLine like '%%simple_background_removal.py%%'" delete >nul 2>&1
echo   [OK] Background Removal stopped (if it was running)

REM === Kill Node.js processes ===
echo.
echo [3/6] Stopping Node.js processes...

REM Kill nodemon/ts-node (Backend API)
echo Stopping Node.js Backend processes...
taskkill /F /FI "WINDOWTITLE eq EduVision - Backend API*" >nul 2>&1
wmic process where "CommandLine like '%%nodemon%%' OR CommandLine like '%%ts-node%%'" delete >nul 2>&1
echo   [OK] Backend Node.js processes stopped (if they were running)

REM Kill node server.js (Streaming Server)
wmic process where "CommandLine like '%%server.js%%'" delete >nul 2>&1
echo   [OK] Streaming Server Node.js process stopped (if it was running)

REM Kill npm run dev (Frontend)
wmic process where "CommandLine like '%%npm%%run%%dev%%'" delete >nul 2>&1
echo   [OK] Frontend npm process stopped (if it was running)

REM === Kill MediaMTX process ===
echo.
echo [4/6] Stopping MediaMTX process...
taskkill /F /IM mediamtx.exe >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] MediaMTX process stopped
) else (
    echo   [INFO] MediaMTX process was not running
)

REM === Wait a moment for cleanup ===
echo.
echo [5/6] Waiting for processes to terminate...
timeout /t 2 /nobreak >nul

REM === Verify ports are free ===
echo.
echo [6/6] Verifying ports are free...
set ALL_CLEAR=1

netstat -ano | findstr :5000 >nul 2>&1
if %errorlevel% equ 0 (
    echo   [WARN] Port 5000 is still in use
    set ALL_CLEAR=0
) else (
    echo   [OK] Port 5000 is free
)

netstat -ano | findstr :8554 >nul 2>&1
if %errorlevel% equ 0 (
    echo   [WARN] Port 8554 is still in use
    set ALL_CLEAR=0
) else (
    echo   [OK] Port 8554 is free
)

netstat -ano | findstr :3000 >nul 2>&1
if %errorlevel% equ 0 (
    echo   [WARN] Port 3000 is still in use
    set ALL_CLEAR=0
) else (
    echo   [OK] Port 3000 is free
)

netstat -ano | findstr :5173 >nul 2>&1
if %errorlevel% equ 0 (
    echo   [WARN] Port 5173 is still in use
    set ALL_CLEAR=0
) else (
    echo   [OK] Port 5173 is free
)

echo.
echo ========================================
if !ALL_CLEAR! equ 1 (
    echo All Services Stopped Successfully!
    echo ========================================
    echo.
    echo All ports are now free.
    echo You can run start.bat again to restart services.
) else (
    echo Services Stopped (Some ports may still be in use)
    echo ========================================
    echo.
    echo Some processes may still be running.
    echo If needed, check Task Manager and manually close:
    echo - Python processes (recognizer_arcface.py, simple_background_removal.py)
    echo - Node.js processes (nodemon, node server.js, npm)
    echo - MediaMTX (mediamtx.exe)
    echo.
    echo Or run this script again to force kill remaining processes.
)
echo.
echo Press any key to close...
pause >nul

