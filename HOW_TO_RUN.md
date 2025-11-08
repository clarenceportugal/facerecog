# How to Run EduVision System

## Prerequisites

Before running, make sure you have:
- ✅ Node.js installed
- ✅ Python 3.13 installed
- ✅ MongoDB running
- ✅ MediaMTX running
- ✅ All packages installed (see SETUP_GUIDE.md)

## Step-by-Step Setup

### 1. Start MediaMTX

**If MediaMTX is not running:**

1. **Download MediaMTX** (if not installed):
   - Go to: https://github.com/bluenviron/mediamtx/releases
   - Download the Windows version
   - Extract to a folder (e.g., `C:\mediamtx`)

2. **Configure MediaMTX** (if not done):
   - Edit `mediamtx.yml` (in MediaMTX folder)
   - Your current config:
     ```yaml
     paths:
       mycamera:
         source: "rtsp://admin:Eduvision124@192.168.8.5:554/Streaming/Channels/101"
     ```

3. **Start MediaMTX**:
   ```powershell
   cd C:\mediamtx  # or wherever you installed MediaMTX
   .\mediamtx.exe
   ```
   
   Or if it's a service, start it from Services.

4. **Verify MediaMTX is running**:
   - Open browser: http://localhost:8554
   - You should see MediaMTX web interface
   - Check that `mycamera` stream is listed

### 2. Start MongoDB

**If MongoDB is not running:**

1. **Check if MongoDB service is running**:
   ```powershell
   Get-Service MongoDB
   ```

2. **If not running, start it**:
   ```powershell
   Start-Service MongoDB
   ```

   Or manually:
   ```powershell
   mongod --dbpath "C:\data\db"
   ```

3. **Verify MongoDB is running**:
   ```powershell
   netstat -an | findstr :27017
   ```

### 3. Start the EduVision System

**Option 1: Use the Simple Launcher (Recommended)**

```powershell
cd C:\Users\ALLEN\Downloads\eduvision-main\eduvision
.\run_all_services_simple.bat
```

This will:
- Check prerequisites
- Install missing dependencies
- Start all services automatically

**Option 2: Manual Start**

**Terminal 1 - Backend API Server:**
```powershell
cd backend
npm run dev
```

**Terminal 2 - Face Recognition Service:**
```powershell
cd backend
py -3.13 recognizer_arcface.py
```

**Terminal 3 - Background Removal Service:**
```powershell
cd streaming-server
py -3.13 simple_background_removal.py
```

**Terminal 4 - Frontend:**
```powershell
cd frontend
npm run dev
```

**Terminal 5 - Node.js Streaming Server:**
```powershell
cd backend
node server.js
```

**Option 3: Use start_system.bat**

```powershell
.\start_system.bat
```

## What Should Happen

### When Everything Starts Successfully:

1. **MediaMTX**: Running on port 8554
   - Web interface: http://localhost:8554
   - Stream available: http://localhost:8554/mycamera/mjpeg

2. **MongoDB**: Running on port 27017
   - Database: `eduvision`

3. **Backend API**: Running on port 5000
   - API: http://localhost:5000

4. **Node.js Streaming Server**: Running on port 3000
   - WebSocket: ws://localhost:3000

5. **Frontend**: Running on port 5173 (Vite default)
   - Web interface: http://localhost:5173

6. **Face Recognition**: Python service running
   - Using MediaMTX stream: `mycamera`
   - Processing frames for face recognition

## Verification Checklist

- [ ] MediaMTX is running (check http://localhost:8554)
- [ ] MongoDB is running (check port 27017)
- [ ] Backend API started (check port 5000)
- [ ] Node.js server started (check port 3000)
- [ ] Frontend started (check port 5173)
- [ ] Face recognition service started (check Python process)
- [ ] No errors in terminal windows

## Troubleshooting

### MediaMTX Not Working

**Check MediaMTX status:**
```powershell
# Check if MediaMTX is running
netstat -an | findstr :8554
```

**Test MediaMTX stream:**
- Open browser: http://localhost:8554/mycamera/mjpeg
- You should see the video stream

**If stream not available:**
- Check MediaMTX logs
- Verify RTSP camera is accessible
- Check camera credentials in mediamtx.yml

### MongoDB Not Running

**Start MongoDB:**
```powershell
mongod --dbpath "C:\data\db"
```

**Or start as service:**
```powershell
Start-Service MongoDB
```

### Port Already in Use

**Kill process using port:**
```powershell
# Find process using port 5000
netstat -ano | findstr :5000
# Kill it (replace PID with actual process ID)
taskkill /F /PID <PID>
```

### Face Recognition Not Working

**Check Python service:**
- Look for errors in the Python terminal
- Verify MediaMTX stream is accessible
- Check if face database is loaded

**Test MediaMTX connection:**
```powershell
# Test if MediaMTX MJPEG endpoint works
curl http://localhost:8554/mycamera/mjpeg
```

## Accessing the System

1. **Open browser**: http://localhost:5173
2. **Login** with your credentials
3. **Navigate to Live Video** page
4. **Start camera stream** - it will use MediaMTX automatically

## Stopping the System

**If using batch files:**
- Close all terminal windows
- Or press Ctrl+C in each window

**If using services:**
- Stop MediaMTX
- Stop MongoDB (if running as service)
- Stop Node.js processes

## Next Steps

1. **Add more cameras** (if needed):
   - Add to MediaMTX `mediamtx.yml`:
     ```yaml
     paths:
       mycamera:
         source: "rtsp://admin:Eduvision124@192.168.8.5:554/Streaming/Channels/101"
       camera2:  # Add this
         source: "rtsp://tapoadmin:eduvision124@192.168.8.169:554/stream1"
     ```
   - Update `backend/server.js` camera config

2. **Register faces**:
   - Use the face registration interface
   - Add instructor faces to the system

3. **Configure schedules**:
   - Set up class schedules for instructors
   - System will automatically track attendance

