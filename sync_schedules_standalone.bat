@echo off
REM ========================================
REM Sync Schedules to Local Database
REM ========================================

setlocal

REM Get the script directory
set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%backend"

echo.
echo ========================================
echo Schedule Sync Tool
echo ========================================
echo.
echo This will sync all schedules from MongoDB to local SQLite database
echo for offline face detection.
echo.

cd /d "%BACKEND_DIR%"

REM Check if backend API is running
echo Checking if backend API is running...
netstat -ano | findstr :5000 >nul
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Backend API is not running on port 5000!
    echo Please start the backend API first, then run this script.
    echo.
    pause
    exit /b 1
)

echo [OK] Backend API is running
echo.

REM Ask if user wants to sync by college
set /p SYNC_COLLEGE="Sync schedules for specific college? (leave empty for all, or enter college code like CIT): "

if "!SYNC_COLLEGE!"=="" (
    echo.
    echo Syncing all schedules...
    py -3.13 sync_schedules.py
) else (
    echo.
    echo Syncing schedules for college: !SYNC_COLLEGE!
    py -3.13 sync_schedules.py --college !SYNC_COLLEGE!
)

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo [OK] Schedule sync completed successfully!
    echo ========================================
    echo.
    echo The face recognizer will now use local database for schedules.
    echo You can verify by checking:
    echo   http://localhost:5000/api/dean/data-source-status
    echo.
) else (
    echo.
    echo ========================================
    echo [ERROR] Schedule sync failed!
    echo ========================================
    echo.
    echo Check the error messages above for details.
    echo.
)

pause

