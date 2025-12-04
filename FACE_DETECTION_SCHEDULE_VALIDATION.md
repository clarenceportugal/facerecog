# Face Detection Schedule Validation (Time & Room)

## Overview
This feature validates that detected faculty members are in the correct room at the correct time. The system displays:
- **Green box**: Faculty has a valid schedule (both time AND room match)
- **Yellow box**: Faculty has no schedule OR schedule time matches but room doesn't match

## Implementation Details

### 1. Backend Endpoints

#### `/api/dean/validate-faculty-schedule` (NEW)
**Location**: `backend/src/routes/deanRoutes.ts`

Validates if a faculty member has a valid schedule at the current time AND in the specified room.

**Request Body**:
```json
{
  "instructorName": "LastName, FirstName",
  "roomName": "Room 101",  // Optional
  "cameraId": "camera1"     // Optional
}
```

**Response**:
```json
{
  "success": true,
  "isValid": true,
  "schedule": { ... },
  "reason": "Valid schedule - time and room match",
  "timeMatch": true,
  "roomMatch": true
}
```

#### `/api/auth/get-current-schedule` (UPDATED)
**Location**: `backend/src/routes/facultyRoutes.ts`

Now accepts `roomName` and `cameraId` parameters and validates room matching.

**Request Body**:
```json
{
  "instructorName": "LastName, FirstName",
  "roomName": "Room 101",  // NEW: Optional
  "cameraId": "camera1"    // NEW: Optional
}
```

**Response**:
```json
{
  "schedule": { ... },
  "isValidSchedule": true,  // NEW: true if time AND room match
  "timeMatch": true,         // NEW
  "roomMatch": true,         // NEW
  "debug": { ... }
}
```

### 2. Python Recognizer Updates

**Location**: `backend/recognizer_arcface.py`

#### Room Mapping Configuration
```python
ROOM_MAPPING = {
    "camera1": os.getenv("CAMERA1_ROOM", ""),
    "camera2": os.getenv("CAMERA2_ROOM", ""),
}
```

#### Updated Function
- `get_current_schedule()` now accepts `camera_id` and `room_name` parameters
- Validates room when room name is provided
- Returns `isValidSchedule`, `timeMatch`, and `roomMatch` flags

### 3. Frontend Updates

**Location**: `frontend/src/pages/programchairperson/LiveVideo.tsx`

The frontend now checks the `is_valid_schedule` flag to determine box color:
- **Green**: `is_valid_schedule === true` (time AND room match)
- **Yellow**: `is_valid_schedule === false` OR no schedule

## Configuration

### Setting Up Room Mapping

1. **Environment Variables** (Recommended):
   ```bash
   # In your .env file or environment
   export CAMERA1_ROOM="Room 101"
   export CAMERA2_ROOM="Room 102"
   export CAMERA_ID="camera1"  # Which camera this recognizer instance is using
   ```

2. **Direct Configuration** (Alternative):
   Edit `backend/recognizer_arcface.py`:
   ```python
   ROOM_MAPPING = {
       "camera1": "Room 101",  # Update with actual room name
       "camera2": "Room 102",  # Update with actual room name
   }
   ```

### Room Name Matching

The system uses flexible room name matching:
- Exact match: `"Room 101" === "Room 101"` ✅
- Partial match: `"Room 101" in "Room 101A"` ✅
- Case-insensitive matching

**Important**: The room name in `ROOM_MAPPING` must match (or be similar to) the room name stored in the `Schedule.room` field in the database.

## How It Works

1. **Face Detection**: When a faculty member is detected, the recognizer calls `get_current_schedule()` with the camera ID.

2. **Schedule Lookup**: The function:
   - Gets the room name from `ROOM_MAPPING` based on camera ID
   - Calls the backend API with instructor name and room name
   - Backend validates:
     - Current time is within schedule time range
     - Room name matches schedule room (if provided)

3. **Validation Result**: 
   - If both time AND room match → `isValidSchedule: true` → Green box
   - If time matches but room doesn't → `isValidSchedule: false` → Yellow box
   - If no schedule → `isValidSchedule: false` → Yellow box

4. **Frontend Display**: The frontend checks `is_valid_schedule` flag and displays the appropriate colored box.

## Testing

1. **Set up room mapping**:
   ```bash
   export CAMERA1_ROOM="Room 101"
   ```

2. **Ensure schedules have correct room names** in the database:
   ```javascript
   // Schedule.room should match the room name in ROOM_MAPPING
   { room: "Room 101", ... }
   ```

3. **Test scenarios**:
   - Faculty with schedule in correct room at correct time → Green box
   - Faculty with schedule in wrong room at correct time → Yellow box
   - Faculty with schedule at wrong time → Yellow box
   - Faculty with no schedule → Yellow box

## Troubleshooting

### Yellow box shows even when faculty is in correct room
- Check that `CAMERA1_ROOM` (or `CAMERA2_ROOM`) environment variable is set correctly
- Verify the room name in the database matches the environment variable
- Check logs for room validation messages

### Green box shows but room doesn't match
- Verify room validation is enabled (room name is being passed)
- Check that `Schedule.room` field in database is populated correctly
- Review API response logs to see `roomMatch` status

### Room validation not working
- Ensure `roomName` is being passed to the API
- Check that `ROOM_MAPPING` is configured correctly
- Verify the recognizer is using the correct camera ID

## API Usage Examples

### Using the validation endpoint directly:
```bash
curl -X POST http://localhost:5000/api/dean/validate-faculty-schedule \
  -H "Content-Type: application/json" \
  -d '{
    "instructorName": "Smith, John",
    "roomName": "Room 101",
    "cameraId": "camera1"
  }'
```

### Response for valid schedule:
```json
{
  "success": true,
  "isValid": true,
  "schedule": { ... },
  "reason": "Valid schedule - time and room match",
  "timeMatch": true,
  "roomMatch": true
}
```

### Response for invalid room:
```json
{
  "success": true,
  "isValid": false,
  "schedule": { ... },
  "reason": "Schedule time matches but room does not match",
  "timeMatch": true,
  "roomMatch": false,
  "expectedRoom": "Room 101",
  "providedRoom": "Room 102"
}
```

## Notes

- Room validation is optional - if no room name is provided, only time validation is performed
- The system gracefully handles missing room information (backward compatible)
- Room matching is case-insensitive and supports partial matches
- Cache is used for performance, but room validation is always performed when room name is available

