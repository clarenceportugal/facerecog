# Offline/Online Mode Configuration

This document explains how to switch between offline and online modes using environment variables.

## Overview

The EduVision system supports two operational modes:

- **Offline Mode**: Uses local SQLite databases only, no MongoDB connection required
- **Online Mode**: Uses MongoDB (with local SQLite fallback), requires MongoDB connection

## Quick Start

### Offline Mode

Set in your `.env` file:
```bash
OFFLINE_MODE=true
```

**What happens:**
- ✅ Server starts without MongoDB connection
- ✅ All data operations use local SQLite databases
- ✅ Face recognition works completely offline
- ✅ Attendance logs saved to local database
- ❌ No MongoDB sync (not needed)

### Online Mode

Set in your `.env` file:
```bash
OFFLINE_MODE=false
# or simply omit the variable (defaults to online)
MONGO_URI=mongodb://127.0.0.1:27017/eduvision
```

**What happens:**
- ✅ Server connects to MongoDB
- ✅ Data operations use MongoDB (with local fallback)
- ✅ Face recognition can fetch schedules from MongoDB
- ✅ Attendance logs synced to MongoDB
- ✅ Background sync services enabled

## Configuration

### Environment Variables

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `OFFLINE_MODE` | `true`, `false`, `1`, `0` | `false` | Enable/disable offline mode |
| `MONGO_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/eduvision` | Required for online mode |

### Examples

#### Windows (.env file)
```env
OFFLINE_MODE=true
```

#### Linux/Mac (.env file)
```env
OFFLINE_MODE=true
```

#### Command Line (Linux/Mac)
```bash
export OFFLINE_MODE=true
npm start
```

#### Command Line (Windows PowerShell)
```powershell
$env:OFFLINE_MODE="true"
npm start
```

## Mode Behavior

### Offline Mode Behavior

When `OFFLINE_MODE=true`:

**Backend Server:**
- ✅ Starts immediately without waiting for MongoDB
- ✅ All routes work with local SQLite databases
- ✅ No MongoDB connection attempts
- ✅ `/api/system/mode` returns `{ mode: "offline" }`

**Face Recognition (Python):**
- ✅ Uses local SQLite database for schedules
- ✅ Skips MongoDB API calls
- ✅ Skips schedule cache refresh from MongoDB
- ✅ Skips MongoDB sync service
- ✅ All logs saved to local database only

**Routes:**
- ✅ All routes work normally
- ✅ Routes that require MongoDB return 503 with helpful message
- ✅ Routes use `optionalOnlineMode` middleware to detect mode

### Online Mode Behavior

When `OFFLINE_MODE=false` (default):

**Backend Server:**
- ✅ Connects to MongoDB before starting
- ✅ Retries connection if it fails
- ✅ Uses MongoDB for data operations
- ✅ Falls back to local SQLite if MongoDB unavailable

**Face Recognition (Python):**
- ✅ Uses local SQLite database first (fastest)
- ✅ Falls back to MongoDB API if local DB empty
- ✅ Refreshes schedule cache from MongoDB periodically
- ✅ Syncs logs to MongoDB when online

## Checking Current Mode

### Via API

```bash
curl http://localhost:5000/api/system/mode
```

Response:
```json
{
  "mode": "offline",
  "description": "Offline Mode (Local SQLite only)",
  "offline": true
}
```

### Via Server Logs

When server starts, you'll see:
```
============================================================
🚀 Starting EduVision Server
📊 System Mode: Offline Mode (Local SQLite only)
============================================================
📴 Running in OFFLINE MODE
   - Using local SQLite databases only
   - MongoDB connection skipped
   - All data operations use local storage
✅ Server running on port 5000 (OFFLINE MODE)
```

## Use Cases

### When to Use Offline Mode

- ✅ No internet connection available
- ✅ Testing without MongoDB setup
- ✅ Development environment
- ✅ Air-gapped systems
- ✅ Reducing external dependencies

### When to Use Online Mode

- ✅ Production environment
- ✅ Multiple servers need to share data
- ✅ Cloud-based deployment
- ✅ Real-time data synchronization needed
- ✅ Backup and redundancy required

## Migration Between Modes

### Switching from Online to Offline

1. Stop the server
2. Set `OFFLINE_MODE=true` in `.env`
3. Start the server
4. System will use local databases only

**Note:** Data already in MongoDB won't be accessible, but local SQLite data will work.

### Switching from Offline to Online

1. Stop the server
2. Set `OFFLINE_MODE=false` in `.env`
3. Ensure `MONGO_URI` is set correctly
4. Start the server
5. System will connect to MongoDB

**Note:** Local SQLite data will sync to MongoDB when routes are accessed.

## Troubleshooting

### Server Won't Start in Online Mode

**Error:** `MONGO_URI is required for online mode`

**Solution:**
- Set `MONGO_URI` in `.env` file
- Or switch to offline mode: `OFFLINE_MODE=true`

### Routes Return 503 in Offline Mode

**Error:** `This operation requires online mode`

**Solution:**
- This is expected behavior for routes that require MongoDB
- Switch to online mode: `OFFLINE_MODE=false`
- Or use alternative routes that work offline

### Face Recognition Not Fetching Schedules

**In Offline Mode:**
- ✅ This is normal - schedules come from local SQLite only
- Ensure schedules are synced to local DB first

**In Online Mode:**
- Check MongoDB connection
- Check `BACKEND_API` environment variable
- Check server logs for errors

## API Endpoints

### Get System Mode
```
GET /api/system/mode
```

Returns current system mode and status.

## Code Examples

### Check Mode in Route Handler

```typescript
import { isOfflineMode } from '../utils/systemMode';

router.get('/example', (req, res) => {
  if (isOfflineMode()) {
    // Use local database
    return res.json({ data: localData });
  } else {
    // Use MongoDB
    return res.json({ data: mongoData });
  }
});
```

### Require Online Mode

```typescript
import { requireOnlineMode } from '../middleware/checkMode';

router.post('/sync', requireOnlineMode, (req, res) => {
  // This route only works in online mode
  // Returns 503 if in offline mode
});
```

### Optional Online Mode

```typescript
import { optionalOnlineMode } from '../middleware/checkMode';

router.get('/data', optionalOnlineMode, (req, res) => {
  const mode = (req as any).systemMode;
  const isOffline = (req as any).isOfflineMode;
  
  // Works in both modes, can check mode if needed
});
```

## Best Practices

1. **Development**: Use offline mode for faster development
2. **Testing**: Use offline mode to avoid external dependencies
3. **Production**: Use online mode for data consistency
4. **Backup**: Regularly sync local data to MongoDB when switching modes
5. **Documentation**: Document which mode your deployment uses

## Related Files

- `backend/src/utils/systemMode.ts` - Mode utility functions
- `backend/src/middleware/checkMode.ts` - Mode checking middleware
- `backend/src/server.ts` - Server startup logic
- `backend/recognizer_arcface.py` - Face recognition script

## Support

For issues or questions:
1. Check server logs for mode information
2. Verify `.env` file configuration
3. Test with `GET /api/system/mode` endpoint
4. Review this documentation

