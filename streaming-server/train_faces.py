# train_faces.py
import cv2
import numpy as np
import json
from pathlib import Path

# 👇 use your updated folder path
dataset_dir = Path(r"C:\Users\mark\Documents\GitHub\eduvision\streaming-server\faces")

cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
face_cascade = cv2.CascadeClassifier(cascade_path)

faces = []
ids = []
label_to_id = {}
next_id = 0

for person_dir in dataset_dir.iterdir():
    if not person_dir.is_dir():
        continue
    label = person_dir.name
    if label not in label_to_id:
        label_to_id[label] = next_id
        next_id += 1
    id_ = label_to_id[label]

    for img_path in person_dir.glob('*.*'):
        img = cv2.imread(str(img_path))
        if img is None:
            continue
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        detected = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
        for (x, y, w, h) in detected:
            faces.append(gray[y:y+h, x:x+w])
            ids.append(id_)
            break  # only use the first detected face per image

if not faces:
    print("⚠️ No faces found in faces/ folder.")
    exit(1)

# train LBPH recognizer
recognizer = cv2.face.LBPHFaceRecognizer_create()
recognizer.train(faces, np.array(ids))
recognizer.write("trainer.yml")

with open("labels.json", "w") as f:
    json.dump({str(v): k for k, v in label_to_id.items()}, f)

print("✅ Training complete. Saved trainer.yml and labels.json")
