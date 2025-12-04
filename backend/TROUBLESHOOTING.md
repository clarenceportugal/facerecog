# Troubleshooting Guide

## Problem: Cannot Add or Delete Faculty & Daniel Masligat Still Appears

This issue has multiple causes. Follow these steps in order:

---

## **Quick Fix (Do This First)**

### Step 1: Stop All Services

**Stop these if they're running:**

1. **Face Recognition** (recognizer_arcface.py)
   - Go to its terminal window
   - Press **Ctrl+C**

2. **Backend Server** (npm run dev)
   - Go to its terminal window
   - Press **Ctrl+C**

3. **Frontend Server** (if running)
   - Go to its terminal window
   - Press **Ctrl+C**

### Step 2: Run the Fix Script

Open PowerShell in the `backend` folder:

```powershell
cd backend
py -3.13 fix_database_issues.py
```

**In the menu, choose:**
1. Option **2** - Fix database issues
2. Option **3** - Nuclear delete Daniel Masligat
3. Option **6** - Exit

### Step 3: Check MongoDB/API

```powershell
py -3.13 test_api_endpoints.py
```

**Choose Option 1** to diagnose issues.

### Step 4: Restart Services

**Terminal 1 - Backend:**
```powershell
cd backend
npm run dev
```

**Terminal 2 - Face Recognition:**
```powershell
cd backend
py -3.13 recognizer_arcface.py
```

### Step 5: Test

Open your browser and try:
- ✅ Add a faculty member
- ✅ Delete a faculty member
- ✅ Check if Daniel Masligat appears in face detection

---

## **Root Causes**

### Cause 1: Database is Locked

**Symptoms:**
- Cannot add/delete faculty
- "Database is locked" errors in console

**Why:** SQLite databases are locked when:
- Face recognition service is reading them
- Backend is writing to them
- Previous process didn't close cleanly

**Fix:**
```powershell
# Stop all services first
py -3.13 fix_database_issues.py
# Choose Option 2: Fix database issues
```

### Cause 2: Stale Cache in Face Recognition

**Symptoms:**
- Deleted person still appears
- Face recognition shows old names

**Why:** The face recognition service loads embeddings into memory at startup and doesn't reload until restarted.

**Fix:**
```powershell
# 1. Stop face recognition (Ctrl+C)
# 2. Delete from databases
py -3.13 fix_database_issues.py
# Choose Option 3: Nuclear delete
# 3. Restart face recognition
py -3.13 recognizer_arcface.py
```

### Cause 3: Data in Multiple Places

**Symptoms:**
- Deleted from UI but still appears in face detection

**Why:** Data exists in multiple locations:
- MongoDB (online database)
- SQLite databases (offline cache)
- Face image folders

**Fix:**
```powershell
# Delete from ALL locations
py -3.13 fix_database_issues.py
# Choose Option 3: Nuclear delete Daniel Masligat
```

### Cause 4: MongoDB Not Connected

**Symptoms:**
- Cannot add/delete faculty
- API returns errors
- Backend logs show MongoDB errors

**Why:**
- MongoDB service not running
- Connection string wrong in .env
- System in offline mode but trying to use MongoDB

**Fix:**

**Option A: Start MongoDB**
```powershell
# Check if MongoDB is running
Get-Service MongoDB

# If not, start it
Start-Service MongoDB

# Or run manually
mongod --dbpath C:\data\db
```

**Option B: Switch to Offline Mode**

Edit `backend/.env`:
```
OFFLINE_MODE=true
```

Then restart backend:
```powershell
cd backend
npm run dev
```

### Cause 5: Offline Mode Conflicts

**Symptoms:**
- Add/delete works but face detection doesn't update
- Data in MongoDB but not in SQLite

**Why:** In offline mode, changes go to SQLite only. Face recognition uses SQLite.

**Fix:**

Make sure both are using the same mode:

**Check backend mode:**
- Look at backend console when starting
- Should say: "Running in OFFLINE MODE" or "Running in ONLINE MODE"

**Check Python mode:**
- Look at recognizer_arcface.py console
- Should say: "System Mode: OFFLINE" or "System Mode: ONLINE"

