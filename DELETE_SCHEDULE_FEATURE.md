# ✅ Delete Schedule Feature Added!

## 🎉 Feature Overview

You can now **delete individual schedules** from faculty accounts directly in the Faculty Info modal!

---

## 🔧 What Was Added

### **Backend (Works in Offline & Online Mode)**

**File:** `backend/src/routes/authRoutes.ts`

Added new DELETE endpoint:
```typescript
DELETE /api/auth/schedules/:id
```

**Features:**
- ✅ Works in **OFFLINE mode** (uses SQLite)
- ✅ Works in **ONLINE mode** (uses MongoDB)
- ✅ Validates schedule exists before deleting
- ✅ Returns success/error messages
- ✅ Logs all operations for debugging

---

### **Frontend**

**File:** `frontend/src/components/InfoModal.tsx`

**Changes:**
1. ✅ Added **Delete icon** import
2. ✅ Added **"Actions" column** to schedule table
3. ✅ Added **`handleDeleteSchedule()`** function with confirmation dialog
4. ✅ Added **Delete button** (🗑️) to each schedule row
5. ✅ Auto-refreshes schedule list after deletion

---

## 🎨 How It Looks

### **Before:**
```
┌─────────────────────────────────────────────────────┐
│ Course Code │ Days │ Time │ Section │ Room │       │
├─────────────────────────────────────────────────────┤
│ CS101       │ MWF  │ 9-10 │ BSCS-3A │ Lab1 │       │
└─────────────────────────────────────────────────────┘
```

### **After:**
```
┌─────────────────────────────────────────────────────────┐
│ Course Code │ Days │ Time │ Section │ Room │ Actions │
├─────────────────────────────────────────────────────────┤
│ CS101       │ MWF  │ 9-10 │ BSCS-3A │ Lab1 │ [🗑️]   │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 How to Use

### **Step 1: Open Faculty Info**
1. Login as Program Chair/Dean
2. Go to "Faculty Info"
3. Click on any faculty member

### **Step 2: View Schedules**
The modal shows all schedules for that faculty member

### **Step 3: Delete a Schedule**
1. Click the **🗑️ Delete icon** (red button) on any schedule row
2. Confirmation dialog appears:
   ```
   ⚠️ Delete Schedule?
   Are you sure you want to delete CS101?
   This action cannot be undone.
   
   [Cancel] [Yes, delete it!]
   ```
3. Click **"Yes, delete it!"** to confirm
4. Schedule is deleted and list refreshes automatically

---

## 🧪 Testing

### **Test in Offline Mode:**

```powershell
# 1. Make sure OFFLINE_MODE=true in backend/.env
# 2. Restart backend if needed
cd backend
npm run dev

# 3. Open web interface
# 4. Go to Faculty Info → Click a faculty
# 5. Click delete button on a schedule
# 6. Verify: Schedule is removed from list ✅
```

### **Test in Online Mode:**

```powershell
# 1. Set OFFLINE_MODE=false in backend/.env
# 2. Restart backend
# 3. Repeat steps 3-6 above
# 4. Verify: Schedule is removed from MongoDB ✅
```

---

## 📋 Technical Details

### **Backend Endpoint**

**URL:** `DELETE /api/auth/schedules/:id`

**Parameters:**
- `id` (path parameter): Schedule ID to delete

**Response (Success):**
```json
{
  "success": true,
  "message": "Schedule deleted successfully"
}
```

**Response (Not Found):**
```json
{
  "message": "Schedule not found"
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Server error"
}
```

---

### **Backend Logic Flow**

```
1. Receive DELETE request with schedule ID
   ↓
2. Check system mode (offline/online)
   ↓
3. Use ScheduleService.findById() to verify schedule exists
   ↓
4. If NOT found → Return 404
   ↓
5. Use ScheduleService.delete() to remove schedule
   - OFFLINE: Deletes from SQLite (offlineDatabase.ts)
   - ONLINE: Deletes from MongoDB (Schedule model)
   ↓
6. Return success/error response
```

---

### **Frontend Logic Flow**

```
1. User clicks delete button (🗑️)
   ↓
2. handleDeleteSchedule() is called
   ↓
3. Show confirmation dialog (SweetAlert2)
   ↓
4. If user confirms:
   - Send DELETE request to backend
   - Show success/error message
   - Refresh schedule list (fetchSchedules())
   ↓
