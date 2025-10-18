import cv2
import os
from pymongo import MongoClient

# Connect to MongoDB
client = MongoClient("mongodb+srv://saynoseanniel:mathematics10@cluster0.crfzw.mongodb.net/eduvision?retryWrites=true&w=majority")
db = client["eduvision"]
users_collection = db["users"]

# Get username from input
username = input("Enter username: ")

# Find user in MongoDB
user = users_collection.find_one({"username": username})

if not user:
    print("User not found!")
    exit()

# Use the user's MongoDB _id as directory name
user_id = str(user["_id"])
role = user.get("role", "unknown")

# Directory name based on role and user ID
person_dir = f"streaming-server/dataset/{user_id}"

# Create directory if it doesn't exist
os.makedirs(person_dir, exist_ok=True)

# Start video capture and face detection
cap = cv2.VideoCapture(0)
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

count = 0
while count < 20:
    ret, frame = cap.read()
    if not ret:
        break

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5)

    for (x, y, w, h) in faces:
        face_img = gray[y:y+h, x:x+w]
        img_path = os.path.join(person_dir, f"{count}.jpg")
        cv2.imwrite(img_path, face_img)
        count += 1
        print(f"Saved: {img_path}")

    cv2.imshow("Capturing Faces", frame)
    if cv2.waitKey(1) & 0xFF == ord('q') or count >= 20:
        break

cap.release()
cv2.destroyAllWindows()
print(f"Face data collection complete. {count} images saved in {person_dir}.")
