#!/usr/bin/env python3
"""
Enhanced Background Removal Utility for Face Registration
Removes background from face images and integrates with face recognition system
"""

import os
import sys
import argparse
from pathlib import Path
from PIL import Image
import numpy as np
from rembg import remove, new_session
import shutil
from datetime import datetime

# Default faces directory (matching your face recognition script)
DEFAULT_FACES_DIR = Path(r"C:\Users\mark\Documents\GitHub\eduvision\streaming-server\faces")

def remove_background_from_image(input_path, output_path=None, model_name='u2net'):
    """
    Remove background from an image and save the result
    
    Args:
        input_path (str): Path to input image
        output_path (str, optional): Path to save output image. If None, adds '_nobg' suffix
        model_name (str): Model to use for background removal
    
    Returns:
        str: Path to the output image
    """
    try:
        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input file not found: {input_path}")
        
        if output_path is None:
            input_file = Path(input_path)
            output_path = input_file.parent / f"{input_file.stem}_nobg{input_file.suffix}"
        
        print(f"🔄 Processing: {input_path}")
        print(f"📤 Output: {output_path}")
        print(f"🤖 Model: {model_name}")
        
        session = new_session(model_name)
        
        with open(input_path, 'rb') as input_file:
            input_data = input_file.read()
        
        print("🎭 Removing background...")
        output_data = remove(input_data, session=session)
        
        with open(output_path, 'wb') as output_file:
            output_file.write(output_data)
        
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

def add_face_to_recognition_db(image_path, person_name, faces_dir=None, remove_bg=True, 
                                model_name='u2net_human_seg', keep_original=False):
    """
    Add a face image to the recognition database with optional background removal
    
    Args:
        image_path (str): Path to the face image
        person_name (str): Name of the person (will create/use folder with this name)
        faces_dir (str): Path to faces directory (default: DEFAULT_FACES_DIR)
        remove_bg (bool): Whether to remove background before saving
        model_name (str): Model for background removal
        keep_original (bool): Keep original image alongside processed one
    
    Returns:
        dict: Results including saved file paths
    """
    if faces_dir is None:
        faces_dir = DEFAULT_FACES_DIR
    else:
        faces_dir = Path(faces_dir)
    
    if not faces_dir.exists():
        print(f"⚠️ Faces directory doesn't exist, creating: {faces_dir}")
        faces_dir.mkdir(parents=True, exist_ok=True)
    
    # Create person folder if it doesn't exist
    person_folder = faces_dir / person_name
    person_folder.mkdir(parents=True, exist_ok=True)
    
    image_path = Path(image_path)
    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")
    
    print(f"\n{'='*60}")
    print(f"👤 Adding face for: {person_name}")
    print(f"📁 Person folder: {person_folder}")
    print(f"📸 Source image: {image_path}")
    print(f"{'='*60}\n")
    
    results = {
        'person': person_name,
        'person_folder': str(person_folder),
        'original_image': None,
        'processed_image': None,
        'success': False
    }
    
    # Generate unique filename based on timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_filename = f"{person_name}_{timestamp}"
    file_extension = image_path.suffix
    
    try:
        if remove_bg:
            # Remove background and save
            temp_output = person_folder / f"{base_filename}_temp{file_extension}"
            processed_path = remove_background_from_image(
                str(image_path), 
                str(temp_output), 
                model_name
            )
            
            if processed_path:
                final_path = person_folder / f"{base_filename}{file_extension}"
                shutil.move(processed_path, final_path)
                results['processed_image'] = str(final_path)
                print(f"✅ Saved processed image: {final_path}")
                
                # Optionally keep original
                if keep_original:
                    original_path = person_folder / f"{base_filename}_original{file_extension}"
                    shutil.copy2(image_path, original_path)
                    results['original_image'] = str(original_path)
                    print(f"📋 Saved original image: {original_path}")
                
                results['success'] = True
            else:
                raise Exception("Background removal failed")
        else:
            # Just copy the image
            final_path = person_folder / f"{base_filename}{file_extension}"
            shutil.copy2(image_path, final_path)
            results['processed_image'] = str(final_path)
            print(f"✅ Saved image: {final_path}")
            results['success'] = True
        
        # Count total images for this person
        total_images = len(list(person_folder.glob("*.*")))
        results['total_images'] = total_images
        
        print(f"\n🎉 Success! {person_name} now has {total_images} face image(s)")
        print(f"📁 Folder: {person_folder}")
        print(f"🔄 Face recognition will auto-reload the database")
        
        return results
        
    except Exception as e:
        print(f"❌ Error adding face: {str(e)}")
        results['error'] = str(e)
        return results

