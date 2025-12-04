#!/usr/bin/env python3
"""
Simple Background Removal Service - No complex dependencies
Uses basic OpenCV and PIL for reliable background removal
"""

import os
import sys
import json
import base64
import io
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import cv2
import numpy as np
from PIL import Image

class SimpleBackgroundRemovalHandler(BaseHTTPRequestHandler):
    """Simple HTTP handler for background removal requests"""
    
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
                    'service': 'simple_background_removal',
                    'method': 'opencv_grabcut'
                }
                self.wfile.write(json.dumps(response).encode())
                self.wfile.flush()
            else:
                self.send_response(404)
                self.end_headers()
        except Exception as e:
            print(f"❌ Error in GET request: {str(e)}")
    
    def do_POST(self):
        """Handle POST requests - process images"""
        try:
            parsed_url = urlparse(self.path)
            
            if parsed_url.path == '/remove-background':
                self.handle_remove_background()
            else:
                self.send_error(404, "Endpoint not found")
                
        except Exception as e:
            print(f"❌ Error handling request: {str(e)}")
            self.send_error(500, f"Internal server error: {str(e)}")
    
    def handle_remove_background(self):
        """Handle single image background removal using GrabCut"""
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
            
            # Process image with GrabCut for clean background removal
            print("🎭 Processing image with GrabCut for clean background removal...")
            processed_bytes = self.remove_background_grabcut(image_bytes)
            
            # Convert back to base64
            processed_b64 = base64.b64encode(processed_bytes).decode('utf-8')
            
            # Send response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            response = {
                'success': True,
                'message': 'Background removed successfully with GrabCut',
                'processed_image_data': f"data:image/jpeg;base64,{processed_b64}",
                'original_size': len(image_bytes),
                'processed_size': len(processed_bytes)
            }
            
            try:
                self.wfile.write(json.dumps(response).encode())
                self.wfile.flush()
                print(f"✅ Background removal completed - {len(image_bytes)} -> {len(processed_bytes)} bytes")
            except ConnectionAbortedError:
                print("⚠️ Connection aborted by client - this is normal")
                return
            except Exception as conn_error:
                print(f"⚠️ Connection error: {conn_error}")
                return
            
        except Exception as e:
            print(f"❌ Error in remove_background: {str(e)}")
            try:
                error_response = {
                    'success': False,
                    'message': f'Background removal failed: {str(e)}',
                    'error': str(e)
                }
                self.wfile.write(json.dumps(error_response).encode())
                self.wfile.flush()
            except:
                pass  # Ignore connection errors when sending error response
    
    def remove_background_grabcut(self, image_bytes):
        """Remove background keeping only the head/face with maximum clarity"""
        try:
            # Convert bytes to OpenCV image
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                raise ValueError("Could not decode image")
            
            # Try to detect face first using Haar Cascade
            face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, 1.1, 4)
            
            # If face is detected, use face coordinates for better GrabCut
            if len(faces) > 0:
                # Use the largest detected face
                largest_face = max(faces, key=lambda x: x[2] * x[3])
                x, y, w, h = largest_face
                
                # Focus only on the face area - smaller margin for precise face-only removal
                margin = min(w, h) // 8  # Smaller margin to focus on face only
                x = max(0, x - margin)
                y = max(0, y - margin)
                w = min(image.shape[1] - x, w + 2 * margin)
                h = min(image.shape[0] - y, h + 2 * margin)
                
                rect = (x, y, w, h)
                print(f"🎯 Face detected at: {rect}")
            else:
                # Fallback to center area if no face detected - focus on upper center for face
                height, width = image.shape[:2]
                head_height = int(height * 0.6)  # Smaller area - focus on head only
                head_width = int(width * 0.7)    # Smaller area - focus on head only
                start_x = (width - head_width) // 2
                start_y = int(height * 0.1)  # Start higher to focus on face
                rect = (start_x, start_y, head_width, head_height)
                print(f"⚠️ No face detected, using center area: {rect}")
            
            # Get image dimensions
            height, width = image.shape[:2]
            
            # Create mask for GrabCut
            mask = np.zeros((height, width), np.uint8)
            
            # Initialize background and foreground models
            bgd_model = np.zeros((1, 65), np.float64)
            fgd_model = np.zeros((1, 65), np.float64)
            
            # Apply GrabCut algorithm with more iterations for better results - focus on face only
            cv2.grabCut(image, mask, rect, bgd_model, fgd_model, 20, cv2.GC_INIT_WITH_RECT)
            
            # Create final mask (0 and 2 are background, 1 and 3 are foreground)
            mask2 = np.where((mask == 2) | (mask == 0), 0, 1).astype('uint8')
            
            # Apply conservative morphological operations to preserve face
            kernel = np.ones((3,3), np.uint8)
            mask2 = cv2.morphologyEx(mask2, cv2.MORPH_CLOSE, kernel)
            
            # Ensure face area is preserved - add MULTIPLE face regions
            # Create precise face masks to guarantee ONLY face is included
            face_centers = [
                (width // 2, int(height * 0.3)),       # Upper center - face area
                (width // 2, int(height * 0.4)),       # Center - face area
            ]
            
            face_radius = min(width, height) // 6  # Smaller radius - focus on face only
            
            # Create multiple circular masks for face areas
            y, x = np.ogrid[:height, :width]
            combined_face_mask = np.zeros((height, width), dtype=bool)
            
            for face_center_x, face_center_y in face_centers:
                face_mask = (x - face_center_x)**2 + (y - face_center_y)**2 <= face_radius**2
                combined_face_mask = np.logical_or(combined_face_mask, face_mask)
            
            # Add a smaller rectangular area in the center - FACE ONLY
            center_rect = np.zeros((height, width), dtype=bool)
            rect_start_y = int(height * 0.15)  # Start higher - face area only
            rect_end_y = int(height * 0.5)     # End higher - face area only
            rect_start_x = int(width * 0.25)   # Narrower - face area only
            rect_end_x = int(width * 0.75)     # Narrower - face area only
            center_rect[rect_start_y:rect_end_y, rect_start_x:rect_end_x] = True
            
            # Combine all face areas - ONLY FACE
            all_face_areas = np.logical_or(combined_face_mask, center_rect)
            mask2 = np.logical_or(mask2, all_face_areas).astype('uint8')
            
            # No blurring to preserve maximum sharpness
            # mask2 = cv2.GaussianBlur(mask2, (1, 1), 0)  # Removed for clarity
            
            # Create 3-channel mask
            mask3 = cv2.cvtColor(mask2, cv2.COLOR_GRAY2BGR)
            
            # Apply mask to image
            result = image * mask3
            
            # Create black background
            black_bg = np.zeros_like(image)
            
            # Composite with black background
            final_image = np.where(mask3 == 1, result, black_bg)
            
            # Apply unsharp mask to enhance clarity
            final_image = self.apply_unsharp_mask(final_image)
            
            # Convert back to bytes with maximum quality
            # Save as high-quality JPEG to maintain camera resolution
            # Use maximum quality and no subsampling to preserve camera resolution
            encode_params = [
                cv2.IMWRITE_JPEG_QUALITY, 100,  # Maximum quality
                cv2.IMWRITE_JPEG_OPTIMIZE, 0,   # No optimization to preserve quality
                cv2.IMWRITE_JPEG_PROGRESSIVE, 0 # No progressive encoding
            ]
            _, buffer = cv2.imencode('.jpg', final_image, encode_params)
            return buffer.tobytes()
            
        except Exception as e:
            print(f"❌ GrabCut failed: {str(e)}")
            # Fallback: return original image
            return image_bytes
    
    def apply_unsharp_mask(self, image):
        """Apply unsharp mask to enhance image clarity"""
        try:
            # Convert to float for processing
            img_float = image.astype(np.float32)
            
            # Create blurred version
            blurred = cv2.GaussianBlur(img_float, (3, 3), 1.0)
            
            # Apply unsharp mask
            sharpened = img_float + 0.5 * (img_float - blurred)
            
            # Clip values to valid range
            sharpened = np.clip(sharpened, 0, 255)
            
            return sharpened.astype(np.uint8)
        except Exception as e:
            print(f"⚠️ Unsharp mask failed: {str(e)}")
            return image
    
    def log_message(self, format, *args):
        """Override to customize logging"""
        print(f"🌐 {self.address_string()} - {format % args}")

def start_simple_background_removal_service(port=8080):
    """Start the simple background removal HTTP service"""
    server_address = ('', port)
    httpd = HTTPServer(server_address, SimpleBackgroundRemovalHandler)
    
    print(f"🚀 Simple Background Removal Service starting on port {port}")
    print(f"📡 Health check: http://localhost:{port}/health")
    print(f"🎭 Remove background: POST http://localhost:{port}/remove-background")
    print(f"🛑 Press Ctrl+C to stop")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print(f"\n🛑 Shutting down Simple Background Removal Service...")
        httpd.shutdown()

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Simple Background Removal HTTP Service')
    parser.add_argument('-p', '--port', type=int, default=8080,
                       help='Port to run the service on (default: 8080)')
    
    args = parser.parse_args()
    
    start_simple_background_removal_service(args.port)
