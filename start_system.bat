@echo off

REM === Kill any process using port 5000 ===
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
    echo Port 5000 is in use by PID %%a. Terminating process...
    taskkill /F /PID %%a >nul 2>&1
)

REM === Get the directory where this batch file is located ===
set "SCRIPT_DIR=%~dp0"

REM === Test GPU Availability ===
echo.
echo ========================================
echo Testing GPU Availability for Face Recognition
echo ========================================
cd /d "%SCRIPT_DIR%backend"
start cmd /k "py -3.13 test_gpu.py & pause"

REM === Wait a moment for GPU test to display ===
timeout /t 2 /nobreak

REM === Start Backend WebSocket/Face Server ===
cd /d "%SCRIPT_DIR%backend"
start cmd /k "py -3.13 recognizer_arcface.py"

REM === Start Background Removal Server ===
cd /d "%SCRIPT_DIR%streaming-server"
start cmd /k "py -3.13 simple_background_removal.py"

REM === Start Backend WebSocket/Face Server ===
cd /d "%SCRIPT_DIR%backend"
start cmd /k "node server.js"

REM === Start Backend Dev Server (API/logic) ===
cd /d "%SCRIPT_DIR%backend"
start cmd /k "npm run dev"

REM Give backend a few seconds to boot
timeout /t 5 /nobreak

REM === Start Frontend React App ===
cd /d "%SCRIPT_DIR%frontend"
start cmd /k "npm run dev"

echo.
echo ========================================
echo All services started!
echo Check the GPU test window to see if GPU is available.
echo ========================================

