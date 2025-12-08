#!/bin/bash
echo "🚀 Installing RetinaFace dependencies..."

# Check if we're in the right directory
if [ ! -d "retinaface" ]; then
    echo "❌ Error: retinaface folder not found!"
    exit 1
fi

# Install MXNet (GPU version - adjust CUDA version if needed)
echo "📦 Installing MXNet (GPU version)..."
pip install mxnet-cu111 || pip install mxnet-cu102 || pip install mxnet

# Install other dependencies
echo "📦 Installing other dependencies..."
pip install opencv-python numpy cython

# Build Cython extensions
echo "🔨 Building Cython extensions..."
cd retinaface
make

echo ""
echo "✅ Installation complete!"
echo ""
echo "📥 Next steps:"
echo "1. Download RetinaFace-R50 model from:"
echo "   https://drive.google.com/file/d/1_DKgGxQWqlTqe78pw0KavId9BIMNUWfu/view?usp=sharing"
echo ""
echo "2. Extract and place in: retinaface/model/R50/"
echo ""
echo "3. Model structure should be:"
echo "   retinaface/model/R50/retina-0000.params"
echo "   retinaface/model/R50/retina-symbol.json"
echo ""
echo "4. Test: cd retinaface && python test.py"
