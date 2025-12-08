// server.js - OPTIMIZED for Low Latency & High FPS

require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const path = require('path');
const readline = require('readline');
const fs = require('fs');
const mongoose = require('mongoose');
const cors = require('cors');

// ========================================
// 🔧 CAMERA CONFIGURATION - EDIT HERE
// ========================================
// MediaMTX Configuration (enabled - using MediaMTX for streaming)
// MediaMTX RTSP server port (for pulling streams)
const MEDIAMTX_RTSP_URL = process.env.MEDIAMTX_RTSP_URL || 'rtsp://localhost:8554';
// MediaMTX HTTP base URL (for HLS/WebRTC endpoints)
const MEDIAMTX_BASE_URL = process.env.MEDIAMTX_URL || 'http://localhost:8888';
const USE_MEDIAMTX = false; // Set to false to use FFmpeg directly (no MediaMTX needed)

const CAMERA_CONFIG = {
  camera1: {
    name: 'Camera 1',
    rtspUrl: 'rtsp://admin:Eduvision124@192.168.1.15:554/Streaming/Channels/101',
    mediamtxStream: 'mycamera' // MediaMTX stream name (must match the path name in mediamtx.yml)
  },
  camera2: {
    name: 'Camera 2',
    rtspUrl: 'rtsp://tapoadmin:eduvision124@192.168.8.169:554/stream1',
    mediamtxStream: 'camera2' // MediaMTX stream name (must match the path name in mediamtx.yml)
    // Note: Make sure this stream is configured in your mediamtx.yml file
  }
};

// ========================================
// 🗄️ DATABASE CONFIGURATION
// ========================================
const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/eduvision';
const STREAMING_PORT = 3000;

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Connection Error:', err));

// ========================================
// 📋 DATABASE MODELS (Temporary - adjust to your schema)
// ========================================

// User Schema (Faculty/Instructor)
const userSchema = new mongoose.Schema({
  first_name: String,
  middle_name: String,
  last_name: String,
  email: String,
  role: String,
  // Add other fields as needed
}, { timestamps: true });

// Schedule Schema - Updated to match actual MongoDB structure
const scheduleSchema = new mongoose.Schema({
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  courseCode: String,
  courseTitle: String,
  room: String,
  startTime: String, // Format: "HH:MM"
  endTime: String,   // Format: "HH:MM"
  section: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Section'
  },
  semester: String,
  schoolYear: String,
  semesterStartDate: String,
  semesterEndDate: String,
  days: {
    mon: Boolean,
    tue: Boolean,
    wed: Boolean,
    thu: Boolean,
    fri: Boolean,
    sat: Boolean,
    sun: Boolean
  }
}, { timestamps: true });

// TimeLog Schema
const timeLogSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  schedule: {
    type: Object,
    required: true
  },
  timeIn: String,
  timeout: String,
  status: String,
  remarks: String,
  detectedBy: String,
  totalMinutes: Number,
  
  // ✅ ADD THESE NEW FIELDS:
  logType: String,      // "time in", "late", or "time out"
  isLate: Boolean       // true if arrived late
}, { timestamps: true });

// Register models
const User = mongoose.model('User', userSchema);
const Schedule = mongoose.model('Schedule', scheduleSchema);
const TimeLog = mongoose.model('TimeLog', timeLogSchema);

// ========================================
// EXPRESS APP SETUP
// ========================================
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// WebSocket server with optimizations for low latency
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false,
  maxPayload: 10 * 1024 * 1024
});

// ========================================
// 🔌 API ROUTES FOR TIME LOGGING
// ========================================

