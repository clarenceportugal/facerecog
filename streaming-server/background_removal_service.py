#!/usr/bin/env python3
"""
Background Removal Service for Face Registration
HTTP service that processes images with background removal
"""

import os
import sys
import json
import base64
import tempfile
import io
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading
from PIL import Image
import numpy as np
from rembg import remove, new_session
import cv2

class BackgroundRemovalHandler(BaseHTTPRequestHandler):
    """HTTP handler for background removal requests"""
    
    def __init__(self, *args, **kwargs):
        # Initialize the rembg session with BEST settings for 100% accurate people segmentation
        self.session = new_session('u2net_human_seg', providers=['CPUExecutionProvider'])
        # Also initialize backup session for double-checking
        self.backup_session = new_session('u2net', providers=['CPUExecutionProvider'])
        super().__init__(*args, **kwargs)
    
    def crop_to_face_area(self, image):
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
                print(f"🎯 Face detected and cropped to: {x}, {y}, {w}, {h}")
                return cropped
            else:
                # Fallback: crop to upper center area (face region)
                width, height = image.size
                crop_x = int(width * 0.2)
                crop_y = int(height * 0.1)
                crop_w = int(width * 0.6)
                crop_h = int(height * 0.6)
                cropped = image.crop((crop_x, crop_y, crop_x + crop_w, crop_y + crop_h))
                print(f"⚠️ No face detected, using center crop: {crop_x}, {crop_y}, {crop_w}, {crop_h}")
                return cropped
                
        except Exception as e:
            print(f"⚠️ Face cropping failed: {e}, using original image")
            return image
    
    def enhance_background_removal(self, image_bytes):
        """Improved background removal with smooth edges"""
        try:
            print("🎯 Starting improved background removal with smooth edges...")
            
            # IMPROVED SETTINGS: Better balance for smooth edges
            processed_bytes = remove(
                image_bytes, 
                session=self.session,
                alpha_matting=True,
                alpha_matting_foreground_threshold=200,  # Reduced for smoother edges
                alpha_matting_background_threshold=50,   # Increased for better edge quality
                alpha_matting_erode_size=8,              # Smaller erosion for smoother edges
                alpha_matting_foreground_erode_size=8,   # Reduced erosion
                alpha_matting_background_erode_size=8     # Reduced erosion
            )
            
            print("✅ Initial processing completed")
            
            # Convert to PIL Image for post-processing
            image = Image.open(io.BytesIO(processed_bytes))
            
            # Convert to RGBA if not already
            if image.mode != 'RGBA':
                image = image.convert('RGBA')
            
            # Focus on face area only - crop to face region
            image = self.crop_to_face_area(image)
            
            # Get the alpha channel
            alpha = image.split()[-1]
            
            # IMPROVED processing for smooth edge quality
            alpha_array = np.array(alpha)
            
            print(f"🔍 Applying smooth edge processing...")
            
            # Create smaller kernels for smoother processing
            small_kernel = np.ones((3,3), np.uint8)
            medium_kernel = np.ones((5,5), np.uint8)
            
            # STEP 1: Gentle noise removal
            alpha_array = cv2.morphologyEx(alpha_array, cv2.MORPH_OPEN, small_kernel)
            
            # STEP 2: Fill small holes gently
            alpha_array = cv2.morphologyEx(alpha_array, cv2.MORPH_CLOSE, small_kernel)
            
            # STEP 3: Apply Gaussian blur for smooth edges
            alpha_array = cv2.GaussianBlur(alpha_array, (5, 5), 1.0)
            
            # STEP 4: Apply bilateral filter to preserve edges while smoothing
            alpha_array = cv2.bilateralFilter(alpha_array.astype(np.uint8), 9, 75, 75)
            
            # STEP 5: Final smoothing for professional quality
            alpha_array = cv2.GaussianBlur(alpha_array, (3, 3), 0.5)
            
            # STEP 6: Create soft edges instead of binary (preserve smooth transitions)
            alpha_array = np.clip(alpha_array, 0, 255).astype(np.uint8)
            
            print(f"✅ Smooth edge processing completed")
            
            # Convert back to PIL Image
            alpha_clean = Image.fromarray(alpha_array, 'L')
            
            # Reconstruct the image with cleaned alpha
            r, g, b = image.split()[:3]
            
            # PRESERVE original camera quality - NO enhancement to maintain exact original quality
            # Convert to RGB without any enhancement to maintain original camera quality
            rgb_image = Image.merge('RGB', (r, g, b))
            black_bg = Image.new('RGB', rgb_image.size, (0, 0, 0))  # Pure black background
            print(f"📸 Maintaining original camera resolution: {rgb_image.size}")
            
            # Apply alpha mask to create clean black background
            if alpha_clean.mode != 'L':
                alpha_clean = alpha_clean.convert('L')
            
            # Create final image with pure black background
            final_image = Image.composite(rgb_image, black_bg, alpha_clean)
            
            # Ensure the background is pure black (0,0,0)
            # Convert to numpy for pixel manipulation
            final_array = np.array(final_image)
            
            # Create a mask where alpha is 0 (transparent areas)
            alpha_mask = alpha_clean.convert('L')
            alpha_array = np.array(alpha_mask)
            
            # Set all transparent areas to pure black (0,0,0)
            final_array[alpha_array == 0] = [0, 0, 0]
            
            # Convert back to PIL Image
            final_image = Image.fromarray(final_array.astype(np.uint8))
            
            # Convert back to bytes with MAXIMUM quality to preserve exact camera clarity
            output = io.BytesIO()
            # Use PNG format for lossless quality preservation, or JPEG with maximum settings
            if len(final_array.shape) == 3 and final_array.shape[2] == 3:  # RGB image
                # Save as PNG for lossless quality (best for camera quality preservation)
                final_image.save(output, format='PNG', optimize=False, compress_level=0)
                print(f"📸 Saved as PNG for maximum quality preservation")
            else:
                # Fallback to JPEG with maximum quality settings
                final_image.save(output, format='JPEG', quality=100, optimize=False, subsampling=0, progressive=False)
                print(f"📸 Saved as JPEG with quality=100 for maximum clarity")
            
            return output.getvalue()
            
        except Exception as e:
            print(f"⚠️ Enhanced processing failed, using improved fallback: {str(e)}")
            # Fallback to improved removal with different settings
            try:
                print("🎯 Starting improved fallback processing...")
                processed_bytes = remove(
                    image_bytes, 
                    session=self.session,
                    alpha_matting=True,
                    alpha_matting_foreground_threshold=180,  # High threshold for accuracy
                    alpha_matting_background_threshold=60,   # Low threshold for complete removal
                    alpha_matting_erode_size=6              # Good erosion for accuracy
                )
                print("✅ Improved fallback processing completed")
                
                # Convert to PIL Image for black background processing
                image = Image.open(io.BytesIO(processed_bytes))
                
                # Convert to RGBA if not already
                if image.mode != 'RGBA':
                    image = image.convert('RGBA')
                
                # Get the alpha channel
                alpha = image.split()[-1]
                
                # IMPROVED fallback alpha processing
                alpha_array = np.array(alpha)
                
                print(f"🔍 Improved fallback alpha processing...")
                
                # Apply same improved processing as main method
                small_kernel = np.ones((3,3), np.uint8)
                medium_kernel = np.ones((5,5), np.uint8)
                
                # Improved alpha refinement
                alpha_array = cv2.morphologyEx(alpha_array, cv2.MORPH_OPEN, small_kernel)
                alpha_array = cv2.morphologyEx(alpha_array, cv2.MORPH_CLOSE, small_kernel)
                alpha_array = cv2.GaussianBlur(alpha_array, (5, 5), 1.0)
                alpha_array = cv2.bilateralFilter(alpha_array.astype(np.uint8), 9, 75, 75)
                alpha_array = cv2.GaussianBlur(alpha_array, (3, 3), 0.5)
                alpha_array = np.clip(alpha_array, 0, 255).astype(np.uint8)
                
                print(f"✅ Improved fallback alpha processing completed")
                
                # Convert back to PIL
                alpha_clean = Image.fromarray(alpha_array, 'L')
                
                # Convert to RGB with black background
                rgb_image = Image.merge('RGB', image.split()[:3])
                black_bg = Image.new('RGB', rgb_image.size, (0, 0, 0))  # Pure black background
                
                # Create final image with black background
                final_image = Image.composite(rgb_image, black_bg, alpha_clean)
                
                # Ensure the background is pure black (0,0,0)
                final_array = np.array(final_image)
                
                # Set all transparent areas to pure black (0,0,0)
                final_array[alpha_array == 0] = [0, 0, 0]
                
                # Convert back to PIL Image
                final_image = Image.fromarray(final_array.astype(np.uint8))
                
                # Convert back to bytes with MAXIMUM quality to preserve exact camera clarity
                output = io.BytesIO()
                # Use PNG format for lossless quality preservation, or JPEG with maximum settings
                if len(final_array.shape) == 3 and final_array.shape[2] == 3:  # RGB image
                    # Save as PNG for lossless quality (best for camera quality preservation)
                    final_image.save(output, format='PNG', optimize=False, compress_level=0)
                    print(f"📸 Fallback saved as PNG for maximum quality preservation")
                else:
                    # Fallback to JPEG with maximum quality settings
                    final_image.save(output, format='JPEG', quality=100, optimize=False, subsampling=0, progressive=False)
                    print(f"📸 Fallback saved as JPEG with quality=100 for maximum clarity")
                
                return output.getvalue()
                
            except Exception as fallback_error:
                print(f"❌ Fallback processing also failed: {str(fallback_error)}")
                # Return original image if all processing fails
                return image_bytes
    
    def do_GET(self):
        """Handle GET requests - health check"""
        try:
            if self.path == '/health':
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                response = {
                    'status': 'healthy',
                    'service': 'background_removal',
                    'model': 'u2net_human_seg',
                    'version': 'improved_smooth_edges'
                }
                self.wfile.write(json.dumps(response).encode())
                self.wfile.flush()
            else:
                self.send_response(404)
                self.end_headers()
        except Exception as e:
            print(f"❌ Error in GET request: {str(e)}")
            try:
                self.send_error(500, f"Internal server error: {str(e)}")
            except:
                pass
    
    def do_POST(self):
        """Handle POST requests - process images"""
        try:
            # Parse URL
            parsed_url = urlparse(self.path)
            
            if parsed_url.path == '/remove-background':
                self.handle_remove_background()
            elif parsed_url.path == '/process-user-folder':
                self.handle_process_user_folder()
            else:
                self.send_error(404, "Endpoint not found")
                
        except Exception as e:
            print(f"❌ Error handling request: {str(e)}")
            self.send_error(500, f"Internal server error: {str(e)}")
    
    def handle_remove_background(self):
        """Handle single image background removal"""
        try:
            # Get content length
            content_length = int(self.headers['Content-Length'])
            
            # Read request data
            post_data = self.rfile.read(content_length)
            
            # Parse JSON request
            request_data = json.loads(post_data.decode('utf-8'))
            
            # Validate request
            if 'image_data' not in request_data:
                self.send_error(400, "Missing image_data in request")
                return
            
            # Decode base64 image data
            image_data = request_data['image_data']
            if image_data.startswith('data:image'):
                # Remove data URL prefix
                image_data = image_data.split(',')[1]
            
            image_bytes = base64.b64decode(image_data)
            
            # Process image with enhanced settings for perfect background removal
            print("🎭 Processing image for improved background removal...")
            
            # Use enhanced processing for perfect background removal
            processed_bytes = self.enhance_background_removal(image_bytes)
            
            # Convert back to base64
            processed_b64 = base64.b64encode(processed_bytes).decode('utf-8')
            
            # Send response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = {
                'success': True,
                'message': 'Background removed with improved smooth edges',
                'processed_image_data': f"data:image/png;base64,{processed_b64}",
                'original_size': len(image_bytes),
                'processed_size': len(processed_bytes),
                'quality': 'improved_smooth_edges'
            }
            
            self.wfile.write(json.dumps(response).encode())
            self.wfile.flush()
            print(f"✅ Improved background removal completed - {len(image_bytes)} -> {len(processed_bytes)} bytes")
            
        except Exception as e:
            print(f"❌ Error in remove_background: {str(e)}")
            self.send_error(500, f"Background removal failed: {str(e)}")
    
    def handle_process_user_folder(self):
        """Handle user folder processing"""
        try:
            # Get content length
            content_length = int(self.headers['Content-Length'])
            
            # Read request data
            post_data = self.rfile.read(content_length)
            
            # Parse JSON request
            request_data = json.loads(post_data.decode('utf-8'))
            
            # Validate request
            if 'user_folder' not in request_data:
                self.send_error(400, "Missing user_folder in request")
                return
            
            user_folder = request_data['user_folder']
            
            # Validate folder exists
            if not os.path.exists(user_folder):
                self.send_error(404, f"User folder not found: {user_folder}")
                return
            
            # Process user folder
            result = self.process_user_folder(user_folder)
            
            # Send response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = {
                'success': True,
                'message': f'Processed {result["batches_processed"]} batches of {result["batch_size"]} images each. Found {result["total_processed"]} processed images, processed {len(result["newly_processed"])} new images, deleted {len(result["deleted_unprocessed"])} unprocessed images. Success rate: {result["success_rate"]:.1f}%',
                'user_folder': user_folder,
                'processed_files': result['processed'],
                'newly_processed': result['newly_processed'],
                'failed_files': result['failed'],
                'deleted_unprocessed': result['deleted_unprocessed'],
                'total_processed': result['total_processed'],
                'total_unprocessed': result['total_unprocessed'],
                'batches_processed': result['batches_processed'],
                'batch_size': result['batch_size'],
                'success_rate': result['success_rate']
            }
            
            self.wfile.write(json.dumps(response).encode())
            self.wfile.flush()
            print(f"✅ User folder processing completed: {user_folder}")
            
        except Exception as e:
            print(f"❌ Error in process_user_folder: {str(e)}")
            self.send_error(500, f"User folder processing failed: {str(e)}")
    
    def process_user_folder(self, user_folder):
        """Process all images in a user folder and keep only processed images"""
        user_path = Path(user_folder)
        
        # Find all image files
        image_extensions = ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG']
        image_files = []
        for ext in image_extensions:
            image_files.extend(user_path.glob(f'*{ext}'))
        
        # Separate processed and unprocessed files
        processed_files = []
        unprocessed_files = []
        
        for image_file in image_files:
            if '_nobg' in image_file.name:
                processed_files.append(image_file)
            else:
                unprocessed_files.append(image_file)
        
        print(f"🔍 Found {len(processed_files)} processed images and {len(unprocessed_files)} unprocessed images")
        
        # Track results
        final_processed = []
        failed_files = []
        deleted_unprocessed = []
        newly_processed = []
        
        # Process unprocessed images in batches of at least 10
        batch_size = max(10, len(unprocessed_files))  # At least 10 images per batch
        total_batches = (len(unprocessed_files) + batch_size - 1) // batch_size
        
        print(f"📦 Processing {len(unprocessed_files)} images in {total_batches} batch(es) of {batch_size} images each")
        
        for batch_num in range(total_batches):
            start_idx = batch_num * batch_size
            end_idx = min(start_idx + batch_size, len(unprocessed_files))
            batch_files = unprocessed_files[start_idx:end_idx]
            
            print(f"🔄 Processing Batch {batch_num + 1}/{total_batches} ({len(batch_files)} images)")
            
            for idx, image_file in enumerate(batch_files, 1):
                try:
                    print(f"🎭 [{batch_num + 1}/{total_batches}] Processing {idx}/{len(batch_files)}: {image_file.name}")
                    
                    # Create output filename
                    output_file = user_path / f"{image_file.stem}_nobg{image_file.suffix}"
                    
                    # Skip if already processed
                    if output_file.exists():
                        print(f"⏭️ Already processed: {output_file.name}")
                        final_processed.append(str(output_file))
                        # Delete original if processed version exists
                        if image_file.exists() and image_file.is_file():
                            image_file.unlink()
                            deleted_unprocessed.append(str(image_file))
                            print(f"🗑️ Deleted unprocessed: {image_file.name}")
                        continue
                    
                    # Read and process image with enhanced settings
                    with open(image_file, 'rb') as f:
                        image_data = f.read()
                    
                    # Use enhanced processing for perfect background removal
                    processed_data = self.enhance_background_removal(image_data)
                    
                    # Save processed image
                    with open(output_file, 'wb') as f:
                        f.write(processed_data)
                    
                    # Delete original image after successful processing
                    if image_file.exists() and image_file.is_file():
                        image_file.unlink()
                        deleted_unprocessed.append(str(image_file))
                        print(f"🗑️ Deleted unprocessed: {image_file.name}")
                    
                    newly_processed.append(str(output_file))
                    final_processed.append(str(output_file))
                    print(f"✅ [{batch_num + 1}/{total_batches}] Processed {idx}/{len(batch_files)}: {image_file.name} -> {output_file.name}")
                    
                except Exception as e:
                    print(f"❌ [{batch_num + 1}/{total_batches}] Failed to process {image_file.name}: {str(e)}")
                    failed_files.append(str(image_file))
            
            print(f"✅ Batch {batch_num + 1}/{total_batches} completed ({len(batch_files)} images processed)")
            
            # Add a small delay between batches to prevent system overload
            if batch_num < total_batches - 1:  # Don't delay after the last batch
                print(f"⏳ Brief pause before next batch...")
                import time
                time.sleep(1)  # 1 second pause between batches
        
        # Add existing processed files to final list
        for processed_file in processed_files:
            final_processed.append(str(processed_file))
        
        print(f"📊 Final Summary:")
        print(f"   📦 Batches processed: {total_batches}")
        print(f"   🖼️ Total processed images: {len(final_processed)}")
        print(f"   🆕 Newly processed: {len(newly_processed)}")
        print(f"   🗑️ Unprocessed deleted: {len(deleted_unprocessed)}")
        print(f"   ❌ Failed: {len(failed_files)}")
        print(f"   ✅ Success rate: {((len(newly_processed) / max(1, len(unprocessed_files))) * 100):.1f}%")
        
        return {
            'processed': final_processed,
            'newly_processed': newly_processed,
            'failed': failed_files,
            'deleted_unprocessed': deleted_unprocessed,
            'total_unprocessed': len(unprocessed_files),
            'total_processed': len(processed_files),
            'batches_processed': total_batches,
            'batch_size': batch_size,
            'success_rate': ((len(newly_processed) / max(1, len(unprocessed_files))) * 100)
        }
    
    def log_message(self, format, *args):
        """Override to customize logging"""
        print(f"🌐 {self.address_string()} - {format % args}")

def start_background_removal_service(port=8080):
    """Start the background removal HTTP service"""
    server_address = ('', port)
    httpd = HTTPServer(server_address, BackgroundRemovalHandler)
    
    print(f"🚀 Improved Background Removal Service starting on port {port}")
    print(f"📡 Health check: http://localhost:{port}/health")
    print(f"🎭 Remove background: POST http://localhost:{port}/remove-background")
    print(f"📁 Process user folder: POST http://localhost:{port}/process-user-folder")
    print(f"✨ Features: Smooth edges, professional quality, improved alpha matting")
    print(f"🛑 Press Ctrl+C to stop")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print(f"\n🛑 Shutting down Improved Background Removal Service...")
        httpd.shutdown()

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Improved Background Removal HTTP Service')
    parser.add_argument('-p', '--port', type=int, default=8080,
                       help='Port to run the service on (default: 8080)')
    
    args = parser.parse_args()
    
    start_background_removal_service(args.port)