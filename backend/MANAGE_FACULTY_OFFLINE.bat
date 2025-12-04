@echo off
echo ============================================================
echo OFFLINE FACULTY MANAGER
echo ============================================================
echo.
echo This tool allows you to:
echo   1. List all faculty members
echo   2. Add new faculty members
echo   3. Delete faculty members
echo   4. Fix Daniel Masligat issue
echo.
echo ============================================================
echo.

cd /d "%~dp0"

py -3.13 offline_faculty_manager.py

echo.
pause

