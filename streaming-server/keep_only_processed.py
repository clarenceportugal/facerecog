#!/usr/bin/env python3
"""
Keep Only Processed Images Script
Keeps only images with _nobg suffix, deletes all others
"""

import os
from pathlib import Path

def keep_only_processed():
    """Keep only processed images (_nobg), delete all others"""
    
    # Get faces directory
    faces_dir = Path("faces")
    if not faces_dir.exists():
        print("❌ Faces directory not found!")
        return False
    
    total_deleted = 0
    total_kept = 0
    
    # Process each user folder
    for user_folder in faces_dir.iterdir():
        if not user_folder.is_dir():
            continue
            
        print(f"\n👤 Processing user: {user_folder.name}")
        
        # Find all images
        all_images = []
        for image_file in user_folder.iterdir():
            if image_file.is_file() and image_file.suffix.lower() in ['.jpg', '.jpeg', '.png']:
                all_images.append(image_file)
        
        if not all_images:
            print(f"  ✅ No images found for {user_folder.name}")
            continue
            
        print(f"  📸 Found {len(all_images)} total images")
        
        # Separate processed and unprocessed images
        processed_images = []
        unprocessed_images = []
        
        for image_file in all_images:
            if '_nobg' in image_file.stem:
                processed_images.append(image_file)
            else:
                unprocessed_images.append(image_file)
        
        print(f"  ✅ Processed images (_nobg): {len(processed_images)}")
        print(f"  🗑️ Unprocessed images: {len(unprocessed_images)}")
        
        # Delete unprocessed images
        for image_file in unprocessed_images:
            try:
                print(f"  🗑️ Deleting unprocessed: {image_file.name}")
                image_file.unlink()
                total_deleted += 1
            except Exception as e:
                print(f"    ❌ Error deleting {image_file.name}: {str(e)}")
        
        # Keep processed images
        for image_file in processed_images:
            print(f"  ✅ Keeping processed: {image_file.name}")
            total_kept += 1
    
    print(f"\n📊 Cleanup Summary:")
    print(f"  ✅ Kept processed images: {total_kept}")
    print(f"  🗑️ Deleted unprocessed images: {total_deleted}")
    print(f"  🎯 Only background-removed images remain")
    
    return total_deleted > 0

if __name__ == '__main__':
    print("🎯 Keep Only Processed Images (Background Removed)")
    print("=" * 55)
    
    success = keep_only_processed()
    
    if success:
        print("\n🎉 Cleanup complete!")
        print("Only background-removed images remain.")
    else:
        print("\n✅ All images are already processed - no cleanup needed.")





