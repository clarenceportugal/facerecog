import dotenv from "dotenv";
dotenv.config(); // ✅ Load .env first

import app from './app';
import mongoose from 'mongoose';
import initializeAdmin from './utils/initializeAdmin';
import { startAbsentDetectionScheduler } from './utils/absentDetectionScheduler';
import http from 'http';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eduvision';
const PORT = process.env.PORT || 5000;

let server: http.Server | null = null;

// MongoDB connection options with increased timeouts and retry logic
const mongooseOptions = {
  serverSelectionTimeoutMS: 30000, // 30 seconds (increased from default 10s)
  socketTimeoutMS: 45000, // 45 seconds
  connectTimeoutMS: 30000, // 30 seconds
  maxPoolSize: 10, // Maintain up to 10 socket connections
  minPoolSize: 5, // Maintain at least 5 socket connections
  retryWrites: true,
  retryReads: true,
};

console.log('Attempting to connect to MongoDB...');
console.log('Connection string:', MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')); // Hide credentials in logs

mongoose.connect(MONGO_URI, mongooseOptions)
  .then(async () => {
    console.log('✅ Connected to MongoDB successfully');

    await initializeAdmin();

    if (!server) {
      server = app.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
        
        // Start automatic absent detection scheduler
        startAbsentDetectionScheduler();
      });
    }
  })
  .catch((error) => {
    console.error('❌ Error connecting to MongoDB:', error.message);
    console.error('\n🔍 Troubleshooting steps:');
    console.error('1. Check if your IP address is whitelisted in MongoDB Atlas');
    console.error('   - Go to MongoDB Atlas → Network Access → Add IP Address');
    console.error('   - Add your current IP or use 0.0.0.0/0 (less secure, for testing only)');
    console.error('2. Verify your MongoDB connection string in .env file');
    console.error('3. Check your internet connection');
    console.error('4. Ensure MongoDB Atlas cluster is not paused');
    console.error('5. Try using a different DNS server (8.8.8.8 or 1.1.1.1)');
    console.error('\n💡 If using MongoDB Atlas, make sure:');
    console.error('   - Your cluster is running (not paused)');
    console.error('   - Your IP is whitelisted');
    console.error('   - Your database user credentials are correct');
    console.error('\n🔄 Retrying connection in 5 seconds...');
    
    // Retry connection after 5 seconds
    setTimeout(() => {
      console.log('🔄 Retrying MongoDB connection...');
      mongoose.connect(MONGO_URI, mongooseOptions)
        .then(async () => {
          console.log('✅ Reconnected to MongoDB successfully');
          await initializeAdmin();
          if (!server) {
            server = app.listen(PORT, () => {
              console.log(`✅ Server running on port ${PORT}`);
              startAbsentDetectionScheduler();
            });
          }
        })
        .catch((retryError) => {
          console.error('❌ Retry failed:', retryError.message);
          console.error('⚠️  Server will continue to retry. Check your MongoDB connection.');
        });
    }, 5000);
  });
