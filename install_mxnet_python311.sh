#!/bin/bash
echo "═══════════════════════════════════════════════════════════════"
echo "🚀 MXNet Installation para sa RTX 3050 Ti 4GB"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "⚠️  Python 3.13 ay hindi supported ng MXNet"
echo "✅ Gagamit tayo ng Python 3.11 (recommended)"
echo ""

# Check if Python 3.11 is installed
if ! command -v python3.11 &> /dev/null; then
    echo "📦 Installing Python 3.11..."
    sudo apt-get update
    sudo apt-get install -y python3.11 python3.11-dev python3.11-venv python3-pip
    echo "✅ Python 3.11 installed!"
else
    echo "✅ Python 3.11 already installed!"
fi

echo ""
echo "🔨 Creating virtual environment..."
python3.11 -m venv ~/eduvision_mxnet_venv
source ~/eduvision_mxnet_venv/bin/activate

echo ""
echo "📦 Upgrading pip..."
pip install --upgrade pip

echo ""
echo "📦 Installing MXNet with GPU support (CUDA 11.1)..."
pip install mxnet-cu111

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ MXNet installed successfully!"
    echo ""
    echo "🧪 Testing MXNet..."
    python3.11 -c "
import mxnet as mx
print(f'✅ MXNet version: {mx.__version__}')
gpus = mx.test_utils.list_gpus()
if len(gpus) > 0:
    print(f'✅ GPU detected: {len(gpus)} GPU(s)')
    print(f'   GPU IDs: {gpus}')
else:
    print('⚠️  No GPU detected (may need CUDA drivers)')
" 2>&1
    
    echo ""
    echo "📦 Installing other dependencies..."
    pip install opencv-python numpy cython
    
    echo ""
    echo "🔨 Building RetinaFace extensions..."
    cd /home/renz/Desktop/eduvision/retinaface
    make
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "✅ INSTALLATION COMPLETE!"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "📋 To use MXNet/RetinaFace:"
    echo "   source ~/eduvision_mxnet_venv/bin/activate"
    echo ""
    echo "📋 To run your recognizer with MXNet:"
    echo "   source ~/eduvision_mxnet_venv/bin/activate"
    echo "   cd /home/renz/Desktop/eduvision/backend"
    echo "   python3 recognizer_arcface.py"
    echo ""
else
    echo ""
    echo "❌ Installation failed. Trying alternative methods..."
    echo ""
    echo "📦 Trying mxnet-cu110..."
    pip install mxnet-cu110
    
    if [ $? -eq 0 ]; then
        echo "✅ MXNet installed with CUDA 11.0!"
    else
        echo "❌ Failed. Please check CUDA installation."
    fi
fi
