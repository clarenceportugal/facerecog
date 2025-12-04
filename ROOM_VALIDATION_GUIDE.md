# 🎯 Room & Time Validation for Face Detection

## ✅ Feature Overview

Your EduVision system now validates BOTH **time AND room** for faculty detection:

| Detection Status | Box Color | Meaning |
|-----------------|-----------|---------|
| ✅ **VALID** | 🟢 **GREEN** | Faculty is in the **correct room** at the **correct time** |
| ⚠️ **INVALID** | 🟡 **YELLOW** | Faculty detected but:<br>- Wrong room (time matches), OR<br>- No schedule at this time |

---

## 🔧 How It Works

```
┌──────────────────────────────────────────────────────┐
│  Face Detection with Room/Time Validation            │
└──────────────────────────────────────────────────────┘

1. Camera detects faculty face
      ↓
2. System checks: "Does this faculty have a class NOW?"
      ↓
3. If YES → Check: "Is the camera room = scheduled room?"
      ↓
4. Result:
   - Time ✅ + Room ✅ = 🟢 GREEN BOX
   - Time ✅ + Room ❌ = 🟡 YELLOW BOX
   - Time ❌           = 🟡 YELLOW BOX
```

---

## ⚙️ Configuration

### **Step 1: Set Up Room Names**

You need to tell the system which room each camera is in.

Edit your `backend/.env` file and add:

```env
# Camera-to-Room Mapping
CAMERA1_ROOM=Lab1
CAMERA2_ROOM=Lab2
# Add more cameras as needed:
# CAMERA3_ROOM=Lab3
# CAMERA4_ROOM=Conference Room
```

**Important:** 
- Room names should match the room names in your schedules!
- Example: If your schedule says "Lab1", set `CAMERA1_ROOM=Lab1`

---

### **Step 2: Ensure Schedule Room Names Match**

When adding schedules, make sure the **Room** field matches your camera room names.

**Example Schedule:**
- Course: CS101
- Instructor: John Doe
- **Room: Lab1** ← Must match `CAMERA1_ROOM=Lab1`
- Time: 09:00 - 11:00
- Days: Mon, Wed, Fri

---

### **Step 3: Restart Face Recognition**

After updating `.env`, restart the face recognition:

```powershell
# Stop the current face recognition (Ctrl+C)
# Then restart:
cd backend
py -3.13 recognizer_arcface.py
```

---

## 📋 Example Setup

### **Scenario: 2 Cameras in 2 Labs**

**backend/.env:**
```env
CAMERA1_ROOM=Lab1
CAMERA2_ROOM=Lab2
```

**Schedule for "Jane Smith":**
- Course: CS101
- Room: **Lab1**
- Time: 10:00 - 12:00
- Days: Monday, Wednesday

**What Happens:**

| Time | Camera | Room | Box Color | Reason |
|------|--------|------|-----------|---------|
| 10:30 Monday | Camera 1 | Lab1 | 🟢 GREEN | Time ✅ Room ✅ |
| 10:30 Monday | Camera 2 | Lab2 | 🟡 YELLOW | Time ✅ but Room ❌ (should be in Lab1) |
| 15:00 Monday | Camera 1 | Lab1 | 🟡 YELLOW | No class scheduled at this time |

---

## 🎨 Visual Examples

### **✅ Valid Detection (Green Box)**

```
Faculty: John Doe
Schedule: CS101, Lab1, 09:00-11:00
Current Time: 09:30
Camera Location: Lab1

Result: 🟢 GREEN BOX
Reason: Faculty is in the correct room (Lab1) at the correct time (09:30)
```

---

### **⚠️ Invalid Detection (Yellow Box) - Wrong Room**

```
Faculty: John Doe
Schedule: CS101, Lab1, 09:00-11:00
Current Time: 09:30
Camera Location: Lab2

Result: 🟡 YELLOW BOX
Reason: Faculty should be in Lab1 but detected in Lab2
```

---

### **⚠️ Invalid Detection (Yellow Box) - Wrong Time**

```
Faculty: John Doe
Schedule: CS101, Lab1, 09:00-11:00
Current Time: 14:00
Camera Location: Lab1

Result: 🟡 YELLOW BOX
Reason: No class scheduled at 14:00 (even though in correct room)
```

---

## 🔍 Testing the Feature

### **Test 1: Verify Room Configuration**

```powershell
# Check your .env file
cd backend
cat .env | findstr CAMERA

# Should show:
# CAMERA1_ROOM=Lab1
# CAMERA2_ROOM=Lab2
```

---

