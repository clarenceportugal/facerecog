# 🔄 Complete Bidirectional Sync Guide

## Overview

Your EduVision system has **TWO databases** that can be synced in **BOTH directions**:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   MongoDB (Cloud)  ←──────────→  SQLite (Local)    │
│      Online DB                      Offline DB     │
│                                                     │
│   Requires Internet                No Internet     │
│   OFFLINE_MODE=false               OFFLINE_MODE=true│
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 🔽 Sync Direction 1: MongoDB → SQLite
**"Download data for offline use"**

### When to Use:
- ✅ Before going offline
- ✅ Want the latest online data available locally
- ✅ Setting up a new offline workstation
- ✅ After others made changes online

### What Gets Synced:
- ✅ All users (faculty, deans, program chairs)
- ✅ All schedules
- ✅ All colleges, courses, sections, rooms
- ✅ All semesters
- ✅ Attendance logs

### How to Sync:

#### **Option A: Using the Sync Tool (Recommended)** ⚡

```powershell
# 1. Make sure you're in ONLINE mode
# Edit backend/.env: OFFLINE_MODE=false

# 2. Start backend server
cd backend
npm run dev
# Wait for: ✅ MongoDB connected

# 3. Run sync tool
./TEST_SYNC.bat

# 4. Choose Option 1
# "1. Sync MongoDB → SQLite (download data for offline use)"

# 5. Done! ✅
```

#### **Option B: Using cURL** 🔧

```powershell
# Backend must be running in ONLINE mode
curl -X POST http://localhost:5000/api/system/sync-to-offline
```

#### **Option C: Automatic (First Time Only)** 🤖

The system **automatically** downloads data from MongoDB if SQLite is empty on startup.

---

## 🔼 Sync Direction 2: SQLite → MongoDB
**"Upload offline changes to the cloud"**

### When to Use:
- ✅ After working offline
- ✅ Want to backup local changes to the cloud
- ✅ Before switching workstations
- ✅ To share your offline work with others

### What Gets Synced:
- ✅ All users (faculty) you added/modified offline
- ✅ All schedules you added/modified offline
- ✅ Updates existing records or creates new ones

### How to Sync:

#### **Option A: Using the Sync Tool (Recommended)** ⚡

```powershell
# 1. Switch to ONLINE mode
# Edit backend/.env: OFFLINE_MODE=false

# 2. Start backend server
cd backend
npm run dev
# Wait for: ✅ MongoDB connected

# 3. Run sync tool
./TEST_SYNC.bat

# 4. Choose Option 2
# "2. Sync SQLite → MongoDB (upload offline changes)"

# 5. Done! ✅
```

#### **Option B: Using cURL** 🔧

```powershell
# Backend must be running in ONLINE mode
curl -X POST http://localhost:5000/api/system/sync-offline-to-mongo
```

---

## 📊 Sync Direction 3: Attendance Logs Only
**"Upload attendance records"**

### When to Use:
- ✅ Syncing just attendance logs (faster than full sync)
- ✅ After a period of offline attendance tracking

### How to Sync:

```powershell
# Backend must be running in ONLINE mode
./TEST_SYNC.bat
# Choose Option 3: Sync Attendance Logs → MongoDB
```

Or:

```powershell
curl -X POST http://localhost:5000/api/system/sync-logs-to-mongo
```

---

## 🎯 Common Scenarios

### **Scenario 1: Daily Offline Work, Weekly Cloud Backup**

```powershell
# Work offline all week
# backend/.env: OFFLINE_MODE=true
# Do your daily work...

# Friday afternoon - backup to cloud:
# 1. Edit backend/.env: OFFLINE_MODE=false
# 2. Restart backend
# 3. ./TEST_SYNC.bat → Option 2 (Upload to MongoDB)
# 4. Edit backend/.env: OFFLINE_MODE=true
# 5. Restart backend
# 6. Continue working offline
```

---

### **Scenario 2: Setting Up a New Computer**

```powershell
# 1. Install the system on new computer
# 2. Edit backend/.env: OFFLINE_MODE=false
# 3. Set MONGO_URI to your MongoDB connection string
# 4. Start backend
# 5. ./TEST_SYNC.bat → Option 1 (Download from MongoDB)
# 6. Switch to offline mode (OFFLINE_MODE=true)
# 7. Work offline!
```

---

### **Scenario 3: Multiple People Using the System**

**Person A (Main computer, online):**
```powershell
# Works online with MongoDB
# OFFLINE_MODE=false
# All changes go directly to MongoDB
```

**Person B (Laptop, offline):**
```powershell
# Morning: Download latest data
# ./TEST_SYNC.bat → Option 1 (MongoDB → SQLite)
# Switch to OFFLINE_MODE=true
# Work offline all day
# 
# Evening: Upload changes
# Switch to OFFLINE_MODE=false
# ./TEST_SYNC.bat → Option 2 (SQLite → MongoDB)
```

---

### **Scenario 4: Internet Went Down Mid-Day**

```powershell
# You were working online, internet dies
# No problem!

# 1. Make sure you have recent data:
#    Last time you synced MongoDB → SQLite
#    (or run sync before internet dies if you can)

# 2. Edit backend/.env: OFFLINE_MODE=true

# 3. Restart backend

# 4. Continue working! All data already in SQLite ✅

# 5. When internet is back:
#    - Switch OFFLINE_MODE=false
#    - Restart backend
#    - Sync offline changes: ./TEST_SYNC.bat → Option 2
```

