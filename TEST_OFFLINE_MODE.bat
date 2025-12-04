@echo off
echo ============================================================
echo TEST OFFLINE MODE - Complete Verification
echo ============================================================
echo.
echo This script will help you test all offline functionality.
echo.
echo ============================================================
echo STEP 1: Verify Backend is in Offline Mode
echo ============================================================
echo.
echo Check your backend console window.
echo.
echo You should see:
echo   ============================================================
echo   System Mode: Offline Mode (Local SQLite only)
echo   ============================================================
echo.
pause
echo.

echo ============================================================
echo STEP 2: Test API Endpoints
echo ============================================================
echo.
cd /d "%~dp0\backend"
py -3.13 test_api_endpoints.py
echo.
pause
echo.

echo ============================================================
echo STEP 3: Check Faculty List
echo ============================================================
echo.
py -3.13 offline_faculty_manager.py
echo.
pause
echo.

echo ============================================================
echo TESTING COMPLETE
echo ============================================================
echo.
echo Now test in browser:
echo   1. Go to http://localhost:5173
echo   2. Login as Program Chair or Dean
echo   3. Try adding a faculty member
echo   4. Try deleting a faculty member
echo   5. Try adding a manual schedule
echo.
echo All should work WITHOUT internet!
echo.
echo ============================================================
pause