**To sync:**
```powershell
# If you're in ONLINE mode, sync MongoDB to SQLite
# (Call sync endpoint from frontend or use API)

# If you're in OFFLINE mode, make sure .env has:
# OFFLINE_MODE=true
```

---

## **Diagnostic Commands**

### Check Database Lock
```powershell
py -3.13 fix_database_issues.py
# Choose Option 1: Run diagnostics
```

### Check API Connection
```powershell
py -3.13 test_api_endpoints.py
# Choose Option 1: Diagnose add/delete issues
```

### List All People in Databases
```powershell
py -3.13 fix_database_issues.py
# Choose Option 5: List all people
```

### Search for Daniel Masligat
```powershell
# In SQLite databases
py -3.13 fix_database_issues.py
# Choose Option 5

# In MongoDB (via API)
py -3.13 test_api_endpoints.py
# Choose Option 2
```

---

## **Manual Fixes**

### Manually Delete from SQLite

```powershell
# Open database
sqlite3 offline_data.db

# Check if Daniel exists
SELECT first_name, last_name, id FROM users 
WHERE first_name LIKE '%daniel%' OR last_name LIKE '%masligat%';

# Delete if found
DELETE FROM users 
WHERE first_name LIKE '%daniel%' OR last_name LIKE '%masligat%';

# Force save
PRAGMA wal_checkpoint(TRUNCATE);

# Exit
.quit
```

Repeat for:
- `face_embeddings.db` (table: `embeddings`)
- `face_detection_data.db` (table: `instructors`)

### Manually Delete from MongoDB

```powershell
# Connect to MongoDB
mongo

# Use database
use eduvision

# Find Daniel
db.users.find({
  $or: [
    {first_name: /daniel/i},
    {last_name: /masligat/i}
  ]
})

# Delete (replace ID with actual ID from above)
db.users.deleteOne({_id: ObjectId("actual_id_here")})

# Exit
exit
```

### Delete Face Images

Navigate to: `streaming-server/faces/`

Look for folders containing:
- `Daniel_Masligat`
- `daniel_masligat`
- `Masligat_Daniel`

Delete these folders manually.

---

## **Prevention**

To prevent this issue in the future:

### When Deleting Faculty:

1. **Use the cleanup script:**
   ```powershell
   py -3.13 cleanup_person.py "FirstName LastName"
   ```

2. **Then restart face recognition:**
   ```powershell
   py -3.13 recognizer_arcface.py
   ```

### Best Practice:

Add a "Deep Delete" button in the UI that:
1. Deletes from MongoDB
2. Deletes from SQLite databases
3. Deletes face image folders
4. Clears cache

---

## **Still Not Working?**

### Last Resort: Nuclear Option

This will delete ALL faculty data and start fresh:

**⚠️ WARNING: This deletes ALL faculty members!**

```powershell
# Backup first
copy offline_data.db offline_data.db.backup
copy face_embeddings.db face_embeddings.db.backup

# Delete all data
sqlite3 offline_data.db "DELETE FROM users WHERE role='instructor';"
sqlite3 face_embeddings.db "DELETE FROM embeddings;"
sqlite3 face_detection_data.db "DELETE FROM instructors;"

# Restart services
```

Then re-add faculty members one by one.

---

## **Quick Reference**

| Problem | Quick Fix |
|---------|-----------|
| Database locked | Stop services → Run fix script → Restart |
| Deleted person still appears | Stop face recognition → Delete → Restart |
| Cannot add/delete | Check MongoDB → Check API → Check .env |
| Face detection not updating | Delete from SQLite → Restart face recognition |
| Data inconsistent | Sync MongoDB to SQLite |

---

## **Get More Help**

If none of these work:

1. **Check logs:**
   - Backend console
   - Face recognition console
   - Browser console (F12)

2. **Share error messages:**
   - Screenshot of errors
   - Copy/paste full error text

3. **Check system mode:**
   - Backend: Should show "OFFLINE MODE" or "ONLINE MODE" on startup
   - Python: Should show mode in console

4. **Verify databases exist:**
   ```powershell
   dir backend\*.db
   ```
   Should show:
   - `offline_data.db`
   - `face_embeddings.db`
   - `face_detection_data.db`

