@echo off
echo ========================================
echo Camera Connection Diagnostic Tool
echo ========================================
echo.

REM Test 1: Ping the camera
echo [Test 1] Testing network connectivity...
ping -n 4 192.168.8.5
if %errorlevel%==0 (
    echo ✅ Camera is reachable on network
) else (
    echo ❌ Camera is NOT reachable - check IP address or network
    pause
    exit /b 1
)
echo.

REM Test 2: Check if port 554 is open
echo [Test 2] Testing RTSP port 554...
powershell -Command "Test-NetConnection -ComputerName 192.168.8.5 -Port 554 -InformationLevel Quiet"
if %errorlevel%==0 (
    echo ✅ Port 554 is OPEN
) else (
    echo ❌ Port 554 is CLOSED or BLOCKED
    echo    This means RTSP is not enabled or wrong port
)
echo.

REM Test 3: Check if HTTP port 80 is open (camera web interface)
echo [Test 3] Testing HTTP port 80 (camera web interface)...
powershell -Command "Test-NetConnection -ComputerName 192.168.8.5 -Port 80 -InformationLevel Quiet"
if %errorlevel%==0 (
    echo ✅ Port 80 is OPEN - Camera web interface is accessible
    echo    Try opening: http://192.168.8.5 in your browser
) else (
    echo ⚠️ Port 80 is CLOSED - Camera web interface may not be accessible
)
echo.

REM Test 4: Check if port 8000 is open (alternative RTSP port)
echo [Test 4] Testing alternative RTSP port 8000...
powershell -Command "Test-NetConnection -ComputerName 192.168.8.5 -Port 8000 -InformationLevel Quiet"
if %errorlevel%==0 (
    echo ✅ Port 8000 is OPEN - Try using port 8000 instead of 554
) else (
    echo ⚠️ Port 8000 is CLOSED
)
echo.

echo ========================================
echo Diagnostic Summary:
echo ========================================
echo.
echo Next steps:
echo 1. If port 554 is closed, check camera settings:
echo    - Enable RTSP in camera configuration
echo    - Verify RTSP port (might not be 554)
echo    - Check camera documentation for correct RTSP URL
echo.
echo 2. Try accessing camera web interface:
echo    - Open browser: http://192.168.8.5
echo    - Login with: admin / Eduvision124
echo    - Enable RTSP service
echo    - Check RTSP port and path
echo.
echo 3. Common RTSP paths to try:
echo    - /Streaming/Channels/101
echo    - /h264/ch1/main/av_stream
echo    - /cam/realmonitor?channel=1^&subtype=0
echo    - /stream1
echo    - /live
echo.
echo 4. Test with VLC Media Player:
echo    - Open VLC
echo    - Media ^> Open Network Stream
echo    - Enter: rtsp://admin:Eduvision124@192.168.8.5:554/Streaming/Channels/101
echo    - If VLC works, MediaMTX should work too
echo.
pause






























