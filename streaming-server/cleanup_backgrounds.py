#!/usr/bin/env python3
"""
Cleanup script to remove all images with backgrounds
Only keeps images that have been processed with background removal
"""

import os
import sys
from pathlib import Path

def cleanup_user_folder(user_folder):
    """Remove all images that don't have _nobg suffix"""
    
    user_path = Path(user_folder)
    if not user_path.exists():
        print(f"❌ User folder not found: {user_folder}")
        return
    
    print(f"🧹 Cleaning up user folder: {user_path.name}")
    
    # Find all image files
    image_extensions = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG']
    all_images = []
    for ext in image_extensions:
        all_images.extend(user_path.glob(f'*{ext}'))
    
    if not all_images:
        print(f"⚠️ No images found in {user_folder}")
        return
    
    print(f"📸 Found {len(all_images)} total images")
    
    # Separate original and processed images
    original_images = []
    processed_images = []
    
    for img in all_images:
        if '_nobg' in img.name:
            processed_images.append(img)
        else:
            original_images.append(img)
    
    print(f"📊 Original images (with background): {len(original_images)}")
    print(f"📊 Processed images (no background): {len(processed_images)}")
    
    # Delete original images (keep only background-removed ones)
    deleted_count = 0
    for img in original_images:
        try:
            img.unlink()
            print(f"🗑️ Deleted: {img.name}")
            deleted_count += 1
        except Exception as e:
            print(f"❌ Failed to delete {img.name}: {e}")
    
    print(f"\n✅ Cleanup completed!")
    print(f"🗑️ Deleted {deleted_count} images with backgrounds")
    print(f"💾 Kept {len(processed_images)} images without backgrounds")
    
    return deleted_count, len(processed_images)

def cleanup_all_users():
    """Clean up all user folders"""
    
    faces_dir = Path("faces")
    if not faces_dir.exists():
        print("❌ Faces directory not found")
        return
    
    print("🧹 Cleaning up ALL user folders...")
    print("=" * 50)
    
    total_deleted = 0
    total_kept = 0
    processed_users = 0
    
    for user_folder in faces_dir.iterdir():
        if user_folder.is_dir() and user_folder.name != 'temp':
            print(f"\n👤 Processing user: {user_folder.name}")
            deleted, kept = cleanup_user_folder(user_folder)
            total_deleted += deleted
            total_kept += kept
            processed_users += 1
    
    print(f"\n🎉 GLOBAL CLEANUP COMPLETED!")
    print(f"👥 Processed {processed_users} users")
    print(f"🗑️ Total deleted: {total_deleted} images with backgrounds")
    print(f"💾 Total kept: {total_kept} images without backgrounds")
    print(f"✨ All saved images now have NO BACKGROUND!")

def main():
    """Main cleanup function"""
    
    if len(sys.argv) > 1:
        # Clean specific user folder
        user_folder = sys.argv[1]
        cleanup_user_folder(user_folder)
    else:
        # Clean all user folders
        cleanup_all_users()

if __name__ == '__main__':
    main()
