#!/bin/bash
# ========================================
# EduVision - Linux Start Script
# GPU Optimized for GTX 3050 Ti
# ========================================

# Load nvm for Node.js 20
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
STREAMING_DIR="$SCRIPT_DIR/streaming-server"

echo ""
echo "========================================"
echo "EduVision - Starting All Services"
echo "GPU Mode: GTX 3050 Ti Optimized"
echo "========================================"
echo ""

# Kill any existing processes on the ports
echo "Cleaning up ports..."
fuser -k 5000/tcp 2>/dev/null
fuser -k 3000/tcp 2>/dev/null
fuser -k 5173/tcp 2>/dev/null
fuser -k 8554/tcp 2>/dev/null
sleep 2

# Set environment variables for GPU - OPTIMIZED FOR REAL-TIME
export USE_GPU=true
export USE_LOCAL_CACHE_FOR_DETECTION=true
export FRAME_SKIP_RATE=1  # Process EVERY frame for true real-time (GPU handles it)

echo "[1/4] Starting Backend API Server..."
cd "$BACKEND_DIR"
npm run dev &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

echo "Waiting for backend to initialize..."
sleep 5

echo "[2/4] Starting Node.js Streaming Server..."
cd "$BACKEND_DIR"
node server.js &
STREAMING_PID=$!
echo "  Streaming PID: $STREAMING_PID"

sleep 3

echo "[3/4] Starting Frontend..."
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

echo ""
echo "========================================"
echo "All Services Started!"
echo "========================================"
echo ""
echo "Services:"
echo "  - Backend API:      http://localhost:5000"
echo "  - Streaming Server: http://localhost:3000"
echo "  - Frontend:         http://localhost:5173"
echo ""
echo "GPU Settings (REAL-TIME MODE):"
echo "  - USE_GPU=true (GTX 3050 Ti)"
echo "  - Detection Size: 512x512"
echo "  - Frame Skip Rate: 1 (EVERY frame processed)"
echo "  - Batch Processing: Multiple faces handled simultaneously"
echo ""
echo "========================================"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for Ctrl+C
trap "echo 'Stopping services...'; kill $BACKEND_PID $STREAMING_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM

# Keep script running
wait

