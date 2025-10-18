#!/usr/bin/env python3
"""
Process All Existing Images Script
Scans all user face folders and removes backgrounds from images that don't have _nobg suffix
"""

import os
import sys
import json
import base64
import requests
from pathlib import Path
import time

def process_all_existing_images():
    """Process all existing images to remove backgrounds"""
    
    # Check if background removal service is running
    try:
        response = requests.get('http://localhost:8080/health', timeout=5)
        if response.status_code != 200:
            print("❌ Background removal service is not running!")
            print("Please start it with: python background_removal_service.py --port 8080")
            return False
    except requests.exceptions.RequestException:
        print("❌ Cannot connect to background removal service!")
        print("Please start it with: python background_removal_service.py --port 8080")
        return False
    
    print("✅ Background removal service is running")
    
    # Get faces directory
    faces_dir = Path("faces")
    if not faces_dir.exists():
        print("❌ Faces directory not found!")
        return False
    
    total_processed = 0
    total_failed = 0
    
    # Process each user folder
    for user_folder in faces_dir.iterdir():
        if not user_folder.is_dir():
            continue
            
        print(f"\n👤 Processing user: {user_folder.name}")
        
        # Find all images that don't have _nobg suffix
        images_to_process = []
        for image_file in user_folder.iterdir():
            if image_file.is_file() and image_file.suffix.lower() in ['.jpg', '.jpeg', '.png']:
                if '_nobg' not in image_file.stem:
                    images_to_process.append(image_file)
        
        if not images_to_process:
            print(f"  ✅ All images already processed for {user_folder.name}")
            continue
            
        print(f"  📸 Found {len(images_to_process)} images to process")
        
        # Process each image
        for image_file in images_to_process:
            try:
                print(f"  🎭 Processing: {image_file.name}")
                
                # Read image
                with open(image_file, 'rb') as f:
                    image_data = f.read()
                
                # Convert to base64
                image_b64 = base64.b64encode(image_data).decode('utf-8')
                
                # Send to background removal service
                response = requests.post(
                    'http://localhost:8080/remove-background',
                    json={'image_data': image_b64},
                    timeout=30
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get('success'):
                        # Create new filename with _nobg suffix
                        new_filename = f"{image_file.stem}_nobg{image_file.suffix}"
                        new_path = image_file.parent / new_filename
                        
                        # Save processed image
                        processed_b64 = result['processed_image_data'].split(',')[1]
                        processed_data = base64.b64decode(processed_b64)
                        
                        with open(new_path, 'wb') as f:
                            f.write(processed_data)
                        
                        # Delete original image
                        image_file.unlink()
                        
                        print(f"    ✅ Processed: {image_file.name} -> {new_filename}")
                        total_processed += 1
                    else:
                        print(f"    ❌ Background removal failed: {result.get('message', 'Unknown error')}")
                        total_failed += 1
                else:
                    print(f"    ❌ HTTP error: {response.status_code}")
                    total_failed += 1
                    
            except Exception as e:
                print(f"    ❌ Error processing {image_file.name}: {str(e)}")
                total_failed += 1
    
    print(f"\n📊 Processing Summary:")
    print(f"  ✅ Successfully processed: {total_processed} images")
    print(f"  ❌ Failed: {total_failed} images")
    print(f"  📁 All processed images now have _nobg suffix")
    
    return total_processed > 0

if __name__ == '__main__':
    print("🎭 Processing All Existing Images for Background Removal")
    print("=" * 60)
    
    success = process_all_existing_images()
    
    if success:
        print("\n🎉 All existing images have been processed!")
        print("All saved images now have backgrounds removed.")
    else:
        print("\n⚠️ No images were processed or service is not available.")
