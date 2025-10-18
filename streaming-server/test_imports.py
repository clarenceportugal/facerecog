#!/usr/bin/env python3
"""Test script to check imports"""

try:
    import rembg
    print("✅ rembg imported successfully")
except ImportError as e:
    print(f"❌ rembg import failed: {e}")

try:
    import cv2
    print("✅ cv2 imported successfully")
except ImportError as e:
    print(f"❌ cv2 import failed: {e}")

try:
    from PIL import Image
    print("✅ PIL imported successfully")
except ImportError as e:
    print(f"❌ PIL import failed: {e}")

try:
    import numpy as np
    print("✅ numpy imported successfully")
except ImportError as e:
    print(f"❌ numpy import failed: {e}")

print("Import test completed")