// Get current schedule for an instructor
app.post('/api/auth/get-current-schedule', async (req, res) => {
  try {
    const { instructorName } = req.body;
    console.log(`[API] Checking schedule for: ${instructorName}`);
    
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    
    // Get current day as lowercase 3-letter code (mon, tue, wed, etc.)
    const daysMap = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const currentDay = daysMap[now.getDay()];
    
    console.log(`[API] Current time: ${currentTime}, Day: ${currentDay}`);

    // Parse instructor name (format: "LastName, FirstName" or "FirstName LastName")
    let firstName, lastName;
    if (instructorName.includes(',')) {
      // Format: "Smith, John"
      const parts = instructorName.split(',').map(s => s.trim());
      lastName = parts[0];
      firstName = parts[1];
    } else {
      // Format: "John Smith"
      const parts = instructorName.trim().split(' ');
      firstName = parts[0];
      lastName = parts[parts.length - 1];
    }

    console.log(`[API] Searching for: ${firstName} ${lastName}`);

    // Calculate time window (30 minutes before class start to class end)
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Find instructor first
    console.log(`[API] Searching User collection for first_name: "${firstName}", last_name: "${lastName}"`);
    
    const instructor = await User.findOne({
      first_name: { $regex: firstName, $options: 'i' },
      last_name: { $regex: lastName, $options: 'i' }
    });

    if (!instructor) {
      console.log(`[API] ❌ Instructor not found: ${instructorName}`);
      console.log(`[API] Searched for: first_name="${firstName}", last_name="${lastName}"`);
      
      // Try to find any users to help with debugging
      const allUsers = await User.find({ role: 'instructor' }).limit(5);
      console.log(`[API] Sample instructors in database:`, allUsers.map(u => `${u.first_name} ${u.last_name}`));
      
      return res.json({ 
        schedule: null,
        debug: {
          searchedFor: { firstName, lastName, originalName: instructorName },
          instructorNotFound: true
        }
      });
    }

    console.log(`[API] ✅ Found instructor: ${instructor.first_name} ${instructor.last_name} (${instructor._id})`);
    console.log(`[API] Current time: ${currentTime} (${currentMinutes} minutes), Current day: ${currentDay}`);

    // Find schedules for this instructor with the current day active
    // First try with day query, then fallback to all schedules if none found
    const dayQuery = {};
    dayQuery[`days.${currentDay}`] = true;

    let schedules = await Schedule.find({
      instructor: instructor._id,
      ...dayQuery
    }).populate('instructor').populate('section');

    console.log(`[API] Found ${schedules.length} schedules for ${currentDay} with day filter`);

    // If no schedules found, check all schedules and filter manually
    if (schedules.length === 0) {
      console.log(`[API] No schedules with day filter, checking all schedules...`);
      const allSchedules = await Schedule.find({
        instructor: instructor._id
      }).populate('instructor').populate('section');
      
      console.log(`[API] Found ${allSchedules.length} total schedules for instructor`);
      
      // Filter by day manually
      schedules = allSchedules.filter(sched => {
        const days = sched.days || {};
        // If days object is empty/null, assume it might be a daily schedule (accept it)
        // Otherwise check if current day is enabled
        const hasDay = Object.keys(days).length === 0 ? true : days[currentDay] === true;
        console.log(`[API] Schedule ${sched.courseCode} - days object:`, JSON.stringify(days), `- Has ${currentDay}:`, hasDay, `- Empty object:`, Object.keys(days).length === 0);
        return hasDay;
      });
      
      console.log(`[API] After manual day filter: ${schedules.length} schedules`);
    }

    // Filter schedules that match current time window
    let currentSchedule = null;
    for (const sched of schedules) {
      if (!sched.startTime || !sched.endTime) {
        console.log(`[API] ⚠️ Schedule ${sched.courseCode} has missing startTime or endTime`);
        continue;
      }

      const [startHour, startMin] = sched.startTime.split(':').map(Number);
      const [endHour, endMin] = sched.endTime.split(':').map(Number);
      
      if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
        console.log(`[API] ⚠️ Schedule ${sched.courseCode} has invalid time format: ${sched.startTime}-${sched.endTime}`);
        continue;
      }
      
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      const earlyArrivalMinutes = startMinutes - 30; // 30 min before class

      console.log(`[API] Checking schedule: ${sched.courseCode} (${sched.startTime}-${sched.endTime})`);
      console.log(`[API] Time window: ${earlyArrivalMinutes} to ${endMinutes}, Current: ${currentMinutes}`);
      console.log(`[API] Days object:`, JSON.stringify(sched.days || {}));

      if (currentMinutes >= earlyArrivalMinutes && currentMinutes <= endMinutes) {
        currentSchedule = sched;
        
        // Calculate if late (more than 15 minutes after start time)
        const lateThresholdMinutes = startMinutes + 15;
        const isLate = currentMinutes > lateThresholdMinutes;
        
        console.log(`[API] ✅ Found matching schedule! Late threshold: ${lateThresholdMinutes}, Is late: ${isLate}`);
        
        // Add extra fields for Python
        const scheduleObj = currentSchedule.toObject();
        scheduleObj.is_late = isLate;
        scheduleObj.start_time_obj = sched.startTime;
        scheduleObj.current_time_str = currentTime;
        
        // Ensure days object exists and is properly formatted
        if (!scheduleObj.days || Object.keys(scheduleObj.days).length === 0) {
          // If days object is missing or empty, create one with current day set
          scheduleObj.days = {
            mon: false,
            tue: false,
            wed: false,
            thu: false,
            fri: false,
            sat: false,
            sun: false
          };
          scheduleObj.days[currentDay] = true;
          console.log(`[API] ⚠️ Schedule ${sched.courseCode} had empty days object, set to current day: ${currentDay}`);
        }
        
        // Ensure days object has boolean values (not undefined)
        const days = scheduleObj.days || {};
        scheduleObj.days = {
          mon: days.mon === true,
          tue: days.tue === true,
          wed: days.wed === true,
          thu: days.thu === true,
          fri: days.fri === true,
          sat: days.sat === true,
          sun: days.sun === true
        };
        
        console.log(`[API] ✅ Returning schedule with days:`, JSON.stringify(scheduleObj.days));
        return res.json({ schedule: scheduleObj });
      }
    }

    console.log(`[API] ℹ️ No current schedule found for ${instructorName} at ${currentTime} on ${currentDay}`);
    console.log(`[API] Debug info: Current time in minutes: ${currentMinutes}, Searched ${schedules.length} schedules`);
    
    // Return debug info if no schedule found
    res.json({ 
      schedule: null,
      debug: {
        instructorName,
        currentTime,
        currentDay,
        currentMinutes,
        schedulesFound: schedules.length,
        schedulesChecked: schedules.map(s => ({
          courseCode: s.courseCode,
          startTime: s.startTime,
          endTime: s.endTime,
          days: s.days
        }))
      }
    });

  } catch (error) {
    console.error('[API] Error getting schedule:', error);
    res.status(500).json({ error: error.message });
  }
});


// Log time in
app.post('/api/auth/log-time-in', async (req, res) => {
  try {
    const { 
      instructorName, 
      scheduleId, 
      cameraId, 
      timestamp,
      logType,    // NEW: "time in" or "late"
      isLate      // NEW: boolean
    } = req.body;
    
    console.log(`[API] Logging ${logType || 'TIME IN'} for: ${instructorName} (Late: ${isLate})`);
    
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      console.log('[API] ❌ Schedule not found');
      return res.status(404).json({ message: 'Schedule not found' });
    }

    // Check if already logged in today for this schedule
    const today = new Date(timestamp);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existingLog = await TimeLog.findOne({
      'schedule._id': scheduleId,
      date: { $gte: today, $lt: tomorrow },
      timeIn: { $exists: true }
    });

    if (existingLog) {
      console.log('[API] ℹ️ Already logged in today');
      return res.json({ message: 'Already logged in today', timeLog: existingLog });
    }

    // Determine status based on isLate flag or calculate it
    const timeInDate = new Date(timestamp);
    let status = 'Present';
    let remarks = '';
    
    if (isLate !== undefined) {
      // Use the isLate flag from Python
      status = isLate ? 'Late' : 'Present';
      remarks = isLate ? `Late (arrived after grace period)` : 'On time';
    } else {
      // Fallback: Calculate from schedule time
      const todayStr = timeInDate.toISOString().split('T')[0];
      const scheduleTime = new Date(`${todayStr}T${schedule.startTime}:00`);
      const diffMinutes = (timeInDate - scheduleTime) / (1000 * 60);
      
      if (diffMinutes > 15) {
        status = 'Late';
        remarks = `Late by ${Math.floor(diffMinutes)} minutes`;
      } else if (diffMinutes < -15) {
        status = 'Early';
        remarks = `Early by ${Math.floor(Math.abs(diffMinutes))} minutes`;
      } else {
        remarks = 'On time';
      }
    }

    // Create time log with new fields
    const timeLog = new TimeLog({
      date: timeInDate,
      schedule: schedule.toObject(),
      timeIn: timeInDate.toTimeString().slice(0, 8), // HH:MM:SS
      status: status,
      remarks: remarks,
      detectedBy: cameraId || 'camera1',
      logType: logType || (isLate ? 'late' : 'time in'), // NEW field
      isLate: isLate || false // NEW field
    });

    await timeLog.save();
    
    const emoji = isLate ? '⚠️' : '✅';
    console.log(`[API] ${emoji} ${logType || 'TIME IN'} logged successfully - Status: ${status}`);
    
    res.json({ success: true, timeLog });
  } catch (error) {
    console.error('[API] Error logging time in:', error);
    res.status(500).json({ error: error.message });
  }
});