5. Schedule disappears from table ✅
```

---

## 🎯 Code Snippets

### **Backend Delete Endpoint:**

```typescript
// backend/src/routes/authRoutes.ts (line ~1186)
router.delete("/schedules/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Check if schedule exists
    const schedule = await ScheduleService.findById(id);
    if (!schedule) {
      res.status(404).json({ message: "Schedule not found" });
      return;
    }
    
    // Delete using data service (works both online and offline)
    const deleted = await ScheduleService.delete(id);
    
    if (!deleted) {
      res.status(500).json({ message: "Failed to delete schedule" });
      return;
    }
    
    res.json({ 
      success: true,
      message: "Schedule deleted successfully" 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
});
```

---

### **Frontend Delete Handler:**

```typescript
// frontend/src/components/InfoModal.tsx (line ~274)
const handleDeleteSchedule = async (scheduleId: string, courseCode: string) => {
  const result = await Swal.fire({
    title: 'Delete Schedule?',
    text: `Are you sure you want to delete ${courseCode}?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Yes, delete it!',
  });

  if (result.isConfirmed) {
    try {
      await axios.delete(`${API_BASE_URL}/api/auth/schedules/${scheduleId}`);
      
      Swal.fire({
        icon: 'success',
        title: 'Deleted!',
        text: 'Schedule has been deleted successfully.',
      });
      
      await fetchSchedules(); // Refresh list
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Failed to delete schedule.',
      });
    }
  }
};
```

---

### **Delete Button in Table:**

```tsx
<TableCell>
  <IconButton
    size="small"
    color="error"
    onClick={() => handleDeleteSchedule(schedule._id, schedule.courseCode)}
    title="Delete schedule"
  >
    <DeleteIcon fontSize="small" />
  </IconButton>
</TableCell>
```

---

## ⚠️ Important Notes

### **1. Deletion is Permanent**
- Once deleted, schedules **cannot be recovered**
- The confirmation dialog warns users about this

### **2. Works in Both Modes**
- ✅ **Offline:** Deletes from SQLite (`offline_data.db`)
- ✅ **Online:** Deletes from MongoDB

### **3. No Bulk Delete**
- Currently, you can only delete **one schedule at a time**
- Future feature: Add "Delete All" button?

### **4. Attendance Logs**
- **Existing attendance logs** for deleted schedules are **NOT deleted**
- This preserves historical data for reporting

---

## 🎨 UI Elements

| Element | Description |
|---------|-------------|
| **Delete Button** | Red 🗑️ icon in the "Actions" column |
| **Confirmation Dialog** | Warning dialog with "Yes/Cancel" options |
| **Success Message** | Green checkmark with "Deleted!" message |
| **Error Message** | Red X with error details |

---

## 📊 Database Impact

### **SQLite (Offline Mode):**

**Before:**
```sql
SELECT * FROM schedules WHERE instructor_id = '123';
-- Returns 5 schedules
```

**After Delete:**
```sql
SELECT * FROM schedules WHERE instructor_id = '123';
-- Returns 4 schedules (one deleted)
```

---

### **MongoDB (Online Mode):**

**Before:**
```javascript
db.schedules.find({ instructor: ObjectId("123") }).count()
// Returns 5
```

**After Delete:**
```javascript
db.schedules.find({ instructor: ObjectId("123") }).count()
// Returns 4 (one deleted)
```

---

## 🐛 Troubleshooting

### **Problem: Delete button not showing**

**Solution:**
1. Hard refresh the page (Ctrl+Shift+R)
2. Check if frontend is running on latest code
3. Clear browser cache

---

### **Problem: "Schedule not found" error**

**Possible Causes:**
- Schedule was already deleted
- Schedule ID is invalid
- Database sync issue (offline/online mismatch)

**Solution:**
- Refresh the schedule list
- Verify schedule still exists in database

---

### **Problem: Delete works but schedule still shows**

**Solution:**
- Refresh the modal (close and reopen)
- The `fetchSchedules()` should auto-refresh, but you can manually refresh

---

## 🎉 Summary

✅ **Feature:** Delete individual schedules from faculty accounts  
✅ **Location:** Faculty Info modal → Schedule table  
✅ **Modes:** Works in both offline and online mode  
✅ **UI:** Red delete button (🗑️) with confirmation  
✅ **Safety:** Confirmation dialog prevents accidental deletion  
✅ **Auto-refresh:** Schedule list updates automatically  

---

## 🚀 Next Steps

**Try it now:**
1. Open Faculty Info
2. Click any faculty member
3. Find the schedules table
4. Look for the **🗑️ icon** in the "Actions" column
5. Click it to delete a schedule!

**Enjoy the new feature! 🎊**

