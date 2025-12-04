import React, { useRef, useEffect, useState } from 'react';
import { Box, Button, Typography, Paper } from '@mui/material';

const CameraTest: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const initializeCamera = async () => {
      try {
        console.log('Testing camera access...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            console.log('Camera test: Video loaded');
            setIsCameraReady(true);
          };
        }
      } catch (err) {
        console.error('Camera test error:', err);
        setError(err instanceof Error ? err.message : 'Camera error');
      }
    };

    initializeCamera();
  }, []);

  return (
    <Box sx={{ p: 4, textAlign: 'center' }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Camera Test
      </Typography>
      
      <Paper sx={{ p: 2, maxWidth: 640, mx: 'auto' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            maxWidth: 640,
            height: 480,
            backgroundColor: '#f0f0f0',
            border: '2px solid #ccc'
          }}
        />
        
        {!isCameraReady && !error && (
          <Typography sx={{ mt: 2 }}>Loading camera...</Typography>
        )}
        
        {error && (
          <Typography color="error" sx={{ mt: 2 }}>
            Error: {error}
          </Typography>
        )}
        
        {isCameraReady && (
          <Typography color="success.main" sx={{ mt: 2 }}>
            ✅ Camera is working!
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default CameraTest;
