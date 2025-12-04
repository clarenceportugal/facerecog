#!/usr/bin/env python3
"""
Direct Image Processing Script
Processes all existing images to remove backgrounds directly using rembg
"""

import os
import sys
from pathlib import Path
from PIL import Image
import numpy as np
import cv2
from rembg import remove, new_session

def crop_to_face_area(image):
    """Crop image to focus on face area only"""
    try:
        # Convert PIL to OpenCV for face detection
        img_array = np.array(image)
        if img_array.shape[2] == 4:  # RGBA
            img_cv = cv2.cvtColor(img_array, cv2.COLOR_RGBA2BGR)
        else:  # RGB
            img_cv = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        
        # Detect face
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
        
        if len(faces) > 0:
            # Use the largest face
            largest_face = max(faces, key=lambda x: x[2] * x[3])
            x, y, w, h = largest_face
            
            # Expand face area slightly
            margin = min(w, h) // 4
            x = max(0, x - margin)
            y = max(0, y - margin)
            w = min(img_cv.shape[1] - x, w + 2 * margin)
            h = min(img_cv.shape[0] - y, h + 2 * margin)
            
            # Crop to face area
            cropped = image.crop((x, y, x + w, y + h))
            print(f"    🎯 Face detected and cropped to: {x}, {y}, {w}, {h}")
            return cropped
        else:
            # Fallback: crop to upper center area (face region)
            width, height = image.size
            crop_x = int(width * 0.2)
            crop_y = int(height * 0.1)
            crop_w = int(width * 0.6)
            crop_h = int(height * 0.6)
            cropped = image.crop((crop_x, crop_y, crop_x + crop_w, crop_y + crop_h))
            print(f"    ⚠️ No face detected, using center crop: {crop_x}, {crop_y}, {crop_w}, {crop_h}")
            return cropped
            
    except Exception as e:
        print(f"    ⚠️ Face cropping failed: {e}, using original image")
        return image

def process_image_direct(image_path, output_path):
    """Process a single image to remove background"""
    try:
        print(f"  🎭 Processing: {image_path.name}")
        
        # Read image
        with open(image_path, 'rb') as f:
            image_data = f.read()
        
        # Remove background
        processed_data = remove(
            image_data,
            session=session,
            alpha_matting=True,
            alpha_matting_foreground_threshold=200,
            alpha_matting_background_threshold=50,
            alpha_matting_erode_size=10
        )
        
        # Convert to PIL Image for face cropping
        image = Image.open(io.BytesIO(processed_data))
        
        # Crop to face area
        cropped_image = crop_to_face_area(image)
        
        # Convert to RGB and add black background
        if cropped_image.mode == 'RGBA':
            # Create black background
            black_bg = Image.new('RGB', cropped_image.size, (0, 0, 0))
            # Composite the image onto black background
            final_image = Image.composite(cropped_image, black_bg, cropped_image.split()[-1])
        else:
            final_image = cropped_image.convert('RGB')
        
        # Save processed image with black background
        final_image.save(output_path, 'JPEG', quality=100)
        
        print(f"    ✅ Processed: {image_path.name} -> {output_path.name}")
        return True
        
    except Exception as e:
        print(f"    ❌ Error processing {image_path.name}: {str(e)}")
        return False

def process_all_existing_images():
    """Process all existing images to remove backgrounds"""
    
    # Initialize rembg session
    global session
    session = new_session('u2net_human_seg', providers=['CPUExecutionProvider'])
    
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
            # Create new filename with _nobg suffix
            new_filename = f"{image_file.stem}_nobg.jpg"
            new_path = image_file.parent / new_filename
            
            # Process image
            success = process_image_direct(image_file, new_path)
            
            if success:
                # Delete original image
                image_file.unlink()
                total_processed += 1
            else:
                total_failed += 1
    
    print(f"\n📊 Processing Summary:")
    print(f"  ✅ Successfully processed: {total_processed} images")
    print(f"  ❌ Failed: {total_failed} images")
    print(f"  📁 All processed images now have _nobg suffix")
    
    return total_processed > 0

if __name__ == '__main__':
    import io
    
    print("🎭 Processing All Existing Images for Background Removal (Direct)")
    print("=" * 70)
    
    success = process_all_existing_images()
    
    if success:
        print("\n🎉 All existing images have been processed!")
        print("All saved images now have backgrounds removed.")
    else:
        print("\n⚠️ No images were processed.")
