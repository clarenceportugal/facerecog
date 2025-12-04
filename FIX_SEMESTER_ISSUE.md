# 🔧 Fix: No Semesters in Offline Mode

## ❌ **Problem**

When adding a manual schedule in offline mode, the semester dropdown is empty.

**Root Cause:** Your offline SQLite database has no semesters in it!

---

## ✅ **Solution: Add Default Semesters**

### **Method 1: Run the Auto-Setup Script (Easiest)** ⚡

```powershell
cd backend
./ADD_SEMESTERS.bat
```

This will add:
- **Previous year:** 1st & 2nd Semester
- **Current year:** 1st & 2nd Semester (✅ 1st marked as ACTIVE)
- **Next year:** 1st Semester

---

### **Method 2: Sync from MongoDB (If You Have Online Data)**

If you have semesters in MongoDB, sync them:

```powershell
# 1. Switch to online mode
# Edit backend/.env: OFFLINE_MODE=false

# 2. Restart backend
cd backend
npm run dev

# 3. Sync MongoDB → SQLite
./TEST_SYNC.bat
# Choose option 1: Sync MongoDB → SQLite

# 4. Switch back to offline mode
# Edit backend/.env: OFFLINE_MODE=true

# 5. Restart backend
npm run dev
```

---

### **Method 3: Add Semesters Manually via Web Interface**

1. **Create a semester management page** (if you have one)
2. **Or add directly to database:**

```powershell
cd backend
sqlite3 offline_data.db
```

```sql
-- Add 1st Semester 2024-2025 (ACTIVE)
INSERT INTO semesters (id, semester_name, academic_year, start_date, end_date, is_active)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  '1st Semester',
  '2024-2025',
  '2024-08-01',
  '2024-12-31',
  1
);

-- Add 2nd Semester 2024-2025
INSERT INTO semesters (id, semester_name, academic_year, start_date, end_date, is_active)
VALUES (
  '550e8400-e29b-41d4-a716-446655440001',
  '2nd Semester',
  '2024-2025',
  '2025-01-01',
  '2025-05-31',
  0
);

-- Exit
.exit
```

---

## 🧪 **Verify Semesters Are Added**

### **Check via Backend Logs**

Restart your backend and watch for:

```
[DB] Found 5 semesters in offline database
```

---

### **Check via API**

```powershell
curl http://localhost:5000/api/auth/all-semesters
```

Should return:
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "_id": "...",
      "semesterName": "1st Semester",
      "academicYear": "2024-2025",
      "startDate": "2024-08-01",
      "endDate": "2024-12-31",
      "isActive": true
    },
    ...
  ]
}
```

---

### **Check via Web Interface**

1. Open "Faculty Info"
2. Click a faculty member
3. Click "Add Schedule Manually"
4. **Semester dropdown should now show options!** ✅

---

## 📋 **What the Script Adds**

| Semester | Academic Year | Start Date | End Date | Active |
|----------|--------------|------------|----------|--------|
| 1st Semester | 2023-2024 | 2023-08-01 | 2023-12-31 | ❌ |
| 2nd Semester | 2023-2024 | 2024-01-01 | 2024-05-31 | ❌ |
| 1st Semester | 2024-2025 | 2024-08-01 | 2024-12-31 | ✅ |
| 2nd Semester | 2024-2025 | 2025-01-01 | 2025-05-31 | ❌ |
| 1st Semester | 2025-2026 | 2025-08-01 | 2025-12-31 | ❌ |

---

## 🎯 **Quick Fix (TL;DR)**

```powershell
cd backend
./ADD_SEMESTERS.bat
```

Then refresh your web page and try adding a schedule again! ✅

---

## 📝 **Why This Happened**

When you created the system:
1. You added users, schedules, rooms, etc.
2. But **semesters** were never added to the offline database
3. The semester dropdown fetches from: `/api/auth/all-semesters`
4. That endpoint works offline, but returns empty array because no semesters in SQLite

---

## 🔄 **Preventing This in the Future**

**When syncing MongoDB → SQLite:**
- The sync includes semesters (line 133-155 in syncService.ts)
- But if you never synced, or if MongoDB also has no semesters, SQLite will be empty

**Solution:** Always run `ADD_SEMESTERS.bat` on new installations!

---

## ⚠️ **Important Note**

The `/api/auth/all-semesters` endpoint **DOES work in offline mode**:

```typescript
// backend/src/routes/authRoutes.ts (line 1370-1386)
router.get("/all-semesters", async (req: Request, res: Response) => {
  try {
    // ✅ Uses data service (works both online and offline)
    const semesters = await SemesterService.findAll();
    res.status(200).json({
      success: true,
      count: semesters.length,
      data: semesters,  // ← Returns semesters from SQLite in offline mode
    });
  } catch (error) {
    // ...
  }
});
```

The problem isn't the endpoint - it's that **your database is empty**!

---

## 🎉 **Summary**

✅ **Semester endpoint works in offline mode**  
❌ **But your offline database has no semesters**  
✅ **Solution: Run `ADD_SEMESTERS.bat`**  
✅ **Alternative: Sync from MongoDB if you have online data**  

**Run the script now:**

```powershell
cd backend
./ADD_SEMESTERS.bat
```

Then try adding a schedule again - the semester dropdown will work! 🚀

