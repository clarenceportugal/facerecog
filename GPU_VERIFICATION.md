# ✅ GPU Verification Guide

## 🎯 How GPU Usage is Verified

### 1. **Initial GPU Detection**
- Checks for `CUDAExecutionProvider` in ONNX Runtime
- Queries GPU info via `nvidia-smi`
- Sets `ctx_id = 0` if GPU available (forces GPU usage)

### 2. **Model Loading Verification**
- **SCRFD Detection Model**: 
  - Loaded with `ctx_id=0` (GPU) or `ctx_id=-1` (CPU)
  - Verifies `CUDAExecutionProvider` in model session
  - Prints: `✅✅✅ VERIFIED: SCRFD is using CUDAExecutionProvider (GPU) ✅✅✅`

- **ArcFaceONNX Recognition Model**:
  - Loaded with `ctx_id=0` (GPU) or `ctx_id=-1` (CPU)
  - Verifies `CUDAExecutionProvider` in model session
  - Prints: `✅✅✅ VERIFIED: Recognition model is using CUDAExecutionProvider (GPU) ✅✅✅`

### 3. **Runtime Verification**
- Performs dummy inference test
- Monitors GPU memory usage via `nvidia-smi`
- Checks GPU utilization percentage
- Prints: `✅✅✅ GPU IS BEING USED! ✅✅✅`

## 🔍 What to Look For in Logs

When the system starts, you should see:

```
[INFO] ⚡ CUDA GPU provider available - enabling GPU acceleration! ⚡
[INFO] ✅ GPU Detected: NVIDIA GeForce RTX 3050 Ti Laptop GPU, 4096 MiB
[INFO] ✅ SCRFD Detection model loaded with GPU (ctx_id=0) - MAXIMUM PERFORMANCE!
[INFO] ✅✅✅ VERIFIED: SCRFD is using CUDAExecutionProvider (GPU) ✅✅✅
[INFO] ✅ Recognition model loaded with GPU (ctx_id=0) - MAXIMUM PERFORMANCE!
[INFO] ✅✅✅ VERIFIED: Recognition model is using CUDAExecutionProvider (GPU) ✅✅✅
[INFO] ✅ GPU test inference completed successfully
[INFO] ✅ GPU Status: X% utilization, YMB memory used
[INFO] ✅✅✅ GPU IS BEING USED! ✅✅✅
```

## ⚠️ Troubleshooting

### If GPU is NOT being used:

1. **Check USE_GPU environment variable:**
   ```bash
   echo $USE_GPU  # Should be "true"
   ```

2. **Check CUDA availability:**
   ```bash
   python3 -c "import onnxruntime as ort; print(ort.get_available_providers())"
   # Should include 'CUDAExecutionProvider'
   ```

3. **Check NVIDIA drivers:**
   ```bash
   nvidia-smi  # Should show your RTX 3050 Ti
   ```

4. **Check ONNX Runtime GPU support:**
   ```bash
   pip list | grep onnxruntime
   # Should have onnxruntime-gpu installed, not just onnxruntime
   ```

## 🚀 Performance Indicators

When GPU is working correctly:
- GPU utilization > 0% during inference
- GPU memory usage > 50MB
- Detection speed: ~30-60 FPS
- Recognition speed: ~100-200 faces/second

## ✅ Current Configuration

- **Detection Model**: SCRFD (ONNX) with `ctx_id=0` (GPU)
- **Recognition Model**: ArcFaceONNX with `ctx_id=0` (GPU)
- **Detection Size**: 640x640 (optimized for RTX 3050 Ti 4GB)
- **GPU Memory Limit**: 3.5GB (safe for RTX 3050 Ti 4GB)
- **Tunable Ops**: Enabled for maximum performance
