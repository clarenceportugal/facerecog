/**
 * Auto-Sync Service
 * Automatically syncs MongoDB → SQLite after data changes
 * This keeps the local cache up-to-date for fast face detection
 */
import { syncAllDataToOffline } from './src/services/syncService';
import { isOfflineMode } from './src/utils/systemMode';

let syncInProgress = false;
let syncScheduled = false;
const SYNC_DELAY = 10000; // 10 seconds delay to batch multiple changes

/**
 * Schedule a sync to run after a short delay
 * This batches multiple rapid changes into a single sync
 */
export function scheduleSync(reason: string = 'data changed') {
  // Skip in offline mode (no need to sync)
  if (isOfflineMode()) {
    return;
  }

  // Skip if sync already scheduled
  if (syncScheduled) {
    console.log(`[AUTO-SYNC] Sync already scheduled, skipping duplicate request`);
    return;
  }

  console.log(`[AUTO-SYNC] Sync scheduled (reason: ${reason}) - will run in ${SYNC_DELAY/1000}s`);
  syncScheduled = true;

  setTimeout(async () => {
    syncScheduled = false;
    await performSync(reason);
  }, SYNC_DELAY);
}

/**
 * Perform the actual sync
 */
async function performSync(reason: string) {
  if (syncInProgress) {
    console.log(`[AUTO-SYNC] Sync already in progress, skipping`);
    return;
  }

  try {
    syncInProgress = true;
    console.log(`[AUTO-SYNC] Starting sync (reason: ${reason})...`);
    
    const result = await syncAllDataToOffline();
    
    if (result.success) {
      console.log(`[AUTO-SYNC] ✅ Sync completed successfully!`);
      console.log(`[AUTO-SYNC] Synced: ${result.synced.users} users, ${result.synced.schedules} schedules`);
    } else {
      console.log(`[AUTO-SYNC] ⚠️ Sync completed with errors:`, result.errors.slice(0, 3));
    }
  } catch (error) {
    console.error(`[AUTO-SYNC] ❌ Sync failed:`, error);
  } finally {
    syncInProgress = false;
  }
}

/**
 * Check if auto-sync is enabled
 */
export function isAutoSyncEnabled(): boolean {
  return process.env.AUTO_SYNC === 'true';
}

/**
 * Force an immediate sync
 */
export async function forceSyncNow(reason: string = 'manual trigger') {
  console.log(`[AUTO-SYNC] Force sync requested (reason: ${reason})`);
  await performSync(reason);
}

