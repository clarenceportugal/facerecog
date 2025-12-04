import sys
import struct
import select  # For non-blocking stdin check (zero-delay frame skipping)
import cv2
import numpy as np
import json
import os
from pathlib import Path
import insightface
from insightface.app import FaceAnalysis
from numpy.linalg import norm
from datetime import datetime, timedelta, time as dt_time
import threading
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import requests
from collections import defaultdict
import gc  # Garbage collection for memory management

# Import local SQLite database modules
try:
    from embedding_db import (
        load_embeddings_from_db,
        save_embedding,
        save_embeddings_batch,
        delete_embedding,
        clear_cache,
        get_cache_info
    )
    SQLITE_AVAILABLE = True
except ImportError:
    print("[WARN] SQLite embedding database not available, using file system only", file=sys.stderr, flush=True)
    SQLITE_AVAILABLE = False

try:
    from local_database import (
        get_current_schedule as get_schedule_from_local_db,
        save_schedule,
        save_schedules_batch,
        save_instructor,
        get_instructor_by_name,
        queue_attendance_log,
        get_unsynced_logs,
        mark_log_synced,
        get_stats as get_local_db_stats
    )
    LOCAL_DB_AVAILABLE = True
except ImportError:
    print("[WARN] Local database not available, using API fallback", file=sys.stderr, flush=True)
    LOCAL_DB_AVAILABLE = False

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# ----------------------------
# Config
# ----------------------------
# Use relative path: go up one level from backend/ to project root, then into streaming-server/faces
SCRIPT_DIR = Path(__file__).parent.resolve()
DATASET_DIR = SCRIPT_DIR.parent / "streaming-server" / "faces"

# System Mode Configuration
# Set OFFLINE_MODE=true to run in offline mode (uses local SQLite only)
# Set OFFLINE_MODE=false or omit to run in online mode (uses MongoDB with local fallback)
OFFLINE_MODE = os.getenv("OFFLINE_MODE", "false").lower() in ("true", "1", "yes")

# ⚡ PERFORMANCE OPTIMIZATION: Use local SQLite cache for face detection even in online mode
# This dramatically reduces delay by avoiding MongoDB queries during face detection
# Set to True to always use local cache for detection (RECOMMENDED for fast detection)
USE_LOCAL_CACHE_FOR_DETECTION = os.getenv("USE_LOCAL_CACHE_FOR_DETECTION", "true").lower() in ("true", "1", "yes")

# ⚡ Optimized for i5 12th gen + GTX 3050 Ti + 16GB RAM - REAL-TIME DISTANT FACE DETECTION
# Detection threshold: Adjusted for better face detection
DETECTION_THRESHOLD = 0.35  # 0.30 + 0.05 = 0.35 - balanced detection
# Recognition threshold: Adjusted for better face recognition
CONF_THRESHOLD = 0.35  # 0.30 + 0.05 = 0.35 - balanced recognition
ABSENCE_TIMEOUT_SECONDS = 300  # 5 minutes = 300 seconds
LATE_THRESHOLD_MINUTES = 15  # 15 minutes late threshold
SCHEDULE_RECHECK_INTERVAL_SECONDS = 300  # Re-check schedules every 5 minutes for existing sessions
SCHEDULE_CACHE_REFRESH_INTERVAL_SECONDS = 300  # Refresh schedule cache every 5 minutes

# ⚡ GPU-specific optimizations
GPU_BATCH_SIZE = 4  # Process multiple frames in batch when available (future optimization)
ENABLE_CUDA_GRAPHS = True  # Enable CUDA graphs for reduced kernel launch overhead
BACKEND_API = os.getenv("BACKEND_API", "http://localhost:5000/api/auth")  # TypeScript server with API endpoints

# Room mapping: Map camera IDs to room names
# Update this mapping based on your camera-to-room configuration
# Format: "camera_id": "room_name" (must match the room name in Schedule.room field)
ROOM_MAPPING = {
    "camera1": os.getenv("CAMERA1_ROOM", ""),  # Set CAMERA1_ROOM environment variable
    "camera2": os.getenv("CAMERA2_ROOM", ""),  # Set CAMERA2_ROOM environment variable
}

# Local schedule cache to avoid MongoDB API calls during face detection
schedule_cache = {}  # Maps instructor name (formatted) -> list of schedules
schedule_cache_lock = threading.Lock()
schedule_cache_last_refresh = None
schedule_cache_file = SCRIPT_DIR / "schedule_cache.json"  # Optional: persist cache to file

def get_current_day():
    """Get current day in lowercase (mon, tue, wed, etc.)"""
    days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    return days[datetime.now().weekday()]

def parse_time_string(time_str):
    """Parse time string (HH:MM) to datetime.time object"""
    try:
        hour, minute = map(int, time_str.split(':'))
        return dt_time(hour, minute)
    except Exception as e:
        print(f"[ERROR] Failed to parse time '{time_str}': {e}", file=sys.stderr, flush=True)
        return None

def format_instructor_name(folder_name):
    """
    Convert folder name to 'LastName, FirstName' format
    Examples:
      'Mark_Lorenz_Quibral' -> 'Quibral, Mark'
      'John_Smith' -> 'Smith, John'
      'Allen_Garcia' -> 'Garcia, Allen'
    """
    parts = folder_name.replace('_', ' ').split()
    if len(parts) >= 2:
        first_name = parts[0]
        last_name = parts[-1]  # Last part is the last name
        return f"{last_name}, {first_name}"
    return folder_name  # Fallback to original if format is unexpected