// Log time out
app.post('/api/auth/log-time-out', async (req, res) => {
  try {
    const { instructorName, scheduleId, timestamp, totalMinutes } = req.body;
    console.log(`[API] Logging TIME OUT for: ${instructorName}`);
    
    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) {
      console.log('[API] ❌ Schedule not found');
      return res.status(404).json({ message: 'Schedule not found' });
    }

    // Find today's time log
    const today = new Date(timestamp);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const timeLog = await TimeLog.findOne({
      'schedule._id': scheduleId,
      date: { $gte: today, $lt: tomorrow }
    });

    if (!timeLog) {
      console.log('[API] ❌ Time in log not found');
      return res.status(404).json({ message: 'Time in log not found' });
    }

    // Update time out
    const timeOutDate = new Date(timestamp);
    const todayStr = timeOutDate.toISOString().split('T')[0];
    const scheduleEndTime = new Date(`${todayStr}T${schedule.endTime}:00`);
    const diffMinutes = (timeOutDate - scheduleEndTime) / (1000 * 60);
    
    let remarks = timeLog.remarks || '';
    
    if (diffMinutes < -15) {
      timeLog.status = 'Left Early';
      remarks += (remarks ? ' | ' : '') + `Left ${Math.floor(Math.abs(diffMinutes))} minutes early`;
    }
    
    timeLog.timeout = timeOutDate.toTimeString().slice(0, 8);
    timeLog.remarks = remarks;
    timeLog.totalMinutes = totalMinutes;

    await timeLog.save();
    console.log(`[API] ✅ TIME OUT logged successfully - Total: ${totalMinutes} min`);
    res.json({ success: true, timeLog });
  } catch (error) {
    console.error('[API] Error logging time out:', error);
    res.status(500).json({ error: error.message });
  }
});
// ========================================
// 🐍 PYTHON FACE RECOGNITION SETUP
// ========================================

// Track if Python is ready
let pythonReady = false;
let frameQueue = [];
let latestDetections = [];
let latestEvents = [];
let latestFrameWidth = 1920;  // Default frame width (Full HD - optimized for smooth streaming)
let latestFrameHeight = 1080;  // Default frame height (Full HD - optimized for smooth streaming)

// Spawn Python recognizer worker (ArcFace)
console.log('Starting Python worker...');
console.log('[DEBUG] Server directory (__dirname):', __dirname);

const pythonScriptPath = path.join(__dirname, 'recognizer_arcface.py');
console.log('[DEBUG] Looking for Python script at:', pythonScriptPath);

if (!fs.existsSync(pythonScriptPath)) {
  console.error('[ERROR] Python script not found at:', pythonScriptPath);
  console.error('[ERROR] Please make sure recognizer_arcface.py is in the same folder as server.js');
  process.exit(1);
}

// Use Python 3.13 where packages are installed
const pythonCommand = process.platform === 'win32' ? 'py' : 'python3';
const pythonArgs = process.platform === 'win32' ? ['-3.13', pythonScriptPath] : [pythonScriptPath];

const python = spawn(pythonCommand, pythonArgs, {
  stdio: ['pipe', 'pipe', 'pipe']
});

console.log('[DEBUG] Python process spawned with PID:', python.pid);

// Handle Python stderr for logging
python.stderr.on('data', (data) => {
  const msg = data.toString().trim();
  // Log all Python stderr output for debugging
  if (msg.length > 0) {
    console.log('[Python]', msg);
  }
  
  if (msg.includes('ERROR') || msg.includes('Traceback') || msg.includes('WARNING')) {
    console.error('[Python ERROR/WARNING]', msg);
  }
  
  // Check for important status messages
  if (msg.includes('READY') || msg.includes('ArcFace model loaded') || msg.includes('Detected') || msg.includes('No faces detected')) {
    console.log('[Python Status]', msg);
  }
});

// Handle Python exit
python.on('exit', (code, signal) => {
  console.error(`❌ Python process exited with code ${code}, signal ${signal}`);
  console.error('❌ Face detection will not work until Python service is restarted!');
  console.error('❌ Make sure recognizer_arcface.py is running and can process frames.');
  pythonReady = false;
});

python.on('error', (err) => {
  console.error('Failed to start Python process:', err);
  console.error('Make sure Python is installed and in your PATH');
  console.error('Try running: python --version');
});

let clients = new Set();

// Read lines from Python stdout
const rl = readline.createInterface({ input: python.stdout });

