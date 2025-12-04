

# Offline Mode Guide - Faculty Management

## Overview

Your system is now running in **OFFLINE MODE**, which means:
- ✅ All data is stored in **SQLite databases** (no MongoDB needed)
- ✅ Works **without internet connection**
- ✅ Add/Delete faculty works locally
- ✅ Face recognition works locally
- ✅ Attendance logging works locally

## Quick Start

### **Fix Daniel Masligat Issue + Manage Faculty**

Double-click: **`MANAGE_FACULTY_OFFLINE.bat`**

Or run:
```powershell
cd backend
py -3.13 offline_faculty_manager.py
```

This tool lets you:
1. ✅ List all faculty members
2. ✅ Add new faculty members
3. ✅ Delete faculty members
4. ✅ Fix Daniel Masligat issue
5. ✅ Search for faculty

---

## How Offline Mode Works

### Data Storage Locations

```
offline_data.db           ← Users, colleges, courses (main database)
face_embeddings.db        ← Face recognition vectors
face_detection_data.db    ← Schedules, instructors
streaming-server/faces/   ← Face images
```

### Add Faculty (Offline)

**Option 1: Use UI** (Recommended)
1. Open browser → EduVision
2. Login as dean/admin
3. Go to "Manage Faculty"
4. Click "Add Faculty"
5. Fill in details and submit

**Option 2: Use Command Line Tool**
```powershell
cd backend
py -3.13 offline_faculty_manager.py
# Choose Option 2: Add new faculty member
```

### Delete Faculty (Offline)

**Option 1: Use UI** (Recommended)
1. Open browser → EduVision
2. Login as dean/admin
3. Go to "Manage Faculty"
4. Find faculty member
5. Click delete icon

**Option 2: Use Command Line Tool**
```powershell
cd backend
py -3.13 offline_faculty_manager.py
# Choose Option 3: Delete faculty member
```

**⚠️ IMPORTANT After Delete:**
```powershell
# Stop face recognition (Ctrl+C), then restart:
py -3.13 recognizer_arcface.py
```

---

## Fix Daniel Masligat Issue

### Problem
Daniel Masligat appears in face detection even though you deleted him.

### Solution

**Quick Fix:**
```powershell
cd backend
py -3.13 offline_faculty_manager.py
# Choose Option 4: Fix Daniel Masligat issue
```

This will:
1. ✅ Delete from `offline_data.db`
2. ✅ Delete from `face_embeddings.db`
3. ✅ Delete from `face_detection_data.db`
4. ✅ Delete face image folders

**Then restart face recognition:**
```powershell
py -3.13 recognizer_arcface.py
```

---

## Troubleshooting

### "Cannot add/delete faculty"

**Cause:** Backend not running or database locked

**Fix:**
1. Check if backend is running: `npm run dev`
2. Check if in offline mode: Look for "OFFLINE MODE" in backend console
3. Stop face recognition (Ctrl+C) - it might be locking the database
4. Try again

### "Faculty added but not appearing in face detection"

**Cause:** Face recognition cache not updated

**Fix:**
```powershell
# Stop face recognition (Ctrl+C)
# Restart it:
py -3.13 recognizer_arcface.py
```

### "Database is locked"

**Cause:** Multiple processes accessing the same database

**Fix:**
1. Stop ALL services:
   - Face recognition (Ctrl+C)
   - Backend (Ctrl+C)
2. Run fix script:
   ```powershell
   py -3.13 fix_database_issues.py
   # Choose Option 2: Fix database issues
   ```
3. Restart services

### "Daniel still appears after deletion"

**Cause:** Face recognition hasn't reloaded

**Fix:**
```powershell
# 1. Delete using tool
py -3.13 offline_faculty_manager.py
# Option 4: Fix Daniel Masligat

# 2. MUST restart face recognition
py -3.13 recognizer_arcface.py
```

### "Added faculty but can't see in UI"

**Cause:** Frontend cache or page not refreshed

**Fix:**
1. Refresh browser (F5)
2. Clear browser cache (Ctrl+Shift+R)
3. Check backend console for errors

---

## Verify Offline Mode

### Check Backend Mode

Start backend and look for:
```
============================================================
🚀 Starting EduVision Server
📊 System Mode: Offline Mode (Local SQLite only)
============================================================
```

### Check Python Face Recognition Mode

Start recognizer and look for:
```
============================================================
[INFO] Starting EduVision Face Recognition System
[INFO] System Mode: OFFLINE (Local SQLite only)
============================================================
```

### Test Offline Mode

1. **Disconnect internet** (turn off WiFi)
2. **Add a faculty member** - should work
3. **Delete a faculty member** - should work
4. **Face detection** - should work
5. **Attendance logging** - should work (queued locally)

