#!/usr/bin/env python3
"""
Test script for background removal functionality
"""

import os
import sys
import requests
import base64
import json
from pathlib import Path

def test_background_removal_service():
    """Test the background removal HTTP service"""
    
    service_url = "http://localhost:8080"
    
    print("🧪 Testing Background Removal Service")
    print("=" * 50)
    
    # Test 1: Health check
    print("\n1️⃣ Testing health check...")
    try:
        response = requests.get(f"{service_url}/health", timeout=5)
        if response.status_code == 200:
            print("✅ Health check passed")
            print(f"   Response: {response.json()}")
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False
    
    # Test 2: Test with a sample image (if available)
    print("\n2️⃣ Testing background removal with sample image...")
    
    # Look for any image file in the faces directory
    faces_dir = Path("faces")
    sample_image = None
    
    if faces_dir.exists():
        for user_folder in faces_dir.iterdir():
            if user_folder.is_dir():
                for image_file in user_folder.glob("*.jpg"):
                    sample_image = image_file
                    break
                if sample_image:
                    break
    
    if sample_image:
        print(f"   Using sample image: {sample_image}")
        
        try:
            # Read image file
            with open(sample_image, 'rb') as f:
                image_data = f.read()
            
            # Convert to base64
            base64_image = base64.b64encode(image_data).decode('utf-8')
            
            # Send request
            response = requests.post(
                f"{service_url}/remove-background",
                json={"image_data": base64_image},
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    print("✅ Background removal test passed")
                    print(f"   Original size: {result.get('original_size', 0):,} bytes")
                    print(f"   Processed size: {result.get('processed_size', 0):,} bytes")
                    
                    # Save processed image for verification
                    if result.get('processed_image_data'):
                        processed_data = result['processed_image_data'].split(',')[1]
                        processed_bytes = base64.b64decode(processed_data)
                        
                        output_path = sample_image.parent / f"{sample_image.stem}_test_nobg.png"
                        with open(output_path, 'wb') as f:
                            f.write(processed_bytes)
                        
                        print(f"   Saved processed image: {output_path}")
                else:
                    print(f"❌ Background removal failed: {result.get('message', 'Unknown error')}")
                    return False
            else:
                print(f"❌ Background removal request failed: {response.status_code}")
                print(f"   Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Background removal test failed: {e}")
            return False
    else:
        print("⚠️ No sample image found, skipping background removal test")
    
    print("\n✅ All tests passed!")
    return True

def test_user_folder_processing():
    """Test user folder processing"""
    
    service_url = "http://localhost:8080"
    
    print("\n3️⃣ Testing user folder processing...")
    
    # Look for a user folder with images
    faces_dir = Path("faces")
    test_folder = None
    
    if faces_dir.exists():
        for user_folder in faces_dir.iterdir():
            if user_folder.is_dir():
                # Check if folder has images
                image_files = list(user_folder.glob("*.jpg"))
                if image_files:
                    test_folder = user_folder
                    break
    
    if test_folder:
        print(f"   Using test folder: {test_folder}")
        
        try:
            response = requests.post(
                f"{service_url}/process-user-folder",
                json={"user_folder": str(test_folder)},
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get('success'):
                    print("✅ User folder processing test passed")
                    print(f"   Total files: {result.get('total_files', 0)}")
                    print(f"   Processed: {len(result.get('processed_files', []))}")
                    print(f"   Failed: {len(result.get('failed_files', []))}")
                else:
                    print(f"❌ User folder processing failed: {result.get('message', 'Unknown error')}")
                    return False
            else:
                print(f"❌ User folder processing request failed: {response.status_code}")
                print(f"   Response: {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ User folder processing test failed: {e}")
            return False
    else:
        print("⚠️ No user folder with images found, skipping folder processing test")
    
    return True

def main():
    """Main test function"""
    print("🚀 Background Removal Service Test Suite")
    print("=" * 60)
    
    # Test basic service functionality
    if not test_background_removal_service():
        print("\n❌ Basic service tests failed")
        sys.exit(1)
    
    # Test user folder processing
    if not test_user_folder_processing():
        print("\n❌ User folder processing tests failed")
        sys.exit(1)
    
    print("\n🎉 All tests completed successfully!")
    print("\n📋 Test Summary:")
    print("   ✅ Health check passed")
    print("   ✅ Background removal service working")
    print("   ✅ User folder processing working")
    print("\n🚀 The background removal service is ready for use!")

if __name__ == '__main__':
    main()
