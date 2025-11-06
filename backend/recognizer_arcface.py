import sys
import struct
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

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# ----------------------------
# Config
# ----------------------------
DATASET_DIR = Path(r"C:\Users\mark\Documents\GitHub\eduvision\streaming-server\faces")
CONF_THRESHOLD = 0.55  # Slightly lower threshold (0.55 vs 0.6) for better detection
ABSENCE_TIMEOUT_SECONDS = 300  # 5 minutes = 300 seconds
LATE_THRESHOLD_MINUTES = 15  # 15 minutes late threshold
BACKEND_API = "http://localhost:5000/api/auth"  # TypeScript server with API endpoints

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

def get_current_schedule(instructor_name):
    """Get current schedule for an instructor - checks if they have a class NOW"""
    try:
        # Format the name properly before sending to backend
        formatted_name = format_instructor_name(instructor_name)
        print(f"[INFO] ⚠️ CHECKING SCHEDULE FOR: '{instructor_name}' -> Formatted to: '{formatted_name}'", file=sys.stderr, flush=True)
        
        response = requests.post(
            f"{BACKEND_API}/get-current-schedule",
            json={"instructorName": formatted_name},
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            schedule = data.get("schedule")
            
            if schedule:
                # Verify the schedule is for today and current time
                current_day = get_current_day()
                current_time = datetime.now().time()
                
                # Check if today is a scheduled day
                days = schedule.get('days', {})
                # If days object is empty, assume it's a daily schedule (accept it)
                # Otherwise check if current day is enabled
                if days and len(days) > 0:
                    if not days.get(current_day, False):
                        print(f"[INFO] {instructor_name} has no class scheduled today ({current_day})", file=sys.stderr, flush=True)
                        print(f"[INFO] Days object: {days}", file=sys.stderr, flush=True)
                        return None
                else:
                    print(f"[INFO] {instructor_name} - days object is empty, assuming daily schedule", file=sys.stderr, flush=True)
                
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
                    
                    print(f"[INFO] {instructor_name} has class NOW: {schedule.get('courseCode')} ({start_time}-{end_time}) - Late: {is_late}", file=sys.stderr, flush=True)
                    return schedule
                else:
                    print(f"[INFO] {instructor_name} not within class time window (class: {start_time}-{end_time}, current: {current_time.strftime('%H:%M')})", file=sys.stderr, flush=True)
                    return None
            
            return None
    except Exception as e:
        print(f"[ERROR] Failed to get schedule: {e}", file=sys.stderr, flush=True)
        print(f"[ERROR] Failed for instructor: {instructor_name} (formatted: {format_instructor_name(instructor_name)})", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return None

def log_time_in(instructor_name, schedule_id, camera_id, is_late):
    """Log time in to backend with late status"""
    try:
        log_type = "late" if is_late else "time in"
        formatted_name = format_instructor_name(instructor_name)
        response = requests.post(
            f"{BACKEND_API}/log-time-in",
            json={
                "instructorName": formatted_name,
                "scheduleId": schedule_id,
                "cameraId": camera_id,
                "timestamp": datetime.now().isoformat(),
                "logType": log_type,
                "isLate": is_late
            },
            timeout=5
        )
        return response.status_code == 200, log_type
    except Exception as e:
        print(f"[ERROR] Failed to log time in: {e}", file=sys.stderr, flush=True)
        return False, None

def log_time_out(instructor_name, schedule_id, camera_id, total_minutes):
    """Log time out to backend"""
    try:
        formatted_name = format_instructor_name(instructor_name)
        response = requests.post(
            f"{BACKEND_API}/log-time-out",
            json={
                "instructorName": formatted_name,
                "scheduleId": schedule_id,
                "cameraId": camera_id,
                "timestamp": datetime.now().isoformat(),
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
    """Load face embeddings from dataset directory"""
    global known_embeddings, known_names
    
    temp_embeddings = []
    temp_names = []
    
    print(f"[INFO] Loading faces from: {DATASET_DIR}", file=sys.stderr, flush=True)
    
    if not DATASET_DIR.exists():
        print(f"[ERROR] Dataset directory does not exist: {DATASET_DIR}", file=sys.stderr, flush=True)
        return False
    
    for person_dir in DATASET_DIR.iterdir():
        if not person_dir.is_dir():
            continue
        
        label = person_dir.name
        face_count = 0
        
        for img_path in person_dir.glob("*.*"):
            # Skip non-image files and backup files
            if img_path.suffix.lower() not in ['.jpg', '.jpeg', '.png']:
                continue
                
            try:
                img = cv2.imread(str(img_path))
                if img is None:
                    print(f"[WARN] Could not read image: {img_path}", file=sys.stderr, flush=True)
                    continue
                
                faces = app.get(img)
                if len(faces) == 0:
                    print(f"[WARN] No face detected in: {img_path}", file=sys.stderr, flush=True)
                    continue
                
                emb = faces[0].embedding
                
                if len(temp_embeddings) > 0 and len(emb) != len(temp_embeddings[0]):
                    print(f"[WARN] Skipping {img_path}: embedding size mismatch", file=sys.stderr, flush=True)
                    continue
                
                emb = emb / norm(emb)
                temp_embeddings.append(emb)
                temp_names.append(label)
                face_count += 1
                
            except Exception as e:
                print(f"[ERROR] Failed to process {img_path}: {e}", file=sys.stderr, flush=True)
                continue
        
        if face_count > 0:
            print(f"[INFO] Loaded {face_count} face(s) for {label}", file=sys.stderr, flush=True)
    
    if not temp_embeddings:
        print("[ERROR] No faces found in dataset folder.", file=sys.stderr, flush=True)
        return False
    
    # Thread-safe update
    with embeddings_lock:
        known_embeddings = np.array(temp_embeddings)
        known_names = temp_names
        print(f"[INFO] ✅ Total faces in database: {len(known_embeddings)}", file=sys.stderr, flush=True)
    
    return True

def reload_embeddings_if_needed(app):
    """Check if reload is requested and reload embeddings"""
    if reload_requested.is_set():
        print("[INFO] 🔄 Reloading face database...", file=sys.stderr, flush=True)
        reload_requested.clear()
        
        success = load_embeddings(app)
        if success:
            print("[INFO] ✅ Face database reloaded successfully!", file=sys.stderr, flush=True)
            return True
        else:
            print("[ERROR] ❌ Failed to reload face database", file=sys.stderr, flush=True)
            return False
    return False

# ----------------------------
# Helper functions
# ----------------------------
def read_frame_from_stdin():
    try:
        len_bytes = sys.stdin.buffer.read(4)
        if not len_bytes or len(len_bytes) < 4:
            return None
        
        frame_len = struct.unpack(">I", len_bytes)[0]
        
        if frame_len > 10 * 1024 * 1024:
            print(f"[ERROR] Frame too large: {frame_len} bytes", file=sys.stderr, flush=True)
            return None
        
        jpg_bytes = b''
        while len(jpg_bytes) < frame_len:
            chunk = sys.stdin.buffer.read(min(65536, frame_len - len(jpg_bytes)))
            if not chunk:
                return None
            jpg_bytes += chunk
        
        frame = cv2.imdecode(np.frombuffer(jpg_bytes, np.uint8), cv2.IMREAD_COLOR)
        return frame
        
    except Exception as e:
        print(f"[ERROR] Failed to read frame: {e}", file=sys.stderr, flush=True)
        return None

def check_absent_people(currently_detected_names):
    """Check for people who have been absent for too long - ONLY for scheduled faculty"""
    events = []
    now = datetime.now()
    
    for name, session in list(person_sessions.items()):
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
                            print(f"[INFO] 🚪 TIME OUT logged for {name} - Total: {session.get_total_time_minutes():.1f} min", file=sys.stderr, flush=True)
                        else:
                            print(f"[WARN] Failed to log TIME OUT for {name}", file=sys.stderr, flush=True)
                    
                    events.append({
                        "type": "left",
                        "name": name,
                        "total_minutes": round(session.get_total_time_minutes(), 2),
                        "left_at": session.left_at.isoformat()
                    })
                    print(f"[INFO] {name} marked as LEFT after {ABSENCE_TIMEOUT_SECONDS}s absence (scheduled class)", file=sys.stderr, flush=True)
    
    return events

# ----------------------------
# Main Setup
# ----------------------------
print(f"[INFO] Looking for faces at: {DATASET_DIR.absolute()}", file=sys.stderr, flush=True)
print(f"[INFO] Path exists: {DATASET_DIR.exists()}", file=sys.stderr, flush=True)

if DATASET_DIR.exists():
    subdirs = [d for d in DATASET_DIR.iterdir() if d.is_dir()]
    print(f"[INFO] Found {len(subdirs)} person folders", file=sys.stderr, flush=True)
    for subdir in subdirs:
        image_count = len(list(subdir.glob("*.*")))
        print(f"[INFO]   - {subdir.name}: {image_count} images", file=sys.stderr, flush=True)

print("[INFO] Starting ArcFace initialization...", file=sys.stderr, flush=True)

# Initialize ArcFace model
try:
    # Try GPU first, fallback to CPU if GPU not available
    import onnxruntime as ort
    
    # Check if CUDA is available
    available_providers = ort.get_available_providers()
    use_gpu = 'CUDAExecutionProvider' in available_providers
    
    if use_gpu:
        print("[INFO] ✅ GPU provider detected! Attempting to use CUDA for face detection", file=sys.stderr, flush=True)
        print(f"[INFO] Available providers: {available_providers}", file=sys.stderr, flush=True)
        # Try GPU with CUDAExecutionProvider
        try:
            app = FaceAnalysis(name="buffalo_s", providers=['CUDAExecutionProvider', 'CPUExecutionProvider'])
            # ctx_id=0 means GPU (first GPU), -1 means CPU
            app.prepare(ctx_id=0, det_size=(640, 640))  # Use larger detection size with GPU
            print("[INFO] ✅ ArcFace model loaded successfully on GPU (CUDA)", file=sys.stderr, flush=True)
            print("[INFO] Performance: Expect ~2-3x faster than CPU", file=sys.stderr, flush=True)
        except Exception as gpu_error:
            error_msg = str(gpu_error)
            print("[WARNING] ⚠️  GPU initialization failed", file=sys.stderr, flush=True)
            
            # Check for specific CUDA DLL errors
            if "cublasLt64" in error_msg or "cublas" in error_msg or "dll" in error_msg.lower():
                print("[WARNING] CUDA runtime libraries are missing!", file=sys.stderr, flush=True)
                print("[WARNING] Your onnxruntime-gpu requires CUDA runtime libraries to be installed.", file=sys.stderr, flush=True)
                print("[WARNING] Solution: Install CUDA Toolkit from NVIDIA website", file=sys.stderr, flush=True)
                print("[WARNING]   - Download: https://developer.nvidia.com/cuda-downloads", file=sys.stderr, flush=True)
                print("[WARNING]   - Or use: pip install nvidia-cublas-cu12 (for CUDA 12.x)", file=sys.stderr, flush=True)
                print("[WARNING]   - Or install onnxruntime-gpu with matching CUDA version", file=sys.stderr, flush=True)
            else:
                print(f"[WARNING] Error details: {error_msg}", file=sys.stderr, flush=True)
            
            print("[INFO] Falling back to CPU mode (still functional, just slower)...", file=sys.stderr, flush=True)
            use_gpu = False
    
    if not use_gpu:
        print("[INFO] Using CPU for face detection", file=sys.stderr, flush=True)
        # Using buffalo_s (small) model for faster detection instead of buffalo_l (large)
        app = FaceAnalysis(name="buffalo_s", providers=['CPUExecutionProvider'])
        # Further reduced det_size to 320 for much faster detection
        # 320x320 is a good balance between speed and accuracy for real-time detection
        app.prepare(ctx_id=-1, det_size=(320, 320))
        print("[INFO] ArcFace model loaded successfully on CPU (optimized for maximum speed)", file=sys.stderr, flush=True)
        
except Exception as e:
    print(f"[ERROR] Failed to load ArcFace model: {e}", file=sys.stderr, flush=True)
    import traceback
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)

# Load initial embeddings
if not load_embeddings(app):
    sys.exit(1)

# Start file system watcher
print("[INFO] Starting file system watcher...", file=sys.stderr, flush=True)
event_handler = FaceDatasetWatcher(debounce_seconds=2)
observer = Observer()
observer.schedule(event_handler, str(DATASET_DIR), recursive=True)
observer.start()
print("[INFO] ✅ File system watcher started", file=sys.stderr, flush=True)

# Signal ready to Node.js
print("READY", flush=True)

# ----------------------------
# Recognition Loop
# ----------------------------
print("[INFO] Entering recognition loop...", file=sys.stderr, flush=True)
print(f"[INFO] Absence timeout: {ABSENCE_TIMEOUT_SECONDS} seconds", file=sys.stderr, flush=True)
print(f"[INFO] Late threshold: {LATE_THRESHOLD_MINUTES} minutes", file=sys.stderr, flush=True)

frame_count = 0
last_absence_check = datetime.now()

try:
    while True:
        try:
            # Check if embeddings need to be reloaded
            reload_embeddings_if_needed(app)
            
            frame = read_frame_from_stdin()
            if frame is None:
                print("[INFO] No more frames, exiting", file=sys.stderr, flush=True)
                break
            
            frame_count += 1
            # Reduced logging frequency for better performance
            if frame_count % 200 == 0:
                print(f"[INFO] Processed {frame_count} frames", file=sys.stderr, flush=True)
            
            detections = []
            events = []
            
            # Thread-safe access to embeddings
            with embeddings_lock:
                faces = app.get(frame)
                
                currently_detected_names = set()
                
                for f in faces:
                    x1, y1, x2, y2 = map(int, f.bbox)
                    w = x2 - x1
                    h = y2 - y1
                    
                    emb = f.embedding / norm(f.embedding)
                    sims = np.dot(known_embeddings, emb)
                    best_idx = np.argmax(sims)
                    best_score = sims[best_idx]
                    
                    if best_score > CONF_THRESHOLD:
                        name = known_names[best_idx]
                        currently_detected_names.add(name)
                        
                        # Handle session tracking
                        if name not in person_sessions:
                            # NEW FACULTY DETECTED - Check if they have a scheduled class NOW
                            schedule = get_current_schedule(name)
                            
                            # Create session for ALL detected faculty (scheduled or not)
                            person_sessions[name] = PersonSession(name)
                            person_sessions[name].schedule = schedule
                            
                            if schedule:
                                # They have a class scheduled NOW
                                person_sessions[name].is_late = schedule.get('is_late', False)
                                
                                # Log time in with late status
                                success, log_type = log_time_in(
                                    name, 
                                    schedule['_id'], 
                                    "camera1",
                                    schedule.get('is_late', False)
                                )
                                
                                if success:
                                    person_sessions[name].time_in_logged = True
                                    person_sessions[name].log_type = log_type
                                    
                                    status_emoji = "⏰" if log_type == "time in" else "⚠️"
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
                                # NO SCHEDULED CLASS - Track but don't log attendance
                                print(f"[INFO] 📋 {name} detected without scheduled class at this time - Tracking only", file=sys.stderr, flush=True)
                                print(f"[DEBUG] Face folder name: {name}", file=sys.stderr, flush=True)
                                print(f"[DEBUG] Will search for: {format_instructor_name(name)}", file=sys.stderr, flush=True)
                                events.append({
                                    "type": "detected_no_schedule",
                                    "name": name,
                                    "timestamp": datetime.now().isoformat(),
                                    "message": f"{name} detected (no scheduled class)"
                                })
                        else:
                            # Existing session
                            session = person_sessions[name]
                            
                            if not session.is_present:
                                returned, absence_duration = session.mark_returned()
                                if returned:
                                    events.append({
                                        "type": "returned",
                                        "name": name,
                                        "absence_minutes": round(absence_duration / 60, 2),
                                        "returned_at": datetime.now().isoformat()
                                    })
                                    print(f"[INFO] {name} RETURNED after {absence_duration/60:.1f} min", file=sys.stderr, flush=True)
                            else:
                                session.update_presence()
                        
                        # Add all detected faces to detections
                        if name in person_sessions:
                            session_dict = person_sessions[name].to_dict()
                            detections.append({
                                "box": [x1, y1, w, h],
                                "name": name,
                                "score": float(best_score),
                                "session": session_dict,
                                "has_schedule": session_dict.get("schedule") is not None
                            })
            
            # Check for absent people
            now = datetime.now()
            if (now - last_absence_check).total_seconds() >= 1:
                absence_events = check_absent_people(currently_detected_names)
                events.extend(absence_events)
                last_absence_check = now
            
            result = {
                "faces": detections,
                "events": events if events else []
            }
            print(json.dumps(result), flush=True)
            
        except KeyboardInterrupt:
            raise
        except Exception as e:
            print(f"[ERROR] Frame processing error: {e}", file=sys.stderr, flush=True)
            import traceback
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({"faces": [], "events": []}), flush=True)

except KeyboardInterrupt:
    print("[INFO] Interrupted by user", file=sys.stderr, flush=True)
finally:
    observer.stop()
    observer.join()
    print("[INFO] Recognition loop ended", file=sys.stderr, flush=True)