# ⏰ Time Tracking System Explanation

## 📋 Overview
The system tracks time for two types of users:
1. **Users WITH Schedule** - Faculty with scheduled classes
2. **Users WITHOUT Schedule** - Faculty detected but no scheduled class

---

## 🎓 USERS WITH SCHEDULE

### 1️⃣ First Detection (Time In)
- **When**: Person is first detected by camera
- **Action**: 
  - System checks if they have a schedule for current time/room
  - If schedule exists → Logs `time_in` (or `late` if past 15 minutes)
  - Creates `PersonSession` with `time_in_logged = True`
  - Starts tracking `total_time_seconds`

### 2️⃣ While Present
- **Tracking**: 
  - Every frame detected → Updates `last_seen` timestamp
  - Calculates time difference: `(now - last_seen)`
  - Adds to `total_time_seconds`
  - Example: Present for 30 minutes = 1800 seconds

### 3️⃣ Person Leaves (Not Detected)
- **Check**: Every 1 second, system checks if person is still detected
- **Timeout**: After **5 minutes (300 seconds)** of not being detected:
  - Marks person as `is_present = False`
  - Records `left_at` timestamp
  - **Logs `time_out`** automatically with total time
  - Sets `time_out_logged = True`

### 4️⃣ Person Returns
- **When**: Person detected again after being absent
- **Action**:
  - Marks as `is_present = True` again
  - **Time tracking CONTINUES** from where they left off
  - `total_time_seconds` is **NOT reset** (preserved)
  - Resets `time_out_logged = False` (so can log again when they leave for good)
  - Logs `returned` event

### 5️⃣ Final Time Out
- **When**: Person leaves again and not detected for 5 minutes
- **Action**:
  - Logs `time_out` again with **updated total time**
  - Total time includes all time present (before and after return)

### 📊 Example Flow (With Schedule):
```
9:00 AM - Detected → time_in logged
9:00-9:30 AM - Present → Tracking time (30 min)
9:30 AM - Leaves → Not detected
9:35 AM - After 5 min → time_out logged (30 min total)
9:40 AM - Returns → Detected again
9:40-10:00 AM - Present → Tracking continues (20 min more)
10:00 AM - Leaves → Not detected
10:05 AM - After 5 min → time_out logged (50 min total)
```

---

## 👤 USERS WITHOUT SCHEDULE

### 1️⃣ First Detection (Time In)
- **When**: Person is first detected by camera
- **Action**:
  - System checks for schedule → None found
  - Logs `time_in_no_schedule`
  - Creates `NoScheduleSession` with `timeInLogged = True`
  - Starts tracking `totalTimeSeconds`

### 2️⃣ While Present
- **Tracking**: 
  - Every frame detected → Updates `lastSeen` timestamp
  - Calculates time difference: `(now - lastSeen) / 1000` (milliseconds to seconds)
  - Adds to `totalTimeSeconds`

### 3️⃣ Person Leaves (Not Detected)
- **Check**: Every WebSocket message, frontend checks if person is still detected
- **Timeout**: After **5 minutes (300 seconds)** of not being detected:
  - Marks person as `isPresent = False`
  - Records `leftAt` timestamp
  - **Logs `time_out_no_schedule`** automatically with total time
  - Sets `timeOutLogged = True`
  - Backend also logs this via API

### 4️⃣ Person Returns
- **When**: Person detected again after being absent
- **Action**:
  - **Checks if existing `time_in_no_schedule` log exists for today**
  - If exists → **NO duplicate time_in log** (uses existing)
  - Marks as `isPresent = True` again
  - **Time tracking CONTINUES** from where they left off
  - `totalTimeSeconds` is **NOT reset** (preserved)
  - Logs `returned` event

### 5️⃣ Final Time Out
- **When**: Person leaves again and not detected for 5 minutes
- **Action**:
  - Logs `time_out_no_schedule` again with **updated total time**
  - Updates existing log (same row as time_in)

### 📊 Example Flow (No Schedule):
```
9:00 AM - Detected → time_in_no_schedule logged
9:00-9:30 AM - Present → Tracking time (30 min)
9:30 AM - Leaves → Not detected
9:35 AM - After 5 min → time_out_no_schedule logged (30 min total)
9:40 AM - Returns → Detected again
       → NO duplicate time_in (uses existing)
9:40-10:00 AM - Present → Tracking continues (20 min more)
10:00 AM - Leaves → Not detected
10:05 AM - After 5 min → time_out_no_schedule logged (50 min total)
       → Updates same row as time_in
```

---

## 🔑 Key Differences

| Feature | With Schedule | Without Schedule |
|---------|--------------|------------------|
| **Time In Log** | `time_in` or `late` | `time_in_no_schedule` |
| **Time Out Log** | `time_out` | `time_out_no_schedule` |
| **Timeout Duration** | 5 minutes (300s) | 5 minutes (300s) |
| **Return Behavior** | Time continues, no duplicate time_in | Time continues, no duplicate time_in |
| **Time Tracking** | `total_time_seconds` (backend) | `totalTimeSeconds` (frontend) |
| **Log Storage** | MongoDB with schedule reference | MongoDB without schedule |

---

## ⚙️ Configuration

```python
ABSENCE_TIMEOUT_SECONDS = 300  # 5 minutes = 300 seconds
LATE_THRESHOLD_MINUTES = 15    # 15 minutes late threshold (for scheduled users only)
```

---

## ✅ Important Points

1. **Time is NEVER reset** - When person returns, time continues accumulating
2. **No duplicate time_in** - System checks for existing log before creating new one
3. **Automatic timeout** - After 5 minutes absence, time_out is logged automatically
4. **Both backend and frontend** track time for no-schedule users (redundancy)
5. **Same timeout** - Both types use 5 minutes (300 seconds)

