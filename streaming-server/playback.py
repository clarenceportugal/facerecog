import cv2
from datetime import datetime

video_file = "recordings/output_2025-09-23_14-00-00.mp4"
seek_time = "2025-09-23 14:32:10"  # from detections.csv

# Convert timestamp to seconds offset
video_start = datetime.strptime("2025-09-23 14:00:00", "%Y-%m-%d %H:%M:%S")
event_time = datetime.strptime(seek_time, "%Y-%m-%d %H:%M:%S")
offset_seconds = (event_time - video_start).total_seconds()

cap = cv2.VideoCapture(video_file)
cap.set(cv2.CAP_PROP_POS_MSEC, offset_seconds * 1000)

while True:
    ret, frame = cap.read()
    if not ret:
        break
    cv2.imshow("Playback", frame)
    if cv2.waitKey(25) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()
