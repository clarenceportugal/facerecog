# 🔄 Offline/Online Sync Guide

## ✅ Issues Fixed

### 1. **Schedule Time Fields Now Have Default Values**
- Start Time: `07:00` (7:00 AM)
- End Time: `08:00` (8:00 AM)
- You can change these to any time you want when adding a schedule

### 2. **Understanding Offline ↔ Online Data Sync**

---

## 🗄️ How the Database System Works

Your EduVision system has **TWO SEPARATE DATABASES**:

| Database | Used When | Purpose |
|----------|-----------|---------|
| **SQLite** (`offline_data.db`) | `OFFLINE_MODE=true` | Local database for offline operations |
| **MongoDB** | `OFFLINE_MODE=false` | Cloud database for online operations |

**IMPORTANT:** These databases are **INDEPENDENT**. Changes in one don't automatically appear in the other!

---

## ❓ Why You Saw Offline Changes in Online Mode

You reported: *"I added/deleted faculty in offline mode, then switched to online mode and saw those changes."*

**This happened because:**
- You added/deleted faculty while `OFFLINE_MODE=true` → Changes saved to **SQLite only**
- When you "switched to online mode," you likely restarted the server but **didn't change the `.env` file**
- The server was still using `OFFLINE_MODE=true`, so it continued reading from **SQLite**
- Result: You saw your offline changes because you were still in offline mode!

---

## 🔄 How to Sync Data Between Databases

### **Option 1: Sync MongoDB → SQLite (Prepare for Offline)**
Use this when you're going offline and want to download all data locally.

**Steps:**
1. Make sure you're online and MongoDB is connected
2. Open PowerShell in the `backend` folder
3. Run:
```powershell
curl -X POST http://localhost:5000/api/system/sync-to-offline
```

### **Option 2: Sync SQLite → MongoDB (After Working Offline) - NEW! 🎉**
Use this when you worked offline and want to upload your changes to MongoDB.

**Steps:**
1. Switch to online mode (set `OFFLINE_MODE=false` in `.env`)
2. Restart the backend server
3. Open PowerShell in the `backend` folder
4. Run:
```powershell
curl -X POST http://localhost:5000/api/system/sync-offline-to-mongo
```

This will:
- Upload all users (faculty) from SQLite → MongoDB
- Upload all schedules from SQLite → MongoDB
- Update existing records or create new ones

### **Option 3: Sync Attendance Logs Only**
```powershell
curl -X POST http://localhost:5000/api/system/sync-logs-to-mongo
```

---

## 🚀 Recommended Workflow

### **Working Offline:**
1. Set `OFFLINE_MODE=true` in `.env`
2. Restart the backend server
3. Work normally (add/delete faculty, schedules, etc.)
4. All changes are saved to SQLite

### **Switching to Online:**
1. **First, sync your offline changes:**
   ```powershell
   # Stop the backend server
   # Change .env: OFFLINE_MODE=false
   # Restart the backend server
   # Wait for MongoDB to connect
   
   # Sync your offline changes
   curl -X POST http://localhost:5000/api/system/sync-offline-to-mongo
   ```
2. Now you're fully online with all your offline changes preserved!

### **Going Back Offline:**
1. **First, download the latest data:**
   ```powershell
   # Make sure you're online
   curl -X POST http://localhost:5000/api/system/sync-to-offline
   ```
2. Set `OFFLINE_MODE=true` in `.env`
3. Restart the backend server

---

## 🔍 How to Check Which Mode You're In

### **Method 1: Check Server Logs**
When you start the backend, look for:
```
============================================================
🚀 SERVER RUNNING IN OFFLINE MODE
📴 MongoDB connection disabled - Using local SQLite database
============================================================
```
or
```
============================================================
🚀 SERVER RUNNING IN ONLINE MODE
🌐 MongoDB connection required
============================================================
```

### **Method 2: Check the API**
```powershell
curl http://localhost:5000/api/system/status
```

Look at the response:
```json
{
  "mode": "offline",  // or "online"
  "mongoConnected": false  // or true
}
```

---

## 🎯 Quick Reference

| Task | Command |
|------|---------|
| **Check current mode** | `curl http://localhost:5000/api/system/status` |
| **Download data for offline use** | `curl -X POST http://localhost:5000/api/system/sync-to-offline` |
| **Upload offline changes to online** | `curl -X POST http://localhost:5000/api/system/sync-offline-to-mongo` |
| **Sync attendance logs** | `curl -X POST http://localhost:5000/api/system/sync-logs-to-mongo` |

---

## ⚠️ Important Notes

1. **Always sync before switching modes** to avoid data loss
2. **Offline changes are isolated** - they won't appear in MongoDB until you sync
3. **Online changes are isolated** - they won't appear in SQLite until you sync
4. **Attendance logs auto-queue** in offline mode and can be synced later
5. **The system can only be in ONE mode at a time** (either online OR offline, not both)

---

## 💡 Example Scenario

**Scenario:** You worked offline for a week, added 10 faculty members, and now you're back online.

**Steps:**
1. **Check your current mode:**
   ```powershell
   curl http://localhost:5000/api/system/status
   ```
   Result: `"mode": "offline"` ✅

2. **Switch to online mode:**
   - Edit `backend/.env` → `OFFLINE_MODE=false`
   - Restart the backend server
   - Wait for "✅ MongoDB connected" message

3. **Upload your offline changes:**
   ```powershell
   curl -X POST http://localhost:5000/api/system/sync-offline-to-mongo
   ```
   Result: 
   ```json
   {
     "success": true,
     "synced": {
       "users": 10,
       "schedules": 5
     }
   }
   ```

4. **Done!** Your 10 faculty members are now in MongoDB 🎉

---

## 🐛 Troubleshooting

### "MongoDB is not connected"
- Check that `OFFLINE_MODE=false` in `.env`
- Check that `MONGO_URI` is set correctly
- Make sure you have internet connection
- Restart the backend server

### "Database is locked"
- Stop all running services (backend, recognizer)
- Wait 5 seconds
- Try again

### "Sync completed with errors"
- Check the server logs for details
- Common causes: duplicate IDs, missing foreign keys
- You may need to manually fix data inconsistencies

---

## 📝 Summary

✅ **Schedule time fields now have default values** (7:00 AM - 8:00 AM)  
✅ **New sync tool** to upload offline changes to MongoDB  
✅ **Clear understanding** of how offline/online mode works  
✅ **Step-by-step guide** for switching between modes safely

**Remember:** Offline and online databases are separate. Always sync when switching modes!

