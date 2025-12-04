@echo off
echo ============================================================
echo Installing Python Packages for Offline Tools
echo ============================================================
echo.
echo Installing required packages...
echo.

cd /d "%~dp0"

py -3.13 -m pip install -r offline_requirements.txt

echo.
echo ============================================================
echo Installation Complete!
echo ============================================================
echo.
echo You can now run:
echo   - offline_faculty_manager.py
echo   - fix_database_issues.py
echo   - test_api_endpoints.py
echo.
pause

