from flask import Flask, request
import requests, os

app = Flask(__name__)
os.makedirs("downloads", exist_ok=True)

@app.route("/cloudinary_webhook", methods=["POST"])
def cloudinary_webhook():
    data = request.json
    if "secure_url" in data:
        url = data["secure_url"]
        filename = os.path.join("downloads", os.path.basename(url))
        print(f"New upload detected → {filename}")
        r = requests.get(url)
        with open(filename, 'wb') as f:
            f.write(r.content)
    return "OK", 200

if __name__ == "__main__":
    app.run(port=5000)
