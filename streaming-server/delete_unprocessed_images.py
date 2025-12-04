#!/usr/bin/env python3
"""
Delete Unprocessed Images Script
Deletes all images that don't have _nobg suffix (images with backgrounds)
"""

import os
from pathlib import Path

def delete_unprocessed_images():
    """Delete all images that don't have _nobg suffix"""
    
    # Get faces directory
    faces_dir = Path("faces")
    if not faces_dir.exists():
        print("❌ Faces directory not found!")
        return False
    
    total_deleted = 0
    
    # Process each user folder
    for user_folder in faces_dir.iterdir():
        if not user_folder.is_dir():
            continue
            
        print(f"\n👤 Processing user: {user_folder.name}")
        
        # Find all images that don't have _nobg suffix
        images_to_delete = []
        for image_file in user_folder.iterdir():
            if image_file.is_file() and image_file.suffix.lower() in ['.jpg', '.jpeg', '.png']:
                if '_nobg' not in image_file.stem:
                    images_to_delete.append(image_file)
        
        if not images_to_delete:
            print(f"  ✅ All images are already processed for {user_folder.name}")
            continue
            
        print(f"  🗑️ Found {len(images_to_delete)} images with backgrounds to delete")
        
        # Delete each image
        for image_file in images_to_delete:
            try:
                print(f"  🗑️ Deleting: {image_file.name}")
                image_file.unlink()
                total_deleted += 1
                print(f"    ✅ Deleted: {image_file.name}")
            except Exception as e:
                print(f"    ❌ Error deleting {image_file.name}: {str(e)}")
    
    print(f"\n📊 Deletion Summary:")
    print(f"  🗑️ Successfully deleted: {total_deleted} images with backgrounds")
    print(f"  ✅ Only background-removed images remain")
    
    return total_deleted > 0

if __name__ == '__main__':
    print("🗑️ Deleting All Images with Backgrounds")
    print("=" * 50)
    
    success = delete_unprocessed_images()
    
    if success:
        print("\n🎉 All images with backgrounds have been deleted!")
        print("Only clean, background-removed images remain.")
    else:
        print("\n✅ No images with backgrounds found - all images are already processed.")
