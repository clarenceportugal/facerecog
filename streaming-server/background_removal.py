#!/usr/bin/env python3
"""
Background Removal Utility for Face Registration
Removes background from face images using rembg library
"""

import os
import sys
import argparse
from pathlib import Path
from PIL import Image
import numpy as np
from rembg import remove, new_session

def remove_background_from_image(input_path, output_path=None, model_name='u2net'):
    """
    Remove background from an image and save the result
    
    Args:
        input_path (str): Path to input image
        output_path (str, optional): Path to save output image. If None, adds '_nobg' suffix
        model_name (str): Model to use for background removal ('u2net', 'u2net_human_seg', 'u2netp', 'silueta')
    
    Returns:
        str: Path to the output image
    """
    try:
        # Validate input file
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input file not found: {input_path}")
        
        # Generate output path if not provided
        if output_path is None:
            input_file = Path(input_path)
            output_path = input_file.parent / f"{input_file.stem}_nobg{input_file.suffix}"
        
        print(f"🔄 Processing: {input_path}")
        print(f"📤 Output: {output_path}")
        print(f"🤖 Model: {model_name}")
        
        # Create rembg session with specified model
        session = new_session(model_name)
        
        # Read input image
        with open(input_path, 'rb') as input_file:
            input_data = input_file.read()
        
        # Remove background
        print("🎭 Removing background...")
        output_data = remove(input_data, session=session)
        
        # Save output image
        with open(output_path, 'wb') as output_file:
            output_file.write(output_data)
        
        # Get file sizes for comparison
        input_size = os.path.getsize(input_path)
        output_size = os.path.getsize(output_path)
        
        print(f"✅ Background removal completed!")
        print(f"📊 Input size: {input_size:,} bytes")
        print(f"📊 Output size: {output_size:,} bytes")
        print(f"📊 Size change: {((output_size - input_size) / input_size * 100):+.1f}%")
        
        return str(output_path)
        
    except Exception as e:
        print(f"❌ Error processing {input_path}: {str(e)}")
        return None

def remove_background_from_folder(input_folder, output_folder=None, model_name='u2net', file_extensions=None):
    """
    Remove background from all images in a folder
    
    Args:
        input_folder (str): Path to input folder
        output_folder (str, optional): Path to output folder. If None, creates 'nobg' subfolder
        model_name (str): Model to use for background removal
        file_extensions (list): List of file extensions to process (default: ['.jpg', '.jpeg', '.png'])
    
    Returns:
        list: List of processed file paths
    """
    if file_extensions is None:
        file_extensions = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG']
    
    input_path = Path(input_folder)
    if not input_path.exists():
        raise FileNotFoundError(f"Input folder not found: {input_folder}")
    
    # Create output folder
    if output_folder is None:
        output_path = input_path / 'nobg'
    else:
        output_path = Path(output_folder)
    
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Find all image files
    image_files = []
    for ext in file_extensions:
        image_files.extend(input_path.glob(f'*{ext}'))
    
    if not image_files:
        print(f"⚠️ No image files found in {input_folder}")
        return []
    
    print(f"📁 Found {len(image_files)} image files to process")
    print(f"📁 Input folder: {input_folder}")
    print(f"📁 Output folder: {output_folder}")
    
    processed_files = []
    failed_files = []
    
    for i, image_file in enumerate(image_files, 1):
        print(f"\n📸 Processing {i}/{len(image_files)}: {image_file.name}")
        
        output_file = output_path / f"{image_file.stem}_nobg{image_file.suffix}"
        result = remove_background_from_image(str(image_file), str(output_file), model_name)
        
        if result:
            processed_files.append(result)
        else:
            failed_files.append(str(image_file))
    
    print(f"\n📊 Processing Summary:")
    print(f"✅ Successfully processed: {len(processed_files)} files")
    print(f"❌ Failed: {len(failed_files)} files")
    
    if failed_files:
        print(f"❌ Failed files:")
        for failed_file in failed_files:
            print(f"   - {failed_file}")
    
    return processed_files

def process_user_face_images(user_folder, model_name='u2net_human_seg'):
    """
    Process face images for a specific user with background removal
    
    Args:
        user_folder (str): Path to user's face images folder
        model_name (str): Model to use (u2net_human_seg is best for people)
    
    Returns:
        dict: Processing results
    """
    user_path = Path(user_folder)
    if not user_path.exists():
        raise FileNotFoundError(f"User folder not found: {user_folder}")
    
    print(f"👤 Processing face images for user: {user_path.name}")
    print(f"📁 Folder: {user_folder}")
    print(f"🤖 Model: {model_name}")
    
    # Find all image files in the user folder
    image_extensions = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG']
    image_files = []
    for ext in image_extensions:
        image_files.extend(user_path.glob(f'*{ext}'))
    
    if not image_files:
        print(f"⚠️ No image files found in user folder")
        return {'processed': [], 'failed': [], 'total': 0}
    
    print(f"📸 Found {len(image_files)} face images to process")
    
    processed_files = []
    failed_files = []
    
    for i, image_file in enumerate(image_files, 1):
        print(f"\n📸 Processing {i}/{len(image_files)}: {image_file.name}")
        
        # Create output filename with _nobg suffix
        output_file = user_path / f"{image_file.stem}_nobg{image_file.suffix}"
        
        # Skip if already processed
        if output_file.exists():
            print(f"⏭️ Already processed: {output_file.name}")
            processed_files.append(str(output_file))
            continue
        
        result = remove_background_from_image(str(image_file), str(output_file), model_name)
        
        if result:
            processed_files.append(result)
        else:
            failed_files.append(str(image_file))
    
    print(f"\n📊 User Processing Summary:")
    print(f"✅ Successfully processed: {len(processed_files)} files")
    print(f"❌ Failed: {len(failed_files)} files")
    print(f"📁 User folder: {user_folder}")
    
    return {
        'processed': processed_files,
        'failed': failed_files,
        'total': len(image_files)
    }

def main():
    """Command line interface for background removal"""
    parser = argparse.ArgumentParser(description='Remove background from images using rembg')
    parser.add_argument('input', help='Input image file or folder path')
    parser.add_argument('-o', '--output', help='Output path (file or folder)')
    parser.add_argument('-m', '--model', default='u2net_human_seg', 
                       choices=['u2net', 'u2net_human_seg', 'u2netp', 'silueta'],
                       help='Model to use for background removal')
    parser.add_argument('--user-folder', action='store_true',
                       help='Process as user face images folder')
    
    args = parser.parse_args()
    
    input_path = Path(args.input)
    
    if not input_path.exists():
        print(f"❌ Input path does not exist: {args.input}")
        sys.exit(1)
    
    try:
        if args.user_folder:
            # Process as user folder
            result = process_user_face_images(args.input, args.model)
            if result['failed']:
                sys.exit(1)
        elif input_path.is_file():
            # Process single file
            result = remove_background_from_image(args.input, args.output, args.model)
            if not result:
                sys.exit(1)
        elif input_path.is_dir():
            # Process folder
            result = remove_background_from_folder(args.input, args.output, args.model)
            if not result:
                sys.exit(1)
        else:
            print(f"❌ Invalid input path: {args.input}")
            sys.exit(1)
        
        print(f"\n🎉 Background removal completed successfully!")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    main()
