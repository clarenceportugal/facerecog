@echo off
REM This version runs services in completely hidden windows
REM Use START_EduVision.bat for minimized windows (easier to debug)

title EduVision - Hidden Launcher
color 0A

echo ========================================
echo    EduVision - Hidden Mode Launcher
echo ========================================
echo.
echo Starting all services in HIDDEN mode...
echo (Use START_EduVision.bat for minimized windows)
echo.

REM Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"

REM Kill any existing processes
echo Cleaning up existing processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul

REM Start MediaMTX (hidden)
if exist "C:\Users\ALLEN\Downloads\mediartx\mediamtx.exe" (
    copy /Y "%SCRIPT_DIR%backend\mediamtx.yml" "C:\Users\ALLEN\Downloads\mediartx\mediamtx.yml" >nul 2>&1
    cd /d "C:\Users\ALLEN\Downloads\mediartx"
    start "" /B mediamtx.exe
    timeout /t 2 /nobreak >nul
)

REM Start Backend API (hidden using VBScript)
echo Starting Backend API...
cd /d "%SCRIPT_DIR%backend"
echo Set WshShell = CreateObject("WScript.Shell") > temp_start.vbs
echo WshShell.Run "cmd /c npm run dev", 0, False >> temp_start.vbs
cscript //nologo temp_start.vbs
del temp_start.vbs
timeout /t 3 /nobreak >nul

REM Start Face Recognition (hidden)
echo Starting Face Recognition...
cd /d "%SCRIPT_DIR%backend"
echo Set WshShell = CreateObject("WScript.Shell") > temp_start.vbs
echo WshShell.Run "cmd /c py -3.13 recognizer_arcface.py", 0, False >> temp_start.vbs
cscript //nologo temp_start.vbs
del temp_start.vbs
timeout /t 2 /nobreak >nul

REM Start Background Removal (hidden)
echo Starting Background Removal...
cd /d "%SCRIPT_DIR%streaming-server"
echo Set WshShell = CreateObject("WScript.Shell") > temp_start.vbs
echo WshShell.Run "cmd /c py -3.13 simple_background_removal.py", 0, False >> temp_start.vbs
cscript //nologo temp_start.vbs
del temp_start.vbs
timeout /t 2 /nobreak >nul

REM Start Node.js Server (hidden)
echo Starting Node.js Server...
cd /d "%SCRIPT_DIR%backend"
echo Set WshShell = CreateObject("WScript.Shell") > temp_start.vbs
echo WshShell.Run "cmd /c node server.js", 0, False >> temp_start.vbs
cscript //nologo temp_start.vbs
del temp_start.vbs
timeout /t 2 /nobreak >nul

REM Start Frontend (hidden)
echo Starting Frontend...
cd /d "%SCRIPT_DIR%frontend"
echo Set WshShell = CreateObject("WScript.Shell") > temp_start.vbs
echo WshShell.Run "cmd /c npm run dev", 0, False >> temp_start.vbs
cscript //nologo temp_start.vbs
del temp_start.vbs
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo   All Services Started (Hidden)
echo ========================================
echo.
echo Services are running in the background.
echo.
echo Opening Frontend in browser...
timeout /t 2 /nobreak >nul
start http://localhost:5173

echo.
echo To stop all services, run: STOP_EduVision.bat
echo.
echo This window will close in 5 seconds...
timeout /t 5 /nobreak >nul

