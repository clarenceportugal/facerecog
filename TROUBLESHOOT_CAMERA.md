# Troubleshooting Camera Connection Issues

## Problem: MediaMTX cannot connect to camera

### Error Types:

**1. "i/o timeout"** - Network cannot reach the camera
```
ERR [path mycamera] [RTSP source] dial tcp 192.168.8.5:554: i/o timeout
```

**2. "connection refused"** - Camera is reachable but RTSP is not enabled
```
ERR [path mycamera] [RTSP source] dial tcp 192.168.8.5:554: connectex: No connection could be made because the target machine actively refused it.
```

If you see "connection refused", it means:
- ✅ Network can reach the camera
- ❌ RTSP service is disabled or wrong port
- ❌ Nothing is listening on port 554

Follow these steps:

## Step 1: Check if camera is reachable

**Test network connectivity:**
```powershell
# Ping the camera IP
ping 192.168.8.5

# Test if port 554 is open
Test-NetConnection -ComputerName 192.168.8.5 -Port 554
```

**If ping fails:**
- Camera might be offline
- Wrong IP address
- Camera not on same network
- Firewall blocking

## Step 2: Test RTSP URL directly

**Option 1: Test with VLC Media Player**
1. Open VLC
2. Media → Open Network Stream
3. Enter: `rtsp://admin:Eduvision124@192.168.8.5:554/Streaming/Channels/101`
4. Click Play

**Option 2: Test with FFmpeg (if installed)**
```powershell
ffmpeg -rtsp_transport tcp -i "rtsp://admin:Eduvision124@192.168.8.5:554/Streaming/Channels/101" -t 10 test.mp4
```

**Option 3: Test with curl**
```powershell
curl -v rtsp://admin:Eduvision124@192.168.8.5:554/Streaming/Channels/101
```

## Step 3: Verify camera credentials and URL

**Check camera settings:**
- IP Address: `192.168.8.5`
- Port: `554` (default RTSP port)
- Username: `admin`
- Password: `Eduvision124`
- RTSP Path: `/Streaming/Channels/101`

**Common RTSP paths for different cameras:**
- Hikvision: `/Streaming/Channels/101` or `/h264/ch1/main/av_stream`
- Dahua: `/cam/realmonitor?channel=1&subtype=0`
- Generic: `/stream1` or `/live`

## Step 4: Check camera configuration

**If using a different camera model, you might need to:**
1. Enable RTSP in camera settings
2. Check RTSP port (might not be 554)
3. Verify username/password
4. Check if camera requires authentication

## Step 5: Network troubleshooting

**Check your network:**
```powershell
# Check your IP address
ipconfig

# Check if camera is on same network
# Your computer should be on 192.168.8.x network
```

**If camera is on different network:**
- You might need to configure port forwarding
- Or use VPN to access camera network

## Step 6: Test with alternative RTSP URL

**Try different RTSP paths:**
```yaml
# In mediamtx.yml, try these alternatives:
paths:
  mycamera:
    # Option 1: Try without channel number
    source: "rtsp://admin:Eduvision124@192.168.8.5:554/Streaming/Channels/101"
    
    # Option 2: Try different path
    # source: "rtsp://admin:Eduvision124@192.168.8.5:554/h264/ch1/main/av_stream"
    
    # Option 3: Try with different port
    # source: "rtsp://admin:Eduvision124@192.168.8.5:8554/Streaming/Channels/101"
```

## Step 7: Check MediaMTX source settings

**In mediamtx.yml, you can add source settings:**
```yaml
paths:
  mycamera:
    source: "rtsp://admin:Eduvision124@192.168.8.5:554/Streaming/Channels/101"
    sourceOnDemand: no  # Pull stream immediately
    rtspTransport: tcp  # Use TCP instead of UDP (more reliable)
    rtspAnyPort: no     # Don't allow any port
```

## Step 8: Check firewall

**Windows Firewall might be blocking:**
```powershell
# Check firewall rules
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*MediaMTX*"}

# Allow MediaMTX through firewall if needed
```

## Common Solutions

1. **Camera is offline** → Power cycle the camera
2. **Wrong IP** → Check camera IP in camera's web interface
3. **Wrong credentials** → Verify username/password in camera settings
4. **Wrong RTSP path** → Check camera documentation for correct RTSP URL
5. **Network issue** → Ensure camera and computer are on same network
6. **Firewall** → Temporarily disable firewall to test

## Test MediaMTX without camera

**To test if MediaMTX is working correctly, you can:**
1. Use a test RTSP stream (if available)
2. Or temporarily disable the camera source and test MediaMTX endpoints

## Still having issues?

1. Check camera manufacturer documentation for RTSP URL format
2. Try accessing camera web interface: `http://192.168.8.5`
3. Check camera logs (if available)
4. Verify camera firmware is up to date

