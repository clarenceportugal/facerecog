import cloudinary
import cloudinary.api
import requests
import os

# Configure your Cloudinary credentials
cloudinary.config(
    cloud_name="deqtxoewp",
    api_key="429458566368881",
    api_secret="1NPDJVTgxydH8VCOD7w-NLhFVdc"
)

# Save location
download_path = r"C:\Users\mark\Desktop\CloudinaryBackup"
os.makedirs(download_path, exist_ok=True)

def download_eduvision_folder():
    prefix = "eduvision/"   # 👈 Note the trailing slash
    next_cursor = None

    while True:
        response = cloudinary.api.resources(
            type="upload",
            prefix=prefix,   # Filter only eduvision/*
            max_results=100,
            next_cursor=next_cursor
        )

        if not response["resources"]:
            print("No files found in eduvision/")
            break

        for res in response['resources']:
            url = res['secure_url']
            public_id = res['public_id']  # e.g. eduvision/facedata/admin/myphoto

            # Preserve folder structure locally
            relative_path = public_id.replace(prefix, "").lstrip("/")
            save_dir = os.path.join(download_path, os.path.dirname(relative_path))
            os.makedirs(save_dir, exist_ok=True)

            filename = os.path.join(save_dir, os.path.basename(url))
            print(f"Downloading {url} → {filename}")

            r = requests.get(url)
            with open(filename, 'wb') as f:
                f.write(r.content)

        next_cursor = response.get("next_cursor")
        if not next_cursor:
            break

download_eduvision_folder()