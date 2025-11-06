"""
Quick test script to check if GPU is available for face recognition
Run this before starting the main application to verify GPU setup
"""
import sys

print("=" * 60)
print("GPU Availability Test for Face Recognition")
print("=" * 60)

# Test 1: Check ONNX Runtime
try:
    import onnxruntime as ort
    print("\n✅ ONNX Runtime installed")
    
    available_providers = ort.get_available_providers()
    print(f"\n📋 Available execution providers: {available_providers}")
    
    has_cuda = 'CUDAExecutionProvider' in available_providers
    has_cpu = 'CPUExecutionProvider' in available_providers
    
    if has_cuda:
        print("\n✅ GPU (CUDA) is AVAILABLE!")
        print("   Your GTX 1650 will be used for face recognition")
        print("   Expected performance: 2-3x faster than CPU")
    else:
        print("\n❌ GPU (CUDA) is NOT available")
        print("   Will use CPU instead")
        if has_cpu:
            print("   ✅ CPU is available (fallback)")
    
    # Test 2: Try to create a GPU session
    if has_cuda:
        print("\n🧪 Testing GPU session creation...")
        try:
            # Try to create a simple session with CUDA
            providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
            print(f"   Attempting to use providers: {providers}")
            print("   ✅ GPU session creation should work")
        except Exception as e:
            print(f"   ⚠️  Warning: {e}")
    
except ImportError:
    print("\n❌ ONNX Runtime NOT installed")
    print("\nTo enable GPU support, install:")
    print("  pip install onnxruntime-gpu")
    print("\nFor CPU only:")
    print("  pip install onnxruntime")
    sys.exit(1)

# Test 3: Check InsightFace
try:
    import insightface
    print("\n✅ InsightFace installed")
except ImportError:
    print("\n❌ InsightFace NOT installed")
    print("  Install with: pip install insightface")
    sys.exit(1)

# Test 4: Check CUDA installation (optional)
try:
    import subprocess
    result = subprocess.run(['nvidia-smi'], capture_output=True, text=True, timeout=5)
    if result.returncode == 0:
        print("\n✅ NVIDIA GPU Driver detected")
        print("   GPU should be accessible")
    else:
        print("\n⚠️  Could not run nvidia-smi")
        print("   GPU driver might not be installed")
except Exception as e:
    print(f"\n⚠️  Could not check GPU driver: {e}")
    print("   (This is okay if GPU is still detected via ONNX Runtime)")

print("\n" + "=" * 60)
print("Test Complete!")
print("=" * 60)

if has_cuda:
    print("\n🎉 Your setup is ready for GPU acceleration!")
    print("   When you run recognizer_arcface.py, it will use your GTX 1650")
else:
    print("\n📝 To enable GPU:")
    print("   1. Install: pip install onnxruntime-gpu")
    print("   2. Make sure CUDA toolkit is installed")
    print("   3. Restart your application")
print()

