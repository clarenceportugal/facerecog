@echo off
echo ============================================================
echo FIX ALL DATABASE AND API ISSUES
echo ============================================================
echo.
echo This script will:
echo   1. Check if services are running
echo   2. Test API endpoints
echo   3. Fix database issues
echo   4. Remove Daniel Masligat from all databases
echo   5. Verify the fix
echo.
echo ============================================================
echo.

cd /d "%~dp0"

echo STEP 1: Checking API endpoints...
echo ============================================================
py -3.13 test_api_endpoints.py
echo.

echo.
echo ============================================================
echo STEP 2: Fixing database issues...
echo ============================================================
echo.
echo IMPORTANT: If any services are running, you need to stop them now!
echo.
echo Stop these processes:
echo   - recognizer_arcface.py (Press Ctrl+C in its window)
echo   - Backend server (Press Ctrl+C in its window)
echo.
pause
echo.

echo Running database fix utility...
py -3.13 fix_database_issues.py
echo.

echo.
echo ============================================================
echo NEXT STEPS
echo ============================================================
echo.
echo 1. Restart backend server:
echo    cd backend
echo    npm run dev
echo.
echo 2. Restart face recognition:
echo    cd backend
echo    py -3.13 recognizer_arcface.py
echo.
echo 3. Test in browser:
echo    - Try adding a faculty member
echo    - Try deleting a faculty member
echo    - Check if Daniel Masligat appears
echo.
echo ============================================================
pause

