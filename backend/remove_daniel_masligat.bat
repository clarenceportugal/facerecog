@echo off
REM Quick cleanup script for Daniel Masligat
echo ============================================================
echo Removing Daniel Masligat from all databases
echo ============================================================
echo.

cd /d "%~dp0"

py -3.13 cleanup_person.py "daniel masligat"

echo.
echo ============================================================
echo.
echo NEXT STEPS:
echo 1. Restart the face recognition service if it's running
echo 2. Stop: Press Ctrl+C in the recognizer_arcface.py window
echo 3. Start: py -3.13 recognizer_arcface.py
echo.
echo ============================================================
pause

