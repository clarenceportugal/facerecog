# Python 3.14 Compatibility Issue - Solution

## Problem
Python 3.14 is too new. Many packages (numpy, opencv-python, insightface, etc.) don't have pre-built wheels yet, so pip tries to build from source, which requires a C compiler.

## Solution Options

### Option 1: Install Python 3.13 (RECOMMENDED) ⭐

1. **Download Python 3.13**: https://www.python.org/downloads/release/python-3130/
   - Choose "Windows installer (64-bit)"
   - During installation, check "Add Python to PATH"
   - OR install to a custom location like `C:\Python313`

2. **After installation, use Python 3.13 specifically:**
   ```powershell
   # If installed to PATH, Python 3.13 should be available as:
   py -3.13 -m pip install opencv-python numpy pillow watchdog requests
   
   # Or if you installed to a specific location:
   C:\Python313\python.exe -m pip install opencv-python numpy pillow watchdog requests
   ```

3. **Install insightface** (this may take a while):
   ```powershell
   py -3.13 -m pip install insightface
   ```

4. **Update your batch files** to use Python 3.13:
   - Change `python` to `py -3.13` in batch files
   - Or set Python 3.13 as default

### Option 2: Install Visual Studio Build Tools (For Python 3.14)

If you want to keep Python 3.14, you need a C compiler:

1. **Download Visual Studio Build Tools**: https://visualstudio.microsoft.com/downloads/
   - Scroll to "Tools for Visual Studio"
   - Download "Build Tools for Visual Studio 2022"

2. **Install C++ Build Tools**:
   - Run the installer
   - Select "Desktop development with C++" workload
   - This will install ~6GB of tools

3. **Then try installing packages again**:
   ```powershell
   python -m pip install opencv-python numpy pillow watchdog requests insightface
   ```

### Option 3: Use Pre-built Packages from streaming-server Folder

If the streaming-server folder has packages already, you might be able to use them, but this is not recommended as it may cause conflicts.

---

## Quick Fix for Now

Install packages that have wheels available:

```powershell
# Try installing with --only-binary to avoid building from source
python -m pip install --only-binary :all: opencv-python pillow watchdog requests

# For numpy, try a specific version that has wheels
python -m pip install --only-binary :all: "numpy<2.0"

# For insightface, you may need Python 3.13 or build tools
```

---

## Recommended Action

**Install Python 3.13** - it's the easiest solution and will work with all packages immediately.

After installing Python 3.13, run:
```powershell
py -3.13 -m pip install opencv-python opencv-python-headless numpy pillow watchdog requests insightface
```

Then update your batch files to use `py -3.13` instead of `python`.

