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
  is_valid_schedule?: boolean;  // ✅ Added: Green if true, Yellow if false
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
  has_schedule?: boolean;  // For determining log color based on schedule
  is_valid_schedule?: boolean;  // For determining log color (green/yellow)
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

  // ⚡ INSTANT DISPLAY - Boxes appear immediately, even for distant faces
  const FACE_TIMEOUT_MS = 0; // No timeout - instant removal when not detected
  const ABSENCE_TIMEOUT_SECONDS = 300; // 5 minutes
  // 0.85 = Very fast following (almost instant) for immediate response
  const SMOOTHING_FACTOR = 0.85; 
  const NEW_FACE_SMOOTHING_FACTOR = 1.0; // New faces appear instantly (no delay)
  const DETECTION_LOG_INTERVAL_MS = 120000; // 2 minutes in milliseconds

  // Refs for smooth animation loop
  const animationFrameRef = useRef<number | null>(null);
  const targetFacesRef = useRef<FaceDetection[]>([]);
  const displayedFacesRef = useRef<FaceDetection[]>([]);
  const facesRef = useRef<FaceDetection[]>([]); // ⚡ Use ref to avoid state updates triggering re-renders
  const frameCountRef = useRef<number>(0); // ⚡ Frame counter for throttling

  const smoothBox = (
    currentBox: [number, number, number, number] | undefined,
    targetBox: [number, number, number, number],
    smoothingFactor: number
  ): [number, number, number, number] => {
    if (!currentBox) {
      return targetBox;
    }
    
    // Smooth interpolation for buttery movement
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
          // ⏱️ PROFILING: Start timing frame processing
          const frameReceiveTime = performance.now();
          
          const buffer = new Uint8Array(event.data);
          const metadataLen = new DataView(buffer.buffer).getUint32(0, false);
          const metadataBytes = buffer.slice(4, 4 + metadataLen);
          const metadataStr = new TextDecoder().decode(metadataBytes);
          const metadata = JSON.parse(metadataStr);
          const jpegData = buffer.slice(4 + metadataLen);
          
          if (metadata.cameraId === selectedCamera) {
            // ⚡ PRIORITY: Update video frame FIRST (non-blocking) - this must never lag
            const blob = new Blob([jpegData], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            
            if (imgRef.current) {
              // Revoke old URL immediately to free memory
              const oldSrc = imgRef.current.src;
              if (oldSrc && oldSrc.startsWith('blob:')) {
                URL.revokeObjectURL(oldSrc);
              }
              
              // ⚡ IMMEDIATE: Set src immediately (video frame updates first, never blocked)
              imgRef.current.src = url;
            }
            
            // ⚡ OPTIMIZED: Process face detection in next frame to prevent blocking video
            // This ensures video feed stays smooth even with multiple faces
            requestAnimationFrame(() => {
            // Handle events from Python (ALL event types)
            if (metadata.events && metadata.events.length > 0) {
              metadata.events.forEach((event: any) => {
                // Get schedule status from event (if available)
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
            const rawDetections = metadata.faces || [];
            
            // Scale bounding boxes from frame resolution to displayed video size
            const frameWidth = metadata.frame_width || 1920;  // Default to 1920 (Full HD) if not provided - matches camera
            const frameHeight = metadata.frame_height || 1080;  // Default to 1080 (Full HD) if not provided - matches camera
            
            // Scale boxes to match displayed video size
            const currentDetections = rawDetections.map((face: FaceDetection) => {
              if (!imgRef.current) return face;
              
              const displayWidth = imgRef.current.naturalWidth || frameWidth;
              const displayHeight = imgRef.current.naturalHeight || frameHeight;
              
              // Calculate scale factors
              const scaleX = displayWidth / frameWidth;
              const scaleY = displayHeight / frameHeight;
              
              // Scale the bounding box
              const [x, y, w, h] = face.box;
              return {
                ...face,
                box: [
                  Math.round(x * scaleX),
                  Math.round(y * scaleY),
                  Math.round(w * scaleX),
                  Math.round(h * scaleY)
                ] as [number, number, number, number]
              };
            });
            
            const currentDetectionNames = new Set<string>(
              currentDetections.map((f: FaceDetection) => f.name || "Unknown")
            );

            // If no faces detected from server, immediately clear all (no delay)
            if (currentDetections.length === 0) {
              if (trackedFacesRef.current.size > 0) {
                trackedFacesRef.current.clear();
                smoothedBoxesRef.current.clear();
                // ⚡ FIX: Update both ref and state to ensure detection clears properly
                facesRef.current = [];
                  setFaces([]);
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
              const hasNewFaces = Array.from(currentDetectionNames).some(key => !previousFaceKeys.has(key));
              
              // Remove faces immediately
              facesToRemove.forEach(key => {
                trackedFacesRef.current.delete(key);
                smoothedBoxesRef.current.delete(key);
              });

              // ⚡ INSTANT BOX FOLLOWING: No smoothing delay - boxes follow faces immediately
              const activeFaces: FaceDetection[] = [];
              const faceCount = currentDetections.length;
              
              // ⚡ ULTRA-FAST: Direct assignment for instant box following (no smoothing delay)
              // Use minimal smoothing only for visual polish, but prioritize instant following
              const useMinimalSmoothing = faceCount <= 2; // Only smooth for 1-2 faces
              
              for (let i = 0; i < faceCount; i++) {
                const face = currentDetections[i];
                const faceKey = face.name || "Unknown";
                
                // ⚡ INSTANT FOLLOWING: Use target box directly for immediate response
                // Minimal smoothing only when very few faces for visual polish
                let finalBox = face.box;
                if (useMinimalSmoothing) {
                const existingSmoothed = smoothedBoxesRef.current.get(faceKey);
                  if (existingSmoothed) {
                    // Very fast interpolation (0.95 = almost instant) for minimal delay
                    finalBox = smoothBox(existingSmoothed.box, face.box, 0.95);
                  }
                }
                
                // ⚡ OPTIMIZED: Update refs with minimal object creation
                smoothedBoxesRef.current.set(faceKey, {
                  box: finalBox,
                  targetBox: face.box
                });
                
                // ⚡ OPTIMIZED: Reuse face object, only update box (faster than spreading)
                const trackedFace = trackedFacesRef.current.get(faceKey);
                if (trackedFace) {
                  trackedFace.detection.box = finalBox;
                  trackedFace.lastSeen = now;
                  trackedFace.framesSinceUpdate = 0;
                } else {
                trackedFacesRef.current.set(faceKey, {
                    detection: { ...face, box: finalBox },
                  lastSeen: now,
                  framesSinceUpdate: 0
                });
                }
                
                // ⚡ OPTIMIZED: Reuse face object if possible (faster than spreading)
                activeFaces.push(trackedFace?.detection || { ...face, box: finalBox });
              }

              // ⚡ INSTANT UPDATE: Update ref immediately for zero-delay box following
              facesRef.current = activeFaces;
              frameCountRef.current++;

              // ⚡ ULTRA-OPTIMIZED THROTTLING: Minimal state updates for maximum performance
              const throttleRate = faceCount > 4 ? 3 : (faceCount > 2 ? 2 : 1);  // More frequent updates for accuracy
              
              // ⚡ ULTRA-OPTIMIZED: Quick name comparison (minimal operations)
              let namesChanged = false;
              if (activeFaces.length !== faces.length) {
                namesChanged = true;
              } else if (activeFaces.length > 0 && faces.length > 0) {
                // ⚡ OPTIMIZED: Quick check - compare first face name only (fastest)
                // If first name matches and length matches, likely same faces
                namesChanged = activeFaces[0].name !== faces[0].name;
                // Only do full comparison if first name differs (rare case)
                if (!namesChanged && activeFaces.length > 1) {
                  const activeNames = new Set(activeFaces.map(f => f.name));
                  const currentNames = new Set(faces.map(f => f.name));
                  namesChanged = activeNames.size !== currentNames.size;
                }
              }
              
              // ⚡ OPTIMIZED: Always update ref immediately, state update throttled for performance
              // Update state only when necessary or throttled (but more frequently for accuracy)
              if (frameCountRef.current % throttleRate === 0 || namesChanged) {
                // Use microtask for smoother updates
                Promise.resolve().then(() => {
                  setFaces(activeFaces);
                });
              }
            }
            
            // Log new face detections (not events) - with 2 minute throttling
            if (currentDetections.length > 0) {
              const currentNames = new Set<string>(
                currentDetections.map((f: FaceDetection) => f.name || "Unknown")
              );
              const previousNames = lastDetectedNamesRef.current;
              const now = Date.now();
              
              // ⚡ OPTIMIZED: Batch process detection logs to reduce state updates
              const logsToAdd: DetectionLog[] = [];
              currentDetections.forEach((face: FaceDetection) => {
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
                setDetectionLogs(prev => [...prev, ...logsToAdd]);
              }
              
              lastDetectedNamesRef.current = currentNames;
              
              if (currentDetections.length === 0) {
                lastDetectedNamesRef.current.clear();
              }
            }
            }); // End of requestAnimationFrame - face processing deferred to not block video
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
          // Show user-friendly error message
          const errorMsg = msg.error.includes('FFmpeg is not installed') 
            ? 'FFmpeg not found. Please install FFmpeg and add it to your system PATH.'
            : msg.error;
          setConnectionStatus(`Error: ${errorMsg}`);
          return;
        }
        
        if (msg.status === 'error') {
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

  // 🎨 ULTRA-OPTIMIZED ANIMATION LOOP - Maximum performance for many faces
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    // Store displayed boxes for smooth interpolation
    const displayedBoxes = new Map<string, [number, number, number, number]>();
    let isRunning = true;
    let lastRenderTime = 0;
    let frameSkipCounter = 0;

    const animate = () => {
      if (!isRunning) return;

      const now = performance.now();
      const currentFaces = facesRef.current.length > 0 ? facesRef.current : faces;
      const faceCount = currentFaces.length;
      
      // ⚡ OPTIMIZED THROTTLING: Balanced throttling for smooth rendering
      // Less aggressive throttling to ensure boxes follow smoothly
      // ⚡ ULTRA-OPTIMIZED THROTTLING: Maximum performance for many faces
      const RENDER_THROTTLE_MS = faceCount > 6 ? 20 : (faceCount > 4 ? 16 : (faceCount > 2 ? 12 : 8)); // 50fps for 6+, 60fps for 4+, 83fps for 2+, 125fps for 1
      
      // ⚡ MINIMAL FRAME SKIPPING: Only skip when extremely many faces (8+)
      if (faceCount > 7) {
        frameSkipCounter++;
        if (frameSkipCounter % 4 !== 0) { // Skip 3 out of 4 frames when 8+ faces (25% render rate)
          animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      } else {
        frameSkipCounter = 0;
      }
      
      // ⚡ OPTIMIZED RENDERING: Adaptive throttling for smooth box following
      if (now - lastRenderTime < RENDER_THROTTLE_MS && faceCount > 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      lastRenderTime = now;

      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx || !img.complete) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // Update canvas size only if changed
      const newWidth = img.naturalWidth || 1920;
      const newHeight = img.naturalHeight || 1080;
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // ⚡ ULTRA-OPTIMIZED: Draw faces with maximum performance
      if (faceCount > 0) {
        // ⚡ PRE-COMPUTE: Set styles once, cache colors
      ctx.textBaseline = "top";
        ctx.lineWidth = 3;
        
        // ⚡ ADAPTIVE QUALITY: Always show labels for all faces (user needs to see names)
        ctx.font = "bold 16px Arial"; // Always set font for labels
        
        const textHeight = 22;
        const padding = 6;
        
        // ⚡ PRE-COMPUTE COLORS: Cache color strings to avoid repeated string operations
        const GREEN_BOX = "#00ff00";
        const YELLOW_BOX = "#ffff00";
        const GREEN_BG = "rgba(0, 255, 0, 0.85)";
        const YELLOW_BG = "rgba(255, 255, 0, 0.85)";
        const BLACK_TEXT = "#000";

        // ⚡ ULTRA-OPTIMIZED: Batch drawing operations for maximum performance
        // Pre-compute all box data before drawing (reduces canvas state changes)
        const boxData: Array<{
          x: number; y: number; w: number; h: number;
          isGreen: boolean;
          name?: string;
          textWidth?: number;
        }> = [];
        
        for (let i = 0; i < faceCount; i++) {
          const f = currentFaces[i];
          const faceKey = f.name || "Unknown";
        const [x, y, w, h] = f.box;
        
          // Store for next frame (no interpolation needed - already processed)
          displayedBoxes.set(faceKey, f.box);

          // ⚡ ULTRA-SIMPLIFIED: Minimal schedule check (cached)
          const isGreen = f.is_valid_schedule === true || f.session?.schedule?.isValidSchedule === true;
          
          const boxInfo: any = {
            x: Math.round(x),
            y: Math.round(y),
            w: Math.round(w),
            h: Math.round(h),
            isGreen
          };
          
          // Always include name and text width for labels (always show names)
          const name = f.name || "Unknown";
          boxInfo.name = name;
          boxInfo.textWidth = ctx.measureText(name).width;
          
          boxData.push(boxInfo);
        }
        
        // ⚡ ULTRA-OPTIMIZED: Direct drawing without grouping (faster for small number of faces)
        // For better performance, draw directly without grouping when face count is low
        if (faceCount <= 4) {
          // Direct drawing (faster for few faces)
          for (const box of boxData) {
            ctx.strokeStyle = box.isGreen ? GREEN_BOX : YELLOW_BOX;
            ctx.strokeRect(box.x, box.y, box.w, box.h);
            
            // Always show labels for all faces
            if (box.name) {
              const labelY = box.y - textHeight - padding;
              const labelW = Math.round(box.textWidth! + padding * 2);
              
              ctx.fillStyle = box.isGreen ? GREEN_BG : YELLOW_BG;
              ctx.fillRect(box.x, labelY, labelW, textHeight + padding);
              
              ctx.fillStyle = BLACK_TEXT;
              ctx.fillText(box.name, box.x + padding, labelY + 2);
            }
          }
        } else {
          // Grouped drawing for many faces (minimizes state changes)
          const greenBoxes: typeof boxData = [];
          const yellowBoxes: typeof boxData = [];
          
          for (const box of boxData) {
            if (box.isGreen) {
              greenBoxes.push(box);
            } else {
              yellowBoxes.push(box);
            }
          }
          
          // Draw all green boxes first (single state change)
          if (greenBoxes.length > 0) {
            ctx.strokeStyle = GREEN_BOX;
            for (const box of greenBoxes) {
              ctx.strokeRect(box.x, box.y, box.w, box.h);
            }
            
            // Always draw green labels
            ctx.fillStyle = GREEN_BG;
            for (const box of greenBoxes) {
              if (box.name) {
                const labelY = box.y - textHeight - padding;
                const labelW = Math.round(box.textWidth! + padding * 2);
                ctx.fillRect(box.x, labelY, labelW, textHeight + padding);
              }
            }
            ctx.fillStyle = BLACK_TEXT;
            for (const box of greenBoxes) {
              if (box.name) {
                const labelY = box.y - textHeight - padding;
                ctx.fillText(box.name, box.x + padding, labelY + 2);
              }
            }
          }
          
          // Draw all yellow boxes (single state change)
          if (yellowBoxes.length > 0) {
            ctx.strokeStyle = YELLOW_BOX;
            for (const box of yellowBoxes) {
              ctx.strokeRect(box.x, box.y, box.w, box.h);
            }
            
            // Always draw yellow labels
            ctx.fillStyle = YELLOW_BG;
            for (const box of yellowBoxes) {
              if (box.name) {
                const labelY = box.y - textHeight - padding;
                const labelW = Math.round(box.textWidth! + padding * 2);
                ctx.fillRect(box.x, labelY, labelW, textHeight + padding);
              }
            }
            ctx.fillStyle = BLACK_TEXT;
            for (const box of yellowBoxes) {
              if (box.name) {
                const labelY = box.y - textHeight - padding;
                ctx.fillText(box.name, box.x + padding, labelY + 2);
              }
            }
          }
        }

        // ⚡ LAZY CLEANUP: Only clean up when really needed
        if (displayedBoxes.size > faceCount * 3) {
          const currentNames = new Set(currentFaces.map(f => f.name || "Unknown"));
          displayedBoxes.forEach((_, key) => {
            if (!currentNames.has(key)) {
              displayedBoxes.delete(key);
            }
          });
        }
      } else {
        displayedBoxes.clear();
      }

      // Continue animation loop
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []); // ⚡ Empty deps - animation loop reads from ref, not state (prevents re-renders)

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

  const getLogColor = (log: DetectionLog) => {
    // For detection logs, use schedule status to determine color (match box color)
    if (log.type === 'detection') {
      const hasSchedule = log.has_schedule === true;
      const isValidSchedule = log.is_valid_schedule !== undefined 
        ? log.is_valid_schedule 
        : hasSchedule;
      
      // Green: Has valid schedule (within time frame)
      // Yellow: No schedule or outside time frame
      if (isValidSchedule && hasSchedule) {
        return { bg: '#e8f5e9', border: '#4caf50' }; // Green
      } else {
        return { bg: '#fff9c4', border: '#fbc02d' }; // Yellow
      }
    }
    
    // For other log types, use original color scheme
    switch (log.type) {
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
            <Typography variant="body2"><strong>Green:</strong> Within scheduled time frame</Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ width: 20, height: 20, backgroundColor: "#ffff00", border: "2px solid #ffff00" }} />
            <Typography variant="body2"><strong>Yellow:</strong> Outside time frame or no schedule</Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ position: "relative", width: "100%", maxWidth: "2560px", margin: "0 auto" }}>
        <img
          ref={imgRef}
          alt="Live Stream"
          style={{
            width: "100%",
            height: "auto",
            maxHeight: "85vh",
            objectFit: "contain",  // Show full image without cropping
            borderRadius: "10px",
            boxShadow: "0px 4px 10px rgba(0,0,0,0.2)",
            backgroundColor: "#000",
            imageRendering: "smooth",  // Smooth rendering for maximum clarity
          }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",  // Match image height exactly
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
              const colors = getLogColor(log);
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