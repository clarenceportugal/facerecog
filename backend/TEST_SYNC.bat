@echo off
echo =========================================
echo    EduVision Sync Tester
echo =========================================
echo.
echo This tool helps you sync data between
echo offline (SQLite) and online (MongoDB).
echo.
echo Make sure the backend server is running!
echo.
pause

py -3.13 test_sync.py

echo.
pause