def batch_add_faces_from_folder(folder_path, person_name, faces_dir=None, 
                                remove_bg=True, model_name='u2net_human_seg'):
    """
    Add multiple face images from a folder to the recognition database
    
    Args:
        folder_path (str): Path to folder containing face images
        person_name (str): Name of the person
        faces_dir (str): Path to faces directory
        remove_bg (bool): Whether to remove background
        model_name (str): Model for background removal
    
    Returns:
        dict: Batch processing results
    """
    folder_path = Path(folder_path)
    if not folder_path.exists():
        raise FileNotFoundError(f"Folder not found: {folder_path}")
    
    image_extensions = {'.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG'}
    image_files = [f for f in folder_path.iterdir() 
                   if f.is_file() and f.suffix in image_extensions]
    
    if not image_files:
        print(f"⚠️ No image files found in {folder_path}")
        return {'processed': 0, 'failed': 0, 'total': 0}
    
    print(f"\n{'='*60}")
    print(f"📁 Batch processing: {len(image_files)} images")
    print(f"👤 Person: {person_name}")
    print(f"{'='*60}\n")
    
    processed = []
    failed = []
    
    for i, image_file in enumerate(image_files, 1):
        print(f"\n[{i}/{len(image_files)}] Processing: {image_file.name}")
        print("-" * 60)
        
        result = add_face_to_recognition_db(
            str(image_file),
            person_name,
            faces_dir,
            remove_bg,
            model_name,
            keep_original=False
        )
        
        if result['success']:
            processed.append(result)
        else:
            failed.append({'file': str(image_file), 'error': result.get('error', 'Unknown')})
    
    print(f"\n{'='*60}")
    print(f"📊 Batch Processing Summary")
    print(f"{'='*60}")
    print(f"✅ Successfully processed: {len(processed)}/{len(image_files)}")
    print(f"❌ Failed: {len(failed)}/{len(image_files)}")
    
    if failed:
        print(f"\n❌ Failed files:")
        for item in failed:
            print(f"   - {item['file']}: {item['error']}")
    
    return {
        'processed': len(processed),
        'failed': len(failed),
        'total': len(image_files),
        'results': processed,
        'errors': failed
    }

def remove_background_from_folder(input_folder, output_folder=None, model_name='u2net', 
                                 file_extensions=None):
    """
    Remove background from all images in a folder
    """
    if file_extensions is None:
        file_extensions = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG']
    
    input_path = Path(input_folder)
    if not input_path.exists():
        raise FileNotFoundError(f"Input folder not found: {input_folder}")
    
    if output_folder is None:
        output_path = input_path / 'nobg'
    else:
        output_path = Path(output_folder)
    
    output_path.mkdir(parents=True, exist_ok=True)
    
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
    
    return processed_files

def main():
    """Command line interface"""
    parser = argparse.ArgumentParser(
        description='Remove background and add faces to recognition database',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Add single face with background removal
  python script.py add-face photo.jpg "John Doe"
  
  # Add face without background removal
  python script.py add-face photo.jpg "Jane Smith" --no-remove-bg
  
  # Batch add faces from folder
  python script.py batch-add ./photos "John Doe"
  
  # Just remove background (legacy mode)
  python script.py remove-bg input.jpg -o output.jpg
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Command to execute')
    
    # Add face command
    add_parser = subparsers.add_parser('add-face', help='Add a face to recognition database')
    add_parser.add_argument('image', help='Path to face image')
    add_parser.add_argument('name', help='Person name')
    add_parser.add_argument('--faces-dir', help='Faces directory path')
    add_parser.add_argument('--no-remove-bg', action='store_true', help='Skip background removal')
    add_parser.add_argument('--keep-original', action='store_true', help='Keep original image')
    add_parser.add_argument('-m', '--model', default='u2net_human_seg',
                           choices=['u2net', 'u2net_human_seg', 'u2netp', 'silueta'],
                           help='Model for background removal')
    
    # Batch add faces command
    batch_parser = subparsers.add_parser('batch-add', help='Add multiple faces from folder')
    batch_parser.add_argument('folder', help='Folder containing face images')
    batch_parser.add_argument('name', help='Person name')
    batch_parser.add_argument('--faces-dir', help='Faces directory path')
    batch_parser.add_argument('--no-remove-bg', action='store_true', help='Skip background removal')
    batch_parser.add_argument('-m', '--model', default='u2net_human_seg',
                            choices=['u2net', 'u2net_human_seg', 'u2netp', 'silueta'],
                            help='Model for background removal')
    
    # Remove background command (legacy)
    bg_parser = subparsers.add_parser('remove-bg', help='Remove background from image(s)')
    bg_parser.add_argument('input', help='Input image or folder')
    bg_parser.add_argument('-o', '--output', help='Output path')
    bg_parser.add_argument('-m', '--model', default='u2net',
                          choices=['u2net', 'u2net_human_seg', 'u2netp', 'silueta'],
                          help='Model for background removal')
    bg_parser.add_argument('--folder', action='store_true', help='Process entire folder')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    try:
        if args.command == 'add-face':
            result = add_face_to_recognition_db(
                args.image,
                args.name,
                faces_dir=args.faces_dir,
                remove_bg=not args.no_remove_bg,
                model_name=args.model,
                keep_original=args.keep_original
            )
            
            if not result['success']:
                sys.exit(1)
                
        elif args.command == 'batch-add':
            result = batch_add_faces_from_folder(
                args.folder,
                args.name,
                faces_dir=args.faces_dir,
                remove_bg=not args.no_remove_bg,
                model_name=args.model
            )
            
            if result['failed'] > 0:
                sys.exit(1)
                
        elif args.command == 'remove-bg':
            if args.folder or Path(args.input).is_dir():
                results = remove_background_from_folder(args.input, args.output, args.model)
                if not results:
                    sys.exit(1)
            else:
                result = remove_background_from_image(args.input, args.output, args.model)
                if not result:
                    sys.exit(1)
        
        print(f"\n🎉 Operation completed successfully!")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()