import React, { useEffect, useRef, useState } from "react";
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
} from "@mui/material";
import AdminMain from "./AdminMain";
import DeleteIcon from "@mui/icons-material/Delete";

type FaceDetection = {
  box: [number, number, number, number];
  name?: string | null;
  score?: number;
};

type TrackedFace = {
  detection: FaceDetection;
  lastSeen: number; // Timestamp
  framesSinceUpdate: number;
};

type DetectionLog = {
  id: string;
  name: string;
  timestamp: Date;
  cameraName: string;
  score?: number;
};

const LiveVideo: React.FC = () => {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastDetectedNamesRef = useRef<Set<string>>(new Set());
  const trackedFacesRef = useRef<Map<string, TrackedFace>>(new Map());
  
  const [faces, setFaces] = useState<FaceDetection[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("camera1");
  const [connectionStatus, setConnectionStatus] = useState<string>("Disconnected");
  const [detectionLogs, setDetectionLogs] = useState<DetectionLog[]>([]);
  const [currentCameraName, setCurrentCameraName] = useState<string>("Camera 1");

  // Persistence settings
  const FACE_TIMEOUT_MS = 1000; // Keep face visible for 1 second after last detection
  const MAX_FRAMES_WITHOUT_UPDATE = 20; // Maximum frames to keep face without update

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
      // Handle binary frames (optimized path)
      if (event.data instanceof ArrayBuffer) {
        try {
          const buffer = new Uint8Array(event.data);
          
          // Read metadata length (first 4 bytes)
          const metadataLen = new DataView(buffer.buffer).getUint32(0, false);
          
          // Extract metadata JSON
          const metadataBytes = buffer.slice(4, 4 + metadataLen);
          const metadataStr = new TextDecoder().decode(metadataBytes);
          const metadata = JSON.parse(metadataStr);
          
          // Extract JPEG data
          const jpegData = buffer.slice(4 + metadataLen);
          
          // Only process if it's for the selected camera
          if (metadata.cameraId === selectedCamera) {
            // Display frame
            const blob = new Blob([jpegData], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            
            if (imgRef.current) {
              imgRef.current.onload = () => URL.revokeObjectURL(url);
              imgRef.current.src = url;
            }
            
            // Update face tracking with persistence
            const now = Date.now();
            const currentDetections = metadata.faces || [];
            
            // Update tracked faces with new detections
            if (currentDetections.length > 0) {
              currentDetections.forEach((face: FaceDetection) => {
                const faceKey = face.name || "Unknown";
                
                trackedFacesRef.current.set(faceKey, {
                  detection: face,
                  lastSeen: now,
                  framesSinceUpdate: 0
                });
              });
            }
            
            // Increment framesSinceUpdate and remove stale faces
            const activeFaces: FaceDetection[] = [];
            trackedFacesRef.current.forEach((tracked, key) => {
              tracked.framesSinceUpdate++;
              
              // Keep face if it was seen recently OR hasn't been too many frames
              const timeSinceLastSeen = now - tracked.lastSeen;
              if (timeSinceLastSeen < FACE_TIMEOUT_MS && 
                  tracked.framesSinceUpdate < MAX_FRAMES_WITHOUT_UPDATE) {
                activeFaces.push(tracked.detection);
              } else {
                // Remove stale face
                trackedFacesRef.current.delete(key);
              }
            });
            
            // Update displayed faces with persistent tracking
            setFaces(activeFaces);
            
            // Log new faces (only when actually detected, not from persistence)
            if (currentDetections.length > 0) {
              const currentNames = new Set<string>(
                currentDetections.map((f: FaceDetection) => f.name || "Unknown")
              );
              const previousNames = lastDetectedNamesRef.current;
              
              currentDetections.forEach((face: FaceDetection) => {
                const name = face.name || "Unknown";
                
                if (!previousNames.has(name)) {
                  const newLog: DetectionLog = {
                    id: `${Date.now()}-${Math.random()}`,
                    name: name,
                    timestamp: new Date(),
                    cameraName: currentCameraName,
                    score: face.score,
                  };
                  
                  setDetectionLogs(prev => [...prev, newLog]);
                }
              });
              
              lastDetectedNamesRef.current = currentNames;
              
              // Clear names that are no longer detected
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
      
      // Handle JSON messages (status updates, errors)
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
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stop" }));
      }
      ws.close();
    };
  }, [selectedCamera, currentCameraName]);

  // Draw detections (boxes + names)
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.complete) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = img.naturalWidth || 640;
    canvas.height = img.naturalHeight || 480;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 3;
    ctx.font = "bold 18px Arial";

    faces.forEach((f) => {
      const [x, y, w, h] = f.box;
      
      ctx.strokeRect(x, y, w, h);
      
      const name = f.name || "Unknown";
      const textMetrics = ctx.measureText(name);
      const textHeight = 20;
      const padding = 5;
      
      ctx.fillStyle = "rgba(0, 255, 0, 0.8)";
      ctx.fillRect(
        x,
        y - textHeight - padding,
        textMetrics.width + padding * 2,
        textHeight + padding
      );
      
      ctx.fillStyle = "#000";
      ctx.fillText(name, x + padding, y - padding);
    });
  }, [faces, imgRef.current?.src]);

  const handleCameraChange = (event: any) => {
    const newCamera = event.target.value;
    setSelectedCamera(newCamera);
    setFaces([]);
    lastDetectedNamesRef.current.clear();
    trackedFacesRef.current.clear(); // Clear tracked faces on camera change
  };

  const handleClearLogs = () => {
    setDetectionLogs([]);
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
            Detection Logs
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
            maxHeight: "300px", 
            overflowY: "auto",
            border: "1px solid #ddd",
            borderRadius: "8px",
            backgroundColor: "#fff",
            padding: 2
          }}
        >
          {detectionLogs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
              No detections logged yet. Faces will appear here when detected.
            </Typography>
          ) : (
            detectionLogs.map((log) => (
              <Box
                key={log.id}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px",
                  marginBottom: "8px",
                  backgroundColor: log.name === "Unknown" ? "#fff3cd" : "#d4edda",
                  borderRadius: "6px",
                  borderLeft: `4px solid ${log.name === "Unknown" ? "#ffc107" : "#28a745"}`,
                  transition: "all 0.2s",
                  "&:hover": {
                    transform: "translateX(4px)",
                    boxShadow: "0px 2px 8px rgba(0,0,0,0.1)"
                  }
                }}
              >
                <Box display="flex" alignItems="center" gap={2}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: log.name === "Unknown" ? "#ffc107" : "#28a745",
                      animation: "pulse 2s infinite"
                    }}
                  />
                  <Box>
                    <Typography variant="body1" fontWeight="bold" color="#333">
                      {log.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {log.cameraName}
                      {log.score && ` • Confidence: ${(log.score * 100).toFixed(1)}%`}
                    </Typography>
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
            ))
          )}
        </Box>
      </Paper>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </AdminMain>
  );
};

export default LiveVideo;