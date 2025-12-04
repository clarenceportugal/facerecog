# Local SQLite Embedding Database System

## Overview

This system implements a fast local SQLite database for face embeddings with in-memory caching and optional MongoDB Atlas sync. This architecture provides:

1. **Fast Local Access**: SQLite database for instant embedding retrieval
2. **In-Memory Cache**: Fastest access for frequently used embeddings
3. **Optional MongoDB Sync**: Background sync with MongoDB Atlas (doesn't block detection)

## Architecture

```
Face Detection (Python)
   ↓
In-Memory Cache (Fastest) ← Check first
   ↓ (cache miss)
SQLite Database (Fast) ← Check second
   ↓ (if empty)
File System (Slow) ← Fallback
   ↓
MongoDB Atlas (Cloud) ← Optional Background Sync
```

## Components

### 1. SQLite Database (`embedding_db.py`)

**Location**: `backend/embedding_db.py`

**Features**:
- Stores face embeddings locally in SQLite
- In-memory caching for fastest access
- Thread-safe operations
- Batch operations for performance

**Database Schema**:
```sql
CREATE TABLE embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_name TEXT NOT NULL,
    embedding BLOB NOT NULL,
    image_path TEXT,
    user_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(person_name, image_path)
)
```

**Key Functions**:
- `load_embeddings_from_db()` - Load all embeddings (uses cache)
- `save_embedding()` - Save single embedding
- `save_embeddings_batch()` - Save multiple embeddings (faster)
- `delete_embedding()` - Delete embedding(s)
- `clear_cache()` - Clear in-memory cache

### 2. MongoDB Sync Service (`mongodb_sync.py`)

**Location**: `backend/mongodb_sync.py`

**Features**:
- Background sync from MongoDB Atlas to SQLite
- Optional sync (doesn't block face detection)
- Configurable sync interval
- Can sync in both directions (MongoDB → SQLite, SQLite → MongoDB)

**Configuration**:
```bash
# Enable MongoDB sync
export MONGODB_SYNC_ENABLED=true

# Set sync interval (seconds)
export MONGODB_SYNC_INTERVAL=300  # 5 minutes

# Backend API URL
export BACKEND_API=http://localhost:5000/api
```

### 3. Updated Recognizer (`recognizer_arcface.py`)

**Changes**:
- Loads embeddings from SQLite first (fast)
- Falls back to file system if SQLite is empty
- Automatically saves to SQLite after loading from file system
- Starts MongoDB sync service on startup

## Usage

### Initial Setup

1. **First Run** (SQLite is empty):
   - System loads embeddings from file system
   - Automatically saves to SQLite for future fast loading
   - Next run will be much faster (SQLite load)

2. **Subsequent Runs**:
   - System loads from SQLite (fast)
   - Uses in-memory cache for instant access
   - No file system processing needed

### Manual Operations

**Clear Cache**:
```python
from embedding_db import clear_cache
clear_cache()  # Force reload from SQLite on next access
```

**Get Cache Info**:
```python
from embedding_db import get_cache_info
info = get_cache_info()
print(info)  # {'cached': True, 'count': 50, 'timestamp': '...'}
```

**Manual Sync**:
```python
from mongodb_sync import manual_sync
manual_sync()  # Manually trigger sync from MongoDB
```

## Performance Benefits

### Before (File System Only)
- **First Load**: ~30-60 seconds (processes all images)
- **Subsequent Loads**: ~30-60 seconds (always processes images)
- **Network Dependency**: None (but slow)

### After (SQLite + Cache)
- **First Load**: ~30-60 seconds (processes images, saves to SQLite)
- **Subsequent Loads**: ~0.1-1 seconds (loads from SQLite)
- **In-Memory Access**: ~0.001 seconds (from cache)
- **Network Dependency**: Optional (MongoDB sync in background)

## Configuration

### Environment Variables

```bash
# MongoDB Sync (Optional)
MONGODB_SYNC_ENABLED=false          # Enable/disable sync
MONGODB_SYNC_INTERVAL=300          # Sync interval in seconds
BACKEND_API=http://localhost:5000/api

# Database Location
# SQLite database is automatically created at:
# backend/face_embeddings.db
```

### Disabling MongoDB Sync

If you don't want MongoDB sync (fully offline):
```bash
export MONGODB_SYNC_ENABLED=false
```

The system will work perfectly fine without MongoDB - it's completely optional.

## API Endpoints

### Get All Embeddings
```
GET /api/face/all-embeddings
```
Returns all embeddings from MongoDB (for syncing to SQLite).

### Sync Embeddings
```
POST /api/face/sync-embeddings
Body: { "embeddings": [...] }
```
Sends embeddings to MongoDB (for backup).

## Database Location

**SQLite Database**: `backend/face_embeddings.db`

This file is created automatically on first use. You can:
- Backup this file for quick restoration
- Move it to another machine
- Delete it to force regeneration from file system

## Troubleshooting

### SQLite Database Not Found
- The database is created automatically on first use
- If missing, the system falls back to file system processing

### Slow First Load
- First load processes images and saves to SQLite
- Subsequent loads are fast (from SQLite)
- This is normal behavior

### MongoDB Sync Not Working
- Check `MONGODB_SYNC_ENABLED=true` is set
- Check network connectivity to MongoDB Atlas
- Check `BACKEND_API` URL is correct
- Sync errors don't affect face detection (it's optional)

### Cache Issues
- Clear cache: `from embedding_db import clear_cache; clear_cache()`
- Cache is automatically invalidated on save/delete

## Migration Path

### From File System to SQLite

1. **Automatic**: On first run, system automatically:
   - Loads from file system
   - Saves to SQLite
   - Next run uses SQLite

2. **Manual**: You can also manually trigger:
   ```python
   from embedding_db import init_database
   init_database()  # Creates database
   # Then run recognizer - it will populate SQLite
   ```

### From MongoDB to SQLite

1. Enable sync: `MONGODB_SYNC_ENABLED=true`
2. Start recognizer - it will sync from MongoDB to SQLite
3. Future runs use fast SQLite

## Best Practices

1. **Backup SQLite Database**: Regularly backup `face_embeddings.db`
2. **Monitor Cache**: Use `get_cache_info()` to monitor cache status
3. **Sync Strategy**: Use MongoDB sync for backup, not primary storage
4. **Performance**: Keep SQLite database on fast storage (SSD)

## File Structure

```
backend/
├── embedding_db.py          # SQLite database operations
├── mongodb_sync.py          # MongoDB sync service
├── recognizer_arcface.py    # Updated to use SQLite
├── face_embeddings.db       # SQLite database (auto-created)
└── ...
```

## Notes

- SQLite database is thread-safe
- In-memory cache is thread-safe
- MongoDB sync is completely optional
- System works offline (no MongoDB required)
- Fast performance even with slow internet

