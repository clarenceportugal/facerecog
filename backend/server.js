// server.js - OPTIMIZED for Low Latency & High FPS
const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const readline = require('readline');
const fs = require('fs');

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

const app = express();
const server = http.createServer(app);

// WebSocket server with optimizations for low latency
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false, // Disable compression for lower latency
  maxPayload: 10 * 1024 * 1024 // 10MB max payload
});

app.use(express.static(__dirname));

// Track if Python is ready
let pythonReady = false;
let frameQueue = [];
let latestDetections = []; // Store latest face detections from Python

// Spawn Python recognizer worker (ArcFace)
console.log('Starting Python worker...');

console.log('[DEBUG] Server directory (__dirname):', __dirname);

// Path to Python script
const pythonScriptPath = path.join(__dirname, 'recognizer_arcface.py');
console.log('[DEBUG] Looking for Python script at:', pythonScriptPath);

// Check if file exists
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
  
  // Check for READY signal
  if (line === 'READY') {
    console.log('✓ Python worker is READY');
    pythonReady = true;
    
    // Process any queued frames
    if (frameQueue.length > 0) {
      console.log(`Processing ${frameQueue.length} queued frames`);
      frameQueue.forEach(item => sendFrameToPython(item.jpgBuffer, item.cameraId));
      frameQueue = [];
    }
    return;
  }
  
  // Try to parse JSON detection results
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

// Camera stream handler - OPTIMIZED
function startCameraStream(ws, cameraId, rtspUrl, cameraName) {
  console.log(`Starting ${cameraName} (${cameraId}): ${rtspUrl}`);

  // OPTIMIZED FFmpeg parameters for low latency & high FPS
  const ffmpeg = spawn('ffmpeg', [
    '-rtsp_transport', 'tcp',
    '-fflags', 'nobuffer+fastseek+flush_packets',
    '-flags', 'low_delay',
    '-strict', 'experimental',
    '-analyzeduration', '100000',
    '-probesize', '100000',
    '-i', rtspUrl,
    '-f', 'mjpeg',
    '-q:v', '3', // Higher quality (lower number = better quality)
    '-vf', 'fps=20,scale=640:480', // 20 FPS for smoother video
    '-'
  ], { 
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let buffer = Buffer.alloc(0);
  let frameCount = 0;
  let pythonFrameCount = 0;
  const SOI = Buffer.from([0xFF, 0xD8]); // JPEG Start
  const EOI = Buffer.from([0xFF, 0xD9]); // JPEG End

  // Store ffmpeg instance
  if (!ws.cameras) ws.cameras = {};
  ws.cameras[cameraId] = {
    ffmpeg,
    frameCount: 0,
    name: cameraName
  };

  // Send connected status
  ws.send(JSON.stringify({
    cameraId,
    status: 'connected',
    cameraName
  }));

  ffmpeg.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    
    // Extract complete JPEG frames
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

      // Send every 5th frame to Python for face recognition (less CPU load)
      pythonFrameCount++;
      if (pythonFrameCount % 5 === 0) {
        sendFrameToPython(jpeg, cameraId);
      }

      // Send frame immediately as BINARY (no base64 encoding!)
      if (ws.readyState === WebSocket.OPEN) {
        try {
          // Create a header with metadata (length-prefixed)
          const metadataStr = JSON.stringify({
            cameraId,
            frameNumber: frameCount,
            faces: latestDetections
          });
          
          const metadataLen = Buffer.alloc(4);
          metadataLen.writeUInt32BE(metadataStr.length, 0);
          
          // Send: [4 bytes: metadata length] [metadata JSON] [JPEG binary data]
          const payload = Buffer.concat([
            metadataLen,
            Buffer.from(metadataStr),
            jpeg
          ]);
          
          ws.send(payload, { binary: true });
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

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  console.log('Client connected');
  clients.add(ws);
  ws.cameras = {};

  // Set binary type
  ws.binaryType = 'arraybuffer';

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received message:', data);
      
      if (data.type === 'start-rtsp') {
        const { cameraId } = data;
        console.log(`Request to start camera: ${cameraId}`);
        console.log('Available cameras:', Object.keys(CAMERA_CONFIG));
        
        const cameraConfig = CAMERA_CONFIG[cameraId];
        
        if (!cameraConfig) {
          console.error(`Invalid camera ID: ${cameraId}`);
          ws.send(JSON.stringify({
            cameraId,
            error: 'Invalid camera ID: ' + cameraId
          }));
          return;
        }

        console.log(`Starting ${cameraConfig.name} with URL: ${cameraConfig.rtspUrl}`);

        // Stop existing stream if any
        if (ws.cameras[cameraId]) {
          try {
            ws.cameras[cameraId].ffmpeg.kill('SIGKILL');
          } catch (e) {
            console.error(`Error killing existing FFmpeg for ${cameraId}:`, e);
          }
        }

        // Start new stream with hardcoded config
        startCameraStream(ws, cameraId, cameraConfig.rtspUrl, cameraConfig.name);
      }
      else if (data.type === 'stop') {
        // Stop all camera streams
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
    
    // Kill all FFmpeg processes for this client
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

// Graceful shutdown
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
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Server running at http://localhost:3000');
  console.log('Waiting for Python worker to initialize...');
  console.log('🚀 Optimized for low latency & high FPS!');
});