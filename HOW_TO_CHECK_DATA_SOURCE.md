# How to Check Data Source (Local vs MongoDB)

## Quick Check Methods

### Method 1: Check Status Endpoint (Easiest)

```bash
curl http://localhost:5000/api/dean/data-source-status
```

Or open in browser:
```
http://localhost:5000/api/dean/data-source-status
```

**Response shows:**
- Local database status (exists, size, last modified)
- MongoDB connection status
- Current system mode (Local vs MongoDB)
- Recommendations

### Method 2: Check Python Recognizer Logs

Look for `[DATA SOURCE]` tags in the recognizer output:

#### ✅ Using Local Database (OFFLINE)
```
[DATA SOURCE] [LOCAL DB] Checking local SQLite database for InstructorName...
[DATA SOURCE] [LOCAL DB] [OK] Loaded X embeddings from LOCAL SQLite database (OFFLINE)
[DATA SOURCE] [LOCAL DB] [OK] InstructorName has class NOW (from LOCAL SQLite DB)
```

#### ✅ Using In-Memory Cache (OFFLINE)
```
[DATA SOURCE] [CACHE] Checking in-memory cache for InstructorName...
[DATA SOURCE] [CACHE] [OK] InstructorName has class NOW (from IN-MEMORY CACHE)
```

#### ⚠️ Using MongoDB Atlas (ONLINE)
```
[DATA SOURCE] [MONGODB API] Cache miss for InstructorName, fetching from MONGODB ATLAS via API...
[DATA SOURCE] [MONGODB API] [OK] InstructorName has class NOW (from MONGODB ATLAS)
```

#### 📁 Using File System (Processing Images)
```
[DATA SOURCE] [FILE SYSTEM] Loading embeddings from file system...
[DATA SOURCE] [FILE SYSTEM] [OK] Total faces loaded: X
```

### Method 3: Check Database Files

Check if local database files exist:

**Windows:**
```powershell
dir backend\face_detection_data.db
dir backend\face_embeddings.db
```

**Linux/Mac:**
```bash
ls -lh backend/face_detection_data.db
ls -lh backend/face_embeddings.db
```

**If files exist:** System is using local databases (offline mode)  
**If files don't exist:** System is using MongoDB (online mode)

### Method 4: Check Database Contents

**Using Python:**
```python
from local_database import get_stats
stats = get_stats()
print(f"Schedules: {stats['schedules']}")
print(f"Instructors: {stats['instructors']}")
print(f"Unsynced logs: {stats['unsynced_logs']}")
```

**Using SQLite Browser:**
1. Download: https://sqlitebrowser.org/
2. Open `backend/face_detection_data.db`
3. Check `schedules` table for data

## What Each Source Means

### [LOCAL DB] - Local SQLite Database
- **Status**: ✅ OFFLINE (works without internet)
- **Speed**: Fast (~0.01s)
- **Location**: `backend/face_detection_data.db`
- **When Used**: Primary source if database exists and has data

### [CACHE] - In-Memory Cache
- **Status**: ✅ OFFLINE (works without internet)
- **Speed**: Fastest (~0.001s)
- **Location**: RAM (temporary)
- **When Used**: After first load from local DB or API

### [MONGODB API] - MongoDB Atlas
- **Status**: ⚠️ ONLINE (requires internet)
- **Speed**: Slower (~0.5-2s)
- **Location**: Cloud (MongoDB Atlas)
- **When Used**: Fallback if local DB is empty or cache expired

### [FILE SYSTEM] - Image Processing
- **Status**: ✅ OFFLINE (works without internet)
- **Speed**: Slow (~30-60s first time)
- **Location**: `streaming-server/faces/` folder
- **When Used**: First time loading embeddings (then saves to SQLite)

## Priority Order

The system checks in this order:

1. **Local SQLite Database** ← Checks first (OFFLINE)
2. **In-Memory Cache** ← Checks second (OFFLINE)
3. **MongoDB Atlas API** ← Checks last (ONLINE - only if local DB empty)

## Example Log Output

### Scenario 1: Using Local Database (Offline)
```
[DATA SOURCE] [LOCAL DB] Checking local SQLite database for Smith, John...
[DATA SOURCE] [LOCAL DB] [OK] Smith, John has class NOW (from LOCAL SQLite DB): CS101 - Late: False
```
**Meaning**: ✅ Using local database, works offline

### Scenario 2: Using MongoDB (Online)
```
[DATA SOURCE] [LOCAL DB] No schedule found in local database for Smith, John, trying cache...
[DATA SOURCE] [CACHE] No schedule found in cache for Smith, John, trying API...
[DATA SOURCE] [MONGODB API] Cache miss for Smith, John, fetching from MONGODB ATLAS via API...
[DATA SOURCE] [MONGODB API] [OK] Smith, John has class NOW (from MONGODB ATLAS): CS101
```
**Meaning**: ⚠️ Using MongoDB, requires internet

### Scenario 3: Loading Embeddings
```
[DATA SOURCE] [LOCAL DB] Loading embeddings from LOCAL SQLite database...
[DATA SOURCE] [LOCAL DB] [OK] Loaded 50 embeddings from LOCAL SQLite database (OFFLINE)
```
**Meaning**: ✅ Using local database for face recognition

## Quick Test: Disconnect Internet

1. **Disconnect internet**
2. **Run face detection**
3. **Check logs**:
   - If you see `[LOCAL DB]` or `[CACHE]` → ✅ Working offline
   - If you see `[MONGODB API]` errors → ⚠️ Needs local DB setup

## Troubleshooting

### Always Using MongoDB?
- **Check**: Local database files exist?
- **Fix**: Sync schedules to local DB using `/sync-schedules-to-local` endpoint
- **Or**: Wait for automatic sync (happens when schedules are accessed)

### Local DB Not Working?
- **Check**: Database files exist and have data?
- **Check**: Python can access SQLite (no permission errors)?
- **Check**: Logs show `[LOCAL DB]` messages?

### Want to Force Local Mode?
1. Sync schedules: `POST /api/dean/sync-schedules-to-local`
2. Disconnect internet
3. System will use local databases only

## Summary

**Look for these in logs:**
- `[DATA SOURCE] [LOCAL DB]` = ✅ Using local (offline)
- `[DATA SOURCE] [CACHE]` = ✅ Using cache (offline)
- `[DATA SOURCE] [MONGODB API]` = ⚠️ Using MongoDB (online)
- `[DATA SOURCE] [FILE SYSTEM]` = 📁 Processing images (offline)

**Check status endpoint:**
```
GET http://localhost:5000/api/dean/data-source-status
```

