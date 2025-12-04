# Sync Schedules to Local Database

## Quick Setup (One-Time)

To populate the local database with schedules for offline face detection:

### Option 1: Using API Endpoint

```bash
# Sync all schedules
curl -X POST http://localhost:5000/api/dean/sync-schedules-to-local \
  -H "Content-Type: application/json"

# Or sync by college
curl -X POST http://localhost:5000/api/dean/sync-schedules-to-local \
  -H "Content-Type: application/json" \
  -d '{"collegeCode": "CIT"}'
```

### Option 2: Using Frontend

1. Open the frontend application
2. Navigate to Dean dashboard
3. Use the sync schedules feature (if available)

### Option 3: Automatic (Recommended)

**The system automatically syncs schedules when:**
- A schedule is fetched from the API
- The recognizer checks for a schedule
- Schedules are updated in MongoDB

**You don't need to manually sync!** The system will populate the local database automatically as it runs.

## Verify Local Database

Check if schedules are in the local database:

```python
# In Python console or script
from local_database import get_stats
stats = get_stats()
print(f"Schedules: {stats['schedules']}")
print(f"Instructors: {stats['instructors']}")
```

Or check the database file:
- Location: `backend/face_detection_data.db`
- Use SQLite browser to view: https://sqlitebrowser.org/

## When to Sync

**You only need to manually sync if:**
- You want to pre-populate the database before going offline
- You've added many new schedules and want them available immediately
- You're setting up a new installation

**Otherwise**, the system syncs automatically as it runs!

## Troubleshooting

### No Schedules in Local DB

1. **Check if API is running**: The sync endpoint needs the backend API
2. **Check MongoDB connection**: Schedules come from MongoDB
3. **Wait for auto-sync**: System syncs automatically when schedules are accessed

### Schedules Not Updating

- Local database updates automatically when schedules are fetched
- If you update schedules in MongoDB, they'll sync on next access
- Or manually call the sync endpoint

### Database File Not Created

- Database is created automatically on first use
- Check write permissions in `backend/` directory
- Check disk space

## Notes

- **Offline Mode**: Once schedules are in local DB, system works offline
- **Auto-Sync**: System syncs schedules automatically (no manual step needed)
- **Performance**: Local DB is 10-100x faster than API calls
- **Backup**: You can backup `face_detection_data.db` for quick restoration

