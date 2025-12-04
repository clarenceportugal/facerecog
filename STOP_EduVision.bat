@echo off
title EduVision - Stop All Services
color 0C

echo ========================================
echo    EduVision - Stopping All Services
echo ========================================
echo.

echo Stopping all EduVision services...
echo.

REM Kill processes by window title
taskkill /FI "WINDOWTITLE eq EduVision-Backend-API*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq EduVision-Face-Recognition*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq EduVision-Background-Removal*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq EduVision-Node-Server*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq EduVision-Frontend*" /F >nul 2>&1

REM Kill processes by port
echo Killing processes on ports...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000') do (
    echo   Stopping process on port 5000 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    echo   Stopping process on port 3000 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173') do (
    echo   Stopping process on port 5173 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

REM Kill Python processes (face recognition and background removal)
echo Killing Python services...
taskkill /FI "IMAGENAME eq python.exe" /FI "COMMANDLINE eq *recognizer_arcface.py*" /F >nul 2>&1
taskkill /FI "IMAGENAME eq python.exe" /FI "COMMANDLINE eq *simple_background_removal.py*" /F >nul 2>&1

REM Kill Node processes
echo Killing Node.js processes...
taskkill /FI "IMAGENAME eq node.exe" /F >nul 2>&1

REM Kill MediaMTX if running
if exist "C:\Users\ALLEN\Downloads\mediartx\mediamtx.exe" (
    echo Stopping MediaMTX...
    taskkill /FI "IMAGENAME eq mediamtx.exe" /F >nul 2>&1
)

timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo   All Services Stopped
echo ========================================
echo.
echo All EduVision services have been terminated.
echo.
timeout /t 3 /nobreak >nul

