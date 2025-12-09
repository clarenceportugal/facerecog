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
  Alert,
} from "@mui/material";
import DeanMain from "./DeanMain";
import DeleteIcon from "@mui/icons-material/Delete";
import PersonOffIcon from "@mui/icons-material/PersonOff";
import PersonIcon from "@mui/icons-material/Person";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

type FaceDetection = {
  box: [number, number, number, number];
  name?: string | null;
  score?: number;
  has_schedule?: boolean;
  is_valid_schedule?: boolean;
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

type NoScheduleSession = {
  name: string;
  firstSeen: number;  // Timestamp when first detected
  lastSeen: number;   // Timestamp when last seen
  totalTimeSeconds: number;  // Total time present in seconds
  isPresent: boolean;  // Whether currently present
  timeInLogged: boolean;  // Whether time in has been logged
  timeOutLogged: boolean;  // Whether time out has been logged
  leftAt: number | null;  // Timestamp when they left
};

type DetectionLog = {
  id: string;
  name: string;
  timestamp: Date;
  cameraName: string;
  score?: number;
  type: 'detection' | 'left' | 'returned' | 'first_detected' | 'time_in' | 'time_out' | 'detected_no_schedule' | 'time_in_no_schedule' | 'time_out_no_schedule';
  details?: string;
  totalMinutes?: number;
  absenceMinutes?: number;
  has_schedule?: boolean;
  is_valid_schedule?: boolean;
};

const DeanLiveVideo: React.FC = () => {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  // ⚡ ZERO-LAG OPTIMIZATION: Store face data in refs to avoid re-renders
  const facesDataRef = useRef<FaceDetection[]>([]);
  const frameMetadataRef = useRef({ width: 1920, height: 1080 });
  const lastDetectedNamesRef = useRef<Set<string>>(new Set());
  const lastLogTimeRef = useRef<Map<string, number>>(new Map()); // Track last log time for each person
  const noScheduleSessionsRef = useRef<Map<string, NoScheduleSession>>(new Map()); // Track sessions for people without schedules
  
  const [faces, setFaces] = useState<FaceDetection[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("camera1");
  const [connectionStatus, setConnectionStatus] = useState<string>("Disconnected");
  const [detectionLogs, setDetectionLogs] = useState<DetectionLog[]>([]);
  const [currentCameraName, setCurrentCameraName] = useState<string>("Camera 1");

  const ABSENCE_TIMEOUT_SECONDS = 300;
  const DETECTION_LOG_INTERVAL_MS = 120000;
  const MAX_DETECTION_LOGS = 500; // ⚡ MEMORY OPTIMIZATION: Limit logs to prevent memory issues

  // Animation frame reference
  const animationFrameRef = useRef<number | null>(null);

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
            // ⚡ PRIORITY 1: Update video frame IMMEDIATELY (never block this)
            // ⚡ MEMORY OPTIMIZATION: Use direct blob URL creation with immediate cleanup
            const blob = new Blob([jpegData], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            
            if (imgRef.current) {
              const oldSrc = imgRef.current.src;
              // ⚡ MEMORY OPTIMIZATION: Revoke old URL immediately to free memory
              if (oldSrc && oldSrc.startsWith('blob:')) {
                // Use setTimeout to ensure old URL is revoked after new one is set
                setTimeout(() => URL.revokeObjectURL(oldSrc), 0);
              }
              imgRef.current.src = url;
            } else {
              // ⚡ MEMORY OPTIMIZATION: If no image element, revoke URL immediately
              URL.revokeObjectURL(url);
            }
            
            // ⚡ PRIORITY 2: Process face data (non-blocking, in next frame)
            requestAnimationFrame(() => {
              // Handle events
              if (metadata.events && metadata.events.length > 0) {
                const newLogs: DetectionLog[] = [];
                metadata.events.forEach((event: any) => {
                  const hasSchedule = event.has_schedule === true || (event.schedule !== null && event.schedule !== undefined);
                  const isValidSchedule = event.is_valid_schedule !== undefined 
                    ? event.is_valid_schedule 
                    : (hasSchedule && event.schedule?.isValidSchedule !== false);
                  
                  const eventLog: DetectionLog = {
                    id: `event-${Date.now()}-${Math.random()}`,
                    name: event.name,
                    timestamp: new Date(event.left_at || event.returned_at || event.timestamp || new Date()),
                    cameraName: currentCameraName,
                    type: event.type,
                    totalMinutes: event.total_minutes,
                    absenceMinutes: event.absence_minutes,
                    details: "",
                    has_schedule: hasSchedule,
                    is_valid_schedule: isValidSchedule
                  };

                  if (event.type === 'time_in') {
                    eventLog.details = `⏰ TIME IN logged - ${event.schedule?.courseCode || 'N/A'} (${event.schedule?.room || 'N/A'})`;
                  } else if (event.type === 'time_out') {
                    eventLog.details = `🚪 TIME OUT logged - Total: ${event.total_minutes} min | ${event.schedule?.courseCode || 'N/A'}`;
                  } else if (event.type === 'left') {
                    eventLog.details = `Left after being absent for 5 minutes. Total time present: ${event.total_minutes} min`;
                  } else if (event.type === 'returned') {
                    eventLog.details = `Returned after ${event.absence_minutes} minutes away`;
                  } else if (event.type === 'first_detected') {
                    eventLog.details = 'First time detected in this session';
                  } else if (event.type === 'detected_no_schedule') {
                    eventLog.details = 'Detected without scheduled class';
                  }

                  newLogs.push(eventLog);
                });
                
                if (newLogs.length > 0) {
                  // ⚡ MEMORY OPTIMIZATION: Limit logs to prevent memory overflow
                  setDetectionLogs(prev => {
                    const combined = [...prev, ...newLogs];
                    if (combined.length > MAX_DETECTION_LOGS) {
                      return combined.slice(-MAX_DETECTION_LOGS);
                    }
                    return combined;
                  });
                }
              }
              
              // ⚡ OPTIMIZATION: Update face data in ref (no re-render)
              const rawDetections = metadata.faces || [];
              const frameWidth = metadata.frame_width || 1920;
              const frameHeight = metadata.frame_height || 1080;
              
              // Store metadata
              frameMetadataRef.current = { width: frameWidth, height: frameHeight };
              
              // ⚡ FIX: Define scaledDetections in outer scope so it's accessible everywhere
              let scaledDetections: FaceDetection[] = [];
              
              // Scale boxes to match displayed video size
              if (imgRef.current && rawDetections.length > 0) {
                const displayWidth = imgRef.current.naturalWidth || frameWidth;
                const displayHeight = imgRef.current.naturalHeight || frameHeight;
                
                const scaleX = displayWidth / frameWidth;
                const scaleY = displayHeight / frameHeight;
                
                scaledDetections = rawDetections.map((face: FaceDetection) => {
                  const [x, y, w, h] = face.box;
                  return {
                    ...face,
                    // ⚡ EXPLICIT: Preserve schedule status for box coloring
                    has_schedule: face.has_schedule,
                    is_valid_schedule: face.is_valid_schedule,
                    box: [
                      Math.round(x * scaleX),
                      Math.round(y * scaleY),
                      Math.round(w * scaleX),
                      Math.round(h * scaleY)
                    ] as [number, number, number, number]
                  };
                });
                
                // ⚡ CRITICAL: Update ref immediately (no re-render, no lag)
                facesDataRef.current = scaledDetections;
                
                // ⚡ CRITICAL FIX: Update state ONLY when face count changes (prevent re-renders)
                // Use callback form to avoid stale closure
                setFaces(prevFaces => {
                  if (prevFaces.length !== scaledDetections.length) {
                    return scaledDetections;
                  }
                  return prevFaces; // No change - prevents re-render
                });
              } else {
                facesDataRef.current = [];
                setFaces(prevFaces => {
                  if (prevFaces.length > 0) {
                    return [];
                  }
                  return prevFaces; // No change - prevents re-render
                });
              }
              
              // 🕐 TRACK TIME IN/OUT FOR PEOPLE WITHOUT SCHEDULES
              const now = Date.now();
              const currentNames = new Set<string>(
                scaledDetections.map((f: FaceDetection) => f.name || "Unknown")
              );
              
              // Process people without schedules
              const noScheduleLogs: DetectionLog[] = [];
              
              // Update sessions for currently detected faces without schedules
              scaledDetections.forEach((face: FaceDetection) => {
                const name = face.name || "Unknown";
                const hasSchedule = face.has_schedule === true || (face.session?.schedule != null);
                
                // Only track if they don't have a schedule
                if (!hasSchedule) {
                  let session = noScheduleSessionsRef.current.get(name);
                  
                  if (!session) {
                    // First time detected - create session and log TIME IN
                    session = {
                      name: name,
                      firstSeen: now,
                      lastSeen: now,
                      totalTimeSeconds: 0,
                      isPresent: true,
                      timeInLogged: false,
                      timeOutLogged: false,
                      leftAt: null,
                    };
                    noScheduleSessionsRef.current.set(name, session);
                    
                    // Log TIME IN for person without schedule
                    noScheduleLogs.push({
                      id: `time-in-no-sched-${now}-${Math.random()}`,
                      name: name,
                      timestamp: new Date(now),
                      cameraName: currentCameraName,
                      score: face.score,
                      type: 'time_in_no_schedule',
                      details: '⏰ TIME IN (No Schedule)',
                      has_schedule: false,
                      is_valid_schedule: false,
                    });
                    
                    session.timeInLogged = true;
                    console.log(`⏰ [NO SCHEDULE] TIME IN logged for ${name}`);
                  } else {
                    // Update existing session
                    if (session.isPresent) {
                      // Update total time while present
                      const timeDiff = (now - session.lastSeen) / 1000; // Convert to seconds
                      session.totalTimeSeconds += timeDiff;
                    } else {
                      // They returned - mark as present again
                      session.isPresent = true;
                      const absenceMinutes = session.leftAt 
                        ? Math.round((now - session.leftAt) / 60000) 
                        : 0;
                      
                      noScheduleLogs.push({
                        id: `returned-no-sched-${now}-${Math.random()}`,
                        name: name,
                        timestamp: new Date(now),
                        cameraName: currentCameraName,
                        type: 'returned',
                        details: `Returned after ${absenceMinutes} minutes away (No Schedule)`,
                        absenceMinutes: absenceMinutes,
                        has_schedule: false,
                        is_valid_schedule: false,
                      });
                      
                      // Reset leftAt since they've returned
                      session.leftAt = null;
                      console.log(`👋 [NO SCHEDULE] ${name} RETURNED after ${absenceMinutes} min`);
                    }
                    session.lastSeen = now;
                  }
                }
              });
              
              // Check for people without schedules who have left (not detected for 5 minutes)
              noScheduleSessionsRef.current.forEach((session, name) => {
                if (session.isPresent && !currentNames.has(name)) {
                  const timeSinceLastSeen = (now - session.lastSeen) / 1000; // Convert to seconds
                  
                  if (timeSinceLastSeen >= ABSENCE_TIMEOUT_SECONDS) {
                    // Update total time before marking as left (add time from lastSeen to now)
                    session.totalTimeSeconds += timeSinceLastSeen;
                    
                    // Mark as left and log TIME OUT
                    session.isPresent = false;
                    session.leftAt = now;
                    
                    if (session.timeInLogged && !session.timeOutLogged) {
                      const totalMinutes = Math.round(session.totalTimeSeconds / 60);
                      
                      noScheduleLogs.push({
                        id: `time-out-no-sched-${now}-${Math.random()}`,
                        name: name,
                        timestamp: new Date(now),
                        cameraName: currentCameraName,
                        type: 'time_out_no_schedule',
                        details: `🚪 TIME OUT (No Schedule) - Total: ${totalMinutes} min`,
                        totalMinutes: totalMinutes,
                        has_schedule: false,
                        is_valid_schedule: false,
                      });
                      
                      session.timeOutLogged = true;
                      console.log(`🚪 [NO SCHEDULE] TIME OUT logged for ${name} - Total: ${totalMinutes} min`);
                    }
                  } else {
                    // Still within absence timeout - update total time while they're still considered present
                    session.totalTimeSeconds += (now - session.lastSeen) / 1000;
                    session.lastSeen = now;
                  }
                }
              });
              
              // Clean up old sessions (older than 1 hour after time out)
              const oneHourAgo = now - (60 * 60 * 1000);
              noScheduleSessionsRef.current.forEach((session, name) => {
                if (session.timeOutLogged && session.leftAt && session.leftAt < oneHourAgo) {
                  noScheduleSessionsRef.current.delete(name);
                }
              });
              
              // Add no-schedule logs
              if (noScheduleLogs.length > 0) {
                // ⚡ MEMORY OPTIMIZATION: Limit logs to prevent memory overflow
                setDetectionLogs(prev => {
                  const combined = [...prev, ...noScheduleLogs];
                  if (combined.length > MAX_DETECTION_LOGS) {
                    return combined.slice(-MAX_DETECTION_LOGS);
                  }
                  return combined;
                });
              }
              
              // Log new face detections (not events) - with 2 minute throttling
              if (scaledDetections.length > 0) {
                const previousNames = lastDetectedNamesRef.current;
                
                // ⚡ OPTIMIZED: Batch process detection logs to reduce state updates
                const logsToAdd: DetectionLog[] = [];
                scaledDetections.forEach((face: FaceDetection) => {
                  const name = face.name || "Unknown";
                  const lastLogTime = lastLogTimeRef.current.get(name) || 0;
                  const timeSinceLastLog = now - lastLogTime;
                  
                  // Log if first time detected OR if 2 minutes have passed since last log
                  if (!previousNames.has(name) || timeSinceLastLog >= DETECTION_LOG_INTERVAL_MS) {
                    // ⚡ OPTIMIZED: Quick schedule check (cached)
                    const hasSchedule = face.has_schedule === true || (face.session?.schedule != null);
                    const isValidSchedule = face.is_valid_schedule ?? (hasSchedule && face.session?.schedule?.isValidSchedule !== false);
                    
                    logsToAdd.push({
                      id: `${now}-${Math.random()}`,
                      name: name,
                      timestamp: new Date(now),
                      cameraName: currentCameraName,
                      score: face.score,
                      type: 'detection',
                      details: face.session ? `Total time: ${face.session.total_minutes.toFixed(1)} min` : undefined,
                      has_schedule: hasSchedule,
                      is_valid_schedule: isValidSchedule
                    });
                    
                    lastLogTimeRef.current.set(name, now);
                  }
                });
                
                // ⚡ OPTIMIZED: Single state update for all logs
                if (logsToAdd.length > 0) {
                  // ⚡ MEMORY OPTIMIZATION: Limit logs to prevent memory overflow
                  setDetectionLogs(prev => {
                    const combined = [...prev, ...logsToAdd];
                    if (combined.length > MAX_DETECTION_LOGS) {
                      return combined.slice(-MAX_DETECTION_LOGS);
                    }
                    return combined;
                  });
                }
                
                lastDetectedNamesRef.current = currentNames;
              } else {
                lastDetectedNamesRef.current.clear();
              }
            });
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
        
        if (msg.error || msg.status === 'error') {
          console.error(`❌ Error from ${msg.cameraId}:`, msg.error);
          const errorMsg = msg.error?.includes('FFmpeg is not installed') 
            ? 'FFmpeg not found. Please install FFmpeg and add it to your system PATH.'
            : msg.error || 'Unknown error';
          setConnectionStatus(`Error: ${errorMsg}`);
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
        ws.close();
      }
      // ⚡ MEMORY OPTIMIZATION: Clean up all blob URLs
      if (imgRef.current && imgRef.current.src && imgRef.current.src.startsWith('blob:')) {
        URL.revokeObjectURL(imgRef.current.src);
      }
      setFaces([]);
      setDetectionLogs([]);
      setConnectionStatus("Disconnected");
      facesDataRef.current = [];
      lastDetectedNamesRef.current.clear();
      lastLogTimeRef.current.clear();
      noScheduleSessionsRef.current.clear();
      // ⚡ MEMORY OPTIMIZATION: Force garbage collection hint
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [selectedCamera, currentCameraName]);

  // ⚡ MEMORY OPTIMIZATION: Periodic cleanup of old logs
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      setDetectionLogs(prev => {
        // Keep only last MAX_DETECTION_LOGS entries
        if (prev.length > MAX_DETECTION_LOGS) {
          return prev.slice(-MAX_DETECTION_LOGS);
        }
        return prev;
      });
      
      // Clean up old sessions (older than 1 hour)
      const oneHourAgo = Date.now() - 3600000;
      noScheduleSessionsRef.current.forEach((session, name) => {
        if (session.firstSeen < oneHourAgo && !session.isPresent) {
          noScheduleSessionsRef.current.delete(name);
        }
      });
    }, 60000); // Run every minute

    return () => clearInterval(cleanupInterval);
  }, []);

  // ⚡ ULTRA-OPTIMIZED REAL-TIME RENDERING: Instant box following with zero lag
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    let isRunning = true;

    const ctx = canvas.getContext("2d", { 
      alpha: true,
      desynchronized: true, // Enable low-latency rendering
      willReadFrequently: false // Optimize for write-only operations
    });
    
    if (!ctx) return;

    // Pre-compile constants outside animation loop
    const GREEN_BOX = "#00ff00";
    const YELLOW_BOX = "#ffff00";
    const GREEN_BG = "rgba(0, 255, 0, 0.85)";
    const YELLOW_BG = "rgba(255, 255, 0, 0.85)";
    const BLACK_TEXT = "#000";
    const textHeight = 22;
    const padding = 6;
    const lineWidth = 3;

    // Pre-configure context (set once, not per frame)
    ctx.textBaseline = "top";
    ctx.lineWidth = lineWidth;
    ctx.font = "bold 16px Arial";

    const animate = () => {
      if (!isRunning) return;

      // ⚡ CRITICAL: Skip rendering if image not ready - prevents flicker
      if (!img.complete || img.naturalWidth === 0) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // ⚡ OPTIMIZATION: Only resize canvas when dimensions actually change
      const newWidth = img.naturalWidth;
      const newHeight = img.naturalHeight;
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        // Re-apply context settings after resize (canvas resize resets context)
        ctx.textBaseline = "top";
        ctx.lineWidth = lineWidth;
        ctx.font = "bold 16px Arial";
      }

      // ⚡ FASTEST CLEAR: Use clearRect (faster than fillRect for clearing)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // ⚡ READ FROM REF: Direct memory access, no React overhead
      const currentFaces = facesDataRef.current;
      
      if (currentFaces.length > 0) {
        // ⚡ ULTRA-OPTIMIZED: Pre-allocate arrays with exact size
        const greenBoxes: Array<{x: number, y: number, w: number, h: number, name: string, textWidth: number}> = [];
        const yellowBoxes: Array<{x: number, y: number, w: number, h: number, name: string, textWidth: number}> = [];
        
        // ⚡ SINGLE PASS: Classify and measure text in one loop
        for (let i = 0; i < currentFaces.length; i++) {
          const face = currentFaces[i];
          const [x, y, w, h] = face.box;
          
          // ⚡ FAST SCHEDULE CHECK: Simplified boolean logic
          const hasSchedule = face.has_schedule === true || (face.session?.schedule != null);
          // ⚡ ROOM VALIDATION: Only green if BOTH has schedule AND room matches (is_valid_schedule === true)
          // ⚡ CRITICAL: Only green if isValidSchedule is explicitly true (room must match)
          const isValidSchedule = face.is_valid_schedule === true;
          const isGreen = isValidSchedule && hasSchedule; // ✅ Green only if schedule exists AND room matches
          
          const name = face.name || "Unknown";
          
          // ⚡ INLINE: Measure text once and store
          const boxInfo = {
            x: x | 0, // Fast integer conversion
            y: y | 0,
            w: w | 0,
            h: h | 0,
            name,
            textWidth: ctx.measureText(name).width
          };
          
          // ⚡ DIRECT PUSH: No intermediate checks
          if (isGreen) {
            greenBoxes.push(boxInfo);
          } else {
            yellowBoxes.push(boxInfo);
          }
        }
        
        // ⚡ BATCH RENDERING: Minimize context state changes
        // Draw all green boxes in batches (strokeStyle set once for all)
        if (greenBoxes.length > 0) {
          ctx.strokeStyle = GREEN_BOX;
          ctx.beginPath(); // Begin path for all green boxes
          for (let i = 0; i < greenBoxes.length; i++) {
            const box = greenBoxes[i];
            ctx.rect(box.x, box.y, box.w, box.h);
          }
          ctx.stroke(); // Stroke all at once
          
          ctx.fillStyle = GREEN_BG;
          for (let i = 0; i < greenBoxes.length; i++) {
            const box = greenBoxes[i];
            const labelY = (box.y - textHeight - padding) | 0;
            const labelW = (box.textWidth + padding * 2) | 0;
            ctx.fillRect(box.x, labelY, labelW, textHeight + padding);
          }
          
          ctx.fillStyle = BLACK_TEXT;
          for (let i = 0; i < greenBoxes.length; i++) {
            const box = greenBoxes[i];
            const labelY = (box.y - textHeight - padding) | 0;
            ctx.fillText(box.name, box.x + padding, labelY + 2);
          }
        }
        
        // Draw all yellow boxes in batches
        if (yellowBoxes.length > 0) {
          ctx.strokeStyle = YELLOW_BOX;
          ctx.beginPath(); // Begin path for all yellow boxes
          for (let i = 0; i < yellowBoxes.length; i++) {
            const box = yellowBoxes[i];
            ctx.rect(box.x, box.y, box.w, box.h);
          }
          ctx.stroke(); // Stroke all at once
          
          ctx.fillStyle = YELLOW_BG;
          for (let i = 0; i < yellowBoxes.length; i++) {
            const box = yellowBoxes[i];
            const labelY = (box.y - textHeight - padding) | 0;
            const labelW = (box.textWidth + padding * 2) | 0;
            ctx.fillRect(box.x, labelY, labelW, textHeight + padding);
          }
          
          ctx.fillStyle = BLACK_TEXT;
          for (let i = 0; i < yellowBoxes.length; i++) {
            const box = yellowBoxes[i];
            const labelY = (box.y - textHeight - padding) | 0;
            ctx.fillText(box.name, box.x + padding, labelY + 2);
          }
        }
      }

      // ⚡ MAXIMUM FPS: No throttling - sync to display refresh rate
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // ⚡ START IMMEDIATELY: Begin animation loop
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      isRunning = false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, []); // ⚡ ZERO DEPS: Pure ref-based rendering, no React re-renders

  const handleCameraChange = (event: any) => {
    const newCamera = event.target.value;
    setSelectedCamera(newCamera);
    setFaces([]);
    facesDataRef.current = [];
    lastDetectedNamesRef.current.clear();
    lastLogTimeRef.current.clear();
    noScheduleSessionsRef.current.clear();
  };

  const handleClearLogs = () => {
    // ⚡ MEMORY OPTIMIZATION: Clear logs and force cleanup
    setDetectionLogs([]);
    lastLogTimeRef.current.clear();
    noScheduleSessionsRef.current.clear();
    // Force garbage collection hint
    if (window.gc) {
      window.gc();
    }
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
      case 'time_in_no_schedule':
        return <AccessTimeIcon />;
      case 'time_out':
      case 'time_out_no_schedule':
        return <PersonOffIcon />;
      default:
        return null;
    }
  };

  const getLogColor = (log: DetectionLog) => {
    if (log.type === 'detection') {
      const hasSchedule = log.has_schedule === true;
      const isValidSchedule = log.is_valid_schedule !== undefined 
        ? log.is_valid_schedule 
        : hasSchedule;
      
      if (isValidSchedule && hasSchedule) {
        return { bg: '#e8f5e9', border: '#4caf50' }; // Green
      } else {
        return { bg: '#fff9c4', border: '#fbc02d' }; // Yellow
      }
    }
    
    switch (log.type) {
      case 'left':
      case 'time_out':
        return { bg: '#ffebee', border: '#f44336' }; // Red
      case 'time_out_no_schedule':
      case 'time_in_no_schedule':
        return { bg: '#fff9c4', border: '#fbc02d' }; // Yellow - No schedule
      case 'returned':
        return { bg: '#e3f2fd', border: '#2196f3' }; // Blue
      case 'first_detected':
      case 'time_in':
        return { bg: '#e8f5e9', border: '#4caf50' }; // Green - With schedule
      default:
        return { bg: '#d4edda', border: '#28a745' };
    }
  };

  return (
    <DeanMain>
      <Box
        sx={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center", 
          mb: 4,
          padding: "24px",
          backgroundColor: "#fff",
          borderRadius: "12px",
          boxShadow: "0px 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight="bold" color="#1a1a1a" mb={1}>
          Live Face Recognition Feed
        </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box
              sx={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                backgroundColor: connectionStatus.includes("Error") 
                  ? "#f44336" 
                  : connectionStatus === "Disconnected"
                  ? "#ff9800"
                  : "#4caf50",
                animation: connectionStatus !== "Disconnected" && !connectionStatus.includes("Error") 
                  ? "pulse 2s infinite" 
                  : "none",
              }}
            />
            <Typography 
              variant="body2" 
              color={connectionStatus.includes("Error") ? "error.main" : connectionStatus === "Disconnected" ? "#ff9800" : "success.main"} 
              fontWeight="500"
            >
              {connectionStatus}
            </Typography>
          </Box>
        </Box>

        <FormControl 
          variant="outlined" 
          size="small" 
          sx={{ 
            minWidth: 220,
            backgroundColor: "#fff",
            "& .MuiOutlinedInput-root": {
              borderRadius: "8px",
            }
          }}
        >
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

      <Box
        sx={{
          display: "flex",
          gap: 2, 
          justifyContent: "center", 
          mb: 3, 
          maxWidth: "1200px", 
          margin: "0 auto 24px", 
          flexWrap: "wrap" 
        }}
      >
        <Alert 
          severity="info" 
          sx={{ 
            flex: 1,
            minWidth: "300px",
              borderRadius: "10px",
            backgroundColor: "#e3f2fd",
            "& .MuiAlert-icon": {
              color: "#1976d2",
            }
          }}
        >
          <Typography variant="body2" component="span">
            <strong>Detection:</strong> Logs every {DETECTION_LOG_INTERVAL_MS / 60000} minutes | <strong>Absence:</strong> Marked as "left" after {ABSENCE_TIMEOUT_SECONDS / 60} minutes
          </Typography>
        </Alert>
        <Box
          sx={{
            display: "flex", 
            gap: 3, 
            alignItems: "center", 
            backgroundColor: "#f8f9fa", 
            padding: "12px 20px", 
            borderRadius: "10px",
            boxShadow: "0px 2px 4px rgba(0,0,0,0.05)",
            border: "1px solid #e0e0e0",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box 
              sx={{ 
                width: 24, 
                height: 24, 
                backgroundColor: "#00ff00", 
                border: "3px solid #00ff00",
                borderRadius: "4px",
                boxShadow: "0px 2px 4px rgba(0,255,0,0.3)",
              }} 
            />
            <Typography variant="body2" fontWeight="500" color="#333">
              <strong>Green:</strong> Within scheduled time frame
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box
              sx={{
                width: 24, 
                height: 24, 
                backgroundColor: "#ffff00", 
                border: "3px solid #ffff00",
                borderRadius: "4px",
                boxShadow: "0px 2px 4px rgba(255,255,0,0.3)",
              }} 
            />
            <Typography variant="body2" fontWeight="500" color="#333">
              <strong>Yellow:</strong> Outside time frame or no schedule
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box 
      sx={{
          position: "relative", 
          width: "100%", 
          maxWidth: "2560px", 
          margin: "0 auto",
          backgroundColor: "#1a1a1a",
          borderRadius: "16px",
          padding: "16px",
          boxShadow: "0px 8px 24px rgba(0,0,0,0.3)",
          minHeight: "400px",
        display: "flex",
          alignItems: "center",
          justifyContent: "center",
      }}
    >
      <Box
        sx={{
            position: "relative",
            width: "100%",
            height: "auto",
            minHeight: "400px",
            backgroundColor: "#000",
            borderRadius: "12px",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "inset 0px 0px 20px rgba(0,0,0,0.5)",
          }}
        >
          {connectionStatus === "Disconnected" || connectionStatus.includes("Error") ? (
                    <Box
                      sx={{
                        display: "flex",
                flexDirection: "column",
                        alignItems: "center",
                justifyContent: "center",
                color: "#666",
                padding: "40px",
              }}
            >
              <Box
                sx={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "50%",
                  border: "3px solid #333",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "16px",
                }}
              >
                          <Box
                            sx={{
                              width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    backgroundColor: "#333",
                            }}
                          />
                        </Box>
              <Typography variant="h6" color="#888" fontWeight="500">
                {connectionStatus.includes("Error") ? "Connection Error" : "Waiting for Stream"}
              </Typography>
              <Typography variant="body2" color="#666" mt={1}>
                {connectionStatus.includes("Error") 
                  ? "Please check your connection and try again" 
                  : "Select a camera to start streaming"}
              </Typography>
            </Box>
          ) : null}
          
          <img
            ref={imgRef}
            alt="Live Stream"
            style={{
              width: "100%",
              height: "auto",
              maxHeight: "85vh",
              objectFit: "contain",
              borderRadius: "8px",
              display: connectionStatus === "Disconnected" || connectionStatus.includes("Error") ? "none" : "block",
            }}
          />
          
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              borderRadius: "8px",
              display: connectionStatus === "Disconnected" || connectionStatus.includes("Error") ? "none" : "block",
            }}
          />
          
          {faces.length > 0 && (
            <Box
              sx={{
                position: "absolute",
                top: 16,
                right: 16,
                backgroundColor: "rgba(0, 255, 0, 0.95)",
                color: "#000",
                padding: "10px 20px",
                borderRadius: "12px",
                fontWeight: "bold",
                fontSize: "15px",
                boxShadow: "0px 4px 12px rgba(0,255,0,0.3)",
                zIndex: 10,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Box
                              sx={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: "#000",
                  animation: "pulse 2s infinite",
                }}
              />
              {faces.length} Face{faces.length !== 1 ? "s" : ""} Detected
            </Box>
          )}
        </Box>
                    </Box>

      <Paper 
        elevation={3} 
        sx={{ 
          mt: 4, 
          p: 3, 
          maxWidth: "1200px", 
          margin: "32px auto 0",
          backgroundColor: "#fff",
          borderRadius: "16px",
          boxShadow: "0px 4px 16px rgba(0,0,0,0.1)",
        }}
      >
        <Box 
          display="flex" 
          justifyContent="space-between" 
          alignItems="center" 
          mb={3}
          pb={2}
          borderBottom="2px solid #e0e0e0"
        >
          <Typography variant="h6" fontWeight="bold" color="#1a1a1a">
            Detection & Activity Logs
          </Typography>
          <Box display="flex" alignItems="center" gap={2}>
            <Chip 
              label={`Total: ${detectionLogs.length}`} 
              color="primary" 
              size="medium"
              sx={{
                fontWeight: "bold",
                fontSize: "0.875rem",
              }}
            />
            <IconButton 
              onClick={handleClearLogs} 
              size="medium" 
              color="error"
              title="Clear all logs"
              sx={{
                backgroundColor: "rgba(244, 67, 54, 0.1)",
                "&:hover": {
                  backgroundColor: "rgba(244, 67, 54, 0.2)",
                }
              }}
            >
              <DeleteIcon />
            </IconButton>
          </Box>
        </Box>

        <Box 
          sx={{ 
            maxHeight: "500px", 
            overflowY: "auto",
            border: "1px solid #e0e0e0",
            borderRadius: "12px",
            backgroundColor: "#fafafa",
            padding: 2,
            "&::-webkit-scrollbar": {
              width: "8px",
            },
            "&::-webkit-scrollbar-track": {
              backgroundColor: "#f1f1f1",
              borderRadius: "4px",
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: "#888",
              borderRadius: "4px",
              "&:hover": {
                backgroundColor: "#555",
              },
            },
          }}
        >
          {detectionLogs.length === 0 ? (
                          <Box
                            sx={{
                              display: "flex",
                flexDirection: "column",
                              alignItems: "center",
                justifyContent: "center",
                py: 6,
                            }}
                          >
                            <Box
                              sx={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  backgroundColor: "#e0e0e0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mb: 2,
                }}
              >
                <AccessTimeIcon sx={{ fontSize: 32, color: "#999" }} />
              </Box>
              <Typography variant="body1" color="text.secondary" fontWeight="500">
                No activity logged yet
              </Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>
                Events will appear here when detected
              </Typography>
            </Box>
          ) : (
            [...detectionLogs].reverse().map((log) => {
              const colors = getLogColor(log);
              return (
                <Box
                  key={log.id}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "16px",
                    marginBottom: "10px",
                    backgroundColor: colors.bg,
                    borderRadius: "10px",
                    borderLeft: `5px solid ${colors.border}`,
                    transition: "all 0.3s ease",
                    boxShadow: "0px 2px 4px rgba(0,0,0,0.05)",
                                "&:hover": {
                      transform: "translateX(6px)",
                      boxShadow: "0px 4px 12px rgba(0,0,0,0.15)",
                    },
                    "&:last-child": {
                      marginBottom: 0,
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
                        {log.type === 'time_in_no_schedule' && ' ⏰'}
                        {log.type === 'time_out_no_schedule' && ' 🚪'}
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
          0%, 100% { 
            opacity: 1; 
            transform: scale(1);
          }
          50% { 
            opacity: 0.6; 
            transform: scale(1.1);
          }
        }
      `}</style>
    </DeanMain>
  );
};

export default DeanLiveVideo;
