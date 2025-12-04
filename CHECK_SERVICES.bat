@echo off
title EduVision - Service Status Checker
color 0B

echo ========================================
echo    EduVision - Service Status Checker
echo ========================================
echo.

echo Checking which services are running...
echo.

REM Check MediaMTX
echo [MediaMTX] Checking port 8554...
netstat -ano | findstr :8554 >nul 2>&1
if errorlevel 1 (
    echo    [OFFLINE] Not running
) else (
    echo    [ONLINE]  Running on port 8554
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8554') do (
        echo    Process ID: %%a
    )
)

REM Check Backend API
echo.
echo [Backend API] Checking port 5000...
netstat -ano | findstr :5000 >nul 2>&1
if errorlevel 1 (
    echo    [OFFLINE] Not running
) else (
    echo    [ONLINE]  Running on port 5000
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
        echo    Process ID: %%a
    )
)

REM Check Node.js Server
echo.
echo [Node.js Server] Checking port 3000...
netstat -ano | findstr :3000 >nul 2>&1
if errorlevel 1 (
    echo    [OFFLINE] Not running
) else (
    echo    [ONLINE]  Running on port 3000
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
        echo    Process ID: %%a
    )
)

REM Check Frontend
echo.
echo [Frontend] Checking port 5173...
netstat -ano | findstr :5173 >nul 2>&1
if errorlevel 1 (
    echo    [OFFLINE] Not running
    echo.
    echo    TROUBLESHOOTING:
    echo    1. Check if "EduVision-Frontend" window exists in taskbar
    echo    2. Open the window to see error messages
    echo    3. Try: cd frontend ^&^& npm install
    echo    4. Try: cd frontend ^&^& npm run dev
) else (
    echo    [ONLINE]  Running on port 5173
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do (
        echo    Process ID: %%a
    )
    echo.
    echo    Frontend should be accessible at: http://localhost:5173
)

REM Check Python processes
echo.
echo [Python Services] Checking...
tasklist | findstr /i "python.exe" >nul 2>&1
if errorlevel 1 (
    echo    [OFFLINE] No Python processes found
) else (
    echo    [ONLINE]  Python processes running:
    tasklist | findstr /i "python.exe"
)

REM Check Node processes
echo.
echo [Node.js Processes] Checking...
tasklist | findstr /i "node.exe" >nul 2>&1
if errorlevel 1 (
    echo    [OFFLINE] No Node.js processes found
) else (
    echo    [ONLINE]  Node.js processes running:
    tasklist | findstr /i "node.exe"
)

echo.
echo ========================================
echo    Quick Access Links
echo ========================================
echo.
echo Frontend:        http://localhost:5173
echo Backend API:     http://localhost:5000
echo Node Server:     http://localhost:3000
echo MediaMTX:        http://localhost:8554
echo.

echo Press any key to exit...
pause >nul

