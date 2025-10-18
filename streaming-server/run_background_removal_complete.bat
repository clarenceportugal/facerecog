@echo off
echo ========================================
echo    EduVision Background Removal Service
echo ========================================
echo.

echo [1/5] Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ and try again
    pause
    exit /b 1
)
echo ✓ Python is installed

echo.
echo [2/5] Installing required packages...
pip install rembg[new] pillow opencv-python-headless numpy scipy matplotlib sympy pyyaml coloredlogs humanfriendly
if errorlevel 1 (
    echo ERROR: Failed to install packages
    pause
    exit /b 1
)
echo ✓ Packages installed successfully

echo.
echo [3/5] Checking service files...
if not exist "background_removal_service.py" (
    echo ERROR: background_removal_service.py not found
    pause
    exit /b 1
)
echo ✓ Service files found

echo.
echo [4/5] Starting Background Removal Service...
echo.
echo ========================================
echo   Service Starting on Port 8080
echo ========================================
echo.
echo Available Endpoints:
echo   - Health Check: http://localhost:8080/health
echo   - Remove Background: POST http://localhost:8080/remove-background
echo   - Process User Folder: POST http://localhost:8080/process-user-folder
echo.
echo Features:
echo   ✓ 100%% accurate background removal
echo   ✓ Batch processing (10+ images per batch)
echo   ✓ Pure black backgrounds
echo   ✓ Lossless quality preservation
echo   ✓ Automatic cleanup of unprocessed images
echo.
echo Press Ctrl+C to stop the service
echo ========================================
echo.

python background_removal_service.py -p 8080

echo.
echo ========================================
echo   Service Stopped
echo ========================================
pause
