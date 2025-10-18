# build_encodings.py
import face_recognition
import os
import pickle

FACES_DIR = "faces"
ENCODINGS_FILE = "face_encodings.pkl"

known_encodings = []
known_names = []

print("🔹 Building face encodings...")

for person_name in os.listdir(FACES_DIR):
    person_folder = os.path.join(FACES_DIR, person_name)
    if not os.path.isdir(person_folder):
        continue

    for file in os.listdir(person_folder):
        file_path = os.path.join(person_folder, file)
        image = face_recognition.load_image_file(file_path)
        encodings = face_recognition.face_encodings(image)

        if len(encodings) > 0:
            known_encodings.append(encodings[0])
            known_names.append(person_name)
            print(f"✅ Added {person_name} from {file}")

# Save encodings
with open(ENCODINGS_FILE, "wb") as f:
    pickle.dump((known_encodings, known_names), f)

print(f"✅ Encodings saved to {ENCODINGS_FILE}")
