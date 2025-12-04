import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  server: {
    proxy: {
      "/ws": {
        target: "ws://192.168.8.5:8080",
        ws: true,
      },
    },
  },
  optimizeDeps: {
    exclude: [
      '@mediapipe/camera_utils',
      '@mediapipe/face_detection',
      '@mediapipe/face_mesh',
      'hls.js',
      'whep-client'
    ],
    force: true, // Force re-optimization
  },
})
