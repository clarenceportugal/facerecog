@echo off
echo Starting Background Removal Service...
echo.
echo This service will process face images to remove backgrounds
echo Service will run on http://localhost:8080
echo.
echo Press Ctrl+C to stop the service
echo.

python background_removal_service.py --port 8080

pause
