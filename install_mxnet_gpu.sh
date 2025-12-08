#!/bin/bash
echo "🚀 Installing MXNet with GPU support for RTX 3050 Ti 4GB..."

# Try different CUDA versions (most compatible first)
echo "📦 Trying CUDA 11.8 (most compatible)..."
pip install --user --break-system-packages mxnet-cu118 2>&1 | tail -5

if [ $? -ne 0 ]; then
    echo "📦 Trying CUDA 11.1..."
    pip install --user --break-system-packages mxnet-cu111 2>&1 | tail -5
fi

if [ $? -ne 0 ]; then
    echo "📦 Trying CUDA 11.0..."
    pip install --user --break-system-packages mxnet-cu110 2>&1 | tail -5
fi

if [ $? -ne 0 ]; then
    echo "⚠️  GPU version failed, installing CPU version..."
    pip install --user --break-system-packages mxnet 2>&1 | tail -5
fi

echo ""
echo "✅ Installation attempt complete!"
echo "Test with: python3 -c 'import mxnet; print(mxnet.__version__)'"
