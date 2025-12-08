#!/bin/bash
echo "🚀 Setting up RetinaFace with Python 3.11 for RTX 3050 Ti 4GB"
echo ""
echo "This will:"
echo "1. Install Python 3.11"
echo "2. Create virtual environment"
echo "3. Install MXNet with GPU support"
echo "4. Build RetinaFace extensions"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Install Python 3.11
echo "📦 Installing Python 3.11..."
sudo apt-get update
sudo apt-get install -y python3.11 python3.11-dev python3.11-venv python3-pip

# Create virtual environment
echo "🔨 Creating virtual environment..."
python3.11 -m venv ~/eduvision_retinaface_venv
source ~/eduvision_retinaface_venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install MXNet with GPU
echo "📦 Installing MXNet with CUDA 11.1 support..."
pip install mxnet-cu111

# Install other dependencies
echo "📦 Installing dependencies..."
pip install opencv-python numpy cython

# Build RetinaFace extensions
echo "🔨 Building RetinaFace Cython extensions..."
cd /home/renz/Desktop/eduvision/retinaface
make

echo ""
echo "✅ Setup complete!"
echo ""
echo "To use RetinaFace, activate the environment:"
echo "  source ~/eduvision_retinaface_venv/bin/activate"
echo ""
echo "Then run your recognizer from that environment."