rl.on('line', (line) => {
  line = line.trim();
  
  // Skip empty lines
  if (!line) return;
  
  // Handle READY signal
  if (line === 'READY') {
    console.log('✓ Python worker is READY');
    console.log(`[DEBUG] Python ready - will start sending frames. Queue has ${frameQueue.length} frames.`);
    pythonReady = true;
    
    if (frameQueue.length > 0) {
      console.log(`Processing ${frameQueue.length} queued frames`);
      frameQueue.forEach(item => sendFrameToPython(item.jpgBuffer, item.cameraId));
      frameQueue = [];
    }
    return;
  }
  
  // ⚡ FILTER: Skip log messages that aren't JSON (common prefixes)
  // Filter out insightface/onnxruntime debug messages and Python log messages
  if (line.startsWith('Applied providers:') ||
      line.startsWith('find model:') ||
      line.startsWith('set det-size:') ||
      line.startsWith('[SYNC]') ||
      line.startsWith('[LOCAL DB]') ||
      line.startsWith('[CACHE]') ||
      line.startsWith('[DATA SOURCE]') ||
      line.startsWith('[INFO]') ||
      line.startsWith('[DEBUG]') ||
      line.startsWith('[WARN]') ||
      line.startsWith('[ERROR]') ||
      line.startsWith('[PROFILE]') ||
      line.startsWith('[PERF]') ||
      line.startsWith('[GPU]') ||
      line.match(/^\d{4}-\d{2}-\d{2}/)) { // Date timestamps
    // These are log/debug messages, not JSON - ignore them silently
    return;
  }
  
  // Only try to parse if line looks like JSON (starts with { or [)
  if (!line.startsWith('{') && !line.startsWith('[')) {
    // Not JSON, probably a log message - ignore silently
    return;
  }
  
  try {
    const msg = JSON.parse(line);
    if (msg.faces !== undefined) {
      latestDetections = msg.faces;
      
      // Store frame resolution for accurate box scaling
      if (msg.frame_width !== undefined) {
        latestFrameWidth = msg.frame_width;
      }
      if (msg.frame_height !== undefined) {
        latestFrameHeight = msg.frame_height;
      }
      
      // Calculate time from first frame sent to first detection
      if (firstFrameSentTime && framesSentToPython === 1) {
        const timeToFirstDetection = Date.now() - firstFrameSentTime;
        console.log(`[DEBUG] ⏱️ Time from first frame sent to first detection: ${timeToFirstDetection}ms`);
        firstFrameSentTime = null; // Reset after first detection
      }
      
      // Reduced logging - only log every 30 frames or on first detection
      if (framesSentToPython % 30 === 0 || (msg.faces.length > 0 && framesSentToPython < 5)) {
        console.log(`[DEBUG] Received detection: ${msg.faces.length} face(s)`);
        if (msg.faces.length > 0) {
          const names = msg.faces.map(f => f.name).join(', ');
          console.log(`[Detection] Found ${msg.faces.length} face(s): ${names}`);
          // Only log full details on first few detections or every 100 frames
          if (framesSentToPython < 3 || framesSentToPython % 100 === 0) {
            console.log(`[DEBUG] Face details:`, JSON.stringify(msg.faces[0], null, 2));
          }
        }
      }
    }
    // Store events from Python
    if (msg.events !== undefined && msg.events.length > 0) {
      latestEvents = msg.events;
      console.log(`[DEBUG] Received ${msg.events.length} event(s):`, msg.events.map(e => e.type).join(', '));
    }
  } catch (err) {
    // Only log JSON errors for lines that actually look like JSON
    // (log messages are already filtered out above)
      console.error('Bad JSON from Python:', err.message);
      console.error('Raw line (first 200 chars):', line.substring(0, 200));
  }
});

// Helper to send frame to Python
let framesSentToPython = 0;
let framesDroppedBecauseNotReady = 0;
let framesDroppedBecauseBufferFull = 0;
let frameSkipCounter = 0;
let firstFrameSentTime = null;

// ⏱️ PROFILING: Track frame timings
let frameCaptureTimestamps = new Map(); // frameNumber -> capture timestamp
let frameToClientTimestamps = new Map(); // frameNumber -> sent to client timestamp
let totalFrameCaptureToClient = 0;
let totalFramesToClient = 0;
      // ⚡ Frame skip rate: Lower = more frames processed (faster detection)
      // RTX 3050 Ti (4GB) + 32GB RAM + 60 FPS: Process every 2nd frame (2) for smooth 60 FPS without buffer overflow
      // At 60 FPS, processing every frame (1) may cause buffer overflow, so 2 is optimal
      // CPU: Use 5 or higher to reduce load
      // Set via FRAME_SKIP_RATE environment variable
      // Default: 2 for RTX 3050 Ti at 60 FPS = process every 2nd frame (30 FPS detection rate, smooth stream)
      const FRAME_SKIP_RATE = parseInt(process.env.FRAME_SKIP_RATE) || 2;

function sendFrameToPython(jpgBuffer, cameraId) {
  if (!pythonReady) {
    if (frameQueue.length < 100) {
      frameQueue.push({ jpgBuffer, cameraId });
      if (frameQueue.length === 1) {
        console.log(`[DEBUG] Python not ready yet - queuing frame (queue size: ${frameQueue.length})`);
        console.log(`[DEBUG] Waiting for Python to initialize (loading model and embeddings)...`);
      }
    } else {
      framesDroppedBecauseNotReady++;
      if (framesDroppedBecauseNotReady % 100 === 0) {
        console.warn(`[WARNING] Python not ready - dropped ${framesDroppedBecauseNotReady} frames. Check if Python service is running.`);
      }
    }
    return;
  }
  
  // Skip frames to reduce load (process every Nth frame)
  frameSkipCounter++;
  if (frameSkipCounter % FRAME_SKIP_RATE !== 0) {
    return; // Skip this frame
  }
  
  // Track timing for first frame
  if (framesSentToPython === 0) {
    firstFrameSentTime = Date.now();
  }
  
  try {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(jpgBuffer.length, 0);
    const data = Buffer.concat([lenBuf, jpgBuffer]);
    const success = python.stdin.write(data);
    
    if (!success) {
      // Buffer is full - skip more frames to catch up
      framesDroppedBecauseBufferFull++;
      // ⚡ AUTO-ADJUST: Increase skip rate temporarily when buffer is full
      if (framesDroppedBecauseBufferFull % 50 === 0) {
        console.warn(`[WARNING] Python stdin buffer full - dropped ${framesDroppedBecauseBufferFull} frames. Python is processing too slowly.`);
        console.warn(`[WARNING] Consider reducing frame rate or increasing FRAME_SKIP_RATE (currently ${FRAME_SKIP_RATE})`);
        // Temporarily skip more frames to catch up
        frameSkipCounter = 0; // Reset counter to skip next few frames
      }
      // Don't wait - just drop this frame and continue
      return;
    }
    
    framesSentToPython++;
    
    if (framesSentToPython === 1) {
      // Only log first frame details
      if (framesSentToPython === 1) {
        console.log(`[DEBUG] First frame sent to Python (size: ${jpgBuffer.length} bytes, skipping every ${FRAME_SKIP_RATE} frames)`);
        console.log(`[DEBUG] Python should process this frame and return detection results soon...`);
      }
    }
    
    if (framesSentToPython % 50 === 0) {
      // Only log every 100 frames to reduce console spam
      if (framesSentToPython % 100 === 0) {
        console.log(`[DEBUG] Sent ${framesSentToPython} frames to Python (dropped ${framesDroppedBecauseBufferFull} due to buffer full, last detection had ${latestDetections.length} face(s))`);
      }
    }
  } catch (err) {
    console.error('Error writing to Python stdin:', err);
    console.error('Python process may have crashed. Check Python service logs.');
    pythonReady = false;
  }
}

