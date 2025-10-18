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

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# ----------------------------
# Config
# ----------------------------
DATASET_DIR = Path(r"C:\Users\portu\eduvision\streaming-server\faces")
CONF_THRESHOLD = 0.6  # higher = stricter (cosine similarity threshold) - increased for better accuracy

# Debug: Print the path being used
print(f"[INFO] Looking for faces at: {DATASET_DIR.absolute()}", file=sys.stderr, flush=True)
print(f"[INFO] Path exists: {DATASET_DIR.exists()}", file=sys.stderr, flush=True)
if DATASET_DIR.exists():
    subdirs = [d for d in DATASET_DIR.iterdir() if d.is_dir()]
    print(f"[INFO] Found {len(subdirs)} person folders", file=sys.stderr, flush=True)
    for subdir in subdirs:
        image_count = len(list(subdir.glob("*.*")))
        print(f"[INFO]   - {subdir.name}: {image_count} images", file=sys.stderr, flush=True)

print("[INFO] Starting ArcFace initialization...", file=sys.stderr, flush=True)

# ----------------------------
# Step 1: Init ArcFace model (CPU only)
# ----------------------------
try:
    print("[INFO] Using CPU for face detection", file=sys.stderr, flush=True)
    
    app = FaceAnalysis(name="buffalo_l", providers=['CPUExecutionProvider'])
    app.prepare(ctx_id=-1, det_size=(640, 640))  # ctx_id=-1 for CPU mode
    print("[INFO] ArcFace model loaded successfully", file=sys.stderr, flush=True)
    
except Exception as e:
    print(f"[ERROR] Failed to load ArcFace model: {e}", file=sys.stderr, flush=True)
    import traceback
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)

# ----------------------------
# Step 2: Build embeddings database
# ----------------------------
known_embeddings = []
known_names = []

print(f"[INFO] Loading faces from: {DATASET_DIR}", file=sys.stderr, flush=True)

if not DATASET_DIR.exists():
    print(f"[ERROR] Dataset directory does not exist: {DATASET_DIR}", file=sys.stderr, flush=True)
    sys.exit(1)

for person_dir in DATASET_DIR.iterdir():
    if not person_dir.is_dir():
        continue
    
    label = person_dir.name
    face_count = 0
    
    for img_path in person_dir.glob("*.*"):
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
            
            # Check embedding dimension consistency
            if len(known_embeddings) > 0 and len(emb) != len(known_embeddings[0]):
                print(f"[WARN] Skipping {img_path}: embedding size mismatch ({len(emb)} vs {len(known_embeddings[0])})", file=sys.stderr, flush=True)
                continue
            
            # Normalize embedding
            emb = emb / norm(emb)
            known_embeddings.append(emb)
            known_names.append(label)
            face_count += 1
            
        except Exception as e:
            print(f"[ERROR] Failed to process {img_path}: {e}", file=sys.stderr, flush=True)
            continue
    
    if face_count > 0:
        print(f"[INFO] Loaded {face_count} face(s) for {label}", file=sys.stderr, flush=True)

if not known_embeddings:
    print("[ERROR] No faces found in dataset folder.", file=sys.stderr, flush=True)
    sys.exit(1)

known_embeddings = np.array(known_embeddings)
print(f"[INFO] Total faces in database: {len(known_embeddings)}", file=sys.stderr, flush=True)

# ----------------------------
# Step 3: Helper to read frames from stdin
# ----------------------------
def read_frame_from_stdin():
    try:
        len_bytes = sys.stdin.buffer.read(4)
        if not len_bytes or len(len_bytes) < 4:
            return None
        
        frame_len = struct.unpack(">I", len_bytes)[0]
        
        # Safety check for unreasonable frame sizes
        if frame_len > 10 * 1024 * 1024:  # 10MB max
            print(f"[ERROR] Frame too large: {frame_len} bytes", file=sys.stderr, flush=True)
            return None
        
        # Read frame in chunks to avoid blocking
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

# ----------------------------
# Signal ready to Node.js
# ----------------------------
print("READY", flush=True)

# ----------------------------
# Step 4: Recognition loop
# ----------------------------
print("[INFO] Entering recognition loop...", file=sys.stderr, flush=True)

frame_count = 0
while True:
    try:
        frame = read_frame_from_stdin()
        if frame is None:
            print("[INFO] No more frames, exiting", file=sys.stderr, flush=True)
            break
        
        frame_count += 1
        if frame_count % 50 == 0:
            print(f"[INFO] Processed {frame_count} frames", file=sys.stderr, flush=True)
        
        detections = []
        faces = app.get(frame)
        
        for f in faces:
            x1, y1, x2, y2 = map(int, f.bbox)
            
            # Calculate width and height
            w = x2 - x1
            h = y2 - y1
            
            emb = f.embedding / norm(f.embedding)
            
            # cosine similarity against known embeddings
            sims = np.dot(known_embeddings, emb)
            best_idx = np.argmax(sims)
            best_score = sims[best_idx]
            
            # Only add detection if we actually recognize the person
            if best_score > CONF_THRESHOLD:
                name = known_names[best_idx]
                # Only return detection for recognized users
                detections.append({
                    "box": [x1, y1, w, h],
                    "name": name,
                    "score": float(best_score)
                })
            # If not recognized, don't add anything to detections (no "Unknown")
        
        # Always send response, even if no faces detected
        result = {"faces": detections}
        print(json.dumps(result), flush=True)
        
    except KeyboardInterrupt:
        print("[INFO] Interrupted by user", file=sys.stderr, flush=True)
        break
    except Exception as e:
        print(f"[ERROR] Frame processing error: {e}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        # Send empty response to keep the pipeline flowing
        print(json.dumps({"faces": []}), flush=True)

print("[INFO] Recognition loop ended", file=sys.stderr, flush=True)