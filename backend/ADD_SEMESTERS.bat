@echo off
echo =========================================
echo    Add Default Semesters to Offline DB
echo =========================================
echo.
echo This will add default semesters to your
echo offline database so you can add schedules.
echo.
pause

py -3.13 add_default_semesters.py

echo.
echo =========================================
echo Done! You can now add schedules.
echo =========================================
echo.
pause

