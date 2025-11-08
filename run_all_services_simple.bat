@echo off
title EduVision - Simple System Launcher
color 0A

echo ========================================
echo    EduVision - Simple System Launcher
echo ========================================
echo.

echo [1/4] Checking system requirements...

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed
    echo Please install Node.js and try again
    pause
    exit /b 1
)
echo ✓ Node.js is installed

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed
    echo Please install Python 3.8+ and try again
    pause
    exit /b 1
)
echo ✓ Python is installed

echo.
echo [2/4] Installing backend dependencies...
cd backend
if not exist "node_modules" (
    echo Installing backend packages...
    npm install
    if errorlevel 1 (
        echo ERROR: Failed to install backend packages
        pause
        exit /b 1
    )
)
echo ✓ Backend dependencies ready

echo.
echo [3/4] Installing frontend dependencies...
cd ..\frontend
if not exist "node_modules" (
    echo Installing frontend packages...
    npm install
    if errorlevel 1 (
        echo ERROR: Failed to install frontend packages
        pause
        exit /b 1
    )
)
echo ✓ Frontend dependencies ready

echo.
echo [4/4] Starting all services...
echo.
echo ========================================
echo   Starting All EduVision Services
echo ========================================
echo.

REM Start services in separate windows
echo Starting Backend Server (TypeScript with nodemon)...
start "EduVision Backend" cmd /k "cd /d %~dp0backend && npm run dev"

timeout /t 3 /nobreak >nul

echo Starting Face Recognition Service (Python)...
start "EduVision Face Recognition" cmd /k "cd /d %~dp0backend && py -3.13 recognizer_arcface.py"

timeout /t 3 /nobreak >nul

echo Starting Background Removal Service (Python)...
start "EduVision Background Removal" cmd /k "cd /d %~dp0streaming-server && py -3.13 simple_background_removal.py"

timeout /t 3 /nobreak >nul

echo Starting Frontend Development Server...
start "EduVision Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 3 /nobreak >nul

echo Starting Node.js Server...
start "EduVision Node Server" cmd /k "cd /d %~dp0backend && node server.js"

echo.
echo ========================================
echo   All Services Started Successfully!
echo ========================================
echo.
echo Services Running:
echo   ✓ Backend Server: http://localhost:3000
echo   ✓ Frontend: http://localhost:5173
echo   ✓ Face Recognition: Python service running
echo   ✓ Background Removal: Python service running
echo   ✓ Node.js Server: Additional service running
echo.
echo NOTE: If Python services fail due to missing packages,
echo       run: py -3.13 -m pip install insightface onnxruntime-gpu
echo.
echo Press any key to open the application in browser...
pause >nul

echo Opening EduVision in browser...
start http://localhost:5173

echo.
echo ========================================
echo   EduVision System is Ready!
echo ========================================
echo.
echo To stop all services:
echo   - Close the individual command windows
echo   - Or press Ctrl+C in each service window
echo.
echo Press any key to exit this launcher...
pause >nul
