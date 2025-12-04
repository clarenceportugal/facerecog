/**
 * Helper functions to sync data to local SQLite database
 * Used for offline face detection
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Save a schedule to local SQLite database (for offline use)
 * This is called automatically when schedules are created/updated
 */
export async function saveScheduleToLocalDB(schedule: any): Promise<void> {
  try {
    const scriptPath = path.join(__dirname, '../../sync_single_schedule.py');
    const scheduleJson = JSON.stringify(schedule);
    
    // Call Python script to save schedule
    const command = `py -3.13 "${scriptPath}" "${scheduleJson.replace(/"/g, '\\"')}"`;
    
    await execAsync(command, {
      cwd: path.join(__dirname, '../..'),
      timeout: 5000, // 5 second timeout
    });
    
    console.log(`[LOCAL DB] Schedule ${schedule.courseCode} saved to local database`);
  } catch (error) {
    // Don't fail the request if local DB save fails (graceful degradation)
    console.warn(`[LOCAL DB] Failed to save schedule to local DB (non-critical):`, error);
  }
}

/**
 * Save multiple schedules to local SQLite database
 */
export async function saveSchedulesBatchToLocalDB(schedules: any[]): Promise<void> {
  try {
    const scriptPath = path.join(__dirname, '../../sync_schedules.py');
    
    // Call Python script to sync all schedules
    const command = `py -3.13 "${scriptPath}"`;
    
    await execAsync(command, {
      cwd: path.join(__dirname, '../..'),
      timeout: 30000, // 30 second timeout for batch
    });
    
    console.log(`[LOCAL DB] Synced ${schedules.length} schedules to local database`);
  } catch (error) {
    // Don't fail the request if local DB save fails
    console.warn(`[LOCAL DB] Failed to sync schedules to local DB (non-critical):`, error);
  }
}

/**
 * Trigger face recognizer to reload embeddings (when new faces are added)
 * This is called automatically when faces are registered
 */
export async function triggerFaceReload(): Promise<void> {
  try {
    // The recognizer watches the file system, so it will auto-reload
    // But we can also send a signal if needed
    console.log('[LOCAL DB] Face recognizer will auto-reload on next file system check');
  } catch (error) {
    console.warn(`[LOCAL DB] Failed to trigger face reload (non-critical):`, error);
  }
}

