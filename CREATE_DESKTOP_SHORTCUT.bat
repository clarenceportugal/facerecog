@echo off
title Create Desktop Shortcut
color 0B

echo ========================================
echo   Creating Desktop Shortcut
echo ========================================
echo.

REM Get the script directory
set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

REM Get desktop path
set "DESKTOP=%USERPROFILE%\Desktop"

REM Create VBScript to create shortcut
set "VBS_FILE=%TEMP%\create_shortcut.vbs"
set "SHORTCUT_PATH=%DESKTOP%\START EduVision.lnk"
set "TARGET_PATH=%SCRIPT_DIR%\START_EduVision.bat"

echo Creating shortcut on desktop...
echo.

REM Create VBScript
(
echo Set oWS = WScript.CreateObject^("WScript.Shell"^)
echo sLinkFile = "%SHORTCUT_PATH%"
echo Set oLink = oWS.CreateShortcut^(sLinkFile^)
echo oLink.TargetPath = "%TARGET_PATH%"
echo oLink.WorkingDirectory = "%SCRIPT_DIR%"
echo oLink.Description = "Start EduVision System"
echo oLink.IconLocation = "shell32.dll,137"
echo oLink.Save
) > "%VBS_FILE%"

REM Run VBScript
cscript //nologo "%VBS_FILE%"

REM Clean up
del "%VBS_FILE%" >nul 2>&1

if exist "%SHORTCUT_PATH%" (
    echo [OK] Shortcut created successfully!
    echo.
    echo Location: %SHORTCUT_PATH%
    echo.
    echo You can now double-click "START EduVision" on your desktop
    echo to start the system from anywhere!
) else (
    echo [ERROR] Failed to create shortcut
    echo.
    echo You can manually create a shortcut:
    echo 1. Right-click START_EduVision.bat
    echo 2. Select "Create shortcut"
    echo 3. Move shortcut to Desktop
)

echo.
pause