// Handle Python stdin drain event (buffer has space again)
python.stdin.on('drain', () => {
  console.log('[DEBUG] Python stdin buffer drained - ready for more frames');
});

// ========================================
// 📹 CAMERA STREAM HANDLER
// ========================================

function startCameraStream(ws, cameraId, rtspUrl, cameraName, mediamtxStream) {
  console.log(`Starting ${cameraName} (${cameraId})`);
  
  // Use MediaMTX: Pull RTSP stream from MediaMTX and convert to MJPEG with FFmpeg
  // This way MediaMTX handles the camera connection, and FFmpeg converts to MJPEG
  if (USE_MEDIAMTX) {
    if (!mediamtxStream) {
      const errorMsg = `MediaMTX is enabled but no stream name configured for ${cameraId}. Please add mediamtxStream to camera config.`;
      console.error(`[${cameraName}] ${errorMsg}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          cameraId,
          status: 'error',
          error: errorMsg
        }));
      }
      return;
    }
    // Use MediaMTX's RTSP endpoint: rtsp://localhost:8554/mycamera
    const mediamtxRtspUrl = `${MEDIAMTX_RTSP_URL}/${mediamtxStream}`;
    console.log(`Using MediaMTX RTSP stream: ${mediamtxRtspUrl}`);
    console.log(`MediaMTX pulls from camera: ${rtspUrl}`);
    return startFFmpegStream(ws, cameraId, mediamtxRtspUrl, cameraName);
  } else {
    console.log(`Using FFmpeg to convert RTSP directly: ${rtspUrl}`);
    return startFFmpegStream(ws, cameraId, rtspUrl, cameraName);
  }
}

function startMediaMTXStream(ws, cameraId, streamName, cameraName, retryCount = 0) {
  const mjpegUrl = `${MEDIAMTX_BASE_URL}/${streamName}/mjpeg`;
  const httpModule = mjpegUrl.startsWith('https') ? https : http;
  
  let frameCount = 0;
  let pythonFrameCount = 0;
  let currentFrame = Buffer.alloc(0);
  const SOI = Buffer.from([0xFF, 0xD8]);
  const EOI = Buffer.from([0xFF, 0xD9]);
  
  if (!ws.cameras) ws.cameras = {};
  
  console.log(`[${cameraName}] Requesting MediaMTX MJPEG stream: ${mjpegUrl}`);
  console.log(`[${cameraName}] Make sure MediaMTX is running and has successfully pulled the stream from the camera.`);
  
  const req = httpModule.get(mjpegUrl, (res) => {
    if (res.statusCode === 400) {
      // 400 Bad Request usually means stream is not ready yet (sourceOnDemand)
      // MediaMTX needs time to pull the stream from the camera
      let errorBody = '';
      res.on('data', (chunk) => {
        errorBody += chunk.toString();
      });
      res.on('end', () => {
        console.warn(`[${cameraName}] MediaMTX stream not ready yet (400). ${errorBody || 'Stream is being pulled on-demand.'}`);
        
        // Retry after a delay (up to 3 times)
        if (retryCount < 3) {
          const delay = (retryCount + 1) * 2000; // 2s, 4s, 6s
          console.log(`[${cameraName}] Retrying in ${delay/1000} seconds... (attempt ${retryCount + 1}/3)`);
          setTimeout(() => {
            startMediaMTXStream(ws, cameraId, streamName, cameraName, retryCount + 1);
          }, delay);
        } else {
          // After 3 retries, send error to client
          const errorMsg = `MediaMTX stream "${streamName}" is not available after ${retryCount + 1} attempts. Check MediaMTX logs to see if it can connect to the camera. The camera works in VLC, so verify MediaMTX configuration in mediamtx.yml matches the camera RTSP URL.`;
          console.error(`[${cameraName}] ${errorMsg}`);
          console.error(`[${cameraName}] Troubleshooting:`);
          console.error(`[${cameraName}] 1. Check MediaMTX logs for connection errors`);
          console.error(`[${cameraName}] 2. Verify camera RTSP URL in mediamtx.yml: rtsp://admin:Eduvision124@192.168.8.5:554/Streaming/Channels/101`);
          console.error(`[${cameraName}] 3. Test camera in VLC with the same RTSP URL`);
          console.error(`[${cameraName}] 4. Try accessing MediaMTX stream directly: ${mjpegUrl}`);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              cameraId,
              status: 'error',
              error: errorMsg
            }));
          }
        }
      });
      return;
    }
    
    if (res.statusCode !== 200) {
      console.error(`[${cameraName}] MediaMTX request failed: ${res.statusCode}`);
      console.error(`[${cameraName}] URL: ${mjpegUrl}`);
      
      let errorBody = '';
      res.on('data', (chunk) => {
        errorBody += chunk.toString();
      });
      res.on('end', () => {
        const errorMsg = errorBody 
          ? `MediaMTX request failed: ${res.statusCode} - ${errorBody}`
          : `MediaMTX request failed: ${res.statusCode}. Check if stream "${streamName}" exists in MediaMTX.`;
        
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            cameraId,
            status: 'error',
            error: errorMsg
          }));
        }
      });
      return;
    }
    
    ws.cameras[cameraId] = {
      request: req,
      frameCount: 0,
      name: cameraName
    };
    
    ws.send(JSON.stringify({
      cameraId,
      status: 'connected',
      cameraName
    }));
    
    res.on('data', (chunk) => {
      currentFrame = Buffer.concat([currentFrame, chunk]);
      
      // Find JPEG frames (SOI to EOI)
      while (true) {
        const startIdx = currentFrame.indexOf(SOI);
        if (startIdx === -1) {
          // Keep last 64KB in case SOI is split across chunks
          if (currentFrame.length > 65536) {
            currentFrame = currentFrame.slice(-65536);
          }
          break;
        }
        
        const endIdx = currentFrame.indexOf(EOI, startIdx + 2);
        if (endIdx === -1) {
          // Keep from SOI in case EOI is in next chunk
          currentFrame = currentFrame.slice(startIdx);
          break;
        }
        
      const jpeg = currentFrame.slice(startIdx, endIdx + 2);
      currentFrame = currentFrame.slice(endIdx + 2);
      frameCount++;
      pythonFrameCount++;
      
      // ⏱️ PROFILING: Mark frame capture timestamp
      const frameCaptureTime = Date.now();
      frameCaptureTimestamps.set(frameCount, frameCaptureTime);
      
      // Send every frame to Python for face recognition
      sendFrameToPython(jpeg, cameraId);
        
        if (ws.readyState === WebSocket.OPEN) {
          try {
            // ⏱️ PROFILING: Calculate latency from frame capture to client
            const captureTime = frameCaptureTimestamps.get(frameCount);
            const sendToClientTime = Date.now();
            
            if (captureTime) {
              const totalLatency = sendToClientTime - captureTime;
              totalFrameCaptureToClient += totalLatency;
              totalFramesToClient++;
              
              // Log latency for frames with faces
              if (latestDetections.length > 0) {
                console.log(`[⏱️ PROFILE] Frame ${frameCount}: Total latency (capture→client) = ${totalLatency}ms with ${latestDetections.length} face(s)`);
              }
              
              // Report average every 100 frames
              if (frameCount % 100 === 0) {
                const avgLatency = totalFrameCaptureToClient / totalFramesToClient;
                console.log(`[📊 SERVER STATS] After ${frameCount} frames - AVG latency (capture→client): ${avgLatency.toFixed(1)}ms`);
              }
              
              // Cleanup old timestamps to prevent memory leak
              if (frameCount > 1000) {
                frameCaptureTimestamps.delete(frameCount - 1000);
              }
            }
            
            const metadataStr = JSON.stringify({
              cameraId,
              frameNumber: frameCount,
              faces: latestDetections,
              events: latestEvents,
              frame_width: latestFrameWidth,
              frame_height: latestFrameHeight
            });
            
            const metadataLen = Buffer.alloc(4);
            metadataLen.writeUInt32BE(metadataStr.length, 0);
            
            const payload = Buffer.concat([
              metadataLen,
              Buffer.from(metadataStr),
              jpeg
            ]);
            
            ws.send(payload, { binary: true });
            
            if (latestEvents.length > 0) {
              latestEvents = [];
            }
          } catch (err) {
            console.error(`[${cameraName}] Error sending frame:`, err);
          }
        }
        
        if (frameCount % 200 === 0) {
          console.log(`[${cameraName}] Sent ${frameCount} frames`);
        }
      }
    });
    
    res.on('end', () => {
      console.log(`[${cameraName}] MediaMTX stream ended`);
      ws.send(JSON.stringify({
        cameraId,
        status: 'disconnected'
      }));
    });
    
    res.on('error', (err) => {
      console.error(`[${cameraName}] MediaMTX stream error:`, err);
      ws.send(JSON.stringify({
        cameraId,
        status: 'error',
        error: err.message
      }));
    });
  });
  
  req.on('error', (err) => {
    const errorMsg = err.message || err.code || 'Unknown error';
    console.error(`[${cameraName}] MediaMTX request error:`, err);
    console.error(`[${cameraName}] Error details:`, {
      code: err.code,
      message: err.message,
      syscall: err.syscall,
      address: err.address,
      port: err.port
    });
    
    let userFriendlyError = `Failed to connect to MediaMTX`;
    if (err.code === 'ECONNREFUSED') {
      userFriendlyError = `MediaMTX is not running at ${MEDIAMTX_BASE_URL}. Please start MediaMTX first.`;
    } else if (err.code === 'ETIMEDOUT') {
      userFriendlyError = `MediaMTX connection timeout. Check if MediaMTX is running at ${MEDIAMTX_BASE_URL}`;
    } else if (err.code === 'ENOTFOUND') {
      userFriendlyError = `Cannot resolve MediaMTX host. Check MEDIAMTX_URL configuration.`;
    } else if (errorMsg) {
      userFriendlyError = `Failed to connect to MediaMTX: ${errorMsg}`;
    }
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        cameraId,
        status: 'error',
        error: userFriendlyError
      }));
    }
  });
  
  req.setTimeout(30000, () => {
    console.error(`[${cameraName}] MediaMTX request timeout after 30 seconds`);
    console.error(`[${cameraName}] Check if MediaMTX is running at ${MEDIAMTX_BASE_URL}`);
    console.error(`[${cameraName}] Try accessing: ${mjpegUrl}`);
    req.destroy();
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        cameraId,
        status: 'error',
        error: `MediaMTX request timeout. Check if MediaMTX is running and the stream "${streamName}" exists.`
      }));
    }
  });
}

