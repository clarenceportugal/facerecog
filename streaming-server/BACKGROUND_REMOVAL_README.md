# Background Removal for Face Registration

This feature automatically removes backgrounds from face images during the registration process, ensuring that only the user's face remains for better face recognition accuracy.

## 🎯 Features

- **Automatic Background Removal**: Removes backgrounds from face images during registration
- **Real-time Processing**: Processes images as they are captured
- **Fallback Support**: Uses original images if background removal fails
- **User Feedback**: Shows processing statistics in the UI
- **Batch Processing**: Can process existing user folders

## 🛠️ Components

### 1. Python Background Removal Service
- **File**: `background_removal_service.py`
- **Port**: 8080
- **Models**: Uses `u2net_human_seg` model (optimized for people)

### 2. Background Removal Utility
- **File**: `background_removal.py`
- **Purpose**: Command-line tool for batch processing

### 3. Node.js Integration
- **File**: `backend/src/utils/backgroundRemoval.ts`
- **Purpose**: Handles communication between Node.js backend and Python service

### 4. Frontend Integration
- **File**: `frontend/src/components/FaceRegistrationModal.tsx`
- **Purpose**: Shows background removal statistics to users

## 🚀 Setup Instructions

### 1. Install Python Dependencies

```bash
cd streaming-server
pip install rembg pillow opencv-python
```

### 2. Start the Background Removal Service

**Option A: Using the batch file (Windows)**
```bash
start_background_removal_service.bat
```

**Option B: Using Python directly**
```bash
python background_removal_service.py --port 8080
```

### 3. Verify Service is Running

```bash
python test_background_removal.py
```

## 📋 Usage

### Automatic Background Removal

When users register their faces through the program chair interface:

1. **Capture**: User captures face images as usual
2. **Process**: Each image is automatically processed for background removal
3. **Save**: Processed images (with backgrounds removed) are saved
4. **Fallback**: If processing fails, original images are used
5. **Feedback**: User sees statistics about background removal

### Manual Processing

**Process a single image:**
```bash
python background_removal.py path/to/image.jpg
```

**Process a user folder:**
```bash
python background_removal.py path/to/user/folder --user-folder
```

**Process with specific model:**
```bash
python background_removal.py path/to/image.jpg -m u2net_human_seg
```

### API Endpoints

**Health Check:**
```bash
GET http://localhost:8080/health
```

**Remove Background:**
```bash
POST http://localhost:8080/remove-background
Content-Type: application/json

{
  "image_data": "base64_encoded_image_data"
}
```

**Process User Folder:**
```bash
POST http://localhost:8080/process-user-folder
Content-Type: application/json

{
  "user_folder": "/path/to/user/folder"
}
```

## 🔧 Configuration

### Available Models

- `u2net_human_seg` (default) - Best for people/faces
- `u2net` - General purpose
- `u2netp` - Lighter version
- `silueta` - Alternative model

### Service Configuration

Edit `background_removal_service.py` to change:
- Port number (default: 8080)
- Model selection
- Timeout settings

## 📊 File Structure

```
streaming-server/
├── background_removal_service.py    # HTTP service
├── background_removal.py            # CLI utility
├── test_background_removal.py       # Test script
├── start_background_removal_service.bat  # Windows startup
└── BACKGROUND_REMOVAL_README.md     # This file

backend/src/utils/
└── backgroundRemoval.ts             # Node.js integration

frontend/src/components/
└── FaceRegistrationModal.tsx        # UI integration
```

## 🎭 How It Works

1. **Image Capture**: User captures face images through the web interface
2. **Upload**: Images are uploaded to the Node.js backend
3. **Processing**: Backend sends images to Python service for background removal
4. **AI Processing**: Python service uses rembg library with u2net_human_seg model
5. **Save**: Processed images (with transparent backgrounds) are saved
6. **Database**: User record is updated with processed image paths
7. **UI Feedback**: User sees processing statistics

## 🔍 Troubleshooting

### Service Not Starting

1. **Check Python installation:**
   ```bash
   python --version
   pip list | grep rembg
   ```

2. **Check port availability:**
   ```bash
   netstat -an | findstr :8080
   ```

3. **Check logs:**
   ```bash
   python background_removal_service.py --port 8080
   ```

### Background Removal Failing

1. **Check service health:**
   ```bash
   curl http://localhost:8080/health
   ```

2. **Test with sample image:**
   ```bash
   python test_background_removal.py
   ```

3. **Check image format:**
   - Supported: JPG, JPEG, PNG
   - Minimum size: 64x64 pixels
   - Maximum size: 10MB

### Performance Issues

1. **Reduce image size** before processing
2. **Use lighter model** (u2netp instead of u2net_human_seg)
3. **Increase timeout** in backend configuration
4. **Process images in smaller batches**

## 📈 Performance

- **Processing time**: 1-3 seconds per image
- **Memory usage**: ~500MB for service
- **Model size**: ~200MB (downloaded on first use)
- **Supported formats**: JPG, JPEG, PNG
- **Output format**: PNG with transparency

## 🔒 Security Notes

- Service runs on localhost only
- No external network access required
- Images are processed locally
- No data is sent to external services

## 🚀 Future Enhancements

- [ ] GPU acceleration support
- [ ] Batch processing optimization
- [ ] Multiple model support
- [ ] Real-time preview
- [ ] Custom model training
- [ ] WebSocket integration for real-time updates

## 📞 Support

If you encounter issues:

1. Check the service logs
2. Run the test script
3. Verify all dependencies are installed
4. Check port availability
5. Review the troubleshooting section

## 🎉 Success Indicators

When working correctly, you should see:

- ✅ Service starts without errors
- ✅ Health check returns 200 OK
- ✅ Background removal processes images successfully
- ✅ UI shows background removal statistics
- ✅ Processed images have transparent backgrounds
- ✅ Face recognition accuracy improves
