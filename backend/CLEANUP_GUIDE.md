# Face Recognition Database Cleanup Guide

## Problem
After deleting a faculty member from the system, their face still appears during face detection. This is because the face data exists in multiple locations:

1. **SQLite Embeddings Database** (`face_embeddings.db`) - Stores face recognition vectors
2. **Face Detection Database** (`face_detection_data.db`) - Stores instructor information
3. **Offline User Database** (`offline_data.db`) - Stores user accounts
4. **Face Images Folder** (`streaming-server/faces/`) - Stores actual face images

## Quick Solution - Remove Daniel Masligat

### Option 1: Double-Click Batch File (Easiest)

1. Navigate to the `backend` folder
2. Double-click: **`remove_daniel_masligat.bat`**
3. Follow the prompts
4. Restart the face recognition service

### Option 2: Run Python Script

```powershell
cd backend
py -3.13 cleanup_person.py "daniel masligat"
```

### Option 3: Remove Someone Else

```powershell
cd backend
py -3.13 cleanup_person.py "FirstName LastName"
```

## Step-by-Step Instructions

### Step 1: Stop Face Recognition (if running)

If the face recognition service is running, stop it first:
- Go to the terminal running `recognizer_arcface.py`
- Press **Ctrl+C** to stop it

### Step 2: Run Cleanup

**Windows (PowerShell):**
```powershell
cd C:\Users\ALLEN\Downloads\backup_caps\new_backup2\eduvision\backend
py -3.13 cleanup_person.py "daniel masligat"
```

**The script will:**
1. Search all databases for "daniel masligat"
2. Show you what it found
3. Ask for confirmation before deleting
4. Remove all records if you confirm

### Step 3: Restart Face Recognition

After cleanup, restart the face recognition service:

```powershell
cd backend
py -3.13 recognizer_arcface.py
```

This will reload the cache without Daniel Masligat's data.

## What Gets Removed

The cleanup script removes:

✅ Face embeddings from `face_embeddings.db`  
✅ Instructor records from `face_detection_data.db`  
✅ User accounts from `offline_data.db`  
✅ Face image folders from `streaming-server/faces/`

## Manual Cleanup (Alternative Method)

If you prefer to do it manually:

### 1. Remove from Face Embeddings Database

```powershell
cd backend
sqlite3 face_embeddings.db
```

In SQLite prompt:
```sql
-- Check what exists
SELECT person_name, COUNT(*) FROM embeddings 
WHERE person_name LIKE '%daniel%masligat%' 
GROUP BY person_name;

-- Delete
DELETE FROM embeddings WHERE person_name LIKE '%daniel%masligat%';

-- Verify
SELECT person_name, COUNT(*) FROM embeddings GROUP BY person_name;

-- Exit
.quit
```

### 2. Remove from Face Detection Database

```powershell
sqlite3 face_detection_data.db
```

In SQLite prompt:
```sql
-- Check what exists
SELECT full_name FROM instructors 
WHERE full_name LIKE '%daniel%masligat%';

-- Delete
DELETE FROM instructors 
WHERE full_name LIKE '%daniel%masligat%';

-- Exit
.quit
```

### 3. Remove from Offline Database

```powershell
sqlite3 offline_data.db
```

In SQLite prompt:
```sql
-- Check what exists
SELECT first_name, last_name, username FROM users 
WHERE first_name LIKE '%daniel%' OR last_name LIKE '%masligat%';

-- Delete
DELETE FROM users 
WHERE first_name LIKE '%daniel%' OR last_name LIKE '%masligat%';

-- Verify it's gone
SELECT first_name, last_name, username FROM users 
WHERE first_name LIKE '%daniel%' OR last_name LIKE '%masligat%';

-- Exit
.quit
```

### 4. Remove Face Images Folder

Navigate to `streaming-server/faces/` and delete any folders containing "daniel" or "masligat" in the name.

Example folder names to look for:
- `Daniel_Masligat`
- `daniel_masligat`
- `Masligat_Daniel`

### 5. Restart Face Recognition

```powershell
cd backend
py -3.13 recognizer_arcface.py
```

## Verification

After cleanup and restart, verify the person is gone:

1. Start the face recognition service
2. Look at the console output
3. You should see: `[INFO] Total faces loaded: X` (where X doesn't include Daniel)
4. Test face detection - the person should no longer appear

## Troubleshooting

### "Person still appears after cleanup"

**Solution:** Make sure you restarted the face recognition service. The in-memory cache needs to be reloaded.

### "Cannot delete - database is locked"

**Solution:** Stop all services that use the database:
1. Stop `recognizer_arcface.py` (Ctrl+C)
2. Stop backend server if running
3. Run cleanup again
4. Restart services

### "Face folder not found"

**Solution:** The face images might be in a different location. Check:
- `streaming-server/faces/`
- `backend/faces/` (if it exists)
- Search your project for folders containing the person's name

### "SQLite command not found"

**Solution:** Install SQLite:

**Windows:**
1. Download from https://www.sqlite.org/download.html
2. Extract to a folder (e.g., `C:\sqlite`)
3. Add to PATH or use full path: `C:\sqlite\sqlite3.exe`

**Or use the Python script** (recommended):
```powershell
py -3.13 cleanup_person.py "daniel masligat"
```

## Prevent Future Issues

To avoid this problem in the future:

### When Deleting a Faculty Member:

1. **In the UI:** Delete the faculty member normally
2. **Run Cleanup Script:**
   ```powershell
   py -3.13 cleanup_person.py "FirstName LastName"
   ```
3. **Restart Services:**
   - Stop face recognition service (Ctrl+C)
   - Restart: `py -3.13 recognizer_arcface.py`

### Best Practice:

Create a "Delete Faculty" endpoint that handles all cleanup automatically:
- Deletes from MongoDB/SQLite users table
- Deletes from all local SQLite databases
- Removes face image folders
- Clears cache

## Quick Reference

| What | Command |
|------|---------|
| Remove Daniel Masligat | `py -3.13 cleanup_person.py "daniel masligat"` |
| Remove any person | `py -3.13 cleanup_person.py "FirstName LastName"` |
| Search only (no delete) | Edit script, comment out `cleanup_person()` |
| Restart face recognition | `py -3.13 recognizer_arcface.py` |

## Need Help?

If the cleanup script doesn't work, check:
1. Are you in the `backend` folder?
2. Is Python 3.13 installed? (`py -3.13 --version`)
3. Are the database files present? (`dir *.db`)
4. Did you stop the face recognition service?

For further assistance, check the error messages or contact support.

