#!/bin/bash
# ========================================
# EduVision - Stop All Services (Linux)
# Stops all services started by start.sh
# ========================================

echo ""
echo "========================================"
echo "EduVision - Stopping All Services"
echo "========================================"
echo ""

# === Kill processes by port ===
echo "[1/5] Stopping services on ports..."

# Stop Backend API (port 5000)
echo "Stopping Backend API (port 5000)..."
if fuser 5000/tcp >/dev/null 2>&1; then
    fuser -k 5000/tcp >/dev/null 2>&1
    echo "  [OK] Backend API stopped"
else
    echo "  [INFO] Backend API was not running"
fi

# Stop MediaMTX (port 8554)
echo "Stopping MediaMTX (port 8554)..."
if fuser 8554/tcp >/dev/null 2>&1; then
    fuser -k 8554/tcp >/dev/null 2>&1
    echo "  [OK] MediaMTX stopped"
else
    echo "  [INFO] MediaMTX was not running"
fi

# Stop Node.js Streaming Server (port 3000)
echo "Stopping Streaming Server (port 3000)..."
if fuser 3000/tcp >/dev/null 2>&1; then
    fuser -k 3000/tcp >/dev/null 2>&1
    echo "  [OK] Streaming Server stopped"
else
    echo "  [INFO] Streaming Server was not running"
fi

# Stop Frontend (port 5173)
echo "Stopping Frontend (port 5173)..."
if fuser 5173/tcp >/dev/null 2>&1; then
    fuser -k 5173/tcp >/dev/null 2>&1
    echo "  [OK] Frontend stopped"
else
    echo "  [INFO] Frontend was not running"
fi

# === Kill Python processes ===
echo ""
echo "[2/5] Stopping Python services..."

# Stop Face Recognition (recognizer_arcface.py)
echo "Stopping Face Recognition Service..."
pkill -f "recognizer_arcface.py" 2>/dev/null && echo "  [OK] Face Recognition stopped" || echo "  [INFO] Face Recognition was not running"

# Stop Background Removal (simple_background_removal.py)
echo "Stopping Background Removal Service..."
pkill -f "simple_background_removal.py" 2>/dev/null && echo "  [OK] Background Removal stopped" || echo "  [INFO] Background Removal was not running"

# === Kill Node.js processes ===
echo ""
echo "[3/5] Stopping Node.js processes..."

# Kill nodemon/ts-node (Backend API)
echo "Stopping Node.js Backend processes..."
pkill -f "nodemon" 2>/dev/null
pkill -f "ts-node" 2>/dev/null
echo "  [OK] Backend Node.js processes stopped (if they were running)"

# Kill node server.js (Streaming Server)
pkill -f "node server.js" 2>/dev/null
echo "  [OK] Streaming Server Node.js process stopped (if it was running)"

# Kill npm run dev processes
pkill -f "npm run dev" 2>/dev/null
pkill -f "vite" 2>/dev/null
echo "  [OK] npm/vite processes stopped (if they were running)"

# === Kill MediaMTX process ===
echo ""
echo "[4/5] Stopping MediaMTX process..."
pkill -f "mediamtx" 2>/dev/null && echo "  [OK] MediaMTX process stopped" || echo "  [INFO] MediaMTX process was not running"

# === Wait a moment for cleanup ===
echo ""
echo "[5/5] Waiting for processes to terminate..."
sleep 2

# === Verify ports are free ===
echo ""
echo "Verifying ports are free..."
ALL_CLEAR=1

if fuser 5000/tcp >/dev/null 2>&1; then
    echo "  [WARN] Port 5000 is still in use"
    ALL_CLEAR=0
else
    echo "  [OK] Port 5000 is free"
fi

if fuser 8554/tcp >/dev/null 2>&1; then
    echo "  [WARN] Port 8554 is still in use"
    ALL_CLEAR=0
else
    echo "  [OK] Port 8554 is free"
fi

if fuser 3000/tcp >/dev/null 2>&1; then
    echo "  [WARN] Port 3000 is still in use"
    ALL_CLEAR=0
else
    echo "  [OK] Port 3000 is free"
fi

if fuser 5173/tcp >/dev/null 2>&1; then
    echo "  [WARN] Port 5173 is still in use"
    ALL_CLEAR=0
else
    echo "  [OK] Port 5173 is free"
fi

echo ""
echo "========================================"
if [ $ALL_CLEAR -eq 1 ]; then
    echo "All Services Stopped Successfully!"
    echo "========================================"
    echo ""
    echo "All ports are now free."
    echo "You can run ./start.sh again to restart services."
else
    echo "Services Stopped (Some ports may still be in use)"
    echo "========================================"
    echo ""
    echo "Some processes may still be running."
    echo "Try running this script again or manually kill:"
    echo "  pkill -9 -f 'node|python|nodemon|vite'"
fi
echo ""

