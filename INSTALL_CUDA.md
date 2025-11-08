# Installing CUDA 12.x Toolkit for GPU Acceleration

## Current Status
✅ InsightFace is working (using CPU)
✅ ONNX Runtime GPU is installed
✅ NVIDIA GPU detected (RTX 4050)
❌ CUDA 12.x runtime libraries missing

## Solution: Install CUDA 12.x Toolkit

### Step 1: Download CUDA 12.x Toolkit

1. Go to: https://developer.nvidia.com/cuda-12-6-0-download-archive
2. Select:
   - **Operating System**: Windows
   - **Architecture**: x86_64
   - **Version**: Windows 10/11
   - **Installer Type**: exe (local)

3. Download the installer (about 3GB)

### Step 2: Install CUDA Toolkit

1. Run the downloaded installer
2. **IMPORTANT**: Choose "Custom" installation
3. **Uncheck** "Visual Studio Integration" (unless you have VS installed)
4. **Check** "CUDA Runtime" and "CUDA Libraries"
5. Click "Install"
6. Wait for installation to complete (~10-15 minutes)

### Step 3: Verify Installation

After installation, restart your computer, then test:

```powershell
py -3.13 -c "import onnxruntime as ort; sess = ort.InferenceSession('dummy.onnx', providers=['CUDAExecutionProvider']); print('CUDA working!')"
```

Or run your face recognition script again - it should use GPU instead of CPU.

---

## Alternative: Continue Using CPU

If you don't want to install CUDA toolkit (3GB download), you can continue using CPU. It will work, just slower:

- CPU: ~2-5 seconds per face recognition
- GPU: ~0.5-1 second per face recognition

The system is already working with CPU fallback - you just won't get GPU acceleration.

---

## After Installation

Once CUDA toolkit is installed:
1. Restart your computer
2. Run your batch files again
3. The errors about missing DLLs should be gone
4. Face recognition will use your RTX 4050 GPU

---

## Note

Your system is **working correctly** right now - it's just using CPU instead of GPU. The error messages are warnings, not fatal errors. The system falls back to CPU automatically.