---

## 🎨 Visual Workflow

```
┌─────────────────────────────────────────────────────┐
│           YOUR TYPICAL WORKFLOW                     │
└─────────────────────────────────────────────────────┘

    Start of Week (Monday)
           │
           ▼
    ┌──────────────────┐
    │  Online Mode     │  ← Download latest data
    │  OFFLINE_MODE=   │    from MongoDB
    │     false        │
    └──────────────────┘
           │
           │ Sync MongoDB → SQLite
           ▼
    ┌──────────────────┐
    │  Offline Mode    │  ← Work all week
    │  OFFLINE_MODE=   │    Add faculty, schedules
    │     true         │    Face detection, etc.
    └──────────────────┘
           │
           │ (Work offline all week)
           ▼
    ┌──────────────────┐
    │  Online Mode     │  ← Upload your changes
    │  OFFLINE_MODE=   │    to MongoDB
    │     false        │
    └──────────────────┘
           │
           │ Sync SQLite → MongoDB
           ▼
    ┌──────────────────┐
    │  Done!           │  ← Your offline work
    │  Data backed up  │    is now in the cloud
    └──────────────────┘
```

---

## 🛠️ Quick Reference Commands

### **Check Current Mode**
```powershell
curl http://localhost:5000/api/system/status
```

### **Download Data (MongoDB → SQLite)**
```powershell
# Prerequisites: OFFLINE_MODE=false, MongoDB connected
curl -X POST http://localhost:5000/api/system/sync-to-offline
```

### **Upload Data (SQLite → MongoDB)**
```powershell
# Prerequisites: OFFLINE_MODE=false, MongoDB connected
curl -X POST http://localhost:5000/api/system/sync-offline-to-mongo
```

### **Sync Logs Only**
```powershell
# Prerequisites: OFFLINE_MODE=false, MongoDB connected
curl -X POST http://localhost:5000/api/system/sync-logs-to-mongo
```

### **Interactive Sync Tool**
```powershell
cd backend
./TEST_SYNC.bat
```

---

## ⚠️ Important Notes

### **Before Syncing:**
1. ✅ **Always stop face recognition** before syncing to avoid database locks
2. ✅ **Check your mode** - Must be in online mode (`OFFLINE_MODE=false`) for syncing
3. ✅ **Verify MongoDB connection** - Look for "✅ MongoDB connected" in logs
4. ✅ **Have internet** - Obviously needed for online mode 😊

### **About Data Conflicts:**
- **Users/Schedules:** The sync **overwrites** MongoDB with SQLite data (or vice versa)
- **No merge logic:** If the same faculty was modified in both databases, the sync will overwrite with the source database's data
- **Best practice:** Only work in one mode at a time per computer

### **Sync Performance:**
- **Small dataset** (< 100 users, < 200 schedules): ~5 seconds
- **Medium dataset** (100-500 users, 200-1000 schedules): ~15 seconds
- **Large dataset** (500+ users, 1000+ schedules): ~30-60 seconds

---

## 🐛 Troubleshooting

### "MongoDB is not connected"
**Solution:**
- Check `OFFLINE_MODE=false` in `.env`
- Check `MONGO_URI` is set correctly
- Restart backend server
- Check internet connection

### "Database is locked"
**Solution:**
- Stop face recognition: `Ctrl+C` in the Python terminal
- Stop all services accessing the database
- Wait 5 seconds
- Try again

### "Sync completed with errors"
**Solution:**
- Check backend logs for specific errors
- Common issues:
  - Invalid ObjectIDs (data corruption)
  - Missing foreign keys (e.g., college_id doesn't exist)
  - Duplicate keys (shouldn't happen with INSERT OR REPLACE)
- Fix data manually if needed

### "Synced 0 users/schedules"
**Possible causes:**
- Source database is empty (check with sync status)
- Connection issue (check logs)
- Wrong database being accessed

---

## 📊 Check Sync Status

```powershell
# Get detailed stats about both databases
curl http://localhost:5000/api/system/sync-status
```

Response:
```json
{
  "offlineStats": {
    "users": 25,
    "schedules": 42,
    "colleges": 3,
    "courses": 8,
    "sections": 15,
    "rooms": 20,
    "semesters": 2,
    "logs": 156
  },
  "unsyncedLogs": 12
}
```

---

## 💡 Pro Tips

1. **Regular Backups:** Sync SQLite → MongoDB weekly, even if working offline
2. **Pre-download:** Before going somewhere without internet, sync MongoDB → SQLite
3. **Testing:** Use `TEST_SYNC.bat` - it's interactive and shows what's happening
4. **Logs:** Always check backend logs during sync for errors
5. **Mode Switching:** Always restart the backend after changing `OFFLINE_MODE`

---

## 🎉 Summary

| What You Want | Command |
|---------------|---------|
| **Download data for offline** | `./TEST_SYNC.bat` → Option 1 |
| **Upload offline changes** | `./TEST_SYNC.bat` → Option 2 |
| **Sync logs only** | `./TEST_SYNC.bat` → Option 3 |
| **Check status** | `curl http://localhost:5000/api/system/status` |

**Remember:** 
- 📥 MongoDB → SQLite = Download for offline
- 📤 SQLite → MongoDB = Upload your offline work

**You're all set for bidirectional sync! 🚀**

