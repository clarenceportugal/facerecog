import cv2
import numpy as np
import os
from flask import Flask, Response
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Path to folder with known faces
# Structure:
# faces/
#   John/
#       img1.jpg
#       img2.jpg
#   Alice/
#       img1.jpg
#       img2.jpg
KNOWN_FACES_DIR = "faces"

# Haar cascade for initial face detection
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

# Store encodings + names
known_encodings = []
known_names = []

def load_known_faces():
    import face_recognition
    for name in os.listdir(KNOWN_FACES_DIR):
        person_dir = os.path.join(KNOWN_FACES_DIR, name)
        if not os.path.isdir(person_dir):
            continue
        for filename in os.listdir(person_dir):
            path = os.path.join(person_dir, filename)
            if not filename.lower().endswith((".jpg", ".jpeg", ".png")):
                continue
            image = face_recognition.load_image_file(path)
            encodings = face_recognition.face_encodings(image)
            if encodings:
                known_encodings.append(encodings[0])
                known_names.append(name)
                print(f"[INFO] Loaded encoding for {name} from {filename}")

# Load faces on startup
load_known_faces()

# Use RTSP from MediaMTX
RTSP_URL = "rtsp://localhost:8554/mystream"  # Change to your MediaMTX stream name
cap = cv2.VideoCapture(RTSP_URL)

def gen_frames():
    import face_recognition

    while True:
        success, frame = cap.read()
        if not success:
            break

        # Resize for speed
        small_frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
        rgb_small_frame = small_frame[:, :, ::-1]

        # Detect + encode faces
        face_locations = face_recognition.face_locations(rgb_small_frame)
        face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

        for encoding, (top, right, bottom, left) in zip(face_encodings, face_locations):
            matches = face_recognition.compare_faces(known_encodings, encoding, tolerance=0.5)
            name = "Unknown"

            if True in matches:
                match_index = matches.index(True)
                name = known_names[match_index]

            # Scale back up
            top, right, bottom, left = top*2, right*2, bottom*2, left*2
            cv2.rectangle(frame, (left, top), (right, bottom), (0, 255, 0), 2)
            cv2.putText(frame, name, (left, top - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2)

        # Stream as MJPEG
        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/video_feed')
def video_feed():
    return Response(gen_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True)
