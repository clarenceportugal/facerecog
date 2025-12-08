#!/bin/bash
echo "🚀 Installing MXNet for RTX 3050 Ti 4GB..."
echo ""

# Check Python version
PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "📋 Python version: $(python3 --version)"
echo ""

# Try different MXNet versions
echo "📦 Attempting to install MXNet with GPU support..."
echo ""

# Try CUDA 11.1 (most compatible)
echo "1️⃣ Trying mxnet-cu111 (CUDA 11.1)..."
pip3 install --user --break-system-packages mxnet-cu111 2>&1 | tail -10

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SUCCESS! MXNet with GPU support installed!"
    python3 -c "import mxnet as mx; print(f'MXNet version: {mx.__version__}'); print(f'GPU available: {len(mx.test_utils.list_gpus()) > 0}')" 2>&1
    exit 0
fi

echo ""
echo "2️⃣ Trying mxnet-cu110 (CUDA 11.0)..."
pip3 install --user --break-system-packages mxnet-cu110 2>&1 | tail -10

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SUCCESS! MXNet with GPU support installed!"
    python3 -c "import mxnet as mx; print(f'MXNet version: {mx.__version__}'); print(f'GPU available: {len(mx.test_utils.list_gpus()) > 0}')" 2>&1
    exit 0
fi

echo ""
echo "3️⃣ Trying generic mxnet (may have GPU support)..."
pip3 install --user --break-system-packages mxnet 2>&1 | tail -10

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ MXNet installed (checking GPU support)..."
    python3 -c "import mxnet as mx; print(f'MXNet version: {mx.__version__}')" 2>&1
    exit 0
fi

echo ""
echo "❌ Failed to install MXNet. Python 3.13 might not be supported."
echo ""
echo "💡 RECOMMENDED: Use Python 3.11 or 3.12"
echo "   Run: ./setup_retinaface_python311.sh"
