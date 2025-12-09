import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import authRoutes from './routes/authRoutes';
import facultyRoutes from './routes/facultyRoutes';
import deanRoutes from './routes/deanRoutes';
import superadminRoutes from './routes/superadminRoutes';
import loginSignupRoutes from './routes/loginSignupRoutes';
import accountCompletion from './routes/accountCompletion';
import faceRoutes from './routes/faceRoutes';
import activityRoutes from './routes/activityRoutes';
import { isOfflineMode, getModeDescription } from './utils/systemMode';
import { initOfflineDatabase, getDbStats } from './services/offlineDatabase';
import { syncAllDataToOffline, syncLogsToMongoDB, syncOfflineChangesToMongoDB, getSyncStatus } from './services/syncService';
import { getStats } from './services/dataService';

// Load .env from multiple locations
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Initialize offline database
initOfflineDatabase();
console.log('[APP] Offline database initialized');

// Disable mongoose buffering in offline mode (fail fast instead of waiting 10s)
if (isOfflineMode()) {
  mongoose.set('bufferCommands', false);
  console.log('[APP] Offline mode detected - MongoDB buffering disabled');
}

const app = express();

// ---------------------- PATCHED CORS + PNA SUPPORT ----------------------
// Allowed origins (add more if needed)
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_ORIGIN || 'https://eduvision-two.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  'http://localhost:5173'
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow server-to-server requests
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error('CORS origin not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// Middleware to echo CORS headers and handle PNA preflight
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  const origin = req.header('Origin') ?? '';
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.header('Access-Control-Request-Private-Network') === 'true') {
      res.header('Access-Control-Allow-Private-Network', 'true');
    }
  }
  next();
});

// Respond to OPTIONS preflight requests
app.options('*', (req: express.Request, res: express.Response) => {
  const origin = req.header('Origin') ?? (ALLOWED_ORIGINS[0] || '*');
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.header('Access-Control-Request-Private-Network') === 'true') {
    res.header('Access-Control-Allow-Private-Network', 'true');
  }
  return res.sendStatus(204);
});
// -----------------------------------------------------------------------

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add system mode info endpoint
app.get('/api/system/mode', async (req, res) => {
  try {
    const stats = await getStats();
    res.json({
      mode: isOfflineMode() ? 'offline' : 'online',
      description: getModeDescription(),
      offline: isOfflineMode(),
      mongoConnected: mongoose.connection.readyState === 1,
      stats
    });
  } catch (error) {
    res.json({
      mode: isOfflineMode() ? 'offline' : 'online',
      description: getModeDescription(),
      offline: isOfflineMode(),
      mongoConnected: mongoose.connection.readyState === 1
    });
  }
});

// Sync status endpoint
app.get('/api/system/sync-status', (req, res) => {
  const status = getSyncStatus();
  res.json({
    success: true,
    ...status,
    mode: isOfflineMode() ? 'offline' : 'online',
    mongoConnected: mongoose.connection.readyState === 1
  });
});

// Sync MongoDB to SQLite
app.post('/api/system/sync-to-offline', async (req: express.Request, res: express.Response) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'MongoDB is not connected. Connect to MongoDB first to sync data.'
    });
  }
  console.log('[SYNC] Starting sync from MongoDB to SQLite...');
  const result = await syncAllDataToOffline();
  res.json(result);
});

// Sync SQLite logs to MongoDB
app.post('/api/system/sync-logs-to-mongo', async (req: express.Request, res: express.Response) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'MongoDB is not connected. Connect to MongoDB first to sync logs.'
    });
  }
  console.log('[SYNC] Starting sync of logs from SQLite to MongoDB...');
  const result = await syncLogsToMongoDB();
  res.json({
    success: result.errors.length === 0,
    ...result
  });
});

// Sync offline changes to MongoDB
app.post('/api/system/sync-offline-to-mongo', async (req: express.Request, res: express.Response) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'MongoDB is not connected. Connect to MongoDB first to sync data.'
    });
  }
  console.log('[SYNC] Starting sync of offline changes to MongoDB...');
  const result = await syncOfflineChangesToMongoDB();
  res.json(result);
});

// Middleware to check MongoDB connection
const checkMongoConnection = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const offlineAllowedPaths = [
    '/api/system/',
    '/api/face/',
    '/api/auth/faculty',
    '/api/auth/instructors',
    '/api/auth/schedules',
    '/api/auth/add-schedules',
    '/api/auth/rooms',
    '/api/auth/sections',
    '/api/auth/subjects',
    '/api/auth/user/',
    '/api/auth/college-users',
    '/api/auth/all-schedules/today',
    '/api/auth/count/instructors',
    '/api/auth/schedules-count/today',
    '/api/auth/logs/',
    '/api/auth/show-daily-report',
    '/api/auth/show-monthly-department-logs',
    '/api/auth/generate-monthly-department-logs',
    '/api/loginsignup/login',
    '/api/loginsignup/colleges',
    '/api/loginsignup/courses',
    '/api/dean/college-courses',
    '/api/dean/all-schedules/today',
    '/api/dean/programchairs',
    '/api/dean-show-monthly-department-logs',
    '/api/dean-generate-monthly-department-logs',
    '/faculty/update-credentials',
    '/faculty/logs/'
  ];

  const isAllowed = offlineAllowedPaths.some(path => req.path.startsWith(path));

  if (isOfflineMode() && !isAllowed && mongoose.connection.readyState !== 1) {
    console.log(`[OFFLINE] Request to ${req.path} - MongoDB not connected`);
  }

  next();
};

app.use(checkMongoConnection);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', facultyRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/auth', deanRoutes);
app.use('/api/loginsignup', loginSignupRoutes);
app.use('/api/accountcompletion', accountCompletion);
app.use('/api/face', faceRoutes);
app.use('/api/auth', activityRoutes);

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  if (err.name === 'MongooseError' && err.message.includes('buffering timed out')) {
    console.log(`[OFFLINE] MongoDB operation timed out for ${req.path}`);
    return res.status(503).json({
      success: false,
      message: 'System is running in offline mode. This operation requires an online connection.',
      mode: 'offline',
      hint: 'Set OFFLINE_MODE=false in .env to enable online mode'
    });
  }

  if (err.message && err.message.includes('Client must be connected')) {
    console.log(`[OFFLINE] MongoDB not connected for ${req.path}`);
    return res.status(503).json({
      success: false,
      message: 'Database not connected. System is running in offline mode.',
      mode: 'offline'
    });
  }

  console.error("Global error handler:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

export default app;