---

## Database Operations

### List All Faculty
```powershell
py -3.13 offline_faculty_manager.py
# Option 1: List all faculty members
```

### Search for Faculty
```powershell
py -3.13 offline_faculty_manager.py
# Option 5: Search for faculty member
# Enter name to search
```

### Check Database Stats
```powershell
py -3.13 -c "
from services.offlineDatabase import getDbStats
stats = getDbStats()
print('Users:', stats['users'])
print('Schedules:', stats['schedules'])
print('Logs:', stats['logs'])
"
```

### Backup Databases
```powershell
# Backup all SQLite databases
copy offline_data.db offline_data.db.backup
copy face_embeddings.db face_embeddings.db.backup
copy face_detection_data.db face_detection_data.db.backup

# With timestamp
$date = Get-Date -Format "yyyyMMdd_HHmmss"
copy offline_data.db "offline_data_$date.db"
```

### Restore Databases
```powershell
# Restore from backup
copy offline_data.db.backup offline_data.db
copy face_embeddings.db.backup face_embeddings.db
copy face_detection_data.db.backup face_detection_data.db
```

---

## Best Practices

### When Adding Faculty:
1. ✅ Use the UI or offline faculty manager
2. ✅ Fill in all required fields
3. ✅ Verify faculty appears in list
4. ✅ Register their face (if using face recognition)
5. ✅ Restart face recognition to load new embeddings

### When Deleting Faculty:
1. ✅ Delete using UI or offline faculty manager
2. ✅ **Always restart face recognition** after deletion
3. ✅ Verify deletion by checking:
   - UI faculty list
   - Face recognition console (should show fewer faces)
   - Face detection (deleted person should not appear)

### Regular Maintenance:
1. ✅ Backup databases weekly
2. ✅ Clear old attendance logs (older than 1 year)
3. ✅ Verify face embeddings are up to date
4. ✅ Test add/delete operations monthly

---

## API Endpoints (Offline Mode)

All these work in offline mode:

```
POST   /api/auth/faculty          - Create faculty
DELETE /api/auth/faculty/:id      - Delete faculty
GET    /api/auth/get-current-schedule  - Get schedule
POST   /api/auth/log-time-in      - Log attendance
POST   /api/auth/log-time-out     - Log time out
GET    /api/superadmin/instructorinfo-only  - List instructors
```

---

## Switching Between Online/Offline Mode

### To Switch to OFFLINE Mode:

1. Edit `backend/.env`:
   ```
   OFFLINE_MODE=true
   ```

2. Restart backend:
   ```powershell
   npm run dev
   ```

3. Restart face recognition:
   ```powershell
   py -3.13 recognizer_arcface.py
   ```

### To Switch to ONLINE Mode:

1. Make sure MongoDB is running:
   ```powershell
   mongod --dbpath C:\data\db
   ```

2. Edit `backend/.env`:
   ```
   OFFLINE_MODE=false
   MONGO_URI=mongodb://localhost:27017/eduvision
   ```

3. Restart backend and face recognition

---

## Quick Reference

| Task | Command |
|------|---------|
| Manage faculty (add/delete) | `py -3.13 offline_faculty_manager.py` |
| Fix Daniel Masligat | `py -3.13 offline_faculty_manager.py` → Option 4 |
| Fix database issues | `py -3.13 fix_database_issues.py` |
| Test API endpoints | `py -3.13 test_api_endpoints.py` |
| List all faculty | `py -3.13 offline_faculty_manager.py` → Option 1 |
| Restart face recognition | Stop (Ctrl+C), then `py -3.13 recognizer_arcface.py` |

---

## Support

If you encounter issues:

1. **Check database exists:**
   ```powershell
   dir backend\*.db
   ```
   Should show: `offline_data.db`, `face_embeddings.db`, `face_detection_data.db`

2. **Check system mode:**
   - Backend console should say "OFFLINE MODE"
   - Face recognition should say "System Mode: OFFLINE"

3. **Run diagnostics:**
   ```powershell
   py -3.13 fix_database_issues.py
   # Option 1: Run diagnostics
   ```

4. **Check logs:**
   - Backend console logs
   - Face recognition console logs
   - Browser console (F12)

---

## Summary

✅ **Add Faculty:** Use UI or `offline_faculty_manager.py`  
✅ **Delete Faculty:** Use UI or tool, then **restart face recognition**  
✅ **Fix Daniel:** Run `offline_faculty_manager.py` → Option 4  
✅ **After any change:** Restart face recognition to reload cache  
✅ **Backup:** Copy `*.db` files regularly  

**Most Important:** **ALWAYS restart face recognition after adding/deleting faculty!**