function startFFmpegStream(ws, cameraId, rtspUrl, cameraName) {
  // ⚡ ZERO DELAY STREAMING - Optimized for real-time with no latency
  const ffmpeg = spawn('ffmpeg', [
    '-rtsp_transport', 'tcp',
    '-fflags', 'nobuffer+fastseek+flush_packets+discardcorrupt+genpts',
    '-flags', 'low_delay',
    '-strict', 'experimental',
    '-analyzeduration', '0',      // Zero analysis delay
    '-probesize', '32',           // Minimal probe size for instant start
    '-max_delay', '0',            // No delay buffering
    '-reorder_queue_size', '0',   // Disable reorder buffer
    '-i', rtspUrl,
    '-f', 'mjpeg',
    '-q:v', '4',                  // Balanced quality for 60 FPS (4 = good quality, still fast encoding)
         '-vf', 'fps=60,scale=1920:1080',  // 60 FPS + Full HD (RTX 3050 Ti optimized for smooth 60 FPS)
    '-thread_queue_size', '1',    // Minimal queue for zero delay (was 512)
    '-vsync', '0',                // Passthrough timestamps (no sync delay)
    '-preset', 'ultrafast',       // Fastest encoding
    '-tune', 'zerolatency',       // Zero latency tuning
    '-flush_packets', '1',        // Flush packets immediately
    '-'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let buffer = Buffer.alloc(0);
  let frameCount = 0;
  let pythonFrameCount = 0;
  let lastSentFrameTime = 0;
  let frontendFrameSkip = 0;  // Skip frames to frontend if WebSocket is slow
  const SOI = Buffer.from([0xFF, 0xD8]);
  const EOI = Buffer.from([0xFF, 0xD9]);
  const MIN_FRAME_INTERVAL_MS = 16;  // 60 FPS (1000/60 = 16.67ms) for smooth real-time playback

  if (!ws.cameras) ws.cameras = {};
  ws.cameras[cameraId] = {
    ffmpeg,
    frameCount: 0,
    name: cameraName
  };

  ws.send(JSON.stringify({
    cameraId,
    status: 'connected',
    cameraName
  }));

  ffmpeg.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    
    while (true) {
      const startIdx = buffer.indexOf(SOI);
      if (startIdx === -1) {
        buffer = Buffer.alloc(0);
        break;
      }

      const endIdx = buffer.indexOf(EOI, startIdx + 2);
      if (endIdx === -1) {
        buffer = buffer.slice(startIdx);
        break;
      }

      const jpeg = buffer.slice(startIdx, endIdx + 2);
      buffer = buffer.slice(endIdx + 2);
      frameCount++;

      pythonFrameCount++;
      // ⚡ ALWAYS send to Python for detection (real-time, no skipping)
      sendFrameToPython(jpeg, cameraId);

      // ⚡ ZERO DELAY: Send frames IMMEDIATELY without any buffering or delay
      if (ws.readyState === WebSocket.OPEN) {
        // ⚡ ULTRA-OPTIMIZED: Pre-allocate buffers and minimize JSON operations
        try {
          // ⚡ OPTIMIZED: Only stringify if there are detections or events (faster)
          let metadataStr;
          if (latestDetections.length > 0 || latestEvents.length > 0) {
            metadataStr = JSON.stringify({
            cameraId,
            frameNumber: frameCount,
            faces: latestDetections,
            events: latestEvents,
            frame_width: latestFrameWidth,
            frame_height: latestFrameHeight
          });
          } else {
            // ⚡ OPTIMIZED: Minimal JSON for empty frames (faster)
            metadataStr = `{"cameraId":"${cameraId}","frameNumber":${frameCount},"faces":[],"events":[],"frame_width":${latestFrameWidth},"frame_height":${latestFrameHeight}}`;
          }
          
          const metadataLen = Buffer.allocUnsafe(4);  // ⚡ OPTIMIZED: Use allocUnsafe (faster)
          metadataLen.writeUInt32BE(metadataStr.length, 0);
          
          // ⚡ OPTIMIZED: Pre-calculate total length for single allocation
          const totalLen = 4 + metadataStr.length + jpeg.length;
          const payload = Buffer.concat([
            metadataLen,
            Buffer.from(metadataStr, 'utf8'),  // Explicit encoding (faster)
            jpeg
          ], totalLen);
          
          // ⚡ 60 FPS OPTIMIZED: Check buffer only if very full (60 FPS needs more headroom)
          // At 60 FPS, we need larger buffer threshold to prevent frame drops
          if (ws.bufferedAmount > 3 * 1024 * 1024) {  // 3MB threshold for 60 FPS (was 2MB)
            // Buffer is getting full - skip this frame to prevent lag
            frontendFrameSkip++;
            if (frontendFrameSkip % 2 === 0) {  // Skip every other frame if buffer is full
              return;  // Skip this frame
            }
          }
          
          ws.send(payload, { binary: true, compress: false });  // No compression for speed
          lastSentFrameTime = Date.now();
          frontendFrameSkip = 0;
          
          // ⚡ OPTIMIZED: Clear events efficiently (reuse array)
          if (latestEvents.length > 0) {
            latestEvents.length = 0;  // Faster than reassignment
          }
        } catch (err) {
          console.error('Error sending frame:', err);
        }
      }

      if (frameCount % 200 === 0) {
        console.log(`[${cameraName}] Sent ${frameCount} frames`);
      }
    }

    if (buffer.length > 2 * 1024 * 1024) {
      console.warn(`[${cameraName}] Buffer overflow, resetting`);
      buffer = Buffer.alloc(0);
    }
  });

  ffmpeg.stderr.on('data', (data) => {
    const msg = data.toString();
    if (!msg.includes('frame=') && !msg.includes('speed=')) {
      console.log(`[FFmpeg-${cameraName}]`, msg.trim());
    }
  });

  ffmpeg.on('exit', (code, signal) => {
    console.log(`[${cameraName}] FFmpeg exited: code=${code}, signal=${signal}`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        cameraId,
        error: 'Stream disconnected'
      }));
    }
  });

  ffmpeg.on('error', (err) => {
    let errorMessage = err.message;
    
    // Provide helpful error message for ENOENT (FFmpeg not found)
    if (err.code === 'ENOENT') {
      errorMessage = 'FFmpeg is not installed or not in PATH. Please install FFmpeg from https://ffmpeg.org/download.html and add it to your system PATH.';
      console.error(`[${cameraName}] ❌ FFmpeg not found!`);
      console.error(`[${cameraName}] Please install FFmpeg:`);
      console.error(`[${cameraName}] 1. Download from: https://ffmpeg.org/download.html`);
      console.error(`[${cameraName}] 2. Extract and add the bin folder to your system PATH`);
      console.error(`[${cameraName}] 3. Restart the server`);
    } else {
      console.error(`[${cameraName}] FFmpeg error:`, err);
    }
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        cameraId,
        status: 'error',
        error: errorMessage
      }));
    }
  });
}

