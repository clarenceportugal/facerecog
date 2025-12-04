@echo off
REM ========================================
REM EduVision - Start All Services
REM Now with FULLY OFFLINE face detection!
REM ========================================

echo.
echo ========================================
echo EduVision - Starting All Services
echo ========================================
echo.
echo NEW: System now works OFFLINE for face detection!
echo - Face embeddings stored locally (SQLite)
echo - Schedules stored locally (SQLite)
echo - Attendance logs queued locally
echo - Syncs to MongoDB when online (optional)
echo.

REM === Kill any process using port 5000 ===
echo Checking port 5000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
    echo Port 5000 is in use by PID %%a. Terminating process...
    taskkill /F /PID %%a >nul 2>&1
)

REM === Kill any process using port 8554 (MediaMTX) ===
echo Checking port 8554...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8554') do (
    echo Port 8554 is in use by PID %%a. Terminating process...
    taskkill /F /PID %%a >nul 2>&1
)

REM === Wait a moment ===
timeout /t 2 /nobreak

REM === Start MediaMTX with config file ===
echo.
echo ========================================
echo Starting MediaMTX...
echo ========================================

REM Copy config file to MediaMTX directory (MediaMTX looks for mediamtx.yml in its directory)
echo Copying mediamtx.yml to MediaMTX directory...
copy /Y "C:\Users\ALLEN\Downloads\eduvision-main\eduvision\backend\mediamtx.yml" "C:\Users\ALLEN\Downloads\mediartx\mediamtx.yml" >nul 2>&1
if %errorlevel%==0 (
    echo ✅ Config file copied successfully
) else (
    echo ⚠️ Warning: Could not copy config file. MediaMTX will use existing config.
)

cd /d "C:\Users\ALLEN\Downloads\mediartx"
start cmd /k "mediamtx.exe"

REM === Wait for MediaMTX to start ===
echo Waiting for MediaMTX to start...
timeout /t 5 /nobreak

REM === Check if MediaMTX is running ===
echo Checking MediaMTX status...
set MEDIAMTX_RUNNING=0
for /f %%a in ('netstat -ano ^| findstr :8554') do (
    set MEDIAMTX_RUNNING=1
)

if %MEDIAMTX_RUNNING%==1 (
    echo ✅ MediaMTX is running on port 8554
) else (
    echo ⚠️ Warning: MediaMTX may not be running. Check the MediaMTX window.
)

REM === Start Face Recognition Service (Python) ===
echo.
echo ========================================
echo Starting Face Recognition Service...
echo ========================================
echo NOTE: This service now works OFFLINE!
echo - Uses local SQLite database for embeddings
echo - Uses local SQLite database for schedules
echo - Queues attendance logs locally
echo - Syncs to MongoDB when online (optional)
echo.
cd /d "C:\Users\ALLEN\OneDrive\Documents\backup\eduvision\backend"
start cmd /k "py -3.13 recognizer_arcface.py"

REM === Start Background Removal Server ===
echo.
echo ========================================
echo Starting Background Removal Service...
echo ========================================
cd /d "C:\Users\ALLEN\OneDrive\Documents\backup\eduvision\streaming-server"
start cmd /k "py -3.13 simple_background_removal.py"

REM === Start Node.js Streaming Server ===
echo.
echo ========================================
echo Starting Node.js Streaming Server...
echo ========================================
cd /d "C:\Users\ALLEN\OneDrive\Documents\backup\eduvision\backend"
start cmd /k "node server.js"

REM === Start Backend Dev Server (API/logic) ===
echo.
echo ========================================
echo Starting Backend API Server...
echo ========================================
cd /d "C:\Users\ALLEN\OneDrive\Documents\backup\eduvision\backend"
start cmd /k "npm run dev"

REM Give backend a few seconds to boot
echo.
echo Waiting for services to initialize...
timeout /t 5 /nobreak

REM === Start Frontend React App ===
echo.
echo ========================================
echo Starting Frontend...
echo ========================================
cd /d "C:\Users\ALLEN\OneDrive\Documents\backup\eduvision\frontend"
start cmd /k "npm run dev"

echo.
echo ========================================
echo All services started!
echo ========================================
echo.
echo Services:
echo - MediaMTX: http://localhost:8554
echo - Backend API: http://localhost:5000
echo - Streaming Server: http://localhost:3000
echo - Frontend: http://localhost:5173
echo.
echo ========================================
echo OFFLINE CAPABILITIES
echo ========================================
echo ✅ Face Detection: Works offline
echo ✅ Face Recognition: Works offline (local SQLite)
echo ✅ Schedule Checking: Works offline (local SQLite)
echo ✅ Room Validation: Works offline (local SQLite)
echo ✅ Attendance Logging: Works offline (queued locally)
echo.
echo Optional: Sync schedules to local DB (one-time setup)
echo POST http://localhost:5000/api/dean/sync-schedules-to-local
echo Body: {"collegeCode": "CIT"}  (or omit for all colleges)
echo.
echo Check each window for any errors.
echo.
echo NOTE: Local databases are created automatically:
echo - backend/face_embeddings.db (face embeddings)
echo - backend/face_detection_data.db (schedules, logs)
echo.
pause

