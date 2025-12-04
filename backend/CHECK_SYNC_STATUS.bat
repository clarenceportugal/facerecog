@echo off
title Check Sync Status
color 0B
echo.
echo ╔═══════════════════════════════════════════╗
echo ║   Check Sync Status                       ║
echo ╚═══════════════════════════════════════════╝
echo.
echo Checking local cache status...
echo.

curl -s http://localhost:5000/api/system/sync-status

echo.
echo.
echo ═══════════════════════════════════════════
echo To sync now: Run QUICK_SYNC.bat
echo ═══════════════════════════════════════════
echo.
pause

