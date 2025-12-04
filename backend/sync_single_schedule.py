#!/usr/bin/env python3
"""
Sync a single schedule to local SQLite database
Called from TypeScript when schedules are created/updated
"""

import sys
import json
from pathlib import Path

# Add parent directory to path to import local_database
sys.path.insert(0, str(Path(__file__).parent))

try:
    from local_database import save_schedule, init_database
except ImportError:
    print("[ERROR] Could not import local_database module.", file=sys.stderr)
    sys.exit(1)

def sync_single_schedule(schedule_json: str):
    """Sync a single schedule to local database"""
    try:
        # Initialize database
        init_database()
        
        # Parse schedule JSON
        schedule = json.loads(schedule_json)
        
        # Format instructor name if needed
        if not schedule.get('instructor_name'):
            instructor = schedule.get('instructor')
            if isinstance(instructor, dict):
                first_name = instructor.get('first_name', '')
                last_name = instructor.get('last_name', '')
                if first_name and last_name:
                    schedule['instructor_name'] = f"{last_name}, {first_name}"
            elif isinstance(instructor, str):
                # If it's just an ID, we can't get the name - will be populated later
                pass
        
        # Save to local database
        save_schedule(schedule)
        
        print(f"[OK] Schedule {schedule.get('courseCode', 'N/A')} saved to local database", flush=True)
        return True
        
    except json.JSONDecodeError as e:
        print(f"[ERROR] Invalid JSON: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"[ERROR] Failed to save schedule: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("[ERROR] Schedule JSON required as argument", file=sys.stderr)
        sys.exit(1)
    
    schedule_json = sys.argv[1]
    success = sync_single_schedule(schedule_json)
    sys.exit(0 if success else 1)

