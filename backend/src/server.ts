import dotenv from "dotenv";
import path from 'path';

// Load .env from multiple locations (backend folder first, then root)
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

import app from './app';
import mongoose from 'mongoose';
import initializeAdmin from './utils/initializeAdmin';
import { startAbsentDetectionScheduler } from './utils/absentDetectionScheduler';
import { getSystemMode, isOfflineMode, getModeDescription, validateModeRequirements } from './utils/systemMode';
import { initOfflineDatabase, getDbStats } from './services/offlineDatabase';
import { syncAllDataToOffline } from './services/syncService';
import http from 'http';

const PORT = process.env.PORT || 5000;
const systemMode = getSystemMode();

let server: http.Server | null = null;

// Validate mode requirements
const validation = validateModeRequirements();
if (!validation.valid) {
  console.error(`❌ ${validation.message}`);
  process.exit(1);
}

console.log('='.repeat(60));
console.log(`🚀 Starting EduVision Server`);
console.log(`📊 System Mode: ${getModeDescription()}`);
console.log('='.repeat(60));

// Check if offline database needs initial sync
async function checkAndSyncOfflineDatabase(): Promise<boolean> {
  const stats = getDbStats();
  const isEmpty = stats.users === 0 && stats.schedules === 0;
  
  if (isEmpty) {
    console.log('');
    console.log('⚠️  Offline database is EMPTY!');
    console.log('   Attempting to sync data from MongoDB...');
    console.log('');
    
    const MONGO_URI = process.env.MONGO_URI || '';
    if (!MONGO_URI) {
      console.log('❌ No MONGO_URI configured. Cannot sync data.');
      console.log('   The system will run with an empty database.');
      return false;
    }
    
    try {
      // Connect to MongoDB temporarily to sync data
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      });
      console.log('✅ Connected to MongoDB for initial sync');
      
      // Sync all data
      const result = await syncAllDataToOffline();
      
      if (result.success) {
        console.log('');
        console.log('✅ Initial sync completed successfully!');
        console.log(`   Users: ${result.synced.users}`);
        console.log(`   Schedules: ${result.synced.schedules}`);
        console.log(`   Colleges: ${result.synced.colleges}`);
        console.log(`   Courses: ${result.synced.courses}`);
        console.log('');
      } else {
        console.log('⚠️  Sync completed with errors:', result.errors.slice(0, 3));
      }
      
      // Disconnect from MongoDB after sync
      await mongoose.disconnect();
      console.log('📴 Disconnected from MongoDB, continuing in offline mode');
      
      return true;
    } catch (error: any) {
      console.log('❌ Could not connect to MongoDB for sync:', error.message);
      console.log('   The system will run with an empty database.');
      console.log('   You can sync later when online using: POST /api/system/sync-to-offline');
      return false;
    }
  } else {
    console.log('✅ Offline database has data:');
    console.log(`   Users: ${stats.users}, Schedules: ${stats.schedules}, Logs: ${stats.logs}`);
    return true;
  }
}

// Start server based on mode
if (isOfflineMode()) {
  // OFFLINE MODE: Start server without MongoDB connection
  console.log('📴 Running in OFFLINE MODE');
  console.log('   - Using local SQLite databases only');
  console.log('   - MongoDB connection skipped');
  console.log('   - All data operations use local storage');
  
  // Disable Mongoose buffering in offline mode
  // This makes MongoDB operations fail immediately instead of timing out
  mongoose.set('bufferCommands', false);
  
  // Check and sync database before starting server
  checkAndSyncOfflineDatabase().then(() => {
    if (!server) {
      server = app.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT} (OFFLINE MODE)`);
        console.log('💡 To switch to online mode, set OFFLINE_MODE=false in .env');
      });
    }
  });
} else {
  // ONLINE MODE: Connect to MongoDB
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eduvision';
  
  console.log('🌐 Running in ONLINE MODE');
  console.log('   - Connecting to MongoDB...');
  console.log('   - Connection string:', MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')); // Hide credentials
  
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

  mongoose.connect(MONGO_URI, mongooseOptions)
    .then(async () => {
      console.log('✅ Connected to MongoDB successfully');

      await initializeAdmin();

      if (!server) {
        server = app.listen(PORT, () => {
          console.log(`✅ Server running on port ${PORT} (ONLINE MODE)`);
          
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
      console.error('\n💡 To run without MongoDB, set OFFLINE_MODE=true in .env');
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
                console.log(`✅ Server running on port ${PORT} (ONLINE MODE)`);
                startAbsentDetectionScheduler();
              });
            }
          })
          .catch((retryError) => {
            console.error('❌ Retry failed:', retryError.message);
            console.error('⚠️  Server will continue to retry. Check your MongoDB connection.');
            console.error('💡 To run offline, set OFFLINE_MODE=true in .env');
          });
      }, 5000);
    });
}
