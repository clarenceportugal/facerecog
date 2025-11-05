// server.js - OPTIMIZED for Low Latency & High FPS

require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const readline = require('readline');
const fs = require('fs');
const mongoose = require('mongoose');
const cors = require('cors');

// ========================================
// 🔧 CAMERA CONFIGURATION - EDIT HERE
// ========================================
const CAMERA_CONFIG = {
  camera1: {
    name: 'Camera 1',
    rtspUrl: 'rtsp://admin:Eduvision124@192.168.8.5:554/Streaming/Channels/101'
  },
  camera2: {
    name: 'Camera 2',
    rtspUrl: 'rtsp://tapoadmin:eduvision124@192.168.8.169:554/stream1'
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
let latestEvents = [];  // Store events from Python

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

const pythonCommand = 'python';

const python = spawn(pythonCommand, [pythonScriptPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

console.log('[DEBUG] Python process spawned with PID:', python.pid);

// Handle Python stderr for logging
python.stderr.on('data', (data) => {
  const msg = data.toString().trim();
  console.log('[Python]', msg);
  
  if (msg.includes('ERROR') || msg.includes('Traceback')) {
    console.error('[Python ERROR]', msg);
  }
});

// Handle Python exit
python.on('exit', (code, signal) => {
  console.log(`Python process exited with code ${code}, signal ${signal}`);
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
  
  if (line === 'READY') {
    console.log('✓ Python worker is READY');
    pythonReady = true;
    
    if (frameQueue.length > 0) {
      console.log(`Processing ${frameQueue.length} queued frames`);
      frameQueue.forEach(item => sendFrameToPython(item.jpgBuffer, item.cameraId));
      frameQueue = [];
    }
    return;
  }
  
  try {
    const msg = JSON.parse(line);
    if (msg.faces !== undefined) {
      latestDetections = msg.faces;
      
      console.log(`[DEBUG] Received detection: ${msg.faces.length} face(s)`);
      if (msg.faces.length > 0) {
        const names = msg.faces.map(f => f.name).join(', ');
        console.log(`[Detection] Found ${msg.faces.length} face(s): ${names}`);
      }
    }
    // Store events from Python
    if (msg.events !== undefined && msg.events.length > 0) {
      latestEvents = msg.events;
      console.log(`[DEBUG] Received ${msg.events.length} event(s):`, msg.events.map(e => e.type).join(', '));
    }
  } catch (err) {
    console.error('Bad JSON from Python:', line);
    console.error('Raw line:', line);
  }
});

// Helper to send frame to Python
let framesSentToPython = 0;
function sendFrameToPython(jpgBuffer, cameraId) {
  if (!pythonReady) {
    if (frameQueue.length < 100) {
      frameQueue.push({ jpgBuffer, cameraId });
    }
    return;
  }
  
  try {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(jpgBuffer.length, 0);
    python.stdin.write(Buffer.concat([lenBuf, jpgBuffer]));
    framesSentToPython++;
    
    if (framesSentToPython % 100 === 0) {
      console.log(`[DEBUG] Sent ${framesSentToPython} frames to Python`);
    }
  } catch (err) {
    console.error('Error writing to Python stdin:', err);
  }
}

// ========================================
// 📹 CAMERA STREAM HANDLER
// ========================================

function startCameraStream(ws, cameraId, rtspUrl, cameraName) {
  console.log(`Starting ${cameraName} (${cameraId}): ${rtspUrl}`);

  const ffmpeg = spawn('ffmpeg', [
    '-rtsp_transport', 'tcp',
    '-fflags', 'nobuffer+fastseek+flush_packets',
    '-flags', 'low_delay',
    '-strict', 'experimental',
    '-analyzeduration', '50000',  // Reduced for faster startup
    '-probesize', '50000',         // Reduced for faster startup
    '-i', rtspUrl,
    '-f', 'mjpeg',
    '-q:v', '7',                   // Slightly lower quality (7 vs 5) for faster encoding
    '-vf', 'fps=20,scale=480:360', // Optimized: 20 FPS at 480x360 for speed + smooth stream
    '-'
  ], { 
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let buffer = Buffer.alloc(0);
  let frameCount = 0;
  let pythonFrameCount = 0;
  const SOI = Buffer.from([0xFF, 0xD8]);
  const EOI = Buffer.from([0xFF, 0xD9]);

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
      // Send every 2nd frame for faster "no face" detection (20 FPS → ~10 FPS detection)
      if (pythonFrameCount % 2 === 0) {
        sendFrameToPython(jpeg, cameraId);
      }

      if (ws.readyState === WebSocket.OPEN) {
        try {
          const metadataStr = JSON.stringify({
            cameraId,
            frameNumber: frameCount,
            faces: latestDetections,
            events: latestEvents
          });
          
          const metadataLen = Buffer.alloc(4);
          metadataLen.writeUInt32BE(metadataStr.length, 0);
          
          const payload = Buffer.concat([
            metadataLen,
            Buffer.from(metadataStr),
            jpeg
          ]);
          
          ws.send(payload, { binary: true });
          
          // Clear events after sending to avoid duplicates
          if (latestEvents.length > 0) {
            latestEvents = [];
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
    console.error(`[${cameraName}] FFmpeg error:`, err);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        cameraId,
        error: err.message
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
            ws.cameras[cameraId].ffmpeg.kill('SIGKILL');
          } catch (e) {
            console.error(`Error killing existing FFmpeg for ${cameraId}:`, e);
          }
        }

        startCameraStream(ws, cameraId, cameraConfig.rtspUrl, cameraConfig.name);
      }
      else if (data.type === 'stop') {
        Object.keys(ws.cameras).forEach(cameraId => {
          try {
            if (ws.cameras[cameraId].ffmpeg && !ws.cameras[cameraId].ffmpeg.killed) {
              ws.cameras[cameraId].ffmpeg.kill('SIGKILL');
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
        if (ws.cameras[cameraId].ffmpeg && !ws.cameras[cameraId].ffmpeg.killed) {
          ws.cameras[cameraId].ffmpeg.kill('SIGKILL');
          console.log(`Stopped ${ws.cameras[cameraId].name}`);
        }
      } catch (e) {
        console.error(`Error killing FFmpeg for ${cameraId}:`, e);
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

server.listen(STREAMING_PORT, '0.0.0.0', () => {
  console.log('Server running at http://localhost:3000');
  console.log('Waiting for Python worker to initialize...');
  console.log('🚀 Optimized for low latency & high FPS!');
});