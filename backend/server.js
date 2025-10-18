// server.js
const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const readline = require('readline');

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
const wss = new WebSocket.Server({ server });

app.use(express.static(__dirname)); // serves index.html and client files

// Track if Python is ready
let pythonReady = false;
let frameQueue = [];
let latestDetections = []; // Store latest face detections from Python

// Spawn Python recognizer worker (ArcFace)
console.log('Starting Python worker...');
const python = spawn('python', [path.join(__dirname, '../streaming-server/recognizer_arcface.py')], {
  stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr all piped
});

// Handle Python stderr for logging
python.stderr.on('data', (data) => {
  console.log('[Python]', data.toString().trim());
});

// Handle Python exit
python.on('exit', (code, signal) => {
  console.log(`Python process exited with code ${code}, signal ${signal}`);
  pythonReady = false;
});

python.on('error', (err) => {
  console.error('Failed to start Python process:', err);
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
      // Store latest detections globally
      latestDetections = msg.faces;
      
      // Log ALL detections for debugging
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
    // Queue frame if Python not ready yet
    if (frameQueue.length < 100) { // Limit queue size
      frameQueue.push({ jpgBuffer, cameraId });
    }
    console.log('[DEBUG] Python not ready, frame queued');
    return;
  }
  
  try {
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(jpgBuffer.length, 0);
    python.stdin.write(Buffer.concat([lenBuf, jpgBuffer]));
    framesSentToPython++;
    
    if (framesSentToPython % 50 === 0) {
      console.log(`[DEBUG] Sent ${framesSentToPython} frames to Python`);
    }
  } catch (err) {
    console.error('Error writing to Python stdin:', err);
  }
}

// Camera stream handler
function startCameraStream(ws, cameraId, rtspUrl, cameraName) {
  console.log(`Starting ${cameraName} (${cameraId}): ${rtspUrl}`);

  const ffmpeg = spawn('ffmpeg', [
    '-rtsp_transport', 'tcp',
    '-timeout', '5000000',
    '-fflags', 'nobuffer',
    '-flags', 'low_delay',
    '-i', rtspUrl,
    '-f', 'mjpeg',
    '-q:v', '5',
    '-vf', 'fps=10,scale=640:480', // 10 FPS for better performance
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

      // Send every 2nd frame to Python for recognition
      pythonFrameCount++;
      if (pythonFrameCount % 2 === 0) {
        sendFrameToPython(jpeg, cameraId);
        
        // Wait a bit for Python to process, then send frame with latest detections
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              cameraId,
              frame: jpeg.toString('base64'),
              faces: latestDetections, // Use latest detections from Python
              frameNumber: frameCount
            }));
          }
        }, 50); // Small delay for processing
      } else {
        // Send frame immediately without waiting for new detection
        // But still include latest detections (they persist until updated)
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            cameraId,
            frame: jpeg.toString('base64'),
            faces: latestDetections, // Reuse last known detections
            frameNumber: frameCount
          }));
        }
      }

      if (frameCount % 100 === 0) {
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

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received message:', data);
      
      if (data.type === 'start-rtsp') {
        const { cameraId } = data;
        console.log(`Request to start camera: ${cameraId}`);
        console.log('Available cameras:', Object.keys(CAMERA_CONFIG));
        
        // Get camera config from hardcoded settings
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
  
  // Stop all client streams
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
});