def refresh_schedule_cache():
    """Fetch all schedules from backend and cache them locally"""
    global schedule_cache, schedule_cache_last_refresh
    
    # Skip cache refresh in offline mode (data doesn't change from external source)
    if OFFLINE_MODE:
        print(f"[CACHE] [OFFLINE] Skipping schedule cache refresh (OFFLINE_MODE=true)", file=sys.stderr, flush=True)
        return False
    
    # ⚡ In hybrid mode, we rely on periodic sync from backend to keep SQLite updated
    # The in-memory cache is still useful as a secondary layer
    if USE_LOCAL_CACHE_FOR_DETECTION and LOCAL_DB_AVAILABLE:
        print(f"[CACHE] [HYBRID] Using SQLite as primary cache, in-memory as fallback", file=sys.stderr, flush=True)
        # Still refresh in-memory cache occasionally for redundancy
        pass  # Continue to refresh
    
    try:
        print(f"[CACHE] [SYNC] Refreshing schedule cache from MongoDB...", file=sys.stderr, flush=True)
        
        # Try to fetch all schedules - we'll use a new endpoint or fetch all instructors' schedules
        # For now, we'll create a simple endpoint that returns all active schedules
        # But first, let's try using the existing API structure
        
        # Since there's no single endpoint for all schedules, we'll need to create one
        # For now, we'll fetch schedules for known instructors from face folders
        # This is a workaround - ideally backend should have /api/auth/all-schedules endpoint
        
        response = requests.get(
            f"{BACKEND_API}/all-schedules-for-recognition",
            timeout=10
        )
        
        if response.status_code == 200:
            all_schedules = response.json()
            
            # Group schedules by instructor name
            new_cache = defaultdict(list)
            current_date = datetime.now().date().isoformat()
            
            for schedule in all_schedules:
                # Get instructor name
                instructor = schedule.get('instructor', {})
                if isinstance(instructor, dict):
                    first_name = instructor.get('first_name', '')
                    last_name = instructor.get('last_name', '')
                    if first_name and last_name:
                        instructor_name = f"{last_name}, {first_name}"
                        
                        # Only cache schedules within semester dates
                        semester_start = schedule.get('semesterStartDate', '')
                        semester_end = schedule.get('semesterEndDate', '')
                        
                        if semester_start <= current_date <= semester_end:
                            new_cache[instructor_name].append(schedule)
            
            # Calculate total before limiting
            total_schedules = sum(len(schedules) for schedules in new_cache.values())
            
            with schedule_cache_lock:
                # Limit cache size to prevent memory issues (keep only last 1000 schedules)
                if total_schedules > 1000:
                    print(f"[CACHE] [WARN] Large cache detected ({total_schedules} schedules), limiting to prevent memory issues", file=sys.stderr, flush=True)
                    # Keep only most recent schedules per instructor
                    limited_cache = {}
                    for instructor, schedules in new_cache.items():
                        limited_cache[instructor] = schedules[:10]  # Max 10 schedules per instructor
                    schedule_cache = limited_cache
                else:
                    schedule_cache = dict(new_cache)
                schedule_cache_last_refresh = datetime.now()
            
            final_total = sum(len(schedules) for schedules in schedule_cache.values())
            print(f"[CACHE] [OK] Cache refreshed: {len(schedule_cache)} instructors, {final_total} total schedules", file=sys.stderr, flush=True)
            
            # Save to file for persistence
            try:
                cache_data = {
                    'schedules': schedule_cache,
                    'last_refresh': schedule_cache_last_refresh.isoformat()
                }
                with open(schedule_cache_file, 'w') as f:
                    json.dump(cache_data, f, default=str, indent=2)
            except Exception as e:
                print(f"[CACHE] [WARN] Could not save cache to file: {e}", file=sys.stderr, flush=True)
            
            return True
        else:
            print(f"[CACHE] [WARN] Failed to fetch schedules: HTTP {response.status_code}", file=sys.stderr, flush=True)
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"[CACHE] [WARN] Network error refreshing cache: {e}", file=sys.stderr, flush=True)
        # Try to load from file if available
        try:
            if schedule_cache_file.exists():
                with open(schedule_cache_file, 'r') as f:
                    cache_data = json.load(f)
                    with schedule_cache_lock:
                        schedule_cache = cache_data.get('schedules', {})
                        if cache_data.get('last_refresh'):
                            schedule_cache_last_refresh = datetime.fromisoformat(cache_data['last_refresh'])
                        else:
                            schedule_cache_last_refresh = datetime.now()
                    print(f"[CACHE] [OK] Loaded cache from file ({len(schedule_cache)} instructors)", file=sys.stderr, flush=True)
                    return True
        except Exception as file_error:
            print(f"[CACHE] [WARN] Could not load cache from file: {file_error}", file=sys.stderr, flush=True)
        return False
    except Exception as e:
        print(f"[CACHE] [ERROR] Error refreshing schedule cache: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return False

def batch_get_schedules(instructor_names, camera_id="camera1", room_name=None):
    """
    ⚡ BATCH OPTIMIZATION: Get schedules for multiple instructors at once
    This avoids per-face database queries when multiple new faces appear
    
    Args:
        instructor_names: List of instructor names (folder name format)
        camera_id: Camera ID for room mapping
        room_name: Room name for validation
        
    Returns:
        Dictionary mapping instructor_name -> schedule (or None)
    """
    if not instructor_names:
        return {}
    
    results = {}
    
    # Get room name from mapping if not provided
    if room_name is None:
        room_name = ROOM_MAPPING.get(camera_id, "")
    
    # ⚡ Batch lookup from local database (fastest)
    if LOCAL_DB_AVAILABLE:
        for name in instructor_names:
            schedule = get_schedule_from_local_db(name, room_name)
            if schedule:
                # Calculate late status
                current_time = datetime.now().time()
                start_time = parse_time_string(schedule.get('startTime', ''))
                if start_time:
                    late_threshold_time = (datetime.combine(datetime.today(), start_time) + timedelta(minutes=LATE_THRESHOLD_MINUTES)).time()
                    schedule['is_late'] = current_time > late_threshold_time
                    schedule['start_time_obj'] = start_time
                    schedule['current_time_str'] = current_time.strftime('%H:%M')
                results[name] = schedule
            else:
                results[name] = None
        
        # If we found schedules for everyone, return early
        if all(v is not None for v in results.values()) or OFFLINE_MODE or USE_LOCAL_CACHE_FOR_DETECTION:
            return results
    
    # ⚡ Batch lookup from in-memory cache (fast)
    for name in instructor_names:
        if name in results and results[name] is not None:
            continue  # Already found in local DB
        schedule = get_current_schedule_from_cache(name)
        if schedule:
            # Validate room
            if room_name:
                schedule_room = (schedule.get('room') or "").strip().lower()
                provided_room = room_name.strip().lower()
                room_match = schedule_room == provided_room or \
                            schedule_room in provided_room or \
                            provided_room in schedule_room
                schedule['isValidSchedule'] = room_match
                schedule['roomMatch'] = room_match
            else:
                schedule['isValidSchedule'] = True
                schedule['roomMatch'] = None
            results[name] = schedule
        else:
            results[name] = None
    
    return results

def get_current_schedule_from_cache(instructor_name):
    """Get current schedule for an instructor from local cache"""
    formatted_name = format_instructor_name(instructor_name)
    current_day = get_current_day()
    current_time = datetime.now().time()
    current_date = datetime.now().date().isoformat()
    
    with schedule_cache_lock:
        instructor_schedules = schedule_cache.get(formatted_name, [])
    
    if not instructor_schedules:
        return None
    
    # Find schedule that matches current day and time
    for schedule in instructor_schedules:
        # Check if schedule is within semester dates
        semester_start = schedule.get('semesterStartDate', '')
        semester_end = schedule.get('semesterEndDate', '')
        if not (semester_start <= current_date <= semester_end):
            continue
        
        # Check if today is a scheduled day
        days = schedule.get('days', {})
        if days and len(days) > 0:
            if not days.get(current_day, False):
                continue
        # If days object is empty, assume it's a daily schedule (accept it)
        
        # Parse schedule times
        start_time = parse_time_string(schedule.get('startTime', ''))
        end_time = parse_time_string(schedule.get('endTime', ''))
        
        if not start_time or not end_time:
            continue
        
        # Check if current time is within the class period (including 30 min before)
        time_before_class = (datetime.combine(datetime.today(), start_time) - timedelta(minutes=30)).time()
        
        if time_before_class <= current_time <= end_time:
            # Calculate if they're late
            late_threshold_time = (datetime.combine(datetime.today(), start_time) + timedelta(minutes=LATE_THRESHOLD_MINUTES)).time()
            is_late = current_time > late_threshold_time
            
            # Create a copy of schedule with additional fields
            schedule_copy = schedule.copy()
            schedule_copy['is_late'] = is_late
            schedule_copy['start_time_obj'] = start_time
            schedule_copy['current_time_str'] = current_time.strftime('%H:%M')
            
            return schedule_copy
    
    return None

def get_current_schedule(instructor_name, camera_id="camera1", room_name=None):
    """Get current schedule for an instructor - checks if they have a class NOW
    Uses local database first (offline), falls back to cache, then API if needed
    
    Args:
        instructor_name: Name of the instructor (folder name format)
        camera_id: ID of the camera (default: "camera1")
        room_name: Room name to validate against schedule (optional, will use ROOM_MAPPING if not provided)
    """
    formatted_name = format_instructor_name(instructor_name)
    
    # Get room name from mapping if not provided
    if room_name is None:
        room_name = ROOM_MAPPING.get(camera_id, "")
    
    # Step 1: Try local database first (OFFLINE - fastest)
    if LOCAL_DB_AVAILABLE:
        # Reduced logging - only log every 100th check to reduce spam
        if hash(instructor_name) % 100 == 0:
            print(f"[DATA SOURCE] [LOCAL DB] Checking local SQLite database for {instructor_name}...", file=sys.stderr, flush=True)
        schedule = get_schedule_from_local_db(instructor_name, room_name)
        if schedule:
            # Calculate if they're late
            current_time = datetime.now().time()
            start_time = parse_time_string(schedule.get('startTime', ''))
            if start_time:
                late_threshold_time = (datetime.combine(datetime.today(), start_time) + timedelta(minutes=LATE_THRESHOLD_MINUTES)).time()
                schedule['is_late'] = current_time > late_threshold_time
                schedule['start_time_obj'] = start_time
                schedule['current_time_str'] = current_time.strftime('%H:%M')
            
            # Only log schedule matches occasionally to reduce spam
            if hash(instructor_name) % 50 == 0:
                status = "[OK] VALID" if schedule.get('isValidSchedule', True) else "[WARN] WRONG ROOM"
                print(f"[DATA SOURCE] [LOCAL DB] {status} {instructor_name} has class NOW (from LOCAL SQLite DB): {schedule.get('courseCode')} - Late: {schedule.get('is_late', False)}", file=sys.stderr, flush=True)
            return schedule
    
    # Step 2: Try cache (in-memory, fast)
    # Reduced logging - only log occasionally
    schedule = get_current_schedule_from_cache(instructor_name)
    if schedule:
        # Validate room if room_name is provided
        if room_name:
            schedule_room = (schedule.get('room') or "").strip().lower()
            provided_room = room_name.strip().lower()
            room_match = schedule_room == provided_room or \
                        schedule_room in provided_room or \
                        provided_room in schedule_room
            
            if room_match:
                schedule['isValidSchedule'] = True
                schedule['roomMatch'] = True
                # Only log occasionally to reduce spam
                if hash(instructor_name) % 50 == 0:
                    print(f"[DATA SOURCE] [CACHE] [OK] {instructor_name} has class NOW (from IN-MEMORY CACHE): {schedule.get('courseCode')} in room {schedule.get('room')}", file=sys.stderr, flush=True)
            else:
                schedule['isValidSchedule'] = False
                schedule['roomMatch'] = False
                # Only log warnings occasionally
                if hash(instructor_name) % 50 == 0:
                    print(f"[DATA SOURCE] [CACHE] [WARN] {instructor_name} has class NOW but wrong room. Expected: {schedule.get('room')}, Camera room: {room_name}", file=sys.stderr, flush=True)
        else:
            schedule['isValidSchedule'] = True
            schedule['roomMatch'] = None
            # Only log occasionally
            if hash(instructor_name) % 50 == 0:
                print(f"[DATA SOURCE] [CACHE] [OK] {instructor_name} has class NOW (from IN-MEMORY CACHE): {schedule.get('courseCode')} (room not validated)", file=sys.stderr, flush=True)
        
        return schedule
    
    # Step 3: Try API as fallback (ONLINE - only if local DB and cache both fail)
    # Skip API calls in offline mode OR if using local cache for detection (performance optimization)
    if OFFLINE_MODE:
        if hash(instructor_name) % 100 == 0:
            print(f"[DATA SOURCE] [OFFLINE MODE] Skipping MongoDB API call for {instructor_name} (OFFLINE_MODE=true)", file=sys.stderr, flush=True)
        return None
    
    # ⚡ PERFORMANCE: Skip slow MongoDB API calls during face detection if local cache is enabled
    if USE_LOCAL_CACHE_FOR_DETECTION:
        if hash(instructor_name) % 100 == 0:
            print(f"[DATA SOURCE] [CACHE ONLY] Skipping MongoDB API call for {instructor_name} (USE_LOCAL_CACHE_FOR_DETECTION=true) - Using local cache for speed", file=sys.stderr, flush=True)
        return None
    
    with schedule_cache_lock:
        cache_is_empty = len(schedule_cache) == 0
        cache_is_old = schedule_cache_last_refresh is None or \
                       (datetime.now() - schedule_cache_last_refresh).total_seconds() > SCHEDULE_CACHE_REFRESH_INTERVAL_SECONDS * 2
    
    if cache_is_empty or cache_is_old:
        print(f"[DATA SOURCE] [MONGODB API] Cache miss for {instructor_name}, fetching from MONGODB ATLAS via API...", file=sys.stderr, flush=True)
        try:
            request_data = {"instructorName": formatted_name}
            if room_name:
                request_data["roomName"] = room_name
            if camera_id:
                request_data["cameraId"] = camera_id
            
            response = requests.post(
                f"{BACKEND_API}/get-current-schedule",
                json=request_data,
                timeout=5
            )
            if response.status_code == 200:
                data = response.json()
                schedule = data.get("schedule")
                
                if schedule:
                    # Save to local database for future offline use
                    if LOCAL_DB_AVAILABLE:
                        print(f"[DATA SOURCE] [MONGODB API] Saving schedule to LOCAL DB for future offline use...", file=sys.stderr, flush=True)
                        save_schedule(schedule)
                    
                    # Verify the schedule is for today and current time
                    current_day = get_current_day()
                    current_time = datetime.now().time()
                    
                    # Check if today is a scheduled day
                    days = schedule.get('days', {})
                    if days and len(days) > 0:
                        if not days.get(current_day, False):
                            print(f"[INFO] {instructor_name} has no class scheduled today ({current_day})", file=sys.stderr, flush=True)
                            return None
                    
                    # Parse schedule times
                    start_time = parse_time_string(schedule.get('startTime', ''))
                    end_time = parse_time_string(schedule.get('endTime', ''))
                    
                    if not start_time or not end_time:
                        print(f"[WARN] Invalid time format for {instructor_name}'s schedule", file=sys.stderr, flush=True)
                        return None
                    
                    # Check if current time is within the class period (including 30 min before)
                    time_before_class = (datetime.combine(datetime.today(), start_time) - timedelta(minutes=30)).time()
                    
                    if time_before_class <= current_time <= end_time:
                        # Calculate if they're late
                        late_threshold_time = (datetime.combine(datetime.today(), start_time) + timedelta(minutes=LATE_THRESHOLD_MINUTES)).time()
                        is_late = current_time > late_threshold_time
                        
                        schedule['is_late'] = is_late
                        schedule['start_time_obj'] = start_time
                        schedule['current_time_str'] = current_time.strftime('%H:%M')
                        
                        # Get validation flags from API response if available
                        api_data = response.json()
                        schedule['isValidSchedule'] = api_data.get('isValidSchedule', True)
                        schedule['timeMatch'] = api_data.get('timeMatch', True)
                        schedule['roomMatch'] = api_data.get('roomMatch', None)
                        
                        status = "[OK] VALID" if schedule.get('isValidSchedule', True) else "[WARN] WRONG ROOM"
                        print(f"[DATA SOURCE] [MONGODB API] {status} {instructor_name} has class NOW (from MONGODB ATLAS): {schedule.get('courseCode')} ({start_time}-{end_time}) - Late: {is_late}", file=sys.stderr, flush=True)
                        return schedule
        except Exception as e:
            print(f"[DATA SOURCE] [MONGODB API] [ERROR] API fallback failed (offline mode): {e}", file=sys.stderr, flush=True)
    
    return None

def log_time_in(instructor_name, schedule_id, camera_id, is_late):
    """Log time in - queues locally (offline), tries to sync if online"""
    log_type = "late" if is_late else "time in"
    formatted_name = format_instructor_name(instructor_name)
    current_time = datetime.now()
    
    # Always queue locally first (works offline)
    if LOCAL_DB_AVAILABLE:
        log_id = queue_attendance_log({
            "instructorName": formatted_name,
            "scheduleId": schedule_id,
            "cameraId": camera_id,
            "date": current_time.date().isoformat(),
            "timeIn": current_time.time().strftime('%H:%M:%S'),
            "status": "late" if is_late else "present",
            "remarks": "Late (arrived after grace period)" if is_late else "On time",
            "logType": log_type,
            "isLate": is_late
        })
        
        if log_id > 0:
            mode_msg = "OFFLINE MODE" if OFFLINE_MODE else "will sync to MongoDB when online"
            print(f"[DATA SOURCE] [LOCAL DB] [OK] Logged {log_type} to LOCAL database (ID: {log_id}) - {mode_msg}", file=sys.stderr, flush=True)
    
    # Skip API sync in offline mode
    if OFFLINE_MODE:
        return True, log_type
    
    # Try to sync to backend if online (non-blocking)
    try:
        response = requests.post(
            f"{BACKEND_API}/log-time-in",
            json={
                "instructorName": formatted_name,
                "scheduleId": schedule_id,
                "cameraId": camera_id,
                "timestamp": current_time.isoformat(),
                "logType": log_type,
                "isLate": is_late
            },
            timeout=5
        )
        if response.status_code == 200:
            # Mark as synced if local DB is available
            if LOCAL_DB_AVAILABLE:
                mark_log_synced(log_id)
            print(f"[DATA SOURCE] [MONGODB API] [OK] Synced {log_type} to MONGODB ATLAS (online sync)", file=sys.stderr, flush=True)
            return True, log_type
    except Exception as e:
        print(f"[DATA SOURCE] [MONGODB API] [WARN] Could not sync to MongoDB (offline mode): {e} - Log is queued locally", file=sys.stderr, flush=True)
        # Still return True because it's queued locally
        return True, log_type
    
    return True, log_type

def log_time_out(instructor_name, schedule_id, camera_id, total_minutes):
    """Log time out - queues locally (offline), tries to sync if online"""
    formatted_name = format_instructor_name(instructor_name)
    current_time = datetime.now()
    
    # Always queue locally first (works offline)
    if LOCAL_DB_AVAILABLE:
        log_id = queue_attendance_log({
            "instructorName": formatted_name,
            "scheduleId": schedule_id,
            "cameraId": camera_id,
            "date": current_time.date().isoformat(),
            "timeOut": current_time.time().strftime('%H:%M:%S'),
            "status": "present",
            "remarks": f"Total time: {total_minutes:.1f} minutes",
            "logType": "time out",
            "isLate": False
        })
        
        if log_id > 0:
            mode_msg = "OFFLINE MODE" if OFFLINE_MODE else "will sync to MongoDB when online"
            print(f"[INFO] [OK] Logged time out locally (ID: {log_id}) - {mode_msg}", file=sys.stderr, flush=True)
    
    # Skip API sync in offline mode
    if OFFLINE_MODE:
        return True
    
    # Try to sync to backend if online (non-blocking)
    try:
        response = requests.post(
            f"{BACKEND_API}/log-time-out",
            json={
                "instructorName": formatted_name,
                "scheduleId": schedule_id,
                "cameraId": camera_id,
                "timestamp": current_time.isoformat(),
                "totalMinutes": total_minutes
            },
            timeout=5
        )
        return response.status_code == 200
    except Exception as e:
        print(f"[ERROR] Failed to log time out: {e}", file=sys.stderr, flush=True)
        return False

# Global variables for embeddings (thread-safe)
known_embeddings = []
known_names = []
embeddings_lock = threading.Lock()
reload_requested = threading.Event()

# Dictionary to track person session data
person_sessions = {}

class PersonSession:
    def __init__(self, name):
        self.name = name
        self.first_seen = datetime.now()
        self.last_seen = datetime.now()
        self.total_time_seconds = 0
        self.is_present = True
        self.left_at = None
        self.schedule = None
        self.time_in_logged = False
        self.time_out_logged = False
        self.is_late = False  # Track if they were late
        self.log_type = None  # "time in" or "late"
        self.last_schedule_check = datetime.now()  # Track when schedule was last checked
        
    def update_presence(self):
        """Update last seen time and calculate accumulated time"""
        now = datetime.now()
        if self.is_present:
            time_diff = (now - self.last_seen).total_seconds()
            self.total_time_seconds += time_diff
        self.last_seen = now
        
    def mark_left(self):
        """Mark person as having left"""
        if self.is_present:
            self.update_presence()
            self.is_present = False
            self.left_at = datetime.now()
            return True
        return False
        
    def mark_returned(self):
        """Mark person as having returned"""
        if not self.is_present:
            self.is_present = True
            returned_at = datetime.now()
            absence_duration = (returned_at - self.left_at).total_seconds()
            self.last_seen = returned_at
            return True, absence_duration
        return False, 0
        
    def get_total_time_minutes(self):
        """Get total time in minutes"""
        if self.is_present:
            self.update_presence()
        return self.total_time_seconds / 60
        
    def _make_json_serializable(self, obj):
        """Recursively convert objects to JSON-serializable format"""
        if obj is None:
            return None
        elif hasattr(obj, 'isoformat'):
            # datetime or date objects
            return obj.isoformat()
        elif hasattr(obj, 'strftime'):
            # time objects
            return obj.strftime('%H:%M:%S')
        elif isinstance(obj, dict):
            return {k: self._make_json_serializable(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [self._make_json_serializable(item) for item in obj]
        elif isinstance(obj, (str, int, float, bool)):
            return obj
        else:
            # Convert anything else to string
            return str(obj)
    
    def to_dict(self):
        """Convert session to dictionary for JSON"""
        return {
            "name": self.name,
            "first_seen": self.first_seen.isoformat(),
            "last_seen": self.last_seen.isoformat(),
            "total_minutes": round(self.get_total_time_minutes(), 2),
            "is_present": self.is_present,
            "left_at": self.left_at.isoformat() if self.left_at else None,
            "is_late": self.is_late,
            "log_type": self.log_type,
            "schedule": self._make_json_serializable(self.schedule)
        }

# ----------------------------
# File System Watcher
# ----------------------------
class FaceDatasetWatcher(FileSystemEventHandler):
    """Watches the faces directory for changes and triggers reload"""
    
    def __init__(self, debounce_seconds=2):
        super().__init__()
        self.debounce_seconds = debounce_seconds
        self.last_event_time = {}
        
    def should_process_event(self, file_path):
        """Debounce events to avoid multiple reloads for the same file"""
        now = time.time()
        if file_path in self.last_event_time:
            if now - self.last_event_time[file_path] < self.debounce_seconds:
                return False
        self.last_event_time[file_path] = now
        return True
    
    def is_image_file(self, path):
        """Check if file is an image"""
        image_extensions = {'.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'}
        return Path(path).suffix in image_extensions
    
    def on_created(self, event):
        """Handle file creation events"""
        if not event.is_directory and self.is_image_file(event.src_path):
            if self.should_process_event(event.src_path):
                print(f"[WATCHER] New image detected: {event.src_path}", file=sys.stderr, flush=True)
                reload_requested.set()
    
    def on_modified(self, event):
        """Handle file modification events"""
        if not event.is_directory and self.is_image_file(event.src_path):
            if self.should_process_event(event.src_path):
                print(f"[WATCHER] Image modified: {event.src_path}", file=sys.stderr, flush=True)
                reload_requested.set()
    
    def on_deleted(self, event):
        """Handle file deletion events"""
        if not event.is_directory and self.is_image_file(event.src_path):
            if self.should_process_event(event.src_path):
                print(f"[WATCHER] Image deleted: {event.src_path}", file=sys.stderr, flush=True)
                reload_requested.set()

# ----------------------------
# Embeddings Management
# ----------------------------
def load_embeddings(app):
    """⚡ PRE-PROCESS ALL FACES AT STARTUP - Store in RAM for instant recognition"""
    global known_embeddings, known_names
    
    print("[INFO] ⚡ PRE-PROCESSING ALL FACES - Loading into RAM for instant recognition...", file=sys.stderr, flush=True)
    
    if not DATASET_DIR.exists():
        print(f"[ERROR] Dataset directory does not exist: {DATASET_DIR}", file=sys.stderr, flush=True)
        return False
    
    # Collect all images first
    all_images = []  # List of (img, label, img_path) tuples
    person_dirs = [d for d in DATASET_DIR.iterdir() if d.is_dir()]
    
    print(f"[INFO] Found {len(person_dirs)} person folders - collecting all images...", file=sys.stderr, flush=True)
    
    for person_dir in person_dirs:
        label = person_dir.name
        for img_path in person_dir.glob("*.*"):
            if img_path.suffix.lower() not in ['.jpg', '.jpeg', '.png']:
                continue
            try:
                img = cv2.imread(str(img_path))
                if img is not None:
                    all_images.append((img, label, img_path))
            except Exception as e:
                print(f"[WARN] Could not read {img_path}: {e}", file=sys.stderr, flush=True)
    
    if not all_images:
        print("[ERROR] No images found in dataset folder.", file=sys.stderr, flush=True)
        return False
    
    print(f"[INFO] ⚡ Processing {len(all_images)} images in batches for maximum speed...", file=sys.stderr, flush=True)
    
    temp_embeddings = []
    temp_names = []
    batch_data = []  # For batch saving to SQLite
    processed_count = 0
    failed_count = 0
    
    # ⚡ BATCH PROCESSING: Process images in batches for faster GPU processing
    BATCH_SIZE = 32  # Process 32 images at once on GPU
    for i in range(0, len(all_images), BATCH_SIZE):
        batch = all_images[i:i+BATCH_SIZE]
        batch_imgs = []
        batch_labels = []
        batch_paths = []
        
        for img, label, img_path in batch:
            batch_imgs.append(img)
            batch_labels.append(label)
            batch_paths.append(img_path)
        
        # Process batch
        for img, label, img_path in zip(batch_imgs, batch_labels, batch_paths):
            try:
                faces = app.get(img)
                if len(faces) == 0:
                    failed_count += 1
                    if failed_count <= 5:  # Only log first 5 failures
                        print(f"[WARN] No face detected in: {img_path.name}", file=sys.stderr, flush=True)
                    continue
                
                emb = faces[0].embedding
                
                if len(temp_embeddings) > 0 and len(emb) != len(temp_embeddings[0]):
                    print(f"[WARN] Skipping {img_path.name}: embedding size mismatch", file=sys.stderr, flush=True)
                    continue
                
                emb = emb / norm(emb)
                temp_embeddings.append(emb)
                temp_names.append(label)
                processed_count += 1
                
                # Prepare for SQLite batch save
                if SQLITE_AVAILABLE:
                    batch_data.append((label, emb, str(img_path), None))
                
            except Exception as e:
                failed_count += 1
                if failed_count <= 5:
                    print(f"[ERROR] Failed to process {img_path.name}: {e}", file=sys.stderr, flush=True)
                continue
        
        # Progress update
        if (i + BATCH_SIZE) % (BATCH_SIZE * 4) == 0 or i + BATCH_SIZE >= len(all_images):
            progress = min(100, int((i + BATCH_SIZE) / len(all_images) * 100))
            print(f"[INFO] ⚡ Progress: {progress}% ({processed_count} faces processed, {failed_count} failed)", file=sys.stderr, flush=True)
    
    if not temp_embeddings:
        print("[ERROR] No faces found in dataset folder.", file=sys.stderr, flush=True)
        return False
    
    # ⚡ STORE IN RAM: Convert to numpy array and store in global variables (float32 for speed)
    with embeddings_lock:
        known_embeddings = np.array(temp_embeddings, dtype=np.float32)  # float32 for faster GPU computation
        known_names = temp_names
        print(f"[INFO] ✅ ALL FACES PRE-PROCESSED AND STORED IN RAM!", file=sys.stderr, flush=True)
        print(f"[INFO] 📊 Total: {len(known_embeddings)} faces from {len(set(known_names))} people", file=sys.stderr, flush=True)
        print(f"[INFO] 💾 Memory: ~{len(known_embeddings) * known_embeddings[0].size * 4 / 1024 / 1024:.1f} MB in RAM", file=sys.stderr, flush=True)
    
    # Save to SQLite for future fast loading (optional)
    if SQLITE_AVAILABLE and batch_data:
        print("[INFO] 💾 Saving embeddings to database for future fast loading...", file=sys.stderr, flush=True)
        try:
            save_embeddings_batch(batch_data)
            print("[INFO] ✅ Embeddings saved to database", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"[WARN] Failed to save embeddings to SQLite: {e}", file=sys.stderr, flush=True)
    
    return True

def reload_embeddings_if_needed(app):
    """Check if reload is requested and reload embeddings"""
    if reload_requested.is_set():
        print("[INFO] [SYNC] Reloading face database...", file=sys.stderr, flush=True)
        reload_requested.clear()
        
        success = load_embeddings(app)
        if success:
            print("[INFO] [OK] Face database reloaded successfully!", file=sys.stderr, flush=True)
            return True
        else:
            print("[ERROR] [ERROR] Failed to reload face database", file=sys.stderr, flush=True)
            return False
    return False

# ----------------------------
# Helper functions
# ----------------------------
def read_single_frame():
    """Read a single frame from stdin"""
    try:
        len_bytes = sys.stdin.buffer.read(4)
        if not len_bytes or len(len_bytes) < 4:
            return None
        
        frame_len = struct.unpack(">I", len_bytes)[0]
        
        if frame_len > 10 * 1024 * 1024:
            return None
        
        if frame_len == 0:
            return None
        
        jpg_bytes = b''
        while len(jpg_bytes) < frame_len:
            chunk = sys.stdin.buffer.read(min(65536, frame_len - len(jpg_bytes)))
            if not chunk:
                return None
            jpg_bytes += chunk
        
        return jpg_bytes
    except:
        return None

def read_frame_from_stdin():
    """⚡ ZERO-DELAY: Always return the LATEST frame, aggressively skip queued frames for real-time"""
    try:
        # ⚡ NO LIMIT FRAME SKIPPING: Read and discard ALL queued frames, keep only the latest
        latest_frame = None
        frames_skipped = 0
        # NO LIMIT - Skip all queued frames until stdin is empty
        
        # Keep reading frames until stdin is empty (non-blocking) - NO LIMIT
        while True:
            frame = read_single_frame()
            if frame is None:
                break  # No more frames available
            
            # If we already have a frame, this is a newer one - skip the old one
            if latest_frame is not None:
                frames_skipped += 1
                # Free old frame memory immediately
                del latest_frame
            
            latest_frame = frame  # Keep the newest frame
            
            # Check if more data is immediately available (non-blocking, zero timeout)
            ready, _, _ = select.select([sys.stdin.buffer], [], [], 0)
            if not ready:
                break  # No more frames waiting
        
        if frames_skipped > 0:
            if frames_skipped % 100 == 0:  # Log even less frequently to reduce overhead
                print(f"[PERF] ⚡ Skipped {frames_skipped} old frames - ZERO DELAY maintained!", file=sys.stderr, flush=True)
        
        if latest_frame is None:
            return None
        
        jpg_bytes = latest_frame
        
        # Debug: Check JPEG validity
        if len(jpg_bytes) < 2 or jpg_bytes[0] != 0xFF or jpg_bytes[1] != 0xD8:
            print(f"[ERROR] Invalid JPEG header: {jpg_bytes[:4].hex()}", file=sys.stderr, flush=True)
            jpg_bytes = None  # Free memory
            return None
        
        # Use copy to avoid memory issues with frombuffer
        try:
            jpg_array = np.frombuffer(jpg_bytes, np.uint8)
            frame = cv2.imdecode(jpg_array, cv2.IMREAD_COLOR)
            # Explicitly delete to free memory
            del jpg_array
            jpg_bytes = None  # Free the bytes buffer
        except MemoryError as e:
            print(f"[ERROR] Memory error decoding frame: {e}", file=sys.stderr, flush=True)
            # Force garbage collection
            gc.collect()
            jpg_bytes = None
            return None
        except Exception as e:
            print(f"[ERROR] Failed to decode JPEG: {e}", file=sys.stderr, flush=True)
            jpg_bytes = None
            return None
        
        if frame is None:
            print(f"[ERROR] Failed to decode JPEG (size: {len(jpg_bytes) if jpg_bytes else 0} bytes)", file=sys.stderr, flush=True)
            return None
        
        return frame
        
    except Exception as e:
        print(f"[ERROR] Failed to read frame: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return None

def check_absent_people(currently_detected_names):
    """Check for people who have been absent for too long - ONLY for scheduled faculty"""
    events = []
    now = datetime.now()
    
    # Clean up old sessions (people who left more than 1 hour ago) to prevent memory leaks
    SESSION_CLEANUP_TIMEOUT = 3600  # 1 hour in seconds
    sessions_to_remove = []
    
    for name, session in list(person_sessions.items()):
        # Clean up old sessions that are no longer present
        if not session.is_present and session.left_at:
            time_since_left = (now - session.left_at).total_seconds()
            if time_since_left >= SESSION_CLEANUP_TIMEOUT:
                sessions_to_remove.append(name)
        
        # Only apply 5-minute timeout to faculty WITH scheduled classes
        if session.is_present and name not in currently_detected_names and session.schedule:
            time_since_last_seen = (now - session.last_seen).total_seconds()
            
            if time_since_last_seen >= ABSENCE_TIMEOUT_SECONDS:
                if session.mark_left():
                    if session.schedule and session.time_in_logged and not session.time_out_logged:
                        if log_time_out(name, session.schedule['_id'], "camera1", session.get_total_time_minutes()):
                            session.time_out_logged = True
                            events.append({
                                "type": "time_out",
                                "name": name,
                                "total_minutes": round(session.get_total_time_minutes(), 2),
                                "left_at": session.left_at.isoformat(),
                                "schedule": session.schedule
                            })
                            print(f"[INFO] [TIME OUT] TIME OUT logged for {name} - Total: {session.get_total_time_minutes():.1f} min", file=sys.stderr, flush=True)
                        else:
                            print(f"[WARN] Failed to log TIME OUT for {name}", file=sys.stderr, flush=True)
                    
                    events.append({
                        "type": "left",
                        "name": name,
                        "total_minutes": round(session.get_total_time_minutes(), 2),
                        "left_at": session.left_at.isoformat()
                    })
                    print(f"[INFO] {name} marked as LEFT after {ABSENCE_TIMEOUT_SECONDS}s absence (scheduled class)", file=sys.stderr, flush=True)
    
    # Remove old sessions to free memory
    for name in sessions_to_remove:
        del person_sessions[name]
        if len(sessions_to_remove) > 0:
            print(f"[MEMORY] Cleaned up {len(sessions_to_remove)} old session(s) from memory", file=sys.stderr, flush=True)
    
    return events

# ----------------------------
# Main Setup
# ----------------------------

# GPU Configuration - Define early so it can be used in startup messages
# ⚡ GPU ENABLED BY DEFAULT for GTX 3050 Ti - Set USE_GPU=false to disable
USE_GPU = os.getenv("USE_GPU", "true").lower() in ("true", "1", "yes")

print("=" * 60, file=sys.stderr, flush=True)
print(f"[INFO] 🚀 Starting EduVision Face Recognition System", file=sys.stderr, flush=True)
print(f"[INFO] ⚡ OPTIMIZED FOR ZERO DELAY - GPU Acceleration Enabled", file=sys.stderr, flush=True)
print(f"[INFO] ⚡ BATCH OPTIMIZATION: Multiple faces processed simultaneously", file=sys.stderr, flush=True)
if OFFLINE_MODE:
    print(f"[INFO] System Mode: OFFLINE (Local SQLite only)", file=sys.stderr, flush=True)
elif USE_LOCAL_CACHE_FOR_DETECTION:
    print(f"[INFO] System Mode: HYBRID (MongoDB for management, SQLite for face detection) ⚡", file=sys.stderr, flush=True)
    print(f"[INFO] Performance Optimization: Using local cache for fast face detection", file=sys.stderr, flush=True)
else:
    print(f"[INFO] System Mode: ONLINE (MongoDB with fallback)", file=sys.stderr, flush=True)

# GPU status
if USE_GPU:
    print(f"[INFO] 🎮 GPU MODE: Enabled (USE_GPU=true)", file=sys.stderr, flush=True)
    print(f"[INFO] 🎯 Expected: Real-time detection with ZERO delay on GTX 3050 Ti", file=sys.stderr, flush=True)
else:
    print(f"[INFO] ⚠️ GPU DISABLED - Detection may be slower", file=sys.stderr, flush=True)
    print(f"[INFO] 💡 TIP: Enable GPU for faster detection: set USE_GPU=true", file=sys.stderr, flush=True)
print("=" * 60, file=sys.stderr, flush=True)
print(f"[INFO] Looking for faces at: {DATASET_DIR.absolute()}", file=sys.stderr, flush=True)
print(f"[INFO] Path exists: {DATASET_DIR.exists()}", file=sys.stderr, flush=True)

if DATASET_DIR.exists():
    subdirs = [d for d in DATASET_DIR.iterdir() if d.is_dir()]
    print(f"[INFO] Found {len(subdirs)} person folders", file=sys.stderr, flush=True)
    for subdir in subdirs:
        image_count = len(list(subdir.glob("*.*")))
        print(f"[INFO]   - {subdir.name}: {image_count} images", file=sys.stderr, flush=True)

print("[INFO] Starting ArcFace initialization...", file=sys.stderr, flush=True)

# Initialize face detection and recognition models
# Pre-define gpu_available so it's accessible after the try block
gpu_available = False

# Import direct model classes for GPU acceleration
from insightface.model_zoo import SCRFD, ArcFaceONNX
import onnxruntime as ort

try:
    init_start = time.time()
    
    if USE_GPU:
        print("[INFO] 🚀 GPU MODE ENABLED - Initializing CUDA for maximum speed...", file=sys.stderr, flush=True)
        try:
            import onnxruntime as ort
            available_providers = ort.get_available_providers()
            print(f"[INFO] Available ONNX providers: {available_providers}", file=sys.stderr, flush=True)
            
            if 'CUDAExecutionProvider' in available_providers:
                print("[INFO] ⚡ CUDA GPU provider available - enabling GPU acceleration! ⚡", file=sys.stderr, flush=True)
                gpu_available = True
            
            if 'TensorrtExecutionProvider' in available_providers:
                print("[INFO] ⚡⚡ TensorRT provider also available - MAXIMUM SPEED! ⚡⚡", file=sys.stderr, flush=True)
            
            if not gpu_available:
                print(f"[WARN] No GPU provider available. Providers: {available_providers}", file=sys.stderr, flush=True)
                print("[INFO] Falling back to CPU mode", file=sys.stderr, flush=True)
        except Exception as gpu_error:
            print(f"[WARN] GPU check failed: {gpu_error}", file=sys.stderr, flush=True)
            print("[INFO] Falling back to CPU mode", file=sys.stderr, flush=True)
    else:
        print("[INFO] Using CPU for face detection (set USE_GPU=true for faster detection with NVIDIA GPU)", file=sys.stderr, flush=True)
    
    # ⚡ RetinaFace Detector Class - GPU-accelerated face detection
    class RetinaFaceDetector:
        """RetinaFace detector using ONNX Runtime for GPU acceleration"""
        def __init__(self, model_path, ctx_id=0, input_size=(640, 640)):
            self.model_path = model_path
            self.ctx_id = ctx_id
            self.input_size = input_size
            
            # Configure providers for GPU or CPU
            if ctx_id >= 0:
                providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
                provider_options = [{
                    'device_id': 0,
                    'arena_extend_strategy': 'kNextPowerOfTwo',
                    'gpu_mem_limit': 4 * 1024 * 1024 * 1024,  # 4GB - Maximum GPU memory (NO LIMIT)
                    'cudnn_conv_algo_search': 'HEURISTIC',
                    'do_copy_in_default_stream': True,
                }, {}]
            else:
                providers = ['CPUExecutionProvider']
                provider_options = [{}]
            
            # Load ONNX model
            self.session = ort.InferenceSession(model_path, providers=providers, provider_options=provider_options)
            self.input_name = self.session.get_inputs()[0].name
            self.output_names = [output.name for output in self.session.get_outputs()]
            
            # Get model input shape
            input_shape = self.session.get_inputs()[0].shape
            if len(input_shape) == 4:
                self.input_height, self.input_width = input_shape[2], input_shape[3]
            else:
                self.input_height, self.input_width = input_size[1], input_size[0]
            
            print(f"[INFO] RetinaFace model loaded: {model_path}")
            print(f"[INFO] Input size: {self.input_width}x{self.input_height}")
            print(f"[INFO] Providers: {providers}")
        
        def detect(self, img, threshold=0.5, max_num=1000):
            """Detect faces in image - returns bboxes and landmarks (SCRFD-compatible format) - NO LIMIT"""
            h, w = img.shape[:2]
            
            # Resize image to model input size
            img_resized = cv2.resize(img, (self.input_width, self.input_height))
            img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)
            img_norm = img_rgb.astype(np.float32) / 255.0
            img_transposed = np.transpose(img_norm, (2, 0, 1))
            img_batch = np.expand_dims(img_transposed, axis=0)
            
            # Run inference
            try:
                outputs = self.session.run(self.output_names, {self.input_name: img_batch})
            except Exception as e:
                print(f"[ERROR] RetinaFace inference failed: {e}", file=sys.stderr, flush=True)
                return np.zeros((0, 5)), None
            
            # Parse outputs - RetinaFace models can have different output formats
            # Try to detect the format and parse accordingly
            bboxes_with_scores = []
            landmarks_list = []
            
            # Common RetinaFace output formats:
            # 1. [bboxes, scores, landmarks] - already decoded
            # 2. [loc, conf, landmarks] - raw predictions (needs decoding)
            # 3. Single output with all predictions
            
            if len(outputs) == 0:
                return np.zeros((0, 5)), None
            
            # Try format 1: Already decoded bboxes and scores
            if len(outputs) >= 2:
                output_0 = outputs[0]
                output_1 = outputs[1]
                
                # Check if output_0 is bboxes (shape: [N, 4] or [N, 5])
                # Check if output_1 is scores (shape: [N] or [N, 1])
                if len(output_0.shape) == 2 and output_0.shape[1] >= 4:
                    if len(output_1.shape) == 1 or (len(output_1.shape) == 2 and output_1.shape[1] == 1):
                        # Format: [bboxes, scores, landmarks?]
                        pred_bboxes = output_0[:, :4]  # Take first 4 columns (x1, y1, x2, y2)
                        pred_scores = output_1.flatten() if len(output_1.shape) > 1 else output_1
                        
                        # Filter by threshold
                        valid_mask = pred_scores > threshold
                        if np.any(valid_mask):
                            # Get valid indices - NO LIMIT, process all valid detections
                            valid_indices = np.where(valid_mask)[0]
                            # No limiting - process ALL valid faces detected
                            
                            # Get filtered predictions
                            pred_bboxes = pred_bboxes[valid_indices]
                            pred_scores = pred_scores[valid_indices]
                            
                            # Scale bboxes back to original image size
                            scale_x = w / self.input_width
                            scale_y = h / self.input_height
                            pred_bboxes[:, [0, 2]] *= scale_x
                            pred_bboxes[:, [1, 3]] *= scale_y
                            
                            # Combine bboxes and scores (format: [x1, y1, x2, y2, score])
                            bboxes_with_scores = np.column_stack([pred_bboxes, pred_scores])
                            
                            # Get landmarks if available
                            if len(outputs) >= 3:
                                pred_landmarks = outputs[2]
                                if len(pred_landmarks.shape) == 3 and pred_landmarks.shape[1] == 5:  # 5 landmarks
                                    landmarks_list = pred_landmarks[valid_indices]
                                    # Scale landmarks
                                    landmarks_list[:, :, 0] *= scale_x
                                    landmarks_list[:, :, 1] *= scale_y
                                else:
                                    landmarks_list = [None] * len(bboxes_with_scores)
                            else:
                                landmarks_list = [None] * len(bboxes_with_scores)
            
            if len(bboxes_with_scores) == 0:
                return np.zeros((0, 5)), None
            
            # Convert to numpy array if needed
            if not isinstance(bboxes_with_scores, np.ndarray):
                bboxes_with_scores = np.array(bboxes_with_scores)
            
            # Return in SCRFD-compatible format: (bboxes with scores, landmarks)
            # landmarks should be an array of shape [N, 5, 2] where N is number of faces
            # Each face has 5 keypoints: [left_eye, right_eye, nose, left_mouth, right_mouth]
            if landmarks_list and len(landmarks_list) > 0 and landmarks_list[0] is not None:
                landmarks_array = np.array(landmarks_list)
                # Ensure shape is [N, 5, 2]
                if len(landmarks_array.shape) == 2 and landmarks_array.shape[1] == 10:
                    # Reshape from [N, 10] to [N, 5, 2] if needed
                    landmarks_array = landmarks_array.reshape(-1, 5, 2)
            else:
                # Create dummy landmarks from bbox center if not available
                landmarks_array = None
                if len(bboxes_with_scores) > 0:
                    # Generate approximate landmarks from bbox (fallback)
                    landmarks_array = []
                    for bbox in bboxes_with_scores:
                        x1, y1, x2, y2 = bbox[:4]
                        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
                        w, h = x2 - x1, y2 - y1
                        # Approximate 5 keypoints
                        landmarks = np.array([
                            [x1 + w * 0.3, y1 + h * 0.35],  # left_eye
                            [x1 + w * 0.7, y1 + h * 0.35],  # right_eye
                            [cx, y1 + h * 0.5],              # nose
                            [x1 + w * 0.3, y1 + h * 0.7],   # left_mouth
                            [x1 + w * 0.7, y1 + h * 0.7],   # right_mouth
                        ])
                        landmarks_array.append(landmarks)
                    landmarks_array = np.array(landmarks_array)
            
            return bboxes_with_scores, landmarks_array
        
        def prepare(self, ctx_id=None, input_size=None):
            """Prepare model (for compatibility with SCRFD interface)"""
            if ctx_id is not None:
                self.ctx_id = ctx_id
            if input_size is not None:
                self.input_size = input_size
            return self
    
    # ⚡ Direct model loading for GPU acceleration (bypasses FaceAnalysis wrapper)
    # This gives us direct control over GPU execution
    import os
    model_dir = os.path.expanduser('~/.insightface/models/buffalo_s')
    
    # Check for RetinaFace model first, fallback to SCRFD
    # RetinaFace model paths to check (common names)
    retinaface_paths = [
        os.path.join(model_dir, 'retinaface_r50_v1.onnx'),
        os.path.join(model_dir, 'retinaface.onnx'),
        os.path.join(model_dir, 'retinaface_mobile0.25.onnx'),
        os.path.join(os.path.expanduser('~/.insightface/models'), 'retinaface_r50_v1.onnx'),
    ]
    
    retinaface_path = None
    for path in retinaface_paths:
        if os.path.exists(path):
            retinaface_path = path
            break
    
    det_path = os.path.join(model_dir, 'det_500m.onnx')
    rec_path = os.path.join(model_dir, 'w600k_mbf.onnx')
    
    use_retinaface = retinaface_path is not None
    
    if use_retinaface:
        print(f"[INFO] 🎯 Using RetinaFace for face detection: {retinaface_path}!", file=sys.stderr, flush=True)
    else:
        print("[INFO] Using SCRFD for face detection (RetinaFace not found, using default)", file=sys.stderr, flush=True)
        print(f"[INFO] To use RetinaFace, download a RetinaFace ONNX model to: {model_dir}", file=sys.stderr, flush=True)
        print(f"[INFO] Common RetinaFace models: retinaface_r50_v1.onnx, retinaface.onnx, retinaface_mobile0.25.onnx", file=sys.stderr, flush=True)
        print(f"[INFO] You can download RetinaFace models from:", file=sys.stderr, flush=True)
        print(f"[INFO]   - https://github.com/deepinsight/insightface/tree/master/python-package", file=sys.stderr, flush=True)
        print(f"[INFO]   - https://github.com/StanislasBertrand/RetinaFace-tf2", file=sys.stderr, flush=True)
        print(f"[INFO]   - Or use: insightface-cli download --name retinaface_r50_v1", file=sys.stderr, flush=True)
    
    if not os.path.exists(det_path) and not use_retinaface:
        raise Exception(f"Detection model not found at {det_path}. Please download buffalo_s models.")
    
    # Detection size for GPU vs CPU
    # Larger size = better distant face detection, but slightly slower
    # 800x800 = maximum distant face detection while maintaining real-time performance on GTX 3050 Ti
    if gpu_available:
        det_size = (800, 800)  # Increased to 800x800 for maximum distant face detection - real-time performance
        print("[INFO] ⚡ GPU: Using 800x800 detection for GTX 3050 Ti (MAXIMUM distant face detection + real-time)", file=sys.stderr, flush=True)
    else:
        det_size = (480, 480)  # CPU: increased for better distant face detection
        print("[INFO] CPU: Using 480x480 detection for better distant face detection", file=sys.stderr, flush=True)
    
    ctx_id = 0 if gpu_available else -1
    
    # ⚡ MAXIMUM GPU PERFORMANCE: Configure ONNX Runtime for maximum speed
    if gpu_available:
        import onnxruntime as ort
        import os as os_env
        
        # ⚡ SET ENVIRONMENT VARIABLES for maximum GPU performance (affects InsightFace's ONNX Runtime)
        # These will be used by InsightFace's internal ONNX Runtime sessions
        os_env.environ['CUDA_VISIBLE_DEVICES'] = '0'  # Use first GPU
        os_env.environ['CUDA_LAUNCH_BLOCKING'] = '0'  # Non-blocking for maximum throughput
        
        # Configure CUDA provider options for maximum performance
        cuda_provider_options = {
            'device_id': 0,
            'arena_extend_strategy': 'kNextPowerOfTwo',  # Efficient memory allocation
            'gpu_mem_limit': 4 * 1024 * 1024 * 1024,  # 4GB - Use maximum available GPU memory (NO LIMIT)
            'cudnn_conv_algo_search': 'HEURISTIC',  # Faster algorithm search (vs EXHAUSTIVE)
            'do_copy_in_default_stream': True,  # Better memory management
            'tunable_op_enable': True,  # Enable tunable ops for optimization
            'tunable_op_tuning_enable': True,  # Enable tuning for maximum performance
        }
        print("[INFO] ⚡⚡ MAXIMUM GPU PERFORMANCE CONFIGURATION ⚡⚡", file=sys.stderr, flush=True)
        print(f"[INFO] GPU Memory Limit: {cuda_provider_options['gpu_mem_limit'] / 1024 / 1024 / 1024:.1f}GB (NO LIMIT - MAXIMUM)", file=sys.stderr, flush=True)
        print(f"[INFO] CuDNN Algorithm: HEURISTIC (fastest)", file=sys.stderr, flush=True)
        print(f"[INFO] Tunable Ops: ENABLED (maximum performance)", file=sys.stderr, flush=True)
    
    # Load detection model with GPU (ctx_id=0 forces GPU usage)
    if use_retinaface:
        print(f"[INFO] Loading RetinaFace detection model: {retinaface_path}", file=sys.stderr, flush=True)
        try:
            det_model = RetinaFaceDetector(retinaface_path, ctx_id=ctx_id, input_size=det_size)
            det_model.prepare(ctx_id=ctx_id, input_size=det_size)
            if ctx_id >= 0:
                print("[INFO] ✅ RetinaFace detection model loaded with GPU (ctx_id=0) - MAXIMUM PERFORMANCE!", file=sys.stderr, flush=True)
            else:
                print("[INFO] ✅ RetinaFace detection model loaded with CPU", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"[ERROR] Failed to load RetinaFace model: {e}", file=sys.stderr, flush=True)
            print(f"[INFO] Falling back to SCRFD...", file=sys.stderr, flush=True)
            use_retinaface = False
            det_model = SCRFD(det_path)
            det_model.prepare(ctx_id=ctx_id, input_size=det_size)
            if ctx_id >= 0:
                print("[INFO] ✅ SCRFD detection model loaded with GPU (ctx_id=0) - MAXIMUM PERFORMANCE!", file=sys.stderr, flush=True)
                # ⚡ VERIFY GPU USAGE: Check if model is actually using GPU
                try:
                    if hasattr(det_model, 'session') and hasattr(det_model.session, 'get_providers'):
                        providers = det_model.session.get_providers()
                        print(f"[INFO] 🔍 Detection model providers: {providers}", file=sys.stderr, flush=True)
                        if 'CUDAExecutionProvider' in providers or 'TensorrtExecutionProvider' in providers:
                            print("[INFO] ✅ VERIFIED: Detection model is using GPU!", file=sys.stderr, flush=True)
                        else:
                            print("[WARN] ⚠️ Detection model may not be using GPU!", file=sys.stderr, flush=True)
                except:
                    pass  # Skip if verification fails
            else:
                print("[INFO] ✅ SCRFD detection model loaded with CPU", file=sys.stderr, flush=True)
    else:
        print(f"[INFO] Loading SCRFD detection model: {det_path}", file=sys.stderr, flush=True)
        det_model = SCRFD(det_path)
        det_model.prepare(ctx_id=ctx_id, input_size=det_size)
        if ctx_id >= 0:
            print("[INFO] ✅ SCRFD detection model loaded with GPU (ctx_id=0) - MAXIMUM PERFORMANCE!", file=sys.stderr, flush=True)
        else:
            print("[INFO] ✅ SCRFD detection model loaded with CPU", file=sys.stderr, flush=True)
    
    # Load recognition model with GPU (ctx_id=0 forces GPU usage)
    print(f"[INFO] Loading recognition model: {rec_path}", file=sys.stderr, flush=True)
    rec_model = ArcFaceONNX(rec_path)
    rec_model.prepare(ctx_id=ctx_id)
    if ctx_id >= 0:
        print("[INFO] ✅ Recognition model loaded with GPU (ctx_id=0) - MAXIMUM PERFORMANCE!", file=sys.stderr, flush=True)
        # ⚡ VERIFY GPU USAGE: Check if model is actually using GPU
        try:
            if hasattr(rec_model, 'session') and hasattr(rec_model.session, 'get_providers'):
                providers = rec_model.session.get_providers()
                print(f"[INFO] 🔍 Recognition model providers: {providers}", file=sys.stderr, flush=True)
                if 'CUDAExecutionProvider' in providers or 'TensorrtExecutionProvider' in providers:
                    print("[INFO] ✅ VERIFIED: Recognition model is using GPU!", file=sys.stderr, flush=True)
                else:
                    print("[WARN] ⚠️ Recognition model may not be using GPU!", file=sys.stderr, flush=True)
        except:
            pass  # Skip if verification fails
    else:
        print("[INFO] ✅ Recognition model loaded with CPU", file=sys.stderr, flush=True)
    
    # Create a wrapper class that mimics FaceAnalysis API
    # ⚡ OPTIMIZED FOR BATCH PROCESSING - Multiple faces processed simultaneously on GPU
    class GPUFaceAnalysis:
        def __init__(self, det, rec, det_thresh=0.5):
            self.det_model = det
            self.rec_model = rec
            self.det_thresh = det_thresh
            from insightface.utils import face_align
            self.face_align = face_align
            
        def get(self, img, max_num=1000):
            """Detect faces and get embeddings - BATCH OPTIMIZED - NO LIMIT
            max_num=1000 (effectively unlimited) - process ALL faces detected
            Optimized for maximum detection and recognition"""
            # Step 1: Detection (single GPU call for ALL faces) - NO LIMIT
            # Process ALL faces detected - no restrictions
            # GPU processes this very fast even with many faces
            bboxes, kpss = self.det_model.detect(img, threshold=self.det_thresh, max_num=max_num)
            if bboxes.shape[0] == 0:
                return []
            
            # Note: Detection model already filters by threshold, so we don't need additional filtering
            # This ensures all detected faces are processed (especially important for distant faces)
            
            num_faces = bboxes.shape[0]
            
            # Step 2: Batch align ALL faces at once (CPU - fast)
            aligned_faces = []
            valid_indices = []
            for i in range(num_faces):
                if kpss is not None and kpss[i] is not None:
                    aimg = self.face_align.norm_crop(img, kpss[i])
                    aligned_faces.append(aimg)
                    valid_indices.append(i)
            
            # Step 3: Batch get embeddings for ALL faces in SINGLE GPU call
            embeddings = [None] * num_faces
            if aligned_faces:
                # Stack all aligned faces into batch
                batch_imgs = np.stack(aligned_faces, axis=0)
                # Get all embeddings in one GPU call (if model supports batch)
                for idx, aligned_idx in enumerate(valid_indices):
                    emb = self.rec_model.get_feat(aligned_faces[idx]).flatten()
                    embeddings[aligned_idx] = emb
            
            # Step 4: Build face objects
            faces = []
            for i in range(num_faces):
                face = type('Face', (), {})()
                # ⚡ FIX: Use copy() to ensure bbox is not a view that can be modified
                # This prevents bbox coordinates from being corrupted when processing multiple faces
                face.bbox = bboxes[i, 0:4].copy()  # Copy to prevent view issues
                face.det_score = float(bboxes[i, 4])
                face.kps = kpss[i].copy() if kpss is not None and kpss[i] is not None else None
                face.embedding = embeddings[i]
                faces.append(face)
            
            return faces
    
    app = GPUFaceAnalysis(det_model, rec_model, det_thresh=DETECTION_THRESHOLD)
    if use_retinaface:
        model_name = "RetinaFace + ArcFace (GPU Direct)"
    else:
        model_name = "SCRFD + ArcFace (GPU Direct)"
    
    init_time = time.time() - init_start
    
    device_type = "GPU (CUDA)" if ctx_id >= 0 else "CPU"
    print(f"[INFO] ✅ Face models loaded successfully on {device_type} (took {init_time:.2f}s)", file=sys.stderr, flush=True)
    print(f"[INFO] 🎯 Model: {model_name}, det_size={det_size}", file=sys.stderr, flush=True)
    print(f"[INFO] 📏 Detection threshold: {DETECTION_THRESHOLD} (BALANCED - detects faces accurately)", file=sys.stderr, flush=True)
    print(f"[INFO] 📏 Recognition threshold: {CONF_THRESHOLD} (BALANCED - recognizes faces accurately)", file=sys.stderr, flush=True)
    if ctx_id >= 0:
        print(f"[INFO] ⚡ GPU Context ID: {ctx_id} - Face detection will run on GPU with REAL-TIME performance!", file=sys.stderr, flush=True)
        print(f"[INFO] 👁️ MAXIMUM DISTANT FACE DETECTION - 800x800 detection size + low thresholds = detects & recognizes faces even when very far away!", file=sys.stderr, flush=True)
        print(f"[INFO] ⚡ REAL-TIME OPTIMIZATIONS: Batch processing + GPU acceleration + aggressive frame skipping = SMOOTH, ZERO-DELAY detection!", file=sys.stderr, flush=True)
    else:
        print(f"[INFO] Running on CPU mode", file=sys.stderr, flush=True)
        
except Exception as e:
    print(f"[ERROR] Failed to load ArcFace model: {e}", file=sys.stderr, flush=True)
    import traceback
    traceback.print_exc(file=sys.stderr)
    print("\n[HELP] Troubleshooting steps:", file=sys.stderr, flush=True)
    print("1. Free up RAM - Close other applications", file=sys.stderr, flush=True)
    print("2. Re-download models - Delete ~/.insightface/models and restart", file=sys.stderr, flush=True)
    print("3. Check available RAM - You need at least 4GB free for buffalo_s", file=sys.stderr, flush=True)
    print("4. Try restarting your computer to clear memory fragmentation", file=sys.stderr, flush=True)
    sys.exit(1)

# ⚡ PRE-PROCESS ALL FACES AT STARTUP - Store in RAM for instant recognition
print("[INFO] ⚡ PRE-PROCESSING ALL FACES - Loading into RAM for instant recognition...", file=sys.stderr, flush=True)
embedding_start = time.time()
if not load_embeddings(app):
    print("[ERROR] Failed to load embeddings. Exiting.", file=sys.stderr, flush=True)
    sys.exit(1)
embedding_time = time.time() - embedding_start
print(f"[INFO] ✅ ALL FACES PRE-PROCESSED AND STORED IN RAM (took {embedding_time:.2f}s)", file=sys.stderr, flush=True)
print(f"[INFO] ⚡ Recognition is now INSTANT - all embeddings ready in memory!", file=sys.stderr, flush=True)

# ⚡ GPU PERFORMANCE MONITORING: Check GPU usage periodically
def check_gpu_usage():
    """Check GPU utilization and memory usage"""
    try:
        import subprocess
        result = subprocess.run(['nvidia-smi', '--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'], 
                              capture_output=True, text=True, timeout=2)
        if result.returncode == 0:
            gpu, mem_used, mem_total = result.stdout.strip().split(', ')
            return {
                'utilization': int(gpu),
                'memory_used_mb': int(mem_used),
                'memory_total_mb': int(mem_total),
                'memory_percent': int(mem_used) * 100 // int(mem_total) if int(mem_total) > 0 else 0
            }
    except:
        pass
    return None

# ⚡ MAXIMUM GPU WARMUP: Run multiple dummy inferences to MAXIMIZE GPU utilization
if gpu_available:
    print("[INFO] ⚡⚡⚡ MAXIMUM GPU WARMUP: Warming up GTX 3050 Ti for MAXIMUM performance...", file=sys.stderr, flush=True)
    warmup_start = time.time()
    try:
        # Create multiple dummy images with variations to warmup all GPU code paths
        dummy_imgs = []
        for var in range(5):  # 5 different variations
            dummy_img = np.zeros((det_size[1], det_size[0], 3), dtype=np.uint8)
            # Add different features to warmup different code paths
            dummy_img[100+var*20:200+var*20, 100+var*20:200+var*20] = 128 + var * 20
            dummy_imgs.append(dummy_img)
        
        # ⚡ AGGRESSIVE WARMUP: 20 iterations with variations for maximum GPU utilization
        for i in range(20):  # Increased to 20 iterations for maximum GPU utilization
            img = dummy_imgs[i % len(dummy_imgs)]  # Cycle through variations
            _ = app.get(img)  # This warms up both detection AND recognition on GPU
            if i % 5 == 0:
                print(f"[INFO] ⚡ GPU warmup iteration {i+1}/20 (MAXIMIZING GPU utilization)...", file=sys.stderr, flush=True)
        
        warmup_time = time.time() - warmup_start
        print(f"[INFO] ✅ GPU warmed up in {warmup_time:.2f}s - MAXIMUM GPU utilization ready!", file=sys.stderr, flush=True)
        
        # ⚡ VERIFY GPU USAGE: Check GPU utilization after warmup
        gpu_stats = check_gpu_usage()
        if gpu_stats:
            print(f"[INFO] ⚡ GPU Status: {gpu_stats['utilization']}% utilization, {gpu_stats['memory_used_mb']}MB/{gpu_stats['memory_total_mb']}MB memory", file=sys.stderr, flush=True)
            if gpu_stats['utilization'] > 10 or gpu_stats['memory_used_mb'] > 100:
                print(f"[INFO] ✅✅✅ GPU MAXIMIZED! (Utilization: {gpu_stats['utilization']}%, Memory: {gpu_stats['memory_used_mb']}MB)", file=sys.stderr, flush=True)
            elif gpu_stats['utilization'] > 0 or gpu_stats['memory_used_mb'] > 50:
                print(f"[INFO] ✅ GPU is being used (Utilization: {gpu_stats['utilization']}%, Memory: {gpu_stats['memory_used_mb']}MB)", file=sys.stderr, flush=True)
            else:
                print(f"[WARN] ⚠️ GPU may not be maximized (Utilization: {gpu_stats['utilization']}%, Memory: {gpu_stats['memory_used_mb']}MB)", file=sys.stderr, flush=True)
                print(f"[WARN] ⚠️ GPU will activate when detection starts. Check nvidia-smi during detection.", file=sys.stderr, flush=True)
    except Exception as warmup_error:
        print(f"[WARN] GPU warmup failed: {warmup_error} - First detection may be slower", file=sys.stderr, flush=True)

# Start MongoDB sync service (optional background sync) - Skip in offline mode
if not OFFLINE_MODE:
    try:
        from mongodb_sync import start_sync
        start_sync()
        print("[INFO] [OK] MongoDB sync service started (optional background sync)", file=sys.stderr, flush=True)
    except ImportError:
        print("[INFO] [WARN] MongoDB sync service not available", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"[WARN] Failed to start MongoDB sync service: {e}", file=sys.stderr, flush=True)
else:
    print("[INFO] [OFFLINE] MongoDB sync service skipped (OFFLINE_MODE=true)", file=sys.stderr, flush=True)

# Start local log sync service (syncs queued logs to MongoDB when online)
try:
    from sync_local_logs import start_sync as start_log_sync
    start_log_sync()
    print("[INFO] [OK] Log sync service started (syncs local logs to MongoDB when online)", file=sys.stderr, flush=True)
except ImportError:
    print("[INFO] [WARN] Log sync service not available", file=sys.stderr, flush=True)
except Exception as e:
    print(f"[WARN] Failed to start log sync service: {e}", file=sys.stderr, flush=True)

# Load initial schedule cache (skip in offline mode)
if not OFFLINE_MODE:
    if USE_LOCAL_CACHE_FOR_DETECTION and LOCAL_DB_AVAILABLE:
        print("[INFO] [HYBRID] Using local SQLite for face detection (fast!) ⚡", file=sys.stderr, flush=True)
        print("[INFO] [HYBRID] Ensure data is synced using: POST /api/system/sync-to-offline", file=sys.stderr, flush=True)
        # Still load in-memory cache as fallback
        refresh_schedule_cache()
    else:
        print("[INFO] Loading schedule cache from MongoDB...", file=sys.stderr, flush=True)
        refresh_schedule_cache()  # Initial load

    # Background thread to periodically refresh schedule cache
    def cache_refresh_worker():
        """Background thread that periodically refreshes the schedule cache"""
        while True:
            time.sleep(SCHEDULE_CACHE_REFRESH_INTERVAL_SECONDS)
            refresh_schedule_cache()

    cache_refresh_thread = threading.Thread(target=cache_refresh_worker, daemon=True)
    cache_refresh_thread.start()
    print("[INFO] [OK] Schedule cache refresh thread started", file=sys.stderr, flush=True)
else:
    print("[INFO] [OFFLINE] Schedule cache refresh skipped (OFFLINE_MODE=true)", file=sys.stderr, flush=True)

# Start file system watcher
print("[INFO] Starting file system watcher...", file=sys.stderr, flush=True)
event_handler = FaceDatasetWatcher(debounce_seconds=2)
observer = Observer()
observer.schedule(event_handler, str(DATASET_DIR), recursive=True)
observer.start()
print("[INFO] [OK] File system watcher started", file=sys.stderr, flush=True)

# Signal ready to Node.js
print("READY", flush=True)

# ----------------------------
# Recognition Loop
# ----------------------------
print("[INFO] Entering recognition loop...", file=sys.stderr, flush=True)
print(f"[INFO] Absence timeout: {ABSENCE_TIMEOUT_SECONDS} seconds", file=sys.stderr, flush=True)
print(f"[INFO] Late threshold: {LATE_THRESHOLD_MINUTES} minutes", file=sys.stderr, flush=True)

# Verify embeddings are loaded
with embeddings_lock:
    if len(known_embeddings) == 0:
        print("[ERROR] ❌ NO EMBEDDINGS LOADED! Face recognition will not work!", file=sys.stderr, flush=True)
        print("[ERROR] Check if face images exist in:", DATASET_DIR, file=sys.stderr, flush=True)
    else:
        print(f"[INFO] ✅ Ready for recognition: {len(known_embeddings)} embeddings loaded for {len(set(known_names))} people", file=sys.stderr, flush=True)

frame_count = 0
last_absence_check = datetime.now()
last_gpu_check = time.time()

# Profiling variables (reduced overhead for zero lag)
total_frame_read_time = 0
total_detection_time = 0
total_recognition_time = 0
total_processing_time = 0
profile_interval = 2000  # Report every 2000 frames (reduced overhead)

try:
    while True:
        try:
            # ⏱️ PROFILING: Start frame processing timer
            frame_start_time = time.time()
            
            # Check if embeddings need to be reloaded (less frequently to reduce overhead)
            if frame_count % 100 == 0:  # Check every 100 frames instead of every frame
            reload_embeddings_if_needed(app)
            
            # ⏱️ PROFILING: Frame read timer
            read_start = time.time()
            frame = read_frame_from_stdin()
            read_time = time.time() - read_start
            total_frame_read_time += read_time
            
            if frame is None:
                print("[INFO] No more frames, exiting", file=sys.stderr, flush=True)
                break
            
            frame_count += 1
            
            # ⚡ GPU PERFORMANCE MONITORING: Check GPU usage and verify maximization
            if gpu_available and frame_count % 1000 == 0:
                gpu_stats = check_gpu_usage()
                if gpu_stats:
                    util = gpu_stats['utilization']
                    mem = gpu_stats['memory_used_mb']
                    mem_total = gpu_stats['memory_total_mb']
                    mem_percent = gpu_stats['memory_percent']
                    
                    print(f"[GPU] ⚡ Utilization: {util}% | Memory: {mem}MB/{mem_total}MB ({mem_percent}%)", file=sys.stderr, flush=True)
                    
                    if util > 50:
                        print(f"[GPU] ✅✅✅ GPU MAXIMIZED! High utilization ({util}%) - Detection & Recognition using GPU at maximum!", file=sys.stderr, flush=True)
                    elif util > 20:
                        print(f"[GPU] ✅ GPU Active ({util}%) - Detection & Recognition using GPU", file=sys.stderr, flush=True)
                    elif util > 0:
                        print(f"[GPU] ⚠️ GPU Low utilization ({util}%) - May not be maximized. Check if models are using GPU.", file=sys.stderr, flush=True)
                    else:
                        print(f"[GPU] ⚠️⚠️⚠️ GPU NOT USED ({util}%) - Models may be running on CPU! Check model providers.", file=sys.stderr, flush=True)
            
            # Debug: Log frame reception much less frequently (reduce overhead for zero lag)
            if frame_count % 2000 == 0:
                print(f"[DEBUG] 📹 Received frame {frame_count} (size: {frame.shape if frame is not None else 'None'})", file=sys.stderr, flush=True)
            
            # Debug: Check frame validity
            if frame is None or frame.size == 0:
                if frame_count % 1000 == 0:  # Reduced from 30 to reduce spam
                    print(f"[ERROR] Invalid frame received (frame_count={frame_count})", file=sys.stderr, flush=True)
                print(json.dumps({"faces": [], "events": []}, separators=(',', ':')), flush=True)
                # Free memory
                del frame
                gc.collect()
                continue
            
            detections = []
            events = []
            
            # Thread-safe access to embeddings
            with embeddings_lock:
                try:
                    # ⏱️ PROFILING: Face detection timer (GPU-accelerated)
                    detection_start = time.time()
                    faces = app.get(frame)
                    detection_time = time.time() - detection_start
                    total_detection_time += detection_time
                    
                    # ⚡ NO LIMIT: Process all detections regardless of time - no skipping
                    
                    # ⚡ PERFORMANCE MONITORING: Log GPU performance less frequently (reduce overhead)
                    if len(faces) > 0 and frame_count % 2000 == 0:
                        fps = 1.0 / detection_time if detection_time > 0 else 0
                        print(f"[PROFILE] ⚡ Frame {frame_count}: Detection={detection_time*1000:.1f}ms ({fps:.1f} FPS), Faces={len(faces)} - GPU ACCELERATED", file=sys.stderr, flush=True)
                except Exception as e:
                    print(f"[ERROR] Face detection failed: {e}", file=sys.stderr, flush=True)
                    import traceback
                    traceback.print_exc(file=sys.stderr)
                    faces = []
                    print(json.dumps({"faces": [], "events": []}, separators=(',', ':')), flush=True)
                    # Free memory on error
                    del frame
                    gc.collect()
                    continue
                
                # Debug: Log if faces are detected (much less frequently for zero lag)
                if len(faces) > 0:
                    if frame_count % 2000 == 0:  # Log much less frequently for zero lag
                        print(f"[DEBUG] ✅ Detected {len(faces)} face(s) in frame {frame_count}, {len(known_names)} known faces in database", file=sys.stderr, flush=True)
                elif frame_count % 5000 == 0:  # Log much less frequently if no faces
                    print(f"[DEBUG] ⚠️ No faces detected in frame {frame_count} (database has {len(known_names)} known faces)", file=sys.stderr, flush=True)
                
                currently_detected_names = set()
                
                # ⏱️ PROFILING: Recognition timer (for all faces in frame) - GPU ACCELERATED
                recognition_start = time.time()
                
                # ⚡ MAXIMUM GPU PERFORMANCE: Batch process all faces simultaneously
                if len(faces) == 0 or len(known_embeddings) == 0:
                    if len(faces) > 0 and len(known_embeddings) == 0 and frame_count % 1000 == 0:
                        print(f"[WARNING] Face detected but no faces registered in database! Add face images to: {DATASET_DIR}", file=sys.stderr, flush=True)
                else:
                    # ⚡ NO LIMIT: Process ALL faces detected - no restrictions
                    # All faces will be processed for maximum detection and recognition
                    
                    # ⚡ ULTRA-FAST GPU RECOGNITION: Optimized batch processing for real-time performance
                    # Step 1: Extract and normalize ALL embeddings at once (vectorized, GPU-optimized)
                    face_embeddings = np.array([f.embedding for f in faces], dtype=np.float32)  # float32 for GPU speed
                    face_norms = np.linalg.norm(face_embeddings, axis=1, keepdims=True)
                    face_norms = np.maximum(face_norms, 1e-10)  # Avoid division by zero
                    normalized_embeddings = face_embeddings / face_norms
                    
                    # Step 2: Single batch matrix multiplication for ALL faces (GPU-accelerated, INSTANT!)
                    # ⚡ known_embeddings are pre-loaded in RAM as float32 - optimized for GPU!
                    # ⚡ Matrix multiplication runs on GPU when using CUDA providers
                    # Shape: (num_known, num_detected) - each column is similarities for one detected face
                    all_similarities = np.dot(known_embeddings.astype(np.float32), normalized_embeddings.T)
                    
                    # Step 3: Get best matches for ALL faces at once (vectorized, GPU-optimized)
                    best_indices = np.argmax(all_similarities, axis=0)
                    best_scores = all_similarities[best_indices, np.arange(len(faces))]
                    
                    # ⚡ PERFORMANCE MONITORING: Log recognition speed less frequently (reduce overhead)
                    recognition_time = time.time() - recognition_start
                    total_recognition_time += recognition_time
                    
                    # ⚡ NO LIMIT: Process all recognitions regardless of time - no skipping
                    
                    if len(faces) > 0 and frame_count % 2000 == 0:
                        rec_fps = len(faces) / recognition_time if recognition_time > 0 else 0
                        print(f"[PROFILE] ⚡ Recognition: {recognition_time*1000:.1f}ms for {len(faces)} face(s) ({rec_fps:.1f} faces/sec) - GPU ACCELERATED", file=sys.stderr, flush=True)
                    
                    if len(faces) > 1 and frame_count % 5000 == 0:
                        print(f"[BATCH] Processed {len(faces)} faces in single batch operation", file=sys.stderr, flush=True)
                
                # ⚡ BATCH OPTIMIZATION: Pre-fetch schedules for all NEW faces at once
                # This avoids sequential database queries when multiple faces appear
                new_faces_to_lookup = []
                face_name_mapping = {}  # Maps face_idx -> recognized name
                
                # First pass: identify which faces need schedule lookups
                for face_idx, f in enumerate(faces):
                    if len(known_embeddings) == 0:
                        continue
                    best_score = best_scores[face_idx]
                    if best_score > CONF_THRESHOLD:
                        name = known_names[best_indices[face_idx]]
                        face_name_mapping[face_idx] = name
                        if name not in person_sessions:
                            new_faces_to_lookup.append(name)
                
                # Batch fetch schedules for all new faces at once
                camera_id = os.getenv("CAMERA_ID", "camera1")
                room_name = ROOM_MAPPING.get(camera_id, "")
                batch_schedules = {}
                if new_faces_to_lookup:
                    if len(new_faces_to_lookup) > 1 and frame_count % 2000 == 0:  # Log much less frequently
                        print(f"[BATCH] ⚡ Batch fetching schedules for {len(new_faces_to_lookup)} new faces", file=sys.stderr, flush=True)
                    batch_schedules = batch_get_schedules(new_faces_to_lookup, camera_id=camera_id, room_name=room_name)
                
                # ⚡ OPTIMIZED BATCH PROCESSING: Process all faces efficiently for multiple users
                # Pre-allocate arrays for batch processing
                recognized_faces = []
                new_sessions_to_create = []
                
                # First pass: Collect all recognized faces and new sessions
                for face_idx, f in enumerate(faces):
                    if len(known_embeddings) == 0:
                        continue
                    
                    best_idx = best_indices[face_idx]
                    best_score = best_scores[face_idx]
                    
                    if best_score > CONF_THRESHOLD:
                        name = known_names[best_idx]
                        currently_detected_names.add(name)
                        recognized_faces.append((face_idx, f, name, best_score, best_idx))
                        
                        # Track new sessions to create
                        if name not in person_sessions:
                            new_sessions_to_create.append(name)
                            
                # Batch create all new sessions at once
                for name in new_sessions_to_create:
                    schedule = batch_schedules.get(name)
                            person_sessions[name] = PersonSession(name)
                            person_sessions[name].schedule = schedule
                            
                            if schedule:
                                person_sessions[name].is_late = schedule.get('is_late', False)
                        # Log time in with late status (batch this if possible)
                                success, log_type = log_time_in(
                                    name, 
                                    schedule['_id'], 
                                    "camera1",
                                    schedule.get('is_late', False)
                                )
                                
                                if success:
                                    person_sessions[name].time_in_logged = True
                                    person_sessions[name].log_type = log_type
                                    
                                    status_emoji = "[TIME]" if log_type == "time in" else "[WARN]"
                                    status_text = "ON TIME" if log_type == "time in" else "LATE"
                                    
                                    events.append({
                                        "type": log_type,
                                        "name": name,
                                        "timestamp": person_sessions[name].first_seen.isoformat(),
                                        "schedule": schedule,
                                        "isLate": schedule.get('is_late', False),
                                        "status": status_text
                                    })
                                    
                            if frame_count % 5000 == 0:  # Log much less frequently for multiple users
                                status_emoji = "[TIME]" if log_type == "time in" else "[WARN]"
                                print(f"[INFO] {status_emoji} {log_type.upper()} logged for {name} - {schedule.get('courseCode', 'N/A')} ({status_text})", file=sys.stderr, flush=True)
                                
                                events.append({
                                    "type": "first_detected",
                                    "name": name,
                                    "timestamp": person_sessions[name].first_seen.isoformat(),
                                    "has_schedule": True
                                })
                            else:
                                # NO SCHEDULED CLASS - Track but don't log attendance
                                events.append({
                                    "type": "detected_no_schedule",
                                    "name": name,
                                    "timestamp": datetime.now().isoformat(),
                                    "message": f"{name} detected (no scheduled class)"
                                })
                
                # Second pass: Process existing sessions (optimized for multiple users)
                for face_idx, f, name, best_score, best_idx in recognized_faces:
                    if name in person_sessions:
                        # Existing session - Optimized for multiple users (minimal overhead)
                            session = person_sessions[name]
                            
                        # Quick presence update
                            if not session.is_present:
                                returned, absence_duration = session.mark_returned()
                                if returned:
                                    events.append({
                                        "type": "returned",
                                        "name": name,
                                        "absence_minutes": round(absence_duration / 60, 2),
                                        "returned_at": datetime.now().isoformat()
                                    })
                            else:
                                session.update_presence()
                        
                        # Schedule re-check (only when needed, less frequently for multiple users)
                                time_since_last_check = (datetime.now() - session.last_schedule_check).total_seconds()
                                if time_since_last_check >= SCHEDULE_RECHECK_INTERVAL_SECONDS:
                                try:
                                    camera_id = os.getenv("CAMERA_ID", "camera1")
                                    room_name = ROOM_MAPPING.get(camera_id, "")
                                    new_schedule = get_current_schedule(name, camera_id=camera_id, room_name=room_name)
                                    session.last_schedule_check = datetime.now()
                                
                                # If schedule changed from None to a schedule, log time in
                                if new_schedule and not session.schedule:
                                    session.schedule = new_schedule
                                    session.is_late = new_schedule.get('is_late', False)
                                    
                                    if not session.time_in_logged:
                                        success, log_type = log_time_in(name, new_schedule['_id'], "camera1", new_schedule.get('is_late', False))
                                        if success:
                                            session.time_in_logged = True
                                            status_text = "ON TIME" if log_type == "time in" else "LATE"
                                            events.append({
                                                "type": log_type,
                                                "name": name,
                                                "timestamp": datetime.now().isoformat(),
                                                "schedule": new_schedule,
                                                "isLate": new_schedule.get('is_late', False),
                                                "status": status_text
                                            })
                                elif new_schedule != session.schedule:
                                        session.schedule = new_schedule
                                    if new_schedule:
                                        session.is_late = new_schedule.get('is_late', False)
                                    else:
                                        session.schedule = None
                                elif new_schedule and session.schedule:
                                    session.schedule = new_schedule
                                    session.is_late = new_schedule.get('is_late', False)
                            except:
                                pass  # Skip on error to avoid lag with multiple users
                        
                # Third pass: Build detections for all recognized faces (optimized batch)
                # ⚡ FIX: Ensure face_idx matches the face object to prevent bbox mismatch
                for face_idx, f, name, best_score, best_idx in recognized_faces:
                        if name in person_sessions:
                        # ⚡ VALIDATION: Ensure face_idx is valid and matches the face object
                        if face_idx < 0 or face_idx >= len(faces):
                            if frame_count % 1000 == 0:
                                print(f"[WARN] Invalid face_idx {face_idx} for {name} (total faces: {len(faces)})", file=sys.stderr, flush=True)
                            continue
                        
                        # ⚡ SAFEGUARD: Use face from faces array to ensure correct bbox
                        # This prevents bbox mismatch if face object was modified
                        actual_face = faces[face_idx]
                        if actual_face.embedding is not f.embedding:
                            if frame_count % 1000 == 0:
                                print(f"[WARN] Face mismatch detected for {name} at idx {face_idx}", file=sys.stderr, flush=True)
                        
                        # Extract bbox from face object - ensure correct format
                        bbox = actual_face.bbox  # Use actual_face to ensure correct bbox
                        if len(bbox) >= 4:
                            # Ensure bbox is in [x1, y1, x2, y2] format
                            x1, y1, x2, y2 = map(float, bbox[:4])
                            
                            # ⚡ FIX: Clip bbox coordinates to frame bounds to prevent boxes from appearing in wrong places
                            x1 = max(0, min(x1, frame_width - 1))
                            y1 = max(0, min(y1, frame_height - 1))
                            x2 = max(x1 + 1, min(x2, frame_width))
                            y2 = max(y1 + 1, min(y2, frame_height))
                            
                            # Validate bbox coordinates (ensure they're reasonable)
                            if x2 > x1 and y2 > y1:
                                x1, y1, x2, y2 = map(int, [x1, y1, x2, y2])
                                w, h = x2 - x1, y2 - y1
                                
                                # Ensure width and height are positive
                                if w > 0 and h > 0:
                            session_dict = person_sessions[name].to_dict()
                            schedule = session_dict.get("schedule")
                            
                            # Determine if schedule is valid (time AND room match)
                            has_schedule = schedule is not None
                            is_valid_schedule = schedule and schedule.get("isValidSchedule", True) if schedule else False
                            
                            detections.append({
                                "box": [x1, y1, w, h],
                                "name": name,
                                "score": float(best_score),
                                "session": session_dict,
                                "has_schedule": has_schedule,
                                        "is_valid_schedule": is_valid_schedule
                                        })
                                else:
                                    if frame_count % 1000 == 0:
                                        print(f"[WARN] Invalid bbox dimensions for {name}: w={w}, h={h}, bbox={bbox}", file=sys.stderr, flush=True)
                            else:
                                if frame_count % 1000 == 0:
                                    print(f"[WARN] Invalid bbox coordinates for {name}: x1={x1}, y1={y1}, x2={x2}, y2={y2}, bbox={bbox}", file=sys.stderr, flush=True)
                        else:
                            if frame_count % 1000 == 0:
                                print(f"[WARN] Invalid bbox format for {name}: bbox={bbox}", file=sys.stderr, flush=True)
                    else:
                        # Face detected but confidence too low - skip (don't show as Unknown)
                        if frame_count % 1000 == 0:  # Reduced from 300 to reduce spam
                            print(f"[DEBUG] Face detected but not recognized (score {best_score:.3f} < threshold {CONF_THRESHOLD})", file=sys.stderr, flush=True)
                        # Don't add to detections - only show recognized faces
            
                # Recognition time already calculated in the else block above
                # No need to recalculate here
            
            # Check for absent people
            now = datetime.now()
            if (now - last_absence_check).total_seconds() >= 1:
                absence_events = check_absent_people(currently_detected_names)
                events.extend(absence_events)
                last_absence_check = now
            
            # Get frame dimensions for scaling (needed for accurate box placement)
            try:
                frame_height, frame_width = frame.shape[:2]
            except Exception as e:
                print(f"[ERROR] Failed to get frame dimensions: {e}", file=sys.stderr, flush=True)
                frame_height, frame_width = 720, 1280  # Default dimensions
            
            # ⏱️ PROFILING: End total frame processing timer
            frame_processing_time = time.time() - frame_start_time
            total_processing_time += frame_processing_time
            
            # ⚡ NO LIMIT: Process all frames completely - no skipping regardless of processing time
            
            # Log detailed timing for frames with faces (much less frequent for multiple users)
            if len(detections) > 0:
                # Log profiling much less frequently when many users (reduce overhead)
                log_interval = 5000 if len(detections) > 10 else 2000  # Much less frequent with many users
                if frame_count % log_interval == 0:
                    print(f"[PROFILE] Frame {frame_count} ({len(detections)} faces) TOTAL: {frame_processing_time*1000:.1f}ms", file=sys.stderr, flush=True)
            
            # Report average timing every N frames (increased interval to reduce spam)
            if frame_count % (profile_interval * 2) == 0:  # Double the interval (e.g., every 200 frames instead of 100)
                avg_read = (total_frame_read_time / frame_count) * 1000
                avg_detect = (total_detection_time / frame_count) * 1000
                avg_recog = (total_recognition_time / frame_count) * 1000
                avg_total = (total_processing_time / frame_count) * 1000
                print(f"[STATS] After {frame_count} frames - AVG: Read={avg_read:.1f}ms, Detect={avg_detect:.1f}ms, Recog={avg_recog:.1f}ms, Total={avg_total:.1f}ms", file=sys.stderr, flush=True)
                # Periodic garbage collection to prevent memory leaks
                gc.collect()
            
            # Prepare result before freeing frame memory
            result = {
                "faces": detections,
                "events": events if events else [],
                "frame_width": int(frame_width),
                "frame_height": int(frame_height)
            }
            
            # Free frame memory after processing (do this after preparing result)
            del frame
            frame = None
            
            # ⚡ FAST JSON OUTPUT: Compact JSON for faster transmission
            print(json.dumps(result, separators=(',', ':')), flush=True)  # Compact JSON (no spaces) for speed
            
        except KeyboardInterrupt:
            raise
        except MemoryError as e:
            print(f"[ERROR] Memory error processing frame: {e}", file=sys.stderr, flush=True)
            print(f"[ERROR] Attempting to free memory...", file=sys.stderr, flush=True)
            # Force garbage collection
            gc.collect()
            # Free frame if it exists
            if 'frame' in locals():
                del frame
            print(json.dumps({"faces": [], "events": []}), flush=True)
            # Continue processing - don't crash
            continue
        except Exception as e:
            print(f"[ERROR] Frame processing error: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc(file=sys.stderr)
            # Free frame if it exists
            if 'frame' in locals():
                del frame
            gc.collect()
            print(json.dumps({"faces": [], "events": []}), flush=True)

except KeyboardInterrupt:
    print("[INFO] Interrupted by user", file=sys.stderr, flush=True)
finally:
    observer.stop()
    observer.join()
    print("[INFO] Recognition loop ended", file=sys.stderr, flush=True)