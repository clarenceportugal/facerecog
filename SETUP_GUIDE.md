# EduVision - Complete Setup Guide for Fresh Laptop

This guide will help you install all necessary packages and dependencies to run the EduVision system on a fresh laptop.

## 📋 Prerequisites Required

### 1. **Node.js and npm** (Required for Backend & Frontend)
- **Download**: https://nodejs.org/ (LTS version recommended)
- **Verify**: Run `node --version` and `npm --version` in terminal
- **Required Version**: Node.js 16+ and npm 8+

### 2. **Python** (Required for Face Recognition & Background Removal)
- **Download**: https://www.python.org/downloads/ (Python 3.8 or higher)
- **Important**: During installation, check "Add Python to PATH"
- **Verify**: Run `python --version` in terminal
- **Required Version**: Python 3.8 or higher

### 3. **MongoDB** (Required for Database)
- **Download**: https://www.mongodb.com/try/download/community
- **Install**: MongoDB Community Server
- **Start Service**: MongoDB should run as a Windows service, or start manually with `mongod`
- **Default Connection**: `mongodb://127.0.0.1:27017/eduvision`

### 4. **FFmpeg** (Optional - for video processing)
- **Download**: https://ffmpeg.org/download.html
- **Add to PATH**: Add FFmpeg bin directory to system PATH
- **Required for**: Video processing features (if used)

---

## 🚀 Installation Steps

### Step 1: Install Node.js Dependencies

Open terminal/command prompt and run:

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Install root dependencies (if needed)
cd ..
npm install
```

### Step 2: Install Python Dependencies

**Important**: Use `python -m pip` instead of just `pip` (especially on Windows).

**⚠️ Python Version Note**: If you have Python 3.14, you may need Python 3.13 instead for full compatibility. See `PYTHON_SETUP_FIX.md` for details.

The Python services need several packages. Install them with:

```powershell
# Basic packages (these work with Python 3.14)
python -m pip install opencv-python numpy pillow watchdog requests

# Face recognition (requires Python 3.13 or build tools for Python 3.14)
python -m pip install insightface

# Background removal - NOT needed! simple_background_removal.py doesn't use rembg
# The simple_background_removal.py uses only OpenCV and PIL which are already installed

# Optional: GPU support (if you have NVIDIA GPU with CUDA)
# python -m pip install onnxruntime-gpu
```

**If you get "pip is not recognized" error:**
- Use `python -m pip` instead of `pip`
- Or use `py -m pip` if you have multiple Python versions

**If packages fail to install (Python 3.14 issue):**
- See `PYTHON_SETUP_FIX.md` for solutions
- Recommended: Install Python 3.13 for full compatibility

### Step 3: Configure MongoDB

1. **Start MongoDB**:
   - If installed as service, it should start automatically
   - Or run manually: `mongod --dbpath "C:\data\db"` (create the folder if needed)

2. **Verify MongoDB is running**:
   ```bash
   # Should show MongoDB listening on port 27017
   netstat -an | findstr :27017
   ```

### Step 4: Update Configuration Files

**Important**: The `start_system.bat` file has hardcoded paths. You need to update it:

1. Open `start_system.bat`
2. Replace all instances of `C:\Users\mark\Documents\GitHub\eduvision` with your path:
   - Your path: `C:\Users\ALLEN\Downloads\eduvision-main\eduvision`

Also check `backend/recognizer_arcface.py`:
- Line 25: Update `DATASET_DIR` path to point to your `streaming-server\faces` folder

### Step 5: Create Environment File (if needed)

Create a `.env` file in the `backend` folder if you need custom configuration:

```env
MONGO_URI=mongodb://127.0.0.1:27017/eduvision
PORT=5000
JWT_SECRET=your-secret-key-here
```

---

## ✅ Verification Checklist

Before running the system, verify:

- [ ] Node.js installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Python installed (`python --version`)
- [ ] MongoDB running (`mongod` or service running)
- [ ] Backend dependencies installed (`backend/node_modules` exists)
- [ ] Frontend dependencies installed (`frontend/node_modules` exists)
- [ ] Python packages installed (test with `python -c "import insightface; import cv2; import rembg"`)
- [ ] Paths updated in `start_system.bat`

---

## 🎯 Running the System

### Option 1: Use the Simple Launcher (Recommended)
```bash
run_all_services_simple.bat
```

This will:
- Check all prerequisites
- Install missing dependencies
- Start all services automatically

### Option 2: Manual Start

**Terminal 1 - Backend API Server:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Face Recognition Service:**
```bash
cd streaming-server
python recognizer_arcface.py
```

**Terminal 3 - Background Removal Service:**
```bash
cd streaming-server
python simple_background_removal.py
```

**Terminal 4 - Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 5 - Node.js Server (if needed):**
```bash
cd backend
node server.js
```

---

## 🔍 Troubleshooting

### Python Import Errors

If you get import errors for Python packages:
```bash
# Reinstall packages
pip install --upgrade insightface opencv-python numpy rembg pillow watchdog requests
```

### MongoDB Connection Errors

1. Check if MongoDB is running:
   ```bash
   netstat -an | findstr :27017
   ```

2. Start MongoDB manually if needed:
   ```bash
   mongod --dbpath "C:\data\db"
   ```

### Port Already in Use

If port 5000 is in use:
```bash
# Find and kill process using port 5000
netstat -ano | findstr :5000
taskkill /F /PID <PID_NUMBER>
```

### Node.js Module Errors

If you get module errors:
```bash
# Delete node_modules and reinstall
cd backend
rmdir /s /q node_modules
npm install

cd ../frontend
rmdir /s /q node_modules
npm install
```

### GPU Issues (Face Recognition)

If face recognition is slow:
- Check if GPU is available: `python backend/test_gpu.py`
- Install GPU version: `pip install onnxruntime-gpu` (requires NVIDIA GPU with CUDA)

---

## 📦 Complete Package List

### Node.js Packages (Auto-installed via npm install)
- Backend: express, mongoose, jsonwebtoken, bcryptjs, ws, multer, cloudinary, etc.
- Frontend: react, react-dom, vite, @mui/material, axios, etc.

### Python Packages (Manual install required)
- `insightface` - Face recognition
- `opencv-python` - Image/video processing
- `opencv-python-headless` - Headless OpenCV
- `numpy` - Numerical operations
- `rembg` - Background removal
- `pillow` - Image processing
- `watchdog` - File system monitoring
- `requests` - HTTP requests

---

## 🎉 Success Indicators

When everything is working:
- ✅ Backend server running on `http://localhost:5000`
- ✅ Frontend running on `http://localhost:5173` (Vite default)
- ✅ Face recognition service running (Python)
- ✅ Background removal service running on `http://localhost:8080`
- ✅ MongoDB connected and database created
- ✅ No error messages in terminal windows

---

## 📝 Notes

1. **First Run**: The system will download AI models automatically on first use (may take a few minutes)
2. **GPU Support**: Optional but recommended for faster face recognition. Requires NVIDIA GPU with CUDA.
3. **Database**: MongoDB will create the database automatically on first connection
4. **Ports Used**:
   - 5000: Backend API
   - 5173: Frontend (Vite default)
   - 8080: Background Removal Service
   - 27017: MongoDB

---

## 🆘 Need Help?

If you encounter issues:
1. Check the error messages in the terminal windows
2. Verify all prerequisites are installed
3. Ensure all paths are correct in configuration files
4. Check that ports are not in use by other applications

