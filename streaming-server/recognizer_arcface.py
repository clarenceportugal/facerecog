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
from datetime import datetime, timedelta
import threading
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# ----------------------------
# Config
# ----------------------------
DATASET_DIR = Path(r"C:\Users\mark\Documents\GitHub\eduvision\streaming-server\faces")
CONF_THRESHOLD = 0.6
ABSENCE_TIMEOUT_SECONDS = 300  # 5 minutes = 300 seconds

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
        
    def to_dict(self):
        """Convert session to dictionary for JSON"""
        return {
            "name": self.name,
            "first_seen": self.first_seen.isoformat(),
            "last_seen": self.last_seen.isoformat(),
            "total_minutes": round(self.get_total_time_minutes(), 2),
            "is_present": self.is_present,
            "left_at": self.left_at.isoformat() if self.left_at else None
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
    """Check for people who have been absent for too long"""
    events = []
    now = datetime.now()
    
    for name, session in list(person_sessions.items()):
        if session.is_present and name not in currently_detected_names:
            time_since_last_seen = (now - session.last_seen).total_seconds()
            
            if time_since_last_seen >= ABSENCE_TIMEOUT_SECONDS:
                if session.mark_left():
                    events.append({
                        "type": "left",
                        "name": name,
                        "total_minutes": round(session.get_total_time_minutes(), 2),
                        "left_at": session.left_at.isoformat()
                    })
                    print(f"[INFO] {name} marked as LEFT after {ABSENCE_TIMEOUT_SECONDS}s absence", file=sys.stderr, flush=True)
    
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
    print("[INFO] Using CPU for face detection", file=sys.stderr, flush=True)
    app = FaceAnalysis(name="buffalo_l", providers=['CPUExecutionProvider'])
    app.prepare(ctx_id=-1, det_size=(640, 640))
    print("[INFO] ArcFace model loaded successfully", file=sys.stderr, flush=True)
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
            if frame_count % 50 == 0:
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
                            person_sessions[name] = PersonSession(name)
                            events.append({
                                "type": "first_detected",
                                "name": name,
                                "timestamp": person_sessions[name].first_seen.isoformat()
                            })
                            print(f"[INFO] NEW SESSION: {name} first detected", file=sys.stderr, flush=True)
                        else:
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
                        
                        detections.append({
                            "box": [x1, y1, w, h],
                            "name": name,
                            "score": float(best_score),
                            "session": person_sessions[name].to_dict()
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