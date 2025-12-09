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
from queue import Queue, Empty
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import requests
from collections import defaultdict
import gc  # Garbage collection for memory management
import socket  # For checking internet connectivity

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

# ⚡ MONGODB-ONLY MODE: Always use MongoDB for schedule operations
# Local database is no longer used for schedule lookups
USE_LOCAL_CACHE_FOR_DETECTION = False  # Disabled - always use MongoDB

# ⚡ ULTRA-FAST & ACCURATE DETECTION: Optimized for maximum speed and accuracy
# Detection threshold: Lower for faster initial detection, filtering happens later for accuracy
DETECTION_THRESHOLD = 0.08  # Lowered from 0.10 for even faster detection (GPU processes faster)
# Minimum detection score: Higher threshold for better accuracy (filters false positives aggressively)
MIN_DETECTION_SCORE = 0.40  # Increased from 0.35 for better accuracy (filters more false positives)
# Recognition threshold: Optimized for accurate recognition with fast matching
CONF_THRESHOLD = 0.45  # Increased from 0.42 for better accuracy (reduces false positive matches significantly)
# Minimum face size: Filter out very small faces that are likely false positives
MIN_FACE_SIZE = 24  # Increased from 20 to filter tiny false detections for better accuracy
# Maximum face aspect ratio: Filter out faces that are too wide or too tall (false positives)
MAX_FACE_ASPECT_RATIO = 2.0  # Tighter from 2.2 for better accuracy (filters non-face objects more aggressively)
MIN_FACE_ASPECT_RATIO = 0.50  # Tighter from 0.45 for better accuracy (filters very elongated detections)
ABSENCE_TIMEOUT_SECONDS = 300  # 5 minutes = 300 seconds
LATE_THRESHOLD_MINUTES = 15  # 15 minutes late threshold
SCHEDULE_RECHECK_INTERVAL_SECONDS = 5  # Re-check schedules every 5 seconds for existing sessions (real-time updates)
SCHEDULE_CACHE_REFRESH_INTERVAL_SECONDS = 60  # Refresh schedule cache every 1 minute (for reference only, not used for detection)

# ⚡ REDUCED NOISE: Track if we've already logged connection errors to avoid spam
_backend_connection_error_logged = False

# ⚡ GPU-specific optimizations for RTX 3050 Ti (4GB VRAM)
GPU_BATCH_SIZE = 12  # Increased from 8 for better GPU utilization (RTX 3050 Ti optimized)
ENABLE_CUDA_GRAPHS = True  # Enable CUDA graphs for reduced kernel launch overhead
MAX_FACES_DETECT = 100  # RTX 3050 Ti can handle more faces simultaneously
BACKEND_API = os.getenv("BACKEND_API", "http://localhost:5000/api/auth")  # TypeScript server with API endpoints

# ⚡ INTERNET CONNECTION ERROR HANDLING: Helper function to detect network/internet failures
def is_internet_connection_error(error):
    """Check if an error is related to internet/network connection failure"""
    if error is None:
        return False
    
    error_str = str(error).lower()
    error_type = type(error).__name__
    
    # Check for common internet/network error types
    network_error_types = [
        'ConnectionError', 'Timeout', 'ConnectTimeout', 'ReadTimeout',
        'NetworkError', 'DNSException', 'URLError', 'HTTPError'
    ]
    
    # Check error type
    if any(err_type in error_type for err_type in network_error_types):
        return True
    
    # Check error message for common internet failure indicators
    internet_error_keywords = [
        'connection refused', 'connection reset', 'connection aborted',
        'connection timeout', 'timeout', 'timed out',
        'network is unreachable', 'network unreachable', 'enotfound',
        'name or service not known', 'dns', 'no internet',
        'no route to host', 'host unreachable', 'etimedout',
        'econnrefused', 'econnreset', 'enetunreach', 'ehostunreach',
        'failed to resolve', 'cannot resolve', 'unreachable',
        'internet connection', 'network error', 'offline'
    ]
    
    return any(keyword in error_str for keyword in internet_error_keywords)

def check_internet_connectivity():
    """Quick check if internet is available by trying to connect to a reliable DNS server"""
    try:
        # Try to connect to Google's DNS (8.8.8.8) on port 53
        socket.create_connection(("8.8.8.8", 53), timeout=3)
        return True
    except (socket.error, OSError):
        try:
            # Fallback: Try Cloudflare DNS (1.1.1.1)
            socket.create_connection(("1.1.1.1", 53), timeout=3)
            return True
        except (socket.error, OSError):
            return False

# Room mapping: Map camera IDs to room names
# Update this mapping based on your camera-to-room configuration
# Format: "camera_id": "room_name" (must match the room name in Schedule.room field)
ROOM_MAPPING = {
    "camera1": os.getenv("CAMERA1_ROOM", "Lab 1"),  # Lab 1 = camera1
    "camera2": os.getenv("CAMERA2_ROOM", "Lab 2"),  # Lab 2 = camera2
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
    global schedule_cache, schedule_cache_last_refresh, _backend_connection_error_logged
    
    # Skip cache refresh in offline mode (data doesn't change from external source)
    if OFFLINE_MODE:
        print(f"[CACHE] [OFFLINE] Skipping schedule cache refresh (OFFLINE_MODE=true)", file=sys.stderr, flush=True)
        return False
    
    # ⚡ MONGODB-ONLY: Always refresh cache from MongoDB
    
    try:
        print(f"[CACHE] [SYNC] Refreshing schedule cache from MongoDB...", file=sys.stderr, flush=True)
        
        # Try to fetch all schedules - we'll use a new endpoint or fetch all instructors' schedules
        # For now, we'll create a simple endpoint that returns all active schedules
        # But first, let's try using the existing API structure
        
        # Since there's no single endpoint for all schedules, we'll need to create one
        # For now, we'll fetch schedules for known instructors from face folders
        # This is a workaround - ideally backend should have /api/auth/all-schedules endpoint
        
        # Ensure BACKEND_API is correctly formatted
        api_url = f"{BACKEND_API}/all-schedules-for-recognition"
        print(f"[CACHE] [DEBUG] Fetching from: {api_url}", file=sys.stderr, flush=True)
        
        # ⚡ INTERNET ERROR HANDLING: Check internet connectivity first
        if not check_internet_connectivity():
            print(f"[CACHE] [WARN] ⚠️ No internet connection detected - skipping cache refresh", file=sys.stderr, flush=True)
            print(f"[CACHE] [INFO] Using existing cache (if available) or local database", file=sys.stderr, flush=True)
            return  # Skip API call if no internet
        
        try:
            response = requests.get(
                api_url,
                timeout=10
            )
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout, 
                requests.exceptions.RequestException, socket.error, OSError) as e:
            # ⚡ INTERNET ERROR HANDLING: Detect and handle internet connection failures
            if is_internet_connection_error(e):
                # ⚡ REDUCED NOISE: Only log once per startup, not repeatedly
                if not _backend_connection_error_logged:
                    print(f"[CACHE] [INFO] Backend API not available at {api_url} (this is normal if backend is not running)", file=sys.stderr, flush=True)
                    print(f"[CACHE] [INFO] Using existing cache or local database", file=sys.stderr, flush=True)
                    _backend_connection_error_logged = True
            else:
                # Only log unexpected errors
                print(f"[CACHE] [ERROR] Failed to fetch schedules: {e}", file=sys.stderr, flush=True)
            return  # Skip cache refresh on network error
        
        if response.status_code == 200:
            all_schedules = response.json()
            
            # Group schedules by instructor name
            new_cache = defaultdict(list)
            current_date = datetime.now().date().isoformat()
            
            print(f"[CACHE] Processing {len(all_schedules)} schedules from API...", file=sys.stderr, flush=True)
            
            for schedule in all_schedules:
                # ⚡ CRITICAL: Skip schedules without _id
                schedule_id = schedule.get('_id') or schedule.get('id')
                if not schedule_id:
                    print(f"[CACHE] [WARN] Skipping schedule without _id: {schedule.get('courseCode', 'N/A')}", file=sys.stderr, flush=True)
                    continue
                
                # Ensure _id is a string
                schedule_id = str(schedule_id).strip()
                if not schedule_id or schedule_id == 'None' or schedule_id == 'N/A':
                    print(f"[CACHE] [WARN] Skipping schedule with invalid _id: {schedule.get('courseCode', 'N/A')}", file=sys.stderr, flush=True)
                    continue
                
                # Update schedule with validated _id
                schedule['_id'] = schedule_id
                
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
                            # Ensure courseCode is present
                            if 'courseCode' not in schedule and 'course_code' in schedule:
                                schedule['courseCode'] = schedule['course_code']
                            elif 'courseCode' not in schedule:
                                schedule['courseCode'] = schedule.get('courseTitle', 'N/A')
                            
                            # ⚡ CRITICAL: Verify _id is still present before caching
                            if schedule.get('_id'):
                                new_cache[instructor_name].append(schedule)
                            else:
                                print(f"[CACHE] [ERROR] Schedule lost _id during processing: {schedule.get('courseCode', 'N/A')}", file=sys.stderr, flush=True)
                        else:
                            if hash(instructor_name) % 100 == 0:  # Log occasionally
                                print(f"[CACHE] Skipping schedule for {instructor_name} (outside semester: {semester_start} to {semester_end})", file=sys.stderr, flush=True)
                    else:
                        print(f"[CACHE] [WARN] Schedule {schedule_id} has instructor but missing first_name or last_name", file=sys.stderr, flush=True)
                else:
                    print(f"[CACHE] [WARN] Schedule {schedule_id} missing instructor data: {schedule.get('courseCode', 'N/A')}", file=sys.stderr, flush=True)
            
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
            
            # Log sample instructors for debugging
            if len(schedule_cache) > 0:
                sample_instructors = list(schedule_cache.keys())[:5]
                print(f"[CACHE] Sample instructors in cache: {', '.join(sample_instructors)}", file=sys.stderr, flush=True)
                
                # Verify cache structure - check a few schedules
                for instructor_name, schedules in list(schedule_cache.items())[:3]:
                    if schedules:
                        sample_schedule = schedules[0]
                        has_course_code = 'courseCode' in sample_schedule or 'course_code' in sample_schedule
                        has_times = 'startTime' in sample_schedule and 'endTime' in sample_schedule
                        has_days = 'days' in sample_schedule
                        has_id = '_id' in sample_schedule and sample_schedule.get('_id')
                        schedule_id_preview = str(sample_schedule.get('_id', 'N/A'))[:20] if has_id else 'N/A'
                        print(f"[CACHE] [VERIFY] {instructor_name}: {len(schedules)} schedule(s), courseCode={has_course_code}, times={has_times}, days={has_days}, _id={has_id} ({schedule_id_preview}...)", file=sys.stderr, flush=True)
            else:
                print(f"[CACHE] [WARN] Cache is empty! No schedules loaded. Check API endpoint: {api_url}", file=sys.stderr, flush=True)
            
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
            try:
                error_body = response.text[:200]  # First 200 chars of error
                print(f"[CACHE] [WARN] Error response: {error_body}", file=sys.stderr, flush=True)
            except:
                pass
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
    ⚡ ALWAYS FETCHES FROM DATABASE DIRECTLY (not from cache)
    This fetches schedules directly from database for each instructor
    
    ⚡ TIME + ROOM VALIDATION: Box color is based on BOTH schedule time AND room
    - Green = within scheduled time AND correct room (Lab 1 for camera1, Lab 2 for camera2)
    - Yellow = outside scheduled time OR wrong room OR no schedule
    
    Args:
        instructor_names: List of instructor names (folder name format)
        camera_id: Camera ID (camera1 = Lab 1, camera2 = Lab 2)
        room_name: Room name (auto-mapped from camera_id if not provided)
        
    Returns:
        Dictionary mapping instructor_name -> schedule (or None)
        Each schedule has isValidSchedule=True only if BOTH time AND room match
    """
    if not instructor_names:
        return {}
    
    results = {}
    
    # Get room name from mapping if not provided
    if room_name is None:
        room_name = ROOM_MAPPING.get(camera_id, "")
    
    # ⚡ ALWAYS FETCH FROM DATABASE: Fetch directly from MongoDB for each instructor
    for name in instructor_names:
        schedule = get_current_schedule(name, camera_id=camera_id, room_name=room_name)
        if schedule:
            # ⚡ TIME + ROOM VALIDATION: isValidSchedule is set by get_current_schedule()
            # It's True only if BOTH time AND room match (from backend API response)
            # Green = within scheduled time AND correct room, Yellow = otherwise
            # schedule['isValidSchedule'] and schedule['roomMatch'] are already set by get_current_schedule()
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
        # Log occasionally for debugging
        if hash(instructor_name) % 100 == 0:
            available_instructors = list(schedule_cache.keys())[:5] if len(schedule_cache) > 0 else []
            print(f"[CACHE] [DEBUG] No schedules in cache for {instructor_name} (formatted: {formatted_name}). Available: {', '.join(available_instructors) if available_instructors else 'none'}", file=sys.stderr, flush=True)
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
        # ⚡ FIX: Handle midnight crossover for 30-minute buffer
        start_datetime = datetime.combine(datetime.today(), start_time)
        time_before_class_dt = start_datetime - timedelta(minutes=30)
        time_before_class = time_before_class_dt.time()
        
        # ⚡ FIX: Handle case where 30-min buffer crosses midnight
        # If time_before_class > start_time, it means buffer crossed midnight
        if time_before_class > start_time:
            # Buffer crossed midnight - check if current_time is after time_before_class OR before end_time
            # This means: current_time >= time_before_class (late night) OR current_time <= end_time (morning)
            time_matches = current_time >= time_before_class or current_time <= end_time
        else:
            # Normal case - no midnight crossover
            time_matches = time_before_class <= current_time <= end_time
        
        if time_matches:
            # Calculate if they're late
            late_threshold_time = (datetime.combine(datetime.today(), start_time) + timedelta(minutes=LATE_THRESHOLD_MINUTES)).time()
            is_late = current_time > late_threshold_time
            
            # Create a copy of schedule with additional fields
            schedule_copy = schedule.copy()
            schedule_copy['is_late'] = is_late
            schedule_copy['start_time_obj'] = start_time
            schedule_copy['current_time_str'] = current_time.strftime('%H:%M')
            
            # ⚡ CRITICAL FIX: ENSURE isValidSchedule is ALWAYS set to True (within scheduled time)
            schedule_copy['isValidSchedule'] = True  # ✅ Always True if time matches (room check removed)
            
            # ⚡ ENSURE courseCode is always included (fix for manually added schedules)
            if 'courseCode' not in schedule_copy and 'course_code' in schedule_copy:
                schedule_copy['courseCode'] = schedule_copy['course_code']
            elif 'courseCode' not in schedule_copy:
                schedule_copy['courseCode'] = schedule.get('courseCode', schedule.get('courseTitle', 'N/A'))  # Default if missing
            
            # ⚡ CRITICAL: ENSURE _id is present and is a string (needed for logging)
            if '_id' not in schedule_copy or not schedule_copy['_id']:
                if 'id' in schedule_copy and schedule_copy['id']:
                    schedule_copy['_id'] = str(schedule_copy['id'])
                elif '_id' in schedule and schedule['_id']:
                    schedule_copy['_id'] = str(schedule['_id'])
                else:
                    # Try to get from original schedule
                    original_id = schedule.get('_id') or schedule.get('id')
                    if original_id:
                        schedule_copy['_id'] = str(original_id)
                    else:
                        print(f"[WARN] ⚠️ Schedule for {instructor_name} has no _id field! Course: {schedule_copy.get('courseCode', 'N/A')} - Skipping schedule", file=sys.stderr, flush=True)
                        # Don't return schedule without _id - it will cause logging errors
                        return None
            
            # Ensure _id is a string (not ObjectId or other type)
            if schedule_copy.get('_id') and not isinstance(schedule_copy['_id'], str):
                schedule_copy['_id'] = str(schedule_copy['_id'])
            
            # ⚡ FINAL VALIDATION: Ensure _id is valid before returning
            if not schedule_copy.get('_id') or schedule_copy['_id'] == 'None' or schedule_copy['_id'] == 'N/A':
                print(f"[WARN] ⚠️ Schedule for {instructor_name} has invalid _id after processing: {schedule_copy.get('_id')} - Skipping", file=sys.stderr, flush=True)
                return None
            
            return schedule_copy
    
    return None

def get_current_schedule(instructor_name, camera_id="camera1", room_name=None):
    """Get current schedule for an instructor - checks if they have a class NOW
    ⚡ ALWAYS FETCHES FROM DATABASE DIRECTLY (not from cache)
    
    ⚡ TIME + ROOM VALIDATION: Box color is based on BOTH schedule time AND room
    - Green = within scheduled time AND correct room (Lab 1 for camera1, Lab 2 for camera2)
    - Yellow = outside scheduled time OR wrong room OR no schedule
    - Reads from MongoDB database for schedule information
    
    Args:
        instructor_name: Name of the instructor (folder name format)
        camera_id: ID of the camera (camera1 = Lab 1, camera2 = Lab 2)
        room_name: Room name (auto-mapped from camera_id if not provided)
    """
    formatted_name = format_instructor_name(instructor_name)
    
    # Get room name from mapping if not provided
    if room_name is None:
        room_name = ROOM_MAPPING.get(camera_id, "")
    
    # ⚡ ALWAYS FETCH FROM DATABASE: Skip cache, fetch directly from MongoDB via API
    # Skip API calls only in offline mode
    if OFFLINE_MODE:
        if hash(instructor_name) % 100 == 0:
            print(f"[DATA SOURCE] [OFFLINE MODE] Skipping MongoDB API call for {instructor_name} (OFFLINE_MODE=true)", file=sys.stderr, flush=True)
        # Try cache as fallback in offline mode
        schedule = get_current_schedule_from_cache(instructor_name)
        if schedule:
            # ⚡ OFFLINE MODE: Can't validate room, so assume valid if time matches
            schedule['isValidSchedule'] = True
            schedule['roomMatch'] = None  # Unknown in offline mode
            return schedule
        return None
    
    # ⚡ ALWAYS FETCH FROM DATABASE: Direct API call to MongoDB
    # ⚡ FIX: Declare global variable at function level (before any use)
    global _backend_connection_error_logged
    
    print(f"[DATA SOURCE] [MONGODB API] Fetching schedule for {instructor_name} (formatted: {formatted_name}) directly from DATABASE...", file=sys.stderr, flush=True)
    try:
        request_data = {"instructorName": formatted_name}
        if room_name:
            request_data["roomName"] = room_name
        if camera_id:
            request_data["cameraId"] = camera_id
        
        # ⚡ INTERNET ERROR HANDLING: Check internet connectivity first
        if not check_internet_connectivity():
            print(f"[WARN] [MONGODB API] ⚠️ No internet connection detected - using cache fallback", file=sys.stderr, flush=True)
            schedule = get_current_schedule_from_cache(instructor_name)
            if schedule:
                schedule['isValidSchedule'] = True
                schedule['roomMatch'] = None  # Unknown in fallback mode
                print(f"[FALLBACK] [CACHE] Using cached schedule for {instructor_name} (no internet)", file=sys.stderr, flush=True)
                return schedule
            return None
        
        # ⚡ IMPROVED ERROR HANDLING: Add retry logic for connection errors
        max_retries = 2
        retry_delay = 0.5  # seconds
        response = None
        
        for attempt in range(max_retries + 1):
            try:
                response = requests.post(
                    f"{BACKEND_API}/get-current-schedule",
                    json=request_data,
                    timeout=5
                )
                break  # Success, exit retry loop
            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout, 
                    socket.error, OSError) as e:
                # ⚡ INTERNET ERROR HANDLING: Check if it's an internet connection error
                is_internet_error = is_internet_connection_error(e)
                
                if is_internet_error:
                    # Internet connection failed - don't retry, use cache immediately
                    # ⚡ REDUCED NOISE: Only log once, not repeatedly
                    if not _backend_connection_error_logged:
                        print(f"[INFO] [MONGODB API] Backend API not available - using cache (this is normal if backend is not running)", file=sys.stderr, flush=True)
                        _backend_connection_error_logged = True
                    schedule = get_current_schedule_from_cache(instructor_name)
                    if schedule:
                        schedule['isValidSchedule'] = True
                        schedule['roomMatch'] = None  # Unknown in fallback mode
                        return schedule
                    return None
                elif attempt < max_retries:
                    # Backend might be starting up, wait and retry
                    if attempt == 0:  # Only log on first attempt
                        print(f"[INFO] [MONGODB API] Backend not responding, retrying... (this is normal during startup)", file=sys.stderr, flush=True)
                    time.sleep(retry_delay)
                    retry_delay *= 2  # Exponential backoff
                else:
                    # All retries exhausted - only log once
                    if not _backend_connection_error_logged:
                        print(f"[INFO] [MONGODB API] Backend server at {BACKEND_API} is not running - using cache (this is normal if backend is not running)", file=sys.stderr, flush=True)
                        _backend_connection_error_logged = True
                    # ⚡ FALLBACK: Try cache as last resort
                    schedule = get_current_schedule_from_cache(instructor_name)
                    if schedule:
                        schedule['isValidSchedule'] = True
                        schedule['roomMatch'] = None  # Unknown in fallback mode
                        return schedule
                    return None
            except requests.exceptions.RequestException as e:
                # Other request errors (not connection/timeout) - check if internet error
                if is_internet_connection_error(e):
                    # ⚡ REDUCED NOISE: Only log once
                    if not _backend_connection_error_logged:
                        print(f"[INFO] [MONGODB API] Backend API not available - using cache", file=sys.stderr, flush=True)
                        _backend_connection_error_logged = True
                else:
                    # Only log actual errors (not connection refused)
                    if 'Connection refused' not in str(e):
                        print(f"[ERROR] [MONGODB API] Request failed: {e}", file=sys.stderr, flush=True)
                # Try cache as fallback
                schedule = get_current_schedule_from_cache(instructor_name)
                if schedule:
                    schedule['isValidSchedule'] = True
                    schedule['roomMatch'] = None  # Unknown in fallback mode
                    print(f"[FALLBACK] [CACHE] Using cached schedule after request error", file=sys.stderr, flush=True)
                    return schedule
                return None
        
        # If we get here without a response, something went wrong
        if response is None:
            return None
        
        if response.status_code == 200:
            data = response.json()
            schedule = data.get("schedule")
            
            # ⚡ DEBUG: Log what we got from API
            if schedule:
                schedule_id_from_api = schedule.get('_id') or schedule.get('id')
                print(f"[DATA SOURCE] [MONGODB API] [DEBUG] Received schedule from API: courseCode={schedule.get('courseCode', 'N/A')}, _id={schedule_id_from_api}, startTime={schedule.get('startTime', 'N/A')}, endTime={schedule.get('endTime', 'N/A')}", file=sys.stderr, flush=True)
            else:
                print(f"[DATA SOURCE] [MONGODB API] [DEBUG] No schedule returned from API for {instructor_name}", file=sys.stderr, flush=True)
                if 'debug' in data:
                    print(f"[DATA SOURCE] [MONGODB API] [DEBUG] API debug info: {data.get('debug', {})}", file=sys.stderr, flush=True)
            
            if schedule:
                # ⚡ MONGODB-ONLY: Schedule fetched directly from database
                # Backend already validated time AND room, so trust the API response
                # But we still need to verify it's for today
                current_day = get_current_day()
                current_time = datetime.now().time()
                
                # Check if today is a scheduled day
                days = schedule.get('days', {})
                if days and len(days) > 0:
                    if not days.get(current_day, False):
                        print(f"[INFO] {instructor_name} has no class scheduled today ({current_day})", file=sys.stderr, flush=True)
                        return None
                
                # Parse schedule times for late calculation
                start_time = parse_time_string(schedule.get('startTime', ''))
                end_time = parse_time_string(schedule.get('endTime', ''))
                
                if not start_time or not end_time:
                    print(f"[WARN] Invalid time format for {instructor_name}'s schedule", file=sys.stderr, flush=True)
                    return None
                
                # ⚡ TRUST BACKEND: Backend already validated time matches (with 30-min buffer)
                # If API returned a schedule, it means time matches - use it directly
                # Calculate if they're late
                late_threshold_time = (datetime.combine(datetime.today(), start_time) + timedelta(minutes=LATE_THRESHOLD_MINUTES)).time()
                is_late = current_time > late_threshold_time
                
                schedule['is_late'] = is_late
                schedule['start_time_obj'] = start_time
                schedule['current_time_str'] = current_time.strftime('%H:%M')
                        
                # ⚡ CRITICAL: Use isValidSchedule and roomMatch from backend API response
                # Backend validates both time AND room, so trust the API response
                # Check both top-level response and schedule object (backend sets both)
                # ⚡ IMPORTANT: Default to False if not provided (only green if room matches)
                api_isValidSchedule = data.get('isValidSchedule')
                if api_isValidSchedule is None:
                    api_isValidSchedule = schedule.get('isValidSchedule', False)  # Default to False for safety
                api_roomMatch = data.get('roomMatch') if 'roomMatch' in data else schedule.get('roomMatch', None)
                api_timeMatch = data.get('timeMatch') or schedule.get('timeMatch', True)
                
                # Use values from API response (backend already validated)
                schedule['isValidSchedule'] = api_isValidSchedule  # ✅ True only if time AND room match
                schedule['timeMatch'] = api_timeMatch
                schedule['roomMatch'] = api_roomMatch  # ✅ True/False/None from backend
                
                # ⚡ DEBUG: Log room matching status
                if room_name:
                    room_status = "✅ MATCH" if api_roomMatch else "❌ NO MATCH" if api_roomMatch is False else "⚠️ NOT VALIDATED"
                    print(f"[ROOM VALIDATION] {instructor_name} - Room: {room_name}, Schedule Room: {schedule.get('room', 'N/A')}, Status: {room_status}", file=sys.stderr, flush=True)
                
                # ⚡ CRITICAL: Ensure _id is present before returning
                schedule_id = schedule.get('_id') or schedule.get('id')
                if not schedule_id:
                    print(f"[WARN] ⚠️ Schedule from API for {instructor_name} has no _id - Cannot use for logging", file=sys.stderr, flush=True)
                    return None
                
                # Ensure _id is a string
                schedule['_id'] = str(schedule_id).strip()
                if not schedule['_id'] or schedule['_id'] == 'None' or schedule['_id'] == 'N/A':
                    print(f"[WARN] ⚠️ Schedule from API for {instructor_name} has invalid _id: {schedule['_id']} - Cannot use for logging", file=sys.stderr, flush=True)
                    return None
                
                # ⚡ LOG: Include room matching status in log
                room_status = "✅" if api_roomMatch else "❌" if api_roomMatch is False else "⚠️"
                print(f"[DATA SOURCE] [MONGODB DATABASE] [OK] {instructor_name} has class NOW (fetched DIRECTLY from DATABASE): {schedule.get('courseCode')} ({start_time}-{end_time}) - Room: {room_name or 'N/A'} {room_status} - Late: {is_late} - _id: {schedule['_id'][:20]}... - isValidSchedule={api_isValidSchedule}", file=sys.stderr, flush=True)
                return schedule
            else:
                print(f"[INFO] {instructor_name} has no schedule in database", file=sys.stderr, flush=True)
                return None
        else:
            print(f"[WARN] API returned status {response.status_code} for {instructor_name}", file=sys.stderr, flush=True)
            return None
    except (requests.exceptions.RequestException, socket.error, OSError) as e:
        # ⚡ INTERNET ERROR HANDLING: Handle all request exceptions gracefully
        if is_internet_connection_error(e):
            print(f"[ERROR] [MONGODB API] ⚠️ Internet connection failed: {e}", file=sys.stderr, flush=True)
            print(f"[FALLBACK] [CACHE] No internet - using cached schedule as fallback...", file=sys.stderr, flush=True)
        else:
            print(f"[ERROR] [MONGODB API] Request exception: {e}", file=sys.stderr, flush=True)
            print(f"[FALLBACK] [CACHE] Attempting to use cached schedule as fallback...", file=sys.stderr, flush=True)
        # Try cache as fallback
        schedule = get_current_schedule_from_cache(instructor_name)
        if schedule:
            schedule['isValidSchedule'] = True
            schedule['roomMatch'] = None
            print(f"[FALLBACK] [CACHE] Using cached schedule for {instructor_name}", file=sys.stderr, flush=True)
            return schedule
        return None
    except Exception as e:
        # ⚡ CATCH-ALL: Handle any other unexpected errors
        print(f"[ERROR] [MONGODB API] Unexpected error while fetching schedule: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        # Try cache as fallback
        schedule = get_current_schedule_from_cache(instructor_name)
        if schedule:
            # ⚡ FALLBACK: Can't validate room from cache, assume valid if time matches
            schedule['isValidSchedule'] = True
            schedule['roomMatch'] = None  # Unknown in fallback mode
            print(f"[FALLBACK] [CACHE] Using cached schedule for {instructor_name} after error", file=sys.stderr, flush=True)
            return schedule
        return None

def log_time_in(instructor_name, schedule_id, camera_id, is_late):
    """Log time in - queues locally (offline), tries to sync if online"""
    log_type = "late" if is_late else "time in"
    formatted_name = format_instructor_name(instructor_name)
    current_time = datetime.now()
    
    # ⚡ VALIDATION: Check if schedule_id is valid before proceeding
    if not schedule_id:
        print(f"[WARN] ⚠️ Cannot log {log_type} for {instructor_name}: schedule_id is None or empty", file=sys.stderr, flush=True)
        return False, log_type
    
    # Ensure schedule_id is a string
    schedule_id = str(schedule_id).strip()
    if not schedule_id or schedule_id == 'None' or schedule_id == 'N/A':
        print(f"[WARN] ⚠️ Cannot log {log_type} for {instructor_name}: schedule_id is invalid: '{schedule_id}'", file=sys.stderr, flush=True)
        return False, log_type
    
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
        # ⚡ INTERNET ERROR HANDLING: Check internet connectivity first
        if not check_internet_connectivity():
            print(f"[DATA SOURCE] [MONGODB API] [WARN] ⚠️ No internet connection - log queued locally (will sync when online)", file=sys.stderr, flush=True)
            return True, log_type  # Still return True because it's queued locally
        
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
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout,
            requests.exceptions.RequestException, socket.error, OSError) as e:
        # ⚡ INTERNET ERROR HANDLING: Detect internet connection failures
        if is_internet_connection_error(e):
            print(f"[DATA SOURCE] [MONGODB API] [WARN] ⚠️ Internet connection failed: {e} - Log queued locally (will sync when online)", file=sys.stderr, flush=True)
        else:
            print(f"[DATA SOURCE] [MONGODB API] [WARN] Could not sync to MongoDB: {e} - Log is queued locally", file=sys.stderr, flush=True)
        # Still return True because it's queued locally
        return True, log_type
    except Exception as e:
        print(f"[DATA SOURCE] [MONGODB API] [WARN] Unexpected error: {e} - Log is queued locally", file=sys.stderr, flush=True)
        # Still return True because it's queued locally
        return True, log_type
    
    return True, log_type

def log_time_out(instructor_name, schedule_id, camera_id, total_minutes):
    """Log time out - queues locally (offline), tries to sync if online"""
    formatted_name = format_instructor_name(instructor_name)
    current_time = datetime.now()
    
    # ⚡ VALIDATION: Check if schedule_id is valid before proceeding
    if not schedule_id:
        print(f"[WARN] ⚠️ Cannot log time out for {instructor_name}: schedule_id is None or empty", file=sys.stderr, flush=True)
        return False
    
    # Ensure schedule_id is a string
    schedule_id = str(schedule_id).strip()
    if not schedule_id or schedule_id == 'None' or schedule_id == 'N/A':
        print(f"[WARN] ⚠️ Cannot log time out for {instructor_name}: schedule_id is invalid: '{schedule_id}'", file=sys.stderr, flush=True)
        return False
    
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
        # ⚡ INTERNET ERROR HANDLING: Check internet connectivity first
        if not check_internet_connectivity():
            print(f"[DATA SOURCE] [MONGODB API] [WARN] ⚠️ No internet connection - time out queued locally (will sync when online)", file=sys.stderr, flush=True)
            return True  # Still return True because it's queued locally
        
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
        if response.status_code == 200:
            # Mark as synced if local DB is available
            if LOCAL_DB_AVAILABLE:
                # Find the log and mark as synced (time out updates existing log)
                today_str = current_time.date().isoformat()
                unsynced_logs = get_unsynced_logs()
                for log in unsynced_logs:
                    if (log.get('scheduleId') == schedule_id and 
                        log.get('date') == today_str and 
                        log.get('timeOut')):
                        mark_log_synced(log.get('id'))
                        break
            print(f"[DATA SOURCE] [MONGODB API] [OK] Synced time out to MONGODB ATLAS (online sync)", file=sys.stderr, flush=True)
            return True
        return False
    except (requests.exceptions.ConnectionError, requests.exceptions.Timeout,
            requests.exceptions.RequestException, socket.error, OSError) as e:
        # ⚡ INTERNET ERROR HANDLING: Detect internet connection failures
        if is_internet_connection_error(e):
            print(f"[DATA SOURCE] [MONGODB API] [WARN] ⚠️ Internet connection failed: {e} - Time out queued locally (will sync when online)", file=sys.stderr, flush=True)
        else:
            print(f"[DATA SOURCE] [MONGODB API] [WARN] Failed to sync time out: {e} - Log is queued locally", file=sys.stderr, flush=True)
        return True  # Still return True because it's queued locally
    except Exception as e:
        print(f"[DATA SOURCE] [MONGODB API] [WARN] Unexpected error logging time out: {e} - Log is queued locally", file=sys.stderr, flush=True)
        return True  # Still return True because it's queued locally

# Global variables for embeddings (thread-safe)
known_embeddings = []
known_names = []
embeddings_lock = threading.Lock()
reload_requested = threading.Event()

# Dictionary to track person session data
person_sessions = {}

# ⚡ ZERO-LAG ARCHITECTURE: Separate threads for video and detection
frame_queue = Queue(maxsize=5)  # Increased queue size for moving users - keep more frames for better motion detection
detection_queue = Queue(maxsize=100)  # Results queue
latest_detection_result = {"faces": [], "events": []}
detection_lock = threading.Lock()

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
        # ⚡ ULTRA-AGGRESSIVE FRAME SKIPPING: Read and discard ALL queued frames, keep only the latest
        latest_frame = None
        frames_skipped = 0
        max_skip = 100  # Optimized for RTX 3050 Ti at 60 FPS (was 150) - faster processing, less skipping needed
        
        # Keep reading frames until stdin is empty (non-blocking)
        for _ in range(max_skip):
            frame = read_single_frame()
            if frame is None:
                break  # No more frames available
            
            # If we already have a frame, this is a newer one - skip the old one
            if latest_frame is not None:
                frames_skipped += 1
            
            latest_frame = frame  # Keep the newest frame
            
            # Check if more data is immediately available (non-blocking, zero timeout)
            ready, _, _ = select.select([sys.stdin.buffer], [], [], 0)
            if not ready:
                break  # No more frames waiting
        
        if frames_skipped > 0:
            if frames_skipped % 10 == 0:  # Log every 10 skipped frames
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
                        # ⚡ VALIDATION: Check if schedule has valid _id before logging
                        schedule_id = None
                        if isinstance(session.schedule, dict):
                            schedule_id = session.schedule.get('_id') or session.schedule.get('id')
                        elif hasattr(session.schedule, '_id'):
                            schedule_id = session.schedule._id
                        elif hasattr(session.schedule, 'id'):
                            schedule_id = session.schedule.id
                        
                        # Ensure schedule_id is a string and not empty
                        if schedule_id:
                            schedule_id = str(schedule_id).strip()
                            if not schedule_id or schedule_id == 'None' or schedule_id == 'N/A':
                                schedule_id = None
                        
                        if schedule_id:
                            if log_time_out(name, schedule_id, "camera1", session.get_total_time_minutes()):
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
                        else:
                            print(f"[WARN] ⚠️ Schedule for {name} has no valid _id - skipping time out log", file=sys.stderr, flush=True)
                    
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
# ⚡ ZERO-LAG ARCHITECTURE: Multi-threaded Processing
# ----------------------------

def video_sender_thread():
    """⚡ PRIORITY THREAD: Sends video frames IMMEDIATELY, never blocked by detection"""
    global latest_detection_result
    
    while True:
        try:
            # ⚡ FRAME SKIPPING: Read and discard ALL queued frames, keep only the latest
            latest_frame = None
            frames_skipped = 0
            max_skip = 100  # Maximum frames to skip
            
            # Keep reading frames until stdin is empty (non-blocking)
            for _ in range(max_skip):
                frame_data = read_single_frame()
                if frame_data is None:
                    break  # No more frames available
                
                # If we already have a frame, this is a newer one - skip the old one
                if latest_frame is not None:
                    frames_skipped += 1
                
                latest_frame = frame_data  # Keep the newest frame
                
                # Check if more data is immediately available (non-blocking, zero timeout)
                ready, _, _ = select.select([sys.stdin.buffer], [], [], 0)
                if not ready:
                    break  # No more frames waiting
            
            if latest_frame is None:
                # No frames available, wait a bit
                time.sleep(0.01)
                continue
            
            # ⚡ IMMEDIATE: Send only the latest frame to processing (non-blocking)
            # If queue is full, drop old frame and add new one
            try:
                frame_queue.put_nowait(latest_frame)
            except:
                # Queue full - drop oldest frame and add new one
                try:
                    frame_queue.get_nowait()
                except:
                    pass
                try:
                    frame_queue.put_nowait(latest_frame)
                except:
                    pass
                    
        except Exception as e:
            print(f"[ERROR] Video sender error: {e}", file=sys.stderr, flush=True)
            break

def face_detection_thread(app):
    """⚡ DETECTION THREAD: Processes faces asynchronously, never blocks video"""
    global latest_detection_result, person_sessions, known_embeddings, known_names
    
    frame_count = 0
    last_absence_check = datetime.now()
    
    while True:
        try:
            # ⚡ ULTRA-FAST: Get frame from queue with minimal timeout for maximum speed
            try:
                frame_data = frame_queue.get(timeout=0.005)  # Reduced from 0.01 for even faster processing
            except Empty:
                continue
            
            # ⚡ ULTRA-FAST: Decode frame with optimized settings
            jpg_array = np.frombuffer(frame_data, np.uint8)
            # ⚡ OPTIMIZED: Use IMREAD_COLOR for speed (no alpha channel processing)
            frame = cv2.imdecode(jpg_array, cv2.IMREAD_COLOR)
            # ⚡ OPTIMIZED: Immediate cleanup for memory efficiency
            del jpg_array
            del frame_data
            
            if frame is None:
                continue
            
            frame_count += 1
            
            # Get frame dimensions
            try:
                frame_height, frame_width = frame.shape[:2]
            except Exception as e:
                print(f"[ERROR] Failed to get frame dimensions: {e}", file=sys.stderr, flush=True)
                frame_height, frame_width = 720, 1280  # Default dimensions
            
            detections = []
            events = []
            
            # Face detection and recognition
            with embeddings_lock:
                try:
                    faces = app.get(frame)
                    
                    currently_detected_names = set()
                    
                    if len(faces) > 0 and len(known_embeddings) > 0:
                        # ⚡ ULTRA-FAST BATCH PROCESSING: Optimized for maximum speed and accuracy
                        num_faces = len(faces)
                        emb_dim = len(faces[0].embedding)
                        
                        # ⚡ ULTRA-OPTIMIZED: Pre-allocate and fill in one pass (faster than loop)
                        face_embeddings = np.array([faces[i].embedding for i in range(num_faces)], dtype=np.float32)
                        face_embeddings = np.ascontiguousarray(face_embeddings, dtype=np.float32)
                        
                        # ⚡ ULTRA-OPTIMIZED: Vectorized normalization (faster than loop, in-place operations)
                        face_norms = np.linalg.norm(face_embeddings, axis=1, keepdims=True)
                        np.maximum(face_norms, 1e-10, out=face_norms)  # In-place for speed
                        normalized_embeddings = np.divide(face_embeddings, face_norms, out=face_embeddings)  # In-place division
                        normalized_embeddings = np.ascontiguousarray(normalized_embeddings, dtype=np.float32)
                        
                        # ⚡ OPTIMIZED: Ensure known_embeddings is contiguous (one-time check, cached)
                        if not known_embeddings.flags['C_CONTIGUOUS']:
                            known_embeddings = np.ascontiguousarray(known_embeddings, dtype=np.float32)
                        
                        # ⚡ ULTRA-FAST: Single matrix multiplication for all similarities (BLAS optimized)
                        all_similarities = np.dot(known_embeddings, normalized_embeddings.T)
                        best_indices = np.argmax(all_similarities, axis=0)
                        row_indices = np.arange(num_faces, dtype=np.int32)
                        best_scores = all_similarities[best_indices, row_indices]
                        
                        # ⚡ ACCURACY BOOST: Pre-filter low confidence matches before processing (faster)
                        high_confidence_mask = best_scores > CONF_THRESHOLD
                        
                        # Batch schedule lookup (only for high confidence matches)
                        new_faces_to_lookup = []
                        face_name_mapping = {}
                        
                        # ⚡ OPTIMIZED: Only process high confidence matches (faster)
                        for face_idx in np.where(high_confidence_mask)[0]:
                            name = known_names[best_indices[face_idx]]
                            face_name_mapping[face_idx] = name
                            if name not in person_sessions:
                                new_faces_to_lookup.append(name)
                        
                        camera_id = os.getenv("CAMERA_ID", "camera1")
                        room_name = ROOM_MAPPING.get(camera_id, "")
                        batch_schedules = {}
                        if new_faces_to_lookup:
                            # ⚡ REAL-TIME: Always fetch schedules directly from database for new faces (no cache delay)
                            if len(new_faces_to_lookup) > 1:
                                print(f"[BATCH] ⚡ Batch fetching schedules for {len(new_faces_to_lookup)} new faces (DIRECT FROM DATABASE)", file=sys.stderr, flush=True)
                            batch_schedules = batch_get_schedules(new_faces_to_lookup, camera_id=camera_id, room_name=room_name)
                        
                        # Process each face (only high confidence matches)
                        for face_idx, f in enumerate(faces):
                            # ⚡ OPTIMIZED: Skip low confidence faces early (faster)
                            if not high_confidence_mask[face_idx]:
                                continue
                                
                            bbox = f.bbox
                            x1, y1, x2, y2 = int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])
                            w, h = x2 - x1, y2 - y1
                            
                            best_idx = best_indices[face_idx]
                            best_score = best_scores[face_idx]
                            
                            # Already filtered by high_confidence_mask, but double-check for safety
                            if best_score > CONF_THRESHOLD:
                                name = known_names[best_idx]
                                currently_detected_names.add(name)
                                
                                # Session handling
                                if name not in person_sessions:
                                    schedule = batch_schedules.get(name)
                                    
                                    # Create session for ALL detected faculty (scheduled or not)
                                    person_sessions[name] = PersonSession(name)
                                    person_sessions[name].schedule = schedule
                                    
                                    if schedule:
                                        # They have a class scheduled NOW
                                        person_sessions[name].is_late = schedule.get('is_late', False)
                                        
                                        # ⚡ VALIDATION: Check if schedule has valid _id before logging
                                        schedule_id = schedule.get('_id') or schedule.get('id')
                                        # Ensure schedule_id is a string and not empty
                                        if schedule_id:
                                            schedule_id = str(schedule_id).strip()
                                            if not schedule_id or schedule_id == 'None' or schedule_id == 'N/A':
                                                schedule_id = None
                                        if schedule_id:
                                            # Log time in with late status
                                            success, log_type = log_time_in(
                                                name, 
                                                schedule_id, 
                                                "camera1",
                                                schedule.get('is_late', False)
                                            )
                                        else:
                                            print(f"[WARN] ⚠️ Schedule for {name} has no valid _id - skipping time in log", file=sys.stderr, flush=True)
                                            success = False
                                            log_type = "time in"
                                        
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
                                            
                                            print(f"[INFO] {status_emoji} {log_type.upper()} logged for {name} - {schedule['courseCode']} ({status_text})", file=sys.stderr, flush=True)
                                        else:
                                            print(f"[WARN] Failed to log {log_type.upper()} for {name}", file=sys.stderr, flush=True)
                                        
                                        events.append({
                                            "type": "first_detected",
                                            "name": name,
                                            "timestamp": person_sessions[name].first_seen.isoformat(),
                                            "has_schedule": True
                                        })
                                    else:
                                        # ⚡ OPTIMIZED: Reduced logging for performance
                                        if frame_count % 2000 == 0:
                                            print(f"[INFO] 📋 {name} detected without scheduled class - Tracking only", file=sys.stderr, flush=True)
                                        events.append({
                                            "type": "detected_no_schedule",
                                            "name": name,
                                            "timestamp": datetime.now().isoformat(),
                                            "message": f"{name} detected (no scheduled class)"
                                        })
                                else:
                                    # Existing session - Re-check schedule periodically or when person returns
                                    session = person_sessions[name]
                                    
                                    # Check if we should re-check the schedule
                                    should_recheck = False
                                    if not session.is_present:
                                        returned, absence_duration = session.mark_returned()
                                        if returned:
                                            # Person returned - re-check schedule in case one was added
                                            should_recheck = True
                                            events.append({
                                                "type": "returned",
                                                "name": name,
                                                "absence_minutes": round(absence_duration / 60, 2),
                                                "returned_at": datetime.now().isoformat()
                                            })
                                            if frame_count % 500 == 0:
                                                print(f"[INFO] {name} RETURNED after {absence_duration/60:.1f} min - Re-checking schedule", file=sys.stderr, flush=True)
                                    else:
                                        session.update_presence()
                                        # ⚡ REAL-TIME: Re-check schedule more frequently (every 30 seconds) to detect new schedules immediately
                                        time_since_last_check = (datetime.now() - session.last_schedule_check).total_seconds()
                                        if time_since_last_check >= SCHEDULE_RECHECK_INTERVAL_SECONDS:
                                            should_recheck = True
                                            if frame_count % 500 == 0:  # Log more frequently for debugging
                                                print(f"[INFO] Re-checking schedule for {name} (last checked {time_since_last_check:.0f}s ago)", file=sys.stderr, flush=True)
                                    
                                    # Re-check schedule if needed
                                    if should_recheck:
                                        try:
                                            camera_id = os.getenv("CAMERA_ID", "camera1")
                                            room_name = ROOM_MAPPING.get(camera_id, "")
                                            new_schedule = get_current_schedule(name, camera_id=camera_id, room_name=room_name)
                                            
                                            if frame_count % 2000 == 0:
                                                if new_schedule:
                                                    print(f"[DEBUG SCHEDULE] {name}: Retrieved schedule with isValidSchedule={new_schedule.get('isValidSchedule', 'NOT SET')}, courseCode={new_schedule.get('courseCode', 'N/A')}", file=sys.stderr, flush=True)
                                                else:
                                                    print(f"[DEBUG SCHEDULE] {name}: No schedule found!", file=sys.stderr, flush=True)
                                            
                                            session.last_schedule_check = datetime.now()
                                        except Exception as schedule_error:
                                            print(f"[ERROR] Failed to re-check schedule for {name}: {schedule_error}", file=sys.stderr, flush=True)
                                            new_schedule = session.schedule
                                        
                                        # If schedule changed from None to a schedule, log time in
                                        if new_schedule and not session.schedule:
                                            print(f"[INFO] [OK] New schedule found for {name} - {new_schedule.get('courseCode')}", file=sys.stderr, flush=True)
                                            if 'isValidSchedule' not in new_schedule:
                                                new_schedule['isValidSchedule'] = True
                                            session.schedule = new_schedule
                                            session.is_late = new_schedule.get('is_late', False)
                                            
                                            # Log time in if not already logged
                                            if not session.time_in_logged:
                                                schedule_id = new_schedule.get('_id') or new_schedule.get('id')
                                                # Ensure schedule_id is a string and not empty
                                                if schedule_id:
                                                    schedule_id = str(schedule_id).strip()
                                                    if not schedule_id or schedule_id == 'None' or schedule_id == 'N/A':
                                                        schedule_id = None
                                                if schedule_id:
                                                    success, log_type = log_time_in(
                                                        name,
                                                        schedule_id,
                                                        "camera1",
                                                        new_schedule.get('is_late', False)
                                                    )
                                                else:
                                                    print(f"[WARN] ⚠️ New schedule for {name} has no valid _id - skipping time in log", file=sys.stderr, flush=True)
                                                    success = False
                                                    log_type = "time in"
                                                
                                                if success:
                                                    session.time_in_logged = True
                                                    session.log_type = log_type
                                                    status_emoji = "[TIME]" if log_type == "time in" else "[WARN]"
                                                    status_text = "ON TIME" if log_type == "time in" else "LATE"
                                                    
                                                    events.append({
                                                        "type": log_type,
                                                        "name": name,
                                                        "timestamp": datetime.now().isoformat(),
                                                        "schedule": new_schedule,
                                                        "isLate": new_schedule.get('is_late', False),
                                                        "status": status_text
                                                    })
                                                    
                                                    print(f"[INFO] {status_emoji} {log_type.upper()} logged for {name} - {new_schedule['courseCode']} ({status_text})", file=sys.stderr, flush=True)
                                        elif new_schedule != session.schedule:
                                            if new_schedule:
                                                print(f"[INFO] Schedule updated for {name} - {new_schedule.get('courseCode')}", file=sys.stderr, flush=True)
                                                if 'isValidSchedule' not in new_schedule:
                                                    new_schedule['isValidSchedule'] = True
                                                session.schedule = new_schedule
                                                session.is_late = new_schedule.get('is_late', False)
                                            else:
                                                if session.schedule:
                                                    print(f"[INFO] Schedule no longer active for {name}", file=sys.stderr, flush=True)
                                                session.schedule = None
                                        elif new_schedule and session.schedule:
                                            if 'isValidSchedule' not in new_schedule:
                                                new_schedule['isValidSchedule'] = True
                                            session.schedule = new_schedule
                                            session.is_late = new_schedule.get('is_late', False)
                                
                                # Add detection
                                if name in person_sessions:
                                    session = person_sessions[name]
                                    schedule = session.schedule
                                    
                                    has_schedule = schedule is not None
                                    # ⚡ CRITICAL: Only green if isValidSchedule is explicitly True (room matches)
                                    # Default to False if not set (safety: only green when room matches)
                                    is_valid_schedule = schedule.get("isValidSchedule", False) if schedule else False
                                    
                                    session_dict = session.to_dict()
                                    detections.append({
                                        "box": [x1, y1, w, h],
                                        "name": name,
                                        "score": float(best_score),
                                        "session": session_dict,
                                        "has_schedule": has_schedule,
                                        "is_valid_schedule": bool(is_valid_schedule)
                                    })
                    
                    # Check for absent people
                    now = datetime.now()
                    if (now - last_absence_check).total_seconds() >= 1:
                        absence_events = check_absent_people(currently_detected_names)
                        events.extend(absence_events)
                        last_absence_check = now
                    
                except Exception as e:
                    print(f"[ERROR] Detection error: {e}", file=sys.stderr, flush=True)
                    import traceback
                    traceback.print_exc(file=sys.stderr)
            
            # ⚡ Update latest result (thread-safe)
            with detection_lock:
                latest_detection_result = {
                    "faces": detections,
                    "events": events if events else [],
                    "frame_width": int(frame_width),
                    "frame_height": int(frame_height)
                }
            
            # Free memory
            del frame
            gc.collect()
            
        except Exception as e:
            print(f"[ERROR] Detection thread error: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc(file=sys.stderr)

def output_thread():
    """⚡ OUTPUT THREAD: Sends detection results only when data changes (lightweight comparison)"""
    global latest_detection_result
    
    last_sent_signature = None
    
    while True:
        try:
            time.sleep(0.033)  # Check every ~30ms, but only send when changed
            
            with detection_lock:
                result = latest_detection_result.copy()
                has_events = len(result.get("events", [])) > 0
            
            # ⚡ LIGHTWEIGHT OPTIMIZATION: Fast comparison using only face names and count
            # This is MUCH faster than MD5 hashing the entire JSON
            faces = result.get("faces", [])
            face_count = len(faces)
            # Create a simple signature: tuple of (count, sorted names)
            # This is extremely fast - no JSON serialization, no hashing
            face_names = tuple(sorted([f.get("name", "") for f in faces])) if faces else ()
            current_signature = (face_count, face_names)
            
            # Send if:
            # 1. Data changed (signature different)
            # 2. There are events (always send events)
            # 3. First time (last_sent_signature is None)
            data_changed = current_signature != last_sent_signature
            
            if data_changed or has_events or last_sent_signature is None:
                print(json.dumps(result, separators=(',', ':')), flush=True)
                last_sent_signature = current_signature
                
                # ⚡ Clear events after sending to prevent resending
                if has_events:
                    with detection_lock:
                        latest_detection_result["events"] = []
            
        except Exception as e:
            print(f"[ERROR] Output thread error: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc(file=sys.stderr)

def start_processing_threads(app):
    """Start all processing threads"""
    
    # Video sender thread (highest priority)
    video_thread = threading.Thread(target=video_sender_thread, daemon=True, name="VideoSender")
    video_thread.start()
    
    # Detection thread
    detection_thread = threading.Thread(target=face_detection_thread, args=(app,), daemon=True, name="FaceDetection")
    detection_thread.start()
    
    # Output thread
    output_thread_obj = threading.Thread(target=output_thread, daemon=True, name="Output")
    output_thread_obj.start()
    
    print("[INFO] ⚡ All processing threads started - ZERO-LAG MODE ACTIVE!", file=sys.stderr, flush=True)
    
    return video_thread, detection_thread, output_thread_obj

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
else:
    print(f"[INFO] System Mode: MONGODB-ONLY (All schedule operations use MongoDB directly) ⚡", file=sys.stderr, flush=True)
    print(f"[INFO] Performance Optimization: Using in-memory cache refreshed from MongoDB", file=sys.stderr, flush=True)

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
    
    # ⚡ Direct model loading for GPU acceleration (bypasses FaceAnalysis wrapper)
    # This gives us direct control over GPU execution
    import os
    model_dir = os.path.expanduser('~/.insightface/models/buffalo_s')
    
    det_path = os.path.join(model_dir, 'det_500m.onnx')
    rec_path = os.path.join(model_dir, 'w600k_mbf.onnx')
    
    if not os.path.exists(det_path):
        raise Exception(f"Detection model not found at {det_path}. Please download buffalo_s models.")
    
    # Detection size for GPU vs CPU
    # Larger size = better distant face detection, but slightly slower
    # 1280x1280 = EXTREME distant face detection while maintaining speed on RTX 3050 Ti
    if gpu_available:
        det_size = (1280, 1280)  # Increased to 1280x1280 for EXTREME distant face detection (RTX 3050 Ti can handle it)
        print("[INFO] ⚡ GPU: Using 1280x1280 detection for RTX 3050 Ti (EXTREME distant face detection + fast processing)", file=sys.stderr, flush=True)
    else:
        det_size = (320, 320)  # CPU: balance speed and accuracy
        print("[INFO] CPU: Using 320x320 detection for balanced performance", file=sys.stderr, flush=True)
    
    ctx_id = 0 if gpu_available else -1
    
    # ⚡ MAXIMUM GPU PERFORMANCE: Configure ONNX Runtime for maximum speed
    if gpu_available:
        import onnxruntime as ort
        # Configure CUDA provider options for MAXIMUM performance (RTX 3050 Ti 4GB)
        cuda_provider_options = {
            'device_id': 0,
            'arena_extend_strategy': 'kNextPowerOfTwo',
            'gpu_mem_limit': 3.5 * 1024 * 1024 * 1024,  # 3.5GB for RTX 3050 Ti (4GB total, leave 0.5GB for system)
            'cudnn_conv_algo_search': 'HEURISTIC',  # Faster algorithm search
            'do_copy_in_default_stream': True,  # Better memory management
            'tunable_op_enable': True,  # Enable tunable ops for better performance
            'tunable_op_tuning_enable': True,  # Enable tuning for optimal performance
        }
        print("[INFO] ⚡ Configuring CUDA provider for MAXIMUM GPU performance (RTX 3050 Ti 4GB)...", file=sys.stderr, flush=True)
        print(f"[INFO] GPU Memory Limit: {cuda_provider_options['gpu_mem_limit'] / 1024 / 1024 / 1024:.1f}GB (RTX 3050 Ti optimized)", file=sys.stderr, flush=True)
        print("[INFO] ⚡ Tunable Ops: Enabled for optimal RTX 3050 Ti performance", file=sys.stderr, flush=True)
    
    # Load detection model with GPU (ctx_id=0 forces GPU usage)
    print(f"[INFO] Loading detection model: {det_path}", file=sys.stderr, flush=True)
    det_model = SCRFD(det_path)
    det_model.prepare(ctx_id=ctx_id, input_size=det_size)
    if ctx_id >= 0:
        print("[INFO] ✅ Detection model loaded with GPU (ctx_id=0) - MAXIMUM PERFORMANCE!", file=sys.stderr, flush=True)
    else:
        print("[INFO] ✅ Detection model loaded with CPU", file=sys.stderr, flush=True)
    
    # Load recognition model with GPU (ctx_id=0 forces GPU usage)
    print(f"[INFO] Loading recognition model: {rec_path}", file=sys.stderr, flush=True)
    rec_model = ArcFaceONNX(rec_path)
    rec_model.prepare(ctx_id=ctx_id)
    if ctx_id >= 0:
        print("[INFO] ✅ Recognition model loaded with GPU (ctx_id=0) - MAXIMUM PERFORMANCE!", file=sys.stderr, flush=True)
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
            
        def get(self, img, max_num=100):
            """Detect faces and get embeddings - BATCH OPTIMIZED for multiple faces
            max_num=100 allows detecting many faces (RTX 3050 Ti optimized)
            Optimized for FAST detection even for distant faces with RTX 3050 Ti"""
            # ⚡ ULTRA-FAST: Step 1: Detection (single GPU call for ALL faces)
            # Lower threshold for initial detection, filtering happens later for accuracy
            # GPU processes this very fast even with many faces
            bboxes, kpss = self.det_model.detect(img, threshold=self.det_thresh, max_num=max_num)
            if bboxes.shape[0] == 0:
                return []
            
            # ⚡ ACCURACY FILTERING: Filter out low-confidence detections and very small faces
            # Get image dimensions for size validation
            img_height, img_width = img.shape[:2]
            
            # Filter by detection score, face size, and aspect ratio for better accuracy
            valid_indices = []
            for i in range(bboxes.shape[0]):
                det_score = float(bboxes[i, 4])
                x1, y1, x2, y2 = bboxes[i, 0:4]
                face_width = x2 - x1
                face_height = y2 - y1
                face_area = face_width * face_height
                
                # Calculate aspect ratio (width/height and height/width)
                aspect_ratio_w_h = face_width / max(face_height, 1)  # Avoid division by zero
                aspect_ratio_h_w = face_height / max(face_width, 1)
                max_aspect_ratio = max(aspect_ratio_w_h, aspect_ratio_h_w)
                min_aspect_ratio = min(aspect_ratio_w_h, aspect_ratio_h_w)
                
                # ⚡ ULTRA-ACCURATE MULTI-LAYER FILTERING:
                # 1. Minimum detection score (confidence) - Higher threshold for accuracy
                # 2. Minimum face size (width and height) - Larger minimum for accuracy
                # 3. Minimum face area (total pixels) - Ensures sufficient detail
                # 4. Aspect ratio validation (faces should be roughly square, not too elongated)
                # 5. Bounding box validation (must be within image bounds)
                # 6. Additional quality checks for better accuracy
                
                # ⚡ ULTRA-OPTIMIZED: Early exit for invalid detections (fastest possible - order matters for speed)
                # Check cheapest conditions first for maximum speed
                if det_score < MIN_DETECTION_SCORE:
                    continue
                if face_width < MIN_FACE_SIZE or face_height < MIN_FACE_SIZE:
                    continue
                if max_aspect_ratio > MAX_FACE_ASPECT_RATIO or min_aspect_ratio < MIN_FACE_ASPECT_RATIO:
                    continue
                if face_area < (MIN_FACE_SIZE * MIN_FACE_SIZE):
                    continue
                if x1 < 0 or y1 < 0 or x2 > img_width or y2 > img_height:
                    continue
                
                # All checks passed - add to valid indices
                valid_indices.append(i)
            
            if len(valid_indices) == 0:
                return []
            
            # Keep only valid detections
            bboxes = bboxes[valid_indices]
            if kpss is not None:
                if isinstance(kpss, np.ndarray):
                    kpss = kpss[valid_indices]
                else:
                    kpss = [kpss[i] for i in valid_indices]
            
            num_faces = len(valid_indices)
            
            # ⚡ ULTRA-FAST: Step 2: Batch align ALL faces at once (CPU - ULTRA-OPTIMIZED)
            # ⚡ ULTRA-OPTIMIZED: Pre-allocate with exact size, avoid list operations
            if kpss is None:
                aligned_faces = []
                alignment_indices = []
            else:
                # ⚡ OPTIMIZED: Pre-allocate lists with known size (faster than append)
                aligned_faces = [None] * num_faces
                alignment_indices = []
                valid_count = 0
                # ⚡ OPTIMIZED: Single pass, no resizing needed, direct assignment
                for i in range(num_faces):
                    if kpss[i] is not None:
                        aimg = self.face_align.norm_crop(img, kpss[i])
                        aligned_faces[valid_count] = aimg
                        alignment_indices.append(i)
                        valid_count += 1
                # Trim to actual size
                aligned_faces = aligned_faces[:valid_count]
            
            # ⚡ ULTRA-FAST: Step 3: Batch get embeddings for ALL faces in SINGLE GPU call
            embeddings = [None] * num_faces
            if aligned_faces:
                # ⚡ ULTRA-OPTIMIZED: True batch processing - stack all faces and process at once
                # ⚡ OPTIMIZED: Ensure contiguous array for faster GPU operations (no copy)
                batch_imgs = np.ascontiguousarray(np.stack(aligned_faces, axis=0), dtype=np.uint8)
                # ⚡ ULTRA-OPTIMIZED: Always use batch processing when available (much faster)
                try:
                    # Attempt batch inference (faster for multiple faces, even for single face)
                    if hasattr(self.rec_model, 'get_feat_batch'):
                        batch_embs = self.rec_model.get_feat_batch(batch_imgs)
                        # ⚡ OPTIMIZED: Direct assignment (faster than loop, no copy)
                        for idx, aligned_idx in enumerate(alignment_indices):
                            embeddings[aligned_idx] = batch_embs[idx].flatten()
                    else:
                        # ⚡ OPTIMIZED: Process in smaller batches for better GPU utilization
                        batch_size = GPU_BATCH_SIZE
                        for batch_start in range(0, len(alignment_indices), batch_size):
                            batch_end = min(batch_start + batch_size, len(alignment_indices))
                            for idx in range(batch_start, batch_end):
                                aligned_idx = alignment_indices[idx]
                                emb = self.rec_model.get_feat(aligned_faces[idx]).flatten()
                                embeddings[aligned_idx] = emb
                except Exception as e:
                    # Fallback to individual processing if batch fails
                    for idx, aligned_idx in enumerate(alignment_indices):
                        emb = self.rec_model.get_feat(aligned_faces[idx]).flatten()
                        embeddings[aligned_idx] = emb
            
            # Step 4: Build face objects (ULTRA-OPTIMIZED)
            # ⚡ ULTRA-OPTIMIZED: Pre-allocate list and use direct attribute assignment
            faces = [None] * num_faces
            for i in range(num_faces):
                face = type('Face', (), {})()
                # ⚡ OPTIMIZED: Direct slice view (no copy needed - faster)
                face.bbox = bboxes[i, 0:4]  # Direct view (faster than copy)
                face.det_score = float(bboxes[i, 4])  # Convert once
                face.kps = kpss[i] if (kpss is not None and i < len(kpss)) else None
                face.embedding = embeddings[i]
                faces[i] = face
            
            return faces
    
    app = GPUFaceAnalysis(det_model, rec_model, det_thresh=DETECTION_THRESHOLD)
    model_name = "buffalo_s (GPU Direct)"
    
    init_time = time.time() - init_start
    
    device_type = "GPU (CUDA)" if ctx_id >= 0 else "CPU"
    print(f"[INFO] ✅ Face models loaded successfully on {device_type} (took {init_time:.2f}s)", file=sys.stderr, flush=True)
    print(f"[INFO] 🎯 Model: {model_name}, det_size={det_size}", file=sys.stderr, flush=True)
    print(f"[INFO] ⚡ ULTRA-FAST & ACCURATE MODE ENABLED (OPTIMIZED)", file=sys.stderr, flush=True)
    print(f"[INFO] 📏 Detection threshold: {DETECTION_THRESHOLD} (optimized for fast initial detection)", file=sys.stderr, flush=True)
    print(f"[INFO] ✅ Minimum detection score: {MIN_DETECTION_SCORE} (high threshold for maximum accuracy)", file=sys.stderr, flush=True)
    print(f"[INFO] 🎯 Recognition threshold: {CONF_THRESHOLD} (optimized for maximum accuracy)", file=sys.stderr, flush=True)
    print(f"[INFO] 📐 Face size filter: {MIN_FACE_SIZE}px (filters tiny false detections)", file=sys.stderr, flush=True)
    print(f"[INFO] ⚡ GPU Batch Size: {GPU_BATCH_SIZE} (optimized for RTX 3050 Ti)", file=sys.stderr, flush=True)
    print(f"[INFO] ✅ Minimum face size: {MIN_FACE_SIZE}px (larger minimum for better accuracy)", file=sys.stderr, flush=True)
    print(f"[INFO] ✅ Aspect ratio filter: {MIN_FACE_ASPECT_RATIO:.2f}-{MAX_FACE_ASPECT_RATIO:.2f} (tighter filter for accuracy)", file=sys.stderr, flush=True)
    print(f"[INFO] 📏 Recognition threshold: {CONF_THRESHOLD} (high threshold for maximum accuracy, reduces false positives)", file=sys.stderr, flush=True)
    if ctx_id >= 0:
        print(f"[INFO] ⚡ GPU Context ID: {ctx_id} - Face detection will run on GPU with ZERO DELAY!", file=sys.stderr, flush=True)
        print(f"[INFO] 👁️ Optimized for FAST distant face detection - detects & recognizes faces quickly even when far away!", file=sys.stderr, flush=True)
        print(f"[INFO] ⚡ Speed optimizations: Batch processing + early filtering + GPU acceleration = FAST recognition!", file=sys.stderr, flush=True)
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

# ⚡ MAXIMUM GPU WARMUP: Run multiple dummy inferences to pre-warm GPU for zero delay
if gpu_available:
    print("[INFO] ⚡⚡ MAXIMUM GPU WARMUP: Warming up GTX 3050 Ti for zero-delay inference...", file=sys.stderr, flush=True)
    warmup_start = time.time()
    try:
        # Create a dummy image for warmup (match detection size)
        dummy_img = np.zeros((det_size[1], det_size[0], 3), dtype=np.uint8)
        # Add some variation to warmup different code paths
        dummy_img[100:200, 100:200] = 128  # Add some features
        for i in range(10):  # 10 warmup iterations for maximum GPU performance
            _ = app.get(dummy_img)
            if i % 3 == 0:
                print(f"[INFO] ⚡ GPU warmup iteration {i+1}/10...", file=sys.stderr, flush=True)
        warmup_time = time.time() - warmup_start
        print(f"[INFO] ✅ GPU warmed up in {warmup_time:.2f}s - Ready for ZERO DELAY detection!", file=sys.stderr, flush=True)
        
        # ⚡ VERIFY GPU USAGE: Check GPU utilization after warmup
        gpu_stats = check_gpu_usage()
        if gpu_stats:
            print(f"[INFO] ⚡ GPU Status: {gpu_stats['utilization']}% utilization, {gpu_stats['memory_used_mb']}MB/{gpu_stats['memory_total_mb']}MB memory", file=sys.stderr, flush=True)
            if gpu_stats['utilization'] > 0 or gpu_stats['memory_used_mb'] > 50:
                print(f"[INFO] ✅ GPU is being used! (Utilization: {gpu_stats['utilization']}%, Memory: {gpu_stats['memory_used_mb']}MB)", file=sys.stderr, flush=True)
            else:
                print(f"[WARN] ⚠️ GPU may not be used effectively (Utilization: {gpu_stats['utilization']}%, Memory: {gpu_stats['memory_used_mb']}MB)", file=sys.stderr, flush=True)
                print(f"[WARN] ⚠️ This is normal if no frames are being processed yet. GPU will activate when detection starts.", file=sys.stderr, flush=True)
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
    # ⚡ MONGODB-ONLY: Always load in-memory cache from MongoDB
    print("[INFO] [MONGODB-ONLY] Loading schedule cache from MongoDB...", file=sys.stderr, flush=True)
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

try:
    # ⚡ ZERO-LAG MODE: Start threaded processing
    threads = start_processing_threads(app)
    
    # Keep main thread alive and handle embedding reloads
    while True:
        time.sleep(1)
        
        # Check if embeddings need reload
        reload_embeddings_if_needed(app)
        
        # ⚡ GPU PERFORMANCE MONITORING: Check GPU usage periodically
        if gpu_available:
            try:
                gpu_stats = check_gpu_usage()
                if gpu_stats:
                    # Only log occasionally to reduce spam
                    import random
                    if random.random() < 0.01:  # 1% chance to log
                        print(f"[GPU] ⚡ Utilization: {gpu_stats['utilization']}% | Memory: {gpu_stats['memory_used_mb']}MB/{gpu_stats['memory_total_mb']}MB ({gpu_stats['memory_percent']}%)", file=sys.stderr, flush=True)
            except:
                pass

except KeyboardInterrupt:
    print("[INFO] Interrupted by user", file=sys.stderr, flush=True)
finally:
    observer.stop()
    observer.join()
    print("[INFO] Recognition loop ended", file=sys.stderr, flush=True)