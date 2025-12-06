/**
 * System Mode Utility
 * Controls whether the system runs in offline or online mode
 * 
 * Set OFFLINE_MODE=true in .env to run in offline mode (uses local SQLite only)
 * Set OFFLINE_MODE=false or omit to run in online mode (uses MongoDB)
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env from multiple locations (backend folder first, then root)
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../.env') });

export type SystemMode = 'offline' | 'online';

/**
 * Get the current system mode from environment variable
 * Defaults to 'online' if not set
 */
export const getSystemMode = (): SystemMode => {
  const offlineMode = process.env.OFFLINE_MODE;
  
  // Log for debugging (only once)
  if (!(global as any).__systemModeLogged) {
    console.log('='.repeat(60));
    console.log('🔧 SYSTEM MODE CONFIGURATION');
    console.log('='.repeat(60));
    console.log(`OFFLINE_MODE env variable: "${offlineMode}"`);
    console.log(`Detected value type: ${typeof offlineMode}`);
  }
  
  // Check for explicit true/false values
  if (offlineMode === 'true' || offlineMode === '1') {
    if (!(global as any).__systemModeLogged) {
      console.log('✅ Running in OFFLINE MODE (Local SQLite)');
      console.log('='.repeat(60));
      (global as any).__systemModeLogged = true;
    }
    return 'offline';
  }
  
  if (offlineMode === 'false' || offlineMode === '0') {
    if (!(global as any).__systemModeLogged) {
      console.log('🌐 Running in ONLINE MODE (MongoDB)');
      console.log('='.repeat(60));
      (global as any).__systemModeLogged = true;
    }
    return 'online';
  }
  
  // Default to online if not specified
  if (!(global as any).__systemModeLogged) {
    console.log('⚠️  OFFLINE_MODE not set - Defaulting to ONLINE MODE');
    console.log('='.repeat(60));
    (global as any).__systemModeLogged = true;
  }
  return 'online';
};

/**
 * Check if system is running in offline mode
 */
export const isOfflineMode = (): boolean => {
  return getSystemMode() === 'offline';
};

/**
 * Check if system is running in online mode
 */
export const isOnlineMode = (): boolean => {
  return getSystemMode() === 'online';
};

/**
 * Get a human-readable mode description
 */
export const getModeDescription = (): string => {
  const mode = getSystemMode();
  return mode === 'offline' 
    ? 'Offline Mode (Local SQLite only)' 
    : 'Online Mode (MongoDB with local fallback)';
};

/**
 * Validate that required services are available for the current mode
 */
export const validateModeRequirements = (): { valid: boolean; message?: string } => {
  const mode = getSystemMode();
  
  if (mode === 'online') {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      return {
        valid: false,
        message: 'MONGO_URI is required for online mode. Set OFFLINE_MODE=true to use offline mode.'
      };
    }
  }
  
  return { valid: true };
};

