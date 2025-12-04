# How to Stop All Services

## Why You Need to Stop Services

The SQLite databases can only be written to by one process at a time. When you try to delete or modify data, you'll get "database is locked" errors if other services are running.

## Services That Lock the Database

1. **Face Recognition** (`recognizer_arcface.py`) - Uses `face_embeddings.db` and `face_detection_data.db`
2. **Backend Server** (`npm run dev`) - Uses `offline_data.db`
3. **Any database tools** (DB Browser for SQLite, etc.)

## How to Stop Services

### Step 1: Stop Face Recognition

1. Find the terminal/window running `recognizer_arcface.py`
2. Press **Ctrl+C** (hold Ctrl, press C)
3. Wait for it to say "Recognition loop ended"

### Step 2: Stop Backend Server

1. Find the terminal/window running `npm run dev`
2. Press **Ctrl+C** (hold Ctrl, press C)
3. Wait for it to stop

### Step 3: Wait

**IMPORTANT:** Wait 5-10 seconds for databases to fully unlock.

SQLite uses WAL (Write-Ahead Logging) which takes a moment to release locks.

### Step 4: Run Your Tool

Now you can safely run:
```powershell
py -3.13 offline_faculty_manager.py
```

## Visual Guide

```
Terminal 1: Face Recognition          Terminal 2: Backend
┌─────────────────────────┐          ┌─────────────────────────┐
│ [INFO] Processing...    │          │ Server running on 5000  │
│ [INFO] Face detected... │          │ Compiled successfully   │
│ ^C                      │          │ ^C                      │
│ Recognition loop ended  │          │ Server stopped          │
└─────────────────────────┘          └─────────────────────────┘
          ↓                                     ↓
    Wait 5 seconds                        Wait 5 seconds
          ↓                                     ↓
          └──────────────────┬──────────────────┘
                             ↓
                   Run offline_faculty_manager.py
```

## Still Getting "Database Locked" Error?

### Method 1: Check Running Processes

```powershell
# Check if Python processes are still running
Get-Process | Where-Object {$_.ProcessName -like "*python*"}

# If you see recognizer processes, kill them:
Stop-Process -Name python -Force
```

### Method 2: Check for WAL Files

```powershell
cd backend
dir *.db-wal
```

If you see `.db-wal` files, the database is still being accessed. Wait a bit longer.

### Method 3: Force Checkpoint (Last Resort)

```powershell
py -3.13 -c "import sqlite3; conn = sqlite3.connect('offline_data.db'); conn.execute('PRAGMA wal_checkpoint(TRUNCATE)'); conn.close(); print('Done')"
```

Run this for each database:
- `offline_data.db`
- `face_embeddings.db`
- `face_detection_data.db`

## Quick Checklist

Before running `offline_faculty_manager.py`:

- [ ] Stopped face recognition (Ctrl+C)
- [ ] Stopped backend server (Ctrl+C)
- [ ] Waited 5-10 seconds
- [ ] Closed any database browser tools
- [ ] No Python processes running (check Task Manager)

## Restart Services After

Once you're done with your changes:

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

## Common Mistakes

❌ **Pressing Ctrl+C but process still running**
   → Check Task Manager, kill python.exe manually

❌ **Not waiting long enough**
   → SQLite needs 5-10 seconds to release locks

❌ **Running script in same window as server**
   → Use a NEW terminal window

❌ **Database browser tool open**
   → Close DB Browser for SQLite if you have it open

## Pro Tip

Create separate terminal windows for each service:
```
Window 1: Backend Server (npm run dev)
Window 2: Face Recognition (py -3.13 recognizer_arcface.py)
Window 3: Tools & Commands (py -3.13 offline_faculty_manager.py)
```

This makes it easier to stop/start services without mixing up windows.

