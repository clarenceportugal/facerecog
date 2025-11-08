import dotenv from "dotenv";
dotenv.config(); // ✅ Load .env first

import app from './app';
import mongoose from 'mongoose';
import initializeAdmin from './utils/initializeAdmin';
import { startAbsentDetectionScheduler } from './utils/absentDetectionScheduler';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eduvision';
const PORT = process.env.PORT || 5000;

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');

    await initializeAdmin();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      
      // Start automatic absent detection scheduler
      startAbsentDetectionScheduler();
    });
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  });
