import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Chip,
  IconButton,
  Alert,
} from "@mui/material";
import AdminMain from "./AdminMain";
import DeleteIcon from "@mui/icons-material/Delete";
import PersonOffIcon from "@mui/icons-material/PersonOff";
import PersonIcon from "@mui/icons-material/Person";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

type FaceDetection = {
  box: [number, number, number, number];
  name?: string | null;
  score?: number;
  has_schedule?: boolean;
  session?: {
    name: string;
    first_seen: string;
    last_seen: string;
    total_minutes: number;
    is_present: boolean;
    left_at: string | null;
    schedule?: any;
  };
};

type TrackedFace = {
  detection: FaceDetection;
  lastSeen: number;
  framesSinceUpdate: number;
};

type DetectionLog = {
  id: string;
  name: string;
  timestamp: Date;
  cameraName: string;
  score?: number;
  type: 'detection' | 'left' | 'returned' | 'first_detected' | 'time_in' | 'time_out' | 'detected_no_schedule';
  details?: string;
  totalMinutes?: number;
  absenceMinutes?: number;
};

const LiveVideo: React.FC = () => {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastDetectedNamesRef = useRef<Set<string>>(new Set());
  const trackedFacesRef = useRef<Map<string, TrackedFace>>(new Map());
  const smoothedBoxesRef = useRef<Map<string, {
    box: [number, number, number, number];
    targetBox: [number, number, number, number];
  }>>(new Map());
  const lastLogTimeRef = useRef<Map<string, number>>(new Map()); // Track last log time for each person
  
  const [faces, setFaces] = useState<FaceDetection[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("camera1");
  const [connectionStatus, setConnectionStatus] = useState<string>("Disconnected");
  const [detectionLogs, setDetectionLogs] = useState<DetectionLog[]>([]);
  const [currentCameraName, setCurrentCameraName] = useState<string>("Camera 1");

  // Optimized for instant response - no delays, immediate updates
  const FACE_TIMEOUT_MS = 0; // No timeout - instant removal when not detected
  const ABSENCE_TIMEOUT_SECONDS = 300; // 5 minutes
  const SMOOTHING_FACTOR = 0.9; // Very high smoothing for existing faces (reduces jitter)
  const NEW_FACE_SMOOTHING_FACTOR = 1.0; // No smoothing for new faces - instant display
  const DETECTION_LOG_INTERVAL_MS = 120000; // 2 minutes in milliseconds

  const smoothBox = (
    currentBox: [number, number, number, number] | undefined,
    targetBox: [number, number, number, number],
    smoothingFactor: number
  ): [number, number, number, number] => {
    if (!currentBox) {
      return targetBox;
    }
    
    return [
      currentBox[0] + (targetBox[0] - currentBox[0]) * smoothingFactor,
      currentBox[1] + (targetBox[1] - currentBox[1]) * smoothingFactor,
      currentBox[2] + (targetBox[2] - currentBox[2]) * smoothingFactor,
      currentBox[3] + (targetBox[3] - currentBox[3]) * smoothingFactor,
    ] as [number, number, number, number];
  };

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:3000");
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket connected");
      setConnectionStatus("Connected");
      
      ws.send(JSON.stringify({
        type: "start-rtsp",
        cameraId: selectedCamera
      }));
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        try {
          const buffer = new Uint8Array(event.data);
          const metadataLen = new DataView(buffer.buffer).getUint32(0, false);
          const metadataBytes = buffer.slice(4, 4 + metadataLen);
          const metadataStr = new TextDecoder().decode(metadataBytes);
          const metadata = JSON.parse(metadataStr);
          const jpegData = buffer.slice(4 + metadataLen);
          
          if (metadata.cameraId === selectedCamera) {
            const blob = new Blob([jpegData], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            
            if (imgRef.current) {
              imgRef.current.onload = () => URL.revokeObjectURL(url);
              imgRef.current.src = url;
            }
            
            // Handle events from Python (ALL event types)
            if (metadata.events && metadata.events.length > 0) {
              metadata.events.forEach((event: any) => {
                const eventLog: DetectionLog = {
                  id: `event-${Date.now()}-${Math.random()}`,
                  name: event.name,
                  timestamp: new Date(event.left_at || event.returned_at || event.timestamp || new Date()),
                  cameraName: currentCameraName,
                  type: event.type,
                  totalMinutes: event.total_minutes,
                  absenceMinutes: event.absence_minutes,
                  details: ""
                };

                // Handle ALL event types
                if (event.type === 'time_in') {
                  eventLog.details = `⏰ TIME IN logged - ${event.schedule?.courseCode || 'N/A'} (${event.schedule?.room || 'N/A'})`;
                  console.log(`⏰ ${event.name} TIME IN for ${event.schedule?.courseCode}`);
                  
                } else if (event.type === 'time_out') {
                  eventLog.details = `🚪 TIME OUT logged - Total: ${event.total_minutes} min | ${event.schedule?.courseCode || 'N/A'}`;
                  console.log(`🚪 ${event.name} TIME OUT after ${event.total_minutes} min`);
                  
                } else if (event.type === 'left') {
                  eventLog.details = `Left after being absent for 5 minutes. Total time present: ${event.total_minutes} min`;
                  console.log(`🚪 ${event.name} LEFT after ${ABSENCE_TIMEOUT_SECONDS}s absence`);
                  
                } else if (event.type === 'returned') {
                  eventLog.details = `Returned after ${event.absence_minutes} minutes away`;
                  console.log(`👋 ${event.name} RETURNED after ${event.absence_minutes} min`);
                  
                } else if (event.type === 'first_detected') {
                  eventLog.details = 'First time detected in this session';
                  console.log(`✨ ${event.name} FIRST DETECTED`);
                  
                } else if (event.type === 'detected_no_schedule') {
                  eventLog.details = 'Detected without scheduled class';
                  console.log(`📋 ${event.name} detected (no schedule)`);
                }

                setDetectionLogs(prev => [...prev, eventLog]);
              });
            }
            
            // Optimized face tracking - instant display and removal
            const now = Date.now();
            const currentDetections = metadata.faces || [];
            const currentDetectionNames = new Set(
              currentDetections.map((f: FaceDetection) => f.name || "Unknown")
            );

            // If no faces detected from server, immediately clear all (no delay)
            if (currentDetections.length === 0) {
              if (trackedFacesRef.current.size > 0) {
                trackedFacesRef.current.clear();
                smoothedBoxesRef.current.clear();
                // Use flushSync for immediate DOM update - boxes disappear instantly
                flushSync(() => {
                  setFaces([]);
                });
              }
            } else {
              // Check for faces to remove BEFORE processing to detect changes
              const previousFaceKeys = new Set(trackedFacesRef.current.keys());
              
              // Immediately remove any faces NOT in current detections (instant removal)
              const facesToRemove: string[] = [];
              trackedFacesRef.current.forEach((tracked, key) => {
                if (!currentDetectionNames.has(key)) {
                  facesToRemove.push(key);
                }
              });
              
              // Check if there are new faces
              const hasNewFaces = [...currentDetectionNames].some(key => !previousFaceKeys.has(key));
              
              // Remove faces immediately
              facesToRemove.forEach(key => {
                trackedFacesRef.current.delete(key);
                smoothedBoxesRef.current.delete(key);
              });

              // Update tracking for currently detected faces with instant display for new faces
              const activeFaces: FaceDetection[] = [];
              
              currentDetections.forEach((face: FaceDetection) => {
                const faceKey = face.name || "Unknown";
                const existingSmoothed = smoothedBoxesRef.current.get(faceKey);
                const isNewFace = !existingSmoothed;
                
                // Use instant display (no smoothing) for new faces, smooth for existing faces
                const smoothingFactor = isNewFace ? NEW_FACE_SMOOTHING_FACTOR : SMOOTHING_FACTOR;
                
                // Smooth the box coordinates for smooth visual tracking
                const smoothedBox = smoothBox(
                  existingSmoothed?.box,
                  face.box,
                  smoothingFactor
                );
                
                // Update smoothed boxes
                smoothedBoxesRef.current.set(faceKey, {
                  box: smoothedBox,
                  targetBox: face.box
                });
                
                // Create smoothed face detection
                const smoothedFace = {
                  ...face,
                  box: smoothedBox
                };
                
                trackedFacesRef.current.set(faceKey, {
                  detection: smoothedFace,
                  lastSeen: now,
                  framesSinceUpdate: 0
                });
                
                activeFaces.push(smoothedFace);
              });

              // Use flushSync only for critical changes (new faces or removed faces), otherwise normal update
              if (hasNewFaces || facesToRemove.length > 0) {
                flushSync(() => {
                  setFaces(activeFaces);
                });
              } else {
                // Normal update for existing faces (just position updates)
                setFaces(activeFaces);
              }
            }
            
            // Log new face detections (not events) - with 2 minute throttling
            if (currentDetections.length > 0) {
              const currentNames = new Set<string>(
                currentDetections.map((f: FaceDetection) => f.name || "Unknown")
              );
              const previousNames = lastDetectedNamesRef.current;
              const now = Date.now();
              
              currentDetections.forEach((face: FaceDetection) => {
                const name = face.name || "Unknown";
                const lastLogTime = lastLogTimeRef.current.get(name) || 0;
                const timeSinceLastLog = now - lastLogTime;
                
                // Log if first time detected OR if 2 minutes have passed since last log
                if (!previousNames.has(name) || timeSinceLastLog >= DETECTION_LOG_INTERVAL_MS) {
                  const newLog: DetectionLog = {
                    id: `${Date.now()}-${Math.random()}`,
                    name: name,
                    timestamp: new Date(),
                    cameraName: currentCameraName,
                    score: face.score,
                    type: 'detection',
                    details: face.session ? `Total time: ${face.session.total_minutes.toFixed(1)} min` : undefined
                  };
                  
                  setDetectionLogs(prev => [...prev, newLog]);
                  lastLogTimeRef.current.set(name, now); // Update last log time
                }
              });
              
              lastDetectedNamesRef.current = currentNames;
              
              if (currentDetections.length === 0) {
                lastDetectedNamesRef.current.clear();
              }
            }
          }
        } catch (e) {
          console.error("Error parsing binary frame:", e);
        }
        return;
      }
      
      try {
        const msg = JSON.parse(event.data);
        
        if (msg.status === "connected") {
          console.log(`✅ ${msg.cameraName} connected`);
          setConnectionStatus(`Streaming: ${msg.cameraName}`);
          setCurrentCameraName(msg.cameraName || selectedCamera);
          return;
        }
        
        if (msg.error) {
          console.error(`❌ Error from ${msg.cameraId}:`, msg.error);
          setConnectionStatus(`Error: ${msg.error}`);
          return;
        }
      } catch (e) {
        console.error("Error parsing message:", e);
      }
    };

    ws.onerror = (err) => {
      console.error("❌ WebSocket error:", err);
      setConnectionStatus("Error");
    };

    ws.onclose = () => {
      console.log("❌ WebSocket closed");
      setConnectionStatus("Disconnected");
    };

    return () => {
      console.log("🧹 Cleaning up LiveVideo component...");
      
      // Close WebSocket connection
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      
      // Clear all face detection state
      setFaces([]);
      setDetectionLogs([]); // Clear detection logs when leaving page
      setConnectionStatus("Disconnected");
      
      // Clear all refs
      lastDetectedNamesRef.current.clear();
      trackedFacesRef.current.clear();
      smoothedBoxesRef.current.clear();
      lastLogTimeRef.current.clear();
      
      // Clear canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      
      // Clear image source to remove last frame
      const img = imgRef.current;
      if (img) {
        img.src = "";
      }
      
      console.log("✅ LiveVideo cleanup complete");
    };
  }, [selectedCamera, currentCameraName]);

  // Optimized canvas rendering with requestAnimationFrame for instant updates
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    // Wait for image to load, but use requestAnimationFrame for immediate updates
    const drawFrame = () => {
      if (!img.complete) {
        requestAnimationFrame(drawFrame);
        return;
      }

      const ctx = canvas.getContext("2d", { alpha: false }); // Disable alpha for better performance
      if (!ctx) return;

      // Update canvas size only if changed (reduces unnecessary redraws)
      const newWidth = img.naturalWidth || 640;
      const newHeight = img.naturalHeight || 480;
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
      }

      // Clear canvas immediately
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Only draw if faces exist
      if (faces.length === 0) return;

      // Optimize rendering settings
      ctx.lineWidth = 3;
      ctx.font = "bold 18px Arial";
      ctx.textBaseline = "top";

      // Batch similar operations
      faces.forEach((f) => {
        const [x, y, w, h] = f.box;
        
        // Determine box color based on schedule status
        const hasSchedule = f.has_schedule || (f.session && f.session.schedule !== null);
        const boxColor = hasSchedule ? "#00ff00" : "#ffff00";  // Green if has schedule, Yellow if not
        const bgColor = hasSchedule ? "rgba(0, 255, 0, 0.8)" : "rgba(255, 255, 0, 0.8)";
        
        // Draw box border
        ctx.strokeStyle = boxColor;
        ctx.strokeRect(x, y, w, h);
        
        // Draw name label
        const name = f.name || "Unknown";
        const textMetrics = ctx.measureText(name);
        const textHeight = 20;
        const padding = 5;
        
        // Draw background for text
        ctx.fillStyle = bgColor;
        ctx.fillRect(
          x,
          y - textHeight - padding,
          textMetrics.width + padding * 2,
          textHeight + padding
        );
        
        // Draw text
        ctx.fillStyle = "#000";
        ctx.fillText(name, x + padding, y - padding);
      });
    };

    // Use requestAnimationFrame for smooth, immediate rendering
    requestAnimationFrame(drawFrame);
  }, [faces, imgRef.current?.src]);

  const handleCameraChange = (event: any) => {
    const newCamera = event.target.value;
    setSelectedCamera(newCamera);
    setFaces([]);
    lastDetectedNamesRef.current.clear();
    trackedFacesRef.current.clear();
    smoothedBoxesRef.current.clear();
    lastLogTimeRef.current.clear(); // Clear log time tracking when switching cameras
  };

  const handleClearLogs = () => {
    setDetectionLogs([]);
    lastLogTimeRef.current.clear(); // Clear log time tracking when clearing logs
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'left':
        return <PersonOffIcon />;
      case 'returned':
        return <PersonIcon />;
      case 'first_detected':
      case 'time_in':
        return <AccessTimeIcon />;
      case 'time_out':
        return <PersonOffIcon />;
      default:
        return null;
    }
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case 'left':
      case 'time_out':
        return { bg: '#ffebee', border: '#f44336' };
      case 'returned':
        return { bg: '#e3f2fd', border: '#2196f3' };
      case 'first_detected':
      case 'time_in':
        return { bg: '#e8f5e9', border: '#4caf50' };
      default:
        return { bg: '#d4edda', border: '#28a745' };
    }
  };

  return (
    <AdminMain>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight="bold" color="#333">
            Live Face Recognition Feed
          </Typography>
          <Typography 
            variant="body2" 
            color={connectionStatus.includes("Error") ? "error" : "success.main"} 
            mt={1}
          >
            Status: {connectionStatus}
          </Typography>
        </Box>

        <FormControl variant="outlined" size="small" sx={{ minWidth: 200 }}>
          <InputLabel id="camera-select-label">Select Camera</InputLabel>
          <Select
            labelId="camera-select-label"
            value={selectedCamera}
            label="Select Camera"
            onChange={handleCameraChange}
          >
            <MenuItem value="camera1">Camera 1</MenuItem>
            <MenuItem value="camera2">Camera 2</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Box sx={{ display: "flex", gap: 2, justifyContent: "center", mb: 3, maxWidth: "800px", margin: "0 auto 24px", flexWrap: "wrap" }}>
        <Alert severity="info" sx={{ flex: 1 }}>
          <strong>Detection:</strong> Logs every {DETECTION_LOG_INTERVAL_MS / 60000} minutes | <strong>Absence:</strong> Marked as "left" after {ABSENCE_TIMEOUT_SECONDS / 60} minutes
        </Alert>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", backgroundColor: "#f5f5f5", padding: "8px 16px", borderRadius: "4px" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ width: 20, height: 20, backgroundColor: "#00ff00", border: "2px solid #00ff00" }} />
            <Typography variant="body2"><strong>Green:</strong> Has scheduled class</Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ width: 20, height: 20, backgroundColor: "#ffff00", border: "2px solid #ffff00" }} />
            <Typography variant="body2"><strong>Yellow:</strong> No scheduled class</Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ position: "relative", width: "100%", maxWidth: "800px", margin: "0 auto" }}>
        <img
          ref={imgRef}
          alt="Live Stream"
          style={{
            width: "100%",
            height: "70vh",
            objectFit: "cover",
            borderRadius: "10px",
            boxShadow: "0px 4px 10px rgba(0,0,0,0.2)",
            backgroundColor: "#000",
          }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "70vh",
            pointerEvents: "none",
            borderRadius: "10px",
          }}
        />
        
        {faces.length > 0 && (
          <Box
            sx={{
              position: "absolute",
              top: 16,
              right: 16,
              backgroundColor: "rgba(0, 255, 0, 0.9)",
              color: "#000",
              padding: "8px 16px",
              borderRadius: "8px",
              fontWeight: "bold",
              fontSize: "14px",
            }}
          >
            {faces.length} Face{faces.length !== 1 ? "s" : ""} Detected
          </Box>
        )}
      </Box>

      <Paper 
        elevation={3} 
        sx={{ 
          mt: 4, 
          p: 3, 
          maxWidth: "800px", 
          margin: "32px auto 0",
          backgroundColor: "#f9f9f9"
        }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" fontWeight="bold" color="#333">
            Detection & Activity Logs
          </Typography>
          <Box display="flex" alignItems="center" gap={2}>
            <Chip 
              label={`Total: ${detectionLogs.length}`} 
              color="primary" 
              size="small"
            />
            <IconButton 
              onClick={handleClearLogs} 
              size="small" 
              color="error"
              title="Clear all logs"
            >
              <DeleteIcon />
            </IconButton>
          </Box>
        </Box>

        <Box 
          sx={{ 
            maxHeight: "400px", 
            overflowY: "auto",
            border: "1px solid #ddd",
            borderRadius: "8px",
            backgroundColor: "#fff",
            padding: 2
          }}
        >
          {detectionLogs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
              No activity logged yet. Events will appear here when detected.
            </Typography>
          ) : (
            [...detectionLogs].reverse().map((log) => {
              const colors = getLogColor(log.type);
              return (
                <Box
                  key={log.id}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px",
                    marginBottom: "8px",
                    backgroundColor: colors.bg,
                    borderRadius: "6px",
                    borderLeft: `4px solid ${colors.border}`,
                    transition: "all 0.2s",
                    "&:hover": {
                      transform: "translateX(4px)",
                      boxShadow: "0px 2px 8px rgba(0,0,0,0.1)"
                    }
                  }}
                >
                  <Box display="flex" alignItems="center" gap={2}>
                    {getLogIcon(log.type) && (
                      <Box sx={{ color: colors.border }}>
                        {getLogIcon(log.type)}
                      </Box>
                    )}
                    <Box>
                      <Typography variant="body1" fontWeight="bold" color="#333">
                        {log.name}
                        {log.type === 'left' && ' 🚪'}
                        {log.type === 'returned' && ' 👋'}
                        {log.type === 'first_detected' && ' ✨'}
                        {log.type === 'time_in' && ' ⏰'}
                        {log.type === 'time_out' && ' 🚪'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {log.cameraName}
                        {log.score && ` • ${(log.score * 100).toFixed(1)}%`}
                      </Typography>
                      {log.details && (
                        <Typography variant="caption" display="block" color="text.secondary" mt={0.5}>
                          {log.details}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  <Box textAlign="right">
                    <Typography variant="body2" color="#333">
                      {formatTime(log.timestamp)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(log.timestamp)}
                    </Typography>
                  </Box>
                </Box>
              );
            })
          )}
        </Box>
      </Paper>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </AdminMain>
  );
};

export default LiveVideo;