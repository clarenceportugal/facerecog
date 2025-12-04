# EduVision - Offline Mode Complete Guide

## 🎯 What Was Fixed

### 1. ✅ Manual Schedule Modal
- **Problem:** No semester, start time, end time showing
- **Cause:** Hardcoded render.com URLs (doesn't work offline)
- **Fixed:** Now uses `API_BASE_URL` (works offline)

### 2. ✅ Faculty Add/Delete
- **Problem:** Cannot add or delete faculty in offline mode
- **Cause:** Hardcoded render.com URLs
- **Fixed:** Now uses `API_BASE_URL` (works offline)

### 3. ✅ Daniel Masligat Issue
- **Problem:** Still appears in face detection after deletion
- **Tools Created:** `offline_faculty_manager.py` to clean all databases

---

## 🚀 Quick Start

### Option 1: One-Click Test (Recommended)

```powershell
# 1. Restart frontend (to apply fixes)
cd frontend
npm run dev

# 2. Test in browser
# Go to http://localhost:5173
# Try adding a faculty member
# Try deleting a faculty member
# Try adding a manual schedule
```

### Option 2: Full Clean Restart

```powershell
# Stop all services first (Ctrl+C in each window)

# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Face Recognition
cd backend
py -3.13 recognizer_arcface.py

# Terminal 3: Frontend
cd frontend
npm run dev
```

---

## 📋 Testing Checklist

### Test 1: Add Faculty (Offline)
- [ ] Go to Faculty Info page
- [ ] Click "+ Add" button
- [ ] Fill in faculty details
- [ ] Click "Add"
- [ ] ✓ Should succeed with success message

### Test 2: Delete Faculty (Offline)
- [ ] Find a faculty in the list
- [ ] Click delete icon
- [ ] Confirm deletion
- [ ] ✓ Should succeed with success message

### Test 3: Manual Schedule Modal
- [ ] Go to schedule page
- [ ] Click "Add Manual Schedule"
- [ ] ✓ Semester dropdown should have options
- [ ] ✓ Start Time field should be visible
- [ ] ✓ End Time field should be visible
- [ ] ✓ Room dropdown should have options
- [ ] ✓ Section dropdown should have options

### Test 4: Offline Mode
- [ ] Disconnect from internet
- [ ] Try adding faculty
- [ ] Try deleting faculty
- [ ] Try adding schedule
- [ ] ✓ All should work without internet!

---

## 🔧 Tools Created

### 1. Offline Faculty Manager
**Location:** `backend/offline_faculty_manager.py`

**Features:**
- ✅ List all faculty
- ✅ Add new faculty
- ✅ Delete faculty
- ✅ Fix Daniel Masligat issue
- ✅ Search faculty

**Usage:**
```powershell
cd backend
py -3.13 offline_faculty_manager.py
```

### 2. Database Fix Utility
**Location:** `backend/fix_database_issues.py`

**Features:**
- ✅ Diagnose database issues
- ✅ Fix database locks
- ✅ Checkpoint WAL files
- ✅ Vacuum databases

**Usage:**
```powershell
cd backend
py -3.13 fix_database_issues.py
```

### 3. API Endpoint Tester
**Location:** `backend/test_api_endpoints.py`

**Features:**
- ✅ Test backend connection
- ✅ Test MongoDB connection
- ✅ Test faculty endpoints
- ✅ Search for specific faculty

**Usage:**
```powershell
cd backend
py -3.13 test_api_endpoints.py
```

---

## 📚 Documentation Created

1. **OFFLINE_MODE_FIXES_APPLIED.md** - What was fixed and how to test
2. **OFFLINE_MODE_GUIDE.md** - Complete offline mode guide
3. **TROUBLESHOOTING.md** - Troubleshooting all issues
4. **STOP_ALL_SERVICES.md** - How to properly stop services
5. **CLEANUP_GUIDE.md** - How to clean up deleted faculty

---

## ⚠️ Important Notes

### After Adding/Deleting Faculty:

**Always restart face recognition:**
```powershell
# Stop face recognition (Ctrl+C)
# Then restart:
py -3.13 recognizer_arcface.py
```

This is required because face recognition loads data into memory cache at startup.

### If Database is Locked:

1. Stop ALL services (face recognition + backend)
2. Wait 10 seconds
3. Run database fix tool
4. Restart services

### If Frontend Changes Don't Apply:

```powershell
# Hard refresh in browser
Ctrl + Shift + R

# Or restart frontend dev server
cd frontend
# Ctrl+C to stop
npm run dev
```

---

## 🔍 Verify Offline Mode

### Check Backend Mode:
Look for this when backend starts:
```
============================================================
📊 System Mode: Offline Mode (Local SQLite only)
============================================================
```

### Check Python Mode:
Look for this when recognizer starts:
```
[INFO] System Mode: OFFLINE (Local SQLite only)
```

### Check Frontend API:
Open `frontend/src/utils/api.ts`:
```typescript
export const API_BASE_URL = "http://localhost:5000";
```

---

## 🐛 Common Issues

### Issue: "Cannot add faculty"

**Solution:**
1. Check backend is running
2. Check backend shows "OFFLINE MODE"
3. Restart frontend
4. Check browser console (F12) for errors

### Issue: "Semester dropdown empty"

**Solution:**
1. Check if semesters exist in database
2. Open browser console (F12)
3. Look for API errors
4. Verify endpoint: `http://localhost:5000/api/auth/all-semesters`

### Issue: "Daniel still appears"

**Solution:**
```powershell
# 1. Stop face recognition
# 2. Run cleanup
cd backend
py -3.13 offline_faculty_manager.py
# Choose option 4

# 3. Restart face recognition
py -3.13 recognizer_arcface.py
```

---

## 📞 Quick Commands

| Task | Command |
|------|---------|
| Manage faculty (offline) | `py -3.13 offline_faculty_manager.py` |
| Fix database issues | `py -3.13 fix_database_issues.py` |
| Test API endpoints | `py -3.13 test_api_endpoints.py` |
| Fix Daniel Masligat | `py -3.13 offline_faculty_manager.py` → Option 4 |
| Restart backend | `cd backend; npm run dev` |
| Restart frontend | `cd frontend; npm run dev` |
| Restart face recognition | `py -3.13 recognizer_arcface.py` |

---

## ✅ Success Indicators

You'll know everything is working when:

1. ✅ Backend console shows "OFFLINE MODE"
2. ✅ Can add faculty without internet
3. ✅ Can delete faculty without internet
4. ✅ Manual schedule modal shows all fields
5. ✅ Face recognition doesn't show deleted people
6. ✅ Browser console (F12) shows no errors

---

## 🎯 Next Steps

1. **Restart frontend:** Apply the code changes
2. **Test all features:** Use the testing checklist above
3. **Report issues:** If something doesn't work, check browser console
4. **Fix other pages:** 14 more files might need the same URL fix

---

## 📦 Files Changed

**Frontend:**
1. `frontend/src/components/AddManualScheduleModal.tsx`
2. `frontend/src/pages/programchairperson/FacultyInfo.tsx`

**Backend (New Tools):**
3. `backend/offline_faculty_manager.py`
4. `backend/fix_database_issues.py`
5. `backend/test_api_endpoints.py`
6. `backend/offline_requirements.txt`
7. `backend/install_offline_tools.bat`

**Documentation:**
8. Multiple `.md` guides created

---

## 🚦 Status: READY FOR TESTING

All fixes have been applied. You need to:
1. ✅ Restart frontend dev server
2. ✅ Test add/delete faculty
3. ✅ Test manual schedule modal
4. ✅ Test offline mode (disconnect internet)

**Everything should work now!** 🎉