// ========================================
// 🔌 WEBSOCKET CONNECTION HANDLER
// ========================================

wss.on('connection', (ws, req) => {
  console.log('Client connected');
  clients.add(ws);
  ws.cameras = {};
  ws.binaryType = 'arraybuffer';

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received message:', data);
      
      if (data.type === 'start-rtsp') {
        const { cameraId } = data;
        console.log(`Request to start camera: ${cameraId}`);
        
        const cameraConfig = CAMERA_CONFIG[cameraId];
        
        if (!cameraConfig) {
          console.error(`Invalid camera ID: ${cameraId}`);
          ws.send(JSON.stringify({
            cameraId,
            error: 'Invalid camera ID: ' + cameraId
          }));
          return;
        }

        if (ws.cameras[cameraId]) {
          try {
            // Stop existing stream (FFmpeg or MediaMTX)
            if (ws.cameras[cameraId].ffmpeg && !ws.cameras[cameraId].ffmpeg.killed) {
              ws.cameras[cameraId].ffmpeg.kill('SIGKILL');
            }
            if (ws.cameras[cameraId].request) {
              ws.cameras[cameraId].request.destroy();
            }
          } catch (e) {
            console.error(`Error stopping existing stream for ${cameraId}:`, e);
          }
        }

        startCameraStream(ws, cameraId, cameraConfig.rtspUrl, cameraConfig.name, cameraConfig.mediamtxStream);
      }
      else if (data.type === 'stop') {
        Object.keys(ws.cameras).forEach(cameraId => {
          try {
            // Stop FFmpeg stream
            if (ws.cameras[cameraId].ffmpeg && !ws.cameras[cameraId].ffmpeg.killed) {
              ws.cameras[cameraId].ffmpeg.kill('SIGKILL');
            }
            // Stop MediaMTX stream
            if (ws.cameras[cameraId].request) {
              ws.cameras[cameraId].request.destroy();
            }
          } catch (e) {
            console.error(`Error stopping ${cameraId}:`, e);
          }
        });
        ws.cameras = {};
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
    
    Object.keys(ws.cameras).forEach(cameraId => {
      try {
        // Stop FFmpeg stream
        if (ws.cameras[cameraId].ffmpeg && !ws.cameras[cameraId].ffmpeg.killed) {
          ws.cameras[cameraId].ffmpeg.kill('SIGKILL');
          console.log(`Stopped ${ws.cameras[cameraId].name}`);
        }
        // Stop MediaMTX stream
        if (ws.cameras[cameraId].request) {
          ws.cameras[cameraId].request.destroy();
          console.log(`Stopped MediaMTX stream for ${ws.cameras[cameraId].name}`);
        }
      } catch (e) {
        console.error(`Error stopping stream for ${cameraId}:`, e);
      }
    });
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// ========================================
// 🛑 GRACEFUL SHUTDOWN
// ========================================

process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  
  clients.forEach(ws => {
    Object.keys(ws.cameras || {}).forEach(cameraId => {
      try {
        if (ws.cameras[cameraId].ffmpeg) {
          ws.cameras[cameraId].ffmpeg.kill('SIGKILL');
        }
      } catch (e) {}
    });
  });

  python.kill('SIGTERM');
  mongoose.connection.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// ========================================
// 🚀 START SERVER
// ========================================

// Check if MediaMTX is available at startup
if (USE_MEDIAMTX) {
  // Try to connect to MediaMTX HTTP server (HLS port)
  const mediamtxCheckUrl = `${MEDIAMTX_BASE_URL}/`;
  const httpModule = mediamtxCheckUrl.startsWith('https') ? https : http;
  
  const checkReq = httpModule.get(mediamtxCheckUrl, (res) => {
    if (res.statusCode === 200 || res.statusCode === 404 || res.statusCode === 301) {
      // 200/404/301 = MediaMTX is running (various responses depending on version)
      console.log(`✅ MediaMTX is running (HTTP: ${MEDIAMTX_BASE_URL}, RTSP: ${MEDIAMTX_RTSP_URL})`);
      console.log(`   MediaMTX will pull camera streams and serve them via RTSP`);
    } else {
      console.warn(`⚠️ MediaMTX check returned status code: ${res.statusCode}`);
    }
    res.on('data', () => {}); // Consume response
    res.on('end', () => {});
  });
  
  checkReq.on('error', (err) => {
    if (err.code === 'ECONNREFUSED') {
      console.error('❌ Cannot connect to MediaMTX!');
      console.error(`   HTTP URL: ${MEDIAMTX_BASE_URL}`);
      console.error(`   RTSP URL: ${MEDIAMTX_RTSP_URL}`);
      console.error('   MediaMTX is not running. Please start MediaMTX first.');
      console.error('   Camera streaming will not work without MediaMTX.');
    } else {
      console.error('❌ Cannot connect to MediaMTX!');
      console.error(`   HTTP URL: ${MEDIAMTX_BASE_URL}`);
      console.error(`   RTSP URL: ${MEDIAMTX_RTSP_URL}`);
      console.error(`   Error: ${err.message || err.code || 'Unknown error'}`);
      console.error('   Please make sure MediaMTX is running and accessible.');
      console.error('   Camera streaming will not work without MediaMTX.');
    }
  });
  
  checkReq.setTimeout(5000, () => {
    console.warn('⚠️ MediaMTX check timeout - MediaMTX may not be running');
    console.warn('   The server will continue, but camera streaming may not work.');
    checkReq.destroy();
  });
} else {
  // Check if FFmpeg is available at startup (only if not using MediaMTX)
  const ffmpegCheck = spawn('ffmpeg', ['-version'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  ffmpegCheck.on('close', (code) => {
    if (code === 0) {
      console.log('✅ FFmpeg is available');
    } else {
      console.warn('⚠️ FFmpeg check returned non-zero exit code');
    }
  });

  ffmpegCheck.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error('❌ FFmpeg is not installed or not in PATH!');
      console.error('   Camera streaming will not work without FFmpeg.');
      console.error('   Please install FFmpeg from: https://ffmpeg.org/download.html');
      console.error('   After installation, add FFmpeg bin folder to your system PATH.');
    } else {
      console.error('⚠️ FFmpeg check error:', err.message);
    }
  });
}

server.listen(STREAMING_PORT, '0.0.0.0', () => {
  console.log('Server running at http://localhost:3000');
  console.log(`Using ${USE_MEDIAMTX ? 'MediaMTX' : 'FFmpeg'} for camera streaming`);
  console.log('Waiting for Python worker to initialize...');
  console.log('🚀 Optimized for low latency & high FPS!');
});