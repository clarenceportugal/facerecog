# Quick Start Guide - EduVision

## 🚀 One-Click Start

### Option 1: Minimized Windows (Recommended)
Double-click: **`START_EduVision.bat`**

- All services start in **minimized windows**
- Windows appear in taskbar (easy to check if needed)
- Best for debugging if issues occur
- **Can be run from anywhere** - script automatically finds project directory

### 🖥️ Create Desktop Shortcut
Want to run from your desktop? Double-click: **`CREATE_DESKTOP_SHORTCUT.bat`**

This creates a shortcut on your desktop that you can use to start the system from anywhere!

### Option 2: Completely Hidden
Double-click: **`START_EduVision_Hidden.bat`**

- All services run **completely hidden** (no windows)
- Cleanest experience
- Use if everything works perfectly

## 🛑 One-Click Stop

Double-click: **`STOP_EduVision.bat`**

- Stops all services
- Kills all processes
- Cleans up ports

## 📋 What Gets Started

When you run `START_EduVision.bat`, it starts:

1. ✅ **MediaMTX** - Camera streaming server
2. ✅ **Backend API** - Main API server (port 5000)
3. ✅ **Face Recognition** - Python face detection service
4. ✅ **Background Removal** - Python background removal service
5. ✅ **Node.js Server** - Streaming server (port 3000)
6. ✅ **Frontend** - React web app (port 5173)

## 🌐 Access the System

After starting, the browser will automatically open to:
- **Frontend**: http://localhost:5173

Other services:
- **MediaMTX**: http://localhost:8554
- **Backend API**: http://localhost:5000
- **Streaming Server**: http://localhost:3000

## 💡 Tips

- **First time?** Use `START_EduVision.bat` (minimized) to see if there are any errors
- **Everything working?** Use `START_EduVision_Hidden.bat` for a clean experience
- **Need to debug?** Check the minimized windows in your taskbar
- **Services not starting?** Make sure MongoDB and MediaMTX are running first

## 🔧 Troubleshooting

### Services won't start?
1. Check if MongoDB is running: `Get-Service MongoDB`
2. Check if MediaMTX is running: Open http://localhost:8554
3. Check if ports are free: Run `netstat -ano | findstr :5000`

### Can't see what's happening?
- Use `START_EduVision.bat` instead of the hidden version
- Check minimized windows in taskbar
- Look for error messages

### Need to stop everything?
- Run `STOP_EduVision.bat`
- Or manually close minimized windows from taskbar

## 📝 Notes

- All services start automatically
- Browser opens automatically after 2 seconds
- Services run in background (minimized or hidden)
- Use Task Manager to see running processes if needed

