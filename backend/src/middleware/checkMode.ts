/**
 * Middleware to check system mode and handle offline/online operations
 */
import { Request, Response, NextFunction } from 'express';
import { isOfflineMode } from '../utils/systemMode';
import mongoose from 'mongoose';

/**
 * Middleware that checks if MongoDB is required and available
 * Returns 503 Service Unavailable if in offline mode and MongoDB is required
 */
export const requireOnlineMode = (req: Request, res: Response, next: NextFunction) => {
  if (isOfflineMode()) {
    return res.status(503).json({
      success: false,
      message: 'This operation requires online mode. Set OFFLINE_MODE=false in .env to enable.',
      mode: 'offline'
    });
  }
  
  // Check if MongoDB is actually connected
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'MongoDB is not connected. Please check your connection.',
      mode: 'online',
      connected: false
    });
  }
  
  next();
};

/**
 * Middleware that allows operation in both modes but provides mode info
 */
export const optionalOnlineMode = (req: Request, res: Response, next: NextFunction) => {
  // Add mode info to request for use in route handlers
  (req as any).systemMode = isOfflineMode() ? 'offline' : 'online';
  (req as any).isOfflineMode = isOfflineMode();
  (req as any).isMongoConnected = mongoose.connection.readyState === 1;
  next();
};