### **Test 2: Check Recognition Logs**

Start face recognition and watch for these messages:

```
[OK] VALID John Doe has class NOW: CS101 in room Lab1
```
or
```
[WARN] WRONG ROOM John Doe has class NOW but wrong room. Expected: Lab1, Camera room: Lab2
```

---

### **Test 3: Watch the Live Video**

1. Login as Program Chair/Dean
2. Go to "Live Video"
3. Detect a faculty member
4. Check the box color:
   - 🟢 **GREEN** = Correct room & time ✅
   - 🟡 **YELLOW** = Wrong room or time ⚠️

---

## 📝 Room Name Matching

The system uses **flexible matching** for room names:

| Schedule Room | Camera Room | Match? |
|---------------|-------------|---------|
| Lab1 | Lab1 | ✅ Exact match |
| Lab1 | lab1 | ✅ Case insensitive |
| Lab 1 | Lab1 | ❌ Space matters |
| Computer Lab 1 | Lab 1 | ✅ Partial match |
| Lab1 | Computer Lab 1 | ✅ Partial match |

**Best Practice:** Use exact, consistent room names (e.g., always "Lab1", not "Lab 1" or "Computer Lab 1")

---

## 🛠️ Troubleshooting

### **Problem: All boxes are YELLOW even when faculty should be in correct room**

**Possible Causes:**
1. `CAMERA1_ROOM` not set in `.env`
2. Room name in schedule doesn't match `CAMERA1_ROOM`
3. Didn't restart face recognition after changing `.env`

**Solution:**
```powershell
# 1. Check .env
cd backend
cat .env | findstr CAMERA

# 2. If missing or wrong, edit .env:
# CAMERA1_ROOM=Lab1

# 3. Restart face recognition
py -3.13 recognizer_arcface.py
```

---

### **Problem: All boxes are GREEN even when in wrong room**

**Possible Causes:**
1. `CAMERA1_ROOM` is empty (validation skipped)
2. Room names partially match (e.g., "Lab1" matches "Lab 1")

**Solution:**
- Set `CAMERA1_ROOM` explicitly in `.env`
- Use exact room names in schedules

---

### **Problem: How do I know which camera is which?**

Check the environment variables:

```powershell
cd backend
cat .env | findstr CAMERA

# Shows:
# CAMERA1_ROOM=Lab1
# CAMERA2_ROOM=Lab2
```

Or check the camera name in Live Video page - it should show "Camera 1", "Camera 2", etc.

---

## 🎯 Quick Setup Checklist

- [ ] 1. Edit `backend/.env` and add `CAMERA1_ROOM=Lab1` (use your actual room name)
- [ ] 2. Make sure schedule room names match (e.g., "Lab1")
- [ ] 3. Restart face recognition: `py -3.13 recognizer_arcface.py`
- [ ] 4. Test: Detect a faculty member with a scheduled class
- [ ] 5. Verify: Green box if in correct room, yellow if in wrong room

---

## 💡 Pro Tips

1. **Use short, consistent room names:** "Lab1" is better than "Computer Laboratory Room 1"
2. **Document your room mapping:** Keep a list of which camera is in which room
3. **Test during actual class times:** Easier to verify with real faculty schedules
4. **Check logs:** The console will show "[OK] VALID" or "[WARN] WRONG ROOM"

---

## 📊 How Room Validation Affects Attendance

| Scenario | Detection | Attendance Logged? | Status |
|----------|-----------|-------------------|--------|
| Correct room & time | 🟢 GREEN | ✅ YES | Present |
| Wrong room, right time | 🟡 YELLOW | ✅ YES* | Present (but flagged) |
| No class scheduled | 🟡 YELLOW | ❌ NO | Not logged |

*Attendance is still logged even if in wrong room (for audit purposes), but the system flags it as potentially incorrect.

---

## 🎉 Summary

✅ **Room validation is ACTIVE** after this fix  
✅ **Green boxes** = Correct room & time  
✅ **Yellow boxes** = Wrong room or no schedule  
✅ **Easy to configure** via `.env` file  

**Next Step:** Edit your `backend/.env` and set `CAMERA1_ROOM=Lab1` (or your actual room name), then restart face recognition!

---

## 🔗 Related Files

- `backend/recognizer_arcface.py` - Face recognition with room validation (lines 76-82, 279-346)
- `backend/.env` - Configuration file (add `CAMERA1_ROOM`, `CAMERA2_ROOM`)
- `frontend/src/pages/programchairperson/LiveVideo.tsx` - Box color rendering (lines 465-500)

**Happy validating! 🚀**

