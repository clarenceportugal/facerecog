@echo off
title EduVision Quick Sync
color 0A
echo.
echo ╔═══════════════════════════════════════════╗
echo ║   EduVision Quick Sync                    ║
echo ║   Sync MongoDB → SQLite Cache             ║
echo ╚═══════════════════════════════════════════╝
echo.
echo Syncing data to local cache...
echo This makes face detection FAST! ⚡
echo.

curl -X POST http://localhost:5000/api/system/sync-to-offline

echo.
echo ═══════════════════════════════════════════
echo ✅ Sync complete! Cache is up-to-date.
echo ═══════════════════════════════════════════
echo.
echo New faculty and schedules will now be 
echo recognized by face detection!
echo.
timeout /t 3

