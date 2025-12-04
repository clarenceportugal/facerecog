# Environment Configuration Guide

## Quick Reference

### Offline Mode
```env
OFFLINE_MODE=true
```

### Online Mode
```env
OFFLINE_MODE=false
MONGO_URI=mongodb://127.0.0.1:27017/eduvision
```

## Complete .env Template

Create a `.env` file in `eduvision/backend/` with:

```env
# System Mode: true = offline (SQLite only), false = online (MongoDB)
OFFLINE_MODE=false

# MongoDB Connection (required for online mode)
MONGO_URI=mongodb://127.0.0.1:27017/eduvision

# Server Port
PORT=5000

# JWT Secret (REQUIRED - change in production!)
JWT_SECRET=your-secret-key-change-this-in-production

# Email Configuration (Optional)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Face Recognition API
BACKEND_API=http://localhost:5000/api/auth

# Camera Configuration
CAMERA1_ROOM=
CAMERA2_ROOM=
CAMERA_ID=camera1

# MongoDB Sync (Optional)
MONGODB_SYNC_ENABLED=false
MONGODB_SYNC_INTERVAL=300
```

## Environment Variables for Python Script

The Python face recognition script (`recognizer_arcface.py`) also respects `OFFLINE_MODE`:

```bash
# Set in your environment or .env file
export OFFLINE_MODE=true  # Linux/Mac
set OFFLINE_MODE=true     # Windows CMD
$env:OFFLINE_MODE="true"  # Windows PowerShell
```

## Testing the Configuration

### Check Current Mode

```bash
# Via API
curl http://localhost:5000/api/system/mode

# Expected response:
# {
#   "mode": "offline",
#   "description": "Offline Mode (Local SQLite only)",
#   "offline": true
# }
```

### Server Startup Messages

**Offline Mode:**
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

**Online Mode:**
```
============================================================
🚀 Starting EduVision Server
📊 System Mode: Online Mode (MongoDB with local fallback)
============================================================
🌐 Running in ONLINE MODE
   - Connecting to MongoDB...
✅ Connected to MongoDB successfully
✅ Server running on port 5000 (ONLINE MODE)
```

## See Also

- `OFFLINE_ONLINE_MODE.md` - Detailed mode documentation
- `backend/src/utils/systemMode.ts` - Mode utility code
- `backend/src/middleware/checkMode.ts` - Mode middleware

