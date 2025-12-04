#!/usr/bin/env python3
"""
Sync schedules from MongoDB to local SQLite database
Run this script to populate the local database with all schedules for offline use
"""

import sys
import requests
import json
from pathlib import Path

# Add parent directory to path to import local_database
sys.path.insert(0, str(Path(__file__).parent))

try:
    from local_database import save_schedules_batch, init_database, get_stats
except ImportError:
    print("[ERROR] Could not import local_database module. Make sure local_database.py is in the same directory.")
    sys.exit(1)

# Backend API URL
BACKEND_API = "http://localhost:5000/api"

def sync_schedules(college_code=None):
    """Sync schedules from MongoDB to local SQLite database"""
    
    print("[SYNC] Initializing local database...")
    init_database()
    
    # Build request URL
    url = f"{BACKEND_API}/dean/sync-schedules-to-local"
    
    # Prepare request body
    data = {}
    if college_code:
        data["collegeCode"] = college_code
        print(f"[SYNC] Syncing schedules for college: {college_code}")
    else:
        print("[SYNC] Syncing all schedules...")
    
    try:
        print(f"[SYNC] Fetching schedules from MongoDB via API: {url}")
        response = requests.post(
            url,
            json=data,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"[ERROR] API returned status {response.status_code}: {response.text}")
            return False
        
        result = response.json()
        
        if not result.get("success"):
            print(f"[ERROR] API returned error: {result.get('message', 'Unknown error')}")
            return False
        
        schedules = result.get("schedules", [])
        count = result.get("count", 0)
        
        if count == 0:
            print("[WARN] No schedules found to sync")
            return True
        
        print(f"[SYNC] Received {count} schedules from API")
        print(f"[SYNC] Saving schedules to local SQLite database...")
        
        # Format schedules for local database
        formatted_schedules = []
        for schedule in schedules:
            # Format instructor name
            instructor_name = schedule.get("instructor_name", "")
            if not instructor_name and schedule.get("instructor"):
                # Handle if instructor is an object
                inst = schedule.get("instructor", {})
                if isinstance(inst, dict):
                    first_name = inst.get("first_name", "")
                    last_name = inst.get("last_name", "")
                    if first_name and last_name:
                        instructor_name = f"{last_name}, {first_name}"
            
            formatted_schedule = {
                "_id": schedule.get("_id"),
                "instructor_id": schedule.get("instructor_id", ""),
                "instructor_name": instructor_name,
                "courseCode": schedule.get("courseCode", ""),
                "courseTitle": schedule.get("courseTitle", ""),
                "room": schedule.get("room", ""),
                "startTime": schedule.get("startTime", ""),
                "endTime": schedule.get("endTime", ""),
                "semesterStartDate": schedule.get("semesterStartDate", ""),
                "semesterEndDate": schedule.get("semesterEndDate", ""),
                "days": schedule.get("days", {}),
                "section_id": schedule.get("section_id", "")
            }
            formatted_schedules.append(formatted_schedule)
        
        # Save to local database
        save_schedules_batch(formatted_schedules)
        
        print(f"[OK] Successfully synced {count} schedules to local database!")
        
        # Show stats
        stats = get_stats()
        print(f"[STATS] Local database now contains:")
        print(f"  - Schedules: {stats.get('schedules', 0)}")
        print(f"  - Instructors: {stats.get('instructors', 0)}")
        
        return True
        
    except requests.exceptions.ConnectionError:
        print("[ERROR] Could not connect to backend API. Make sure the backend server is running on http://localhost:5000")
        return False
    except requests.exceptions.Timeout:
        print("[ERROR] Request timed out. The API may be slow or unresponsive.")
        return False
    except Exception as e:
        print(f"[ERROR] Failed to sync schedules: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Sync schedules from MongoDB to local SQLite database")
    parser.add_argument(
        "--college",
        type=str,
        help="College code to sync (e.g., CIT). If not provided, syncs all schedules."
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("Schedule Sync Tool")
    print("=" * 60)
    print()
    
    success = sync_schedules(college_code=args.college)
    
    if success:
        print()
        print("[OK] Sync completed successfully!")
        print("[INFO] The face recognizer will now use local database for schedules (offline mode)")
        sys.exit(0)
    else:
        print()
        print("[ERROR] Sync failed. Check the error messages above.")
        sys.exit(1)

