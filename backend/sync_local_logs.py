"""
Background service to sync local attendance logs to MongoDB
Runs in background and syncs queued logs when internet is available
"""
import os
import sys
import time
import threading
import requests
from typing import List, Dict
from datetime import datetime

try:
    from local_database import (
        get_unsynced_logs,
        mark_log_synced,
        clear_old_synced_logs
    )
    LOCAL_DB_AVAILABLE = True
except ImportError:
    print("[SYNC] Local database not available", flush=True)
    LOCAL_DB_AVAILABLE = False

# Configuration
BACKEND_API = os.getenv("BACKEND_API", "http://localhost:5000/api/auth")
SYNC_INTERVAL_SECONDS = int(os.getenv("LOG_SYNC_INTERVAL", "60"))  # 1 minute default
SYNC_ENABLED = os.getenv("LOG_SYNC_ENABLED", "true").lower() == "true"
BATCH_SIZE = 10  # Sync 10 logs at a time

class LogSyncService:
    """Background service to sync local logs to MongoDB"""
    
    def __init__(self):
        self.running = False
        self.sync_thread: threading.Thread = None
        self.last_sync_time = None
        self.sync_lock = threading.Lock()
    
    def sync_logs(self) -> int:
        """Sync unsynced logs to backend"""
        if not LOCAL_DB_AVAILABLE:
            return 0
        
        if not SYNC_ENABLED:
            return 0
        
        try:
            # Get unsynced logs
            unsynced_logs = get_unsynced_logs(limit=BATCH_SIZE)
            
            if not unsynced_logs:
                return 0
            
            print(f"[SYNC] [SYNC] Syncing {len(unsynced_logs)} logs to backend...", flush=True)
            
            synced_count = 0
            
            for log in unsynced_logs:
                log_id = log['id']
                
                # Determine if it's time in or time out
                if log.get('time_in') and not log.get('time_out'):
                    # Time in log
                    try:
                        response = requests.post(
                            f"{BACKEND_API}/log-time-in",
                            json={
                                "instructorName": log['instructor_name'],
                                "scheduleId": log['schedule_id'],
                                "cameraId": log.get('camera_id', 'camera1'),
                                "timestamp": f"{log['date']}T{log['time_in']}",
                                "logType": log.get('log_type', 'time in'),
                                "isLate": bool(log.get('is_late', 0))
                            },
                            timeout=10
                        )
                        
                        if response.status_code == 200:
                            mark_log_synced(log_id)
                            synced_count += 1
                            print(f"[SYNC] [OK] Synced log {log_id} (time in)", flush=True)
                        else:
                            print(f"[SYNC] [ERROR] Failed to sync log {log_id}: {response.status_code}", flush=True)
                    except Exception as e:
                        print(f"[SYNC] [ERROR] Error syncing log {log_id}: {e}", flush=True)
                
                elif log.get('time_out'):
                    # Time out log
                    try:
                        response = requests.post(
                            f"{BACKEND_API}/log-time-out",
                            json={
                                "instructorName": log['instructor_name'],
                                "scheduleId": log['schedule_id'],
                                "cameraId": log.get('camera_id', 'camera1'),
                                "timestamp": f"{log['date']}T{log['time_out']}",
                                "totalMinutes": 0  # Calculate if needed
                            },
                            timeout=10
                        )
                        
                        if response.status_code == 200:
                            mark_log_synced(log_id)
                            synced_count += 1
                            print(f"[SYNC] [OK] Synced log {log_id} (time out)", flush=True)
                        else:
                            print(f"[SYNC] [ERROR] Failed to sync log {log_id}: {response.status_code}", flush=True)
                    except Exception as e:
                        print(f"[SYNC] [ERROR] Error syncing log {log_id}: {e}", flush=True)
            
            if synced_count > 0:
                with self.sync_lock:
                    self.last_sync_time = datetime.now()
                print(f"[SYNC] [OK] Synced {synced_count}/{len(unsynced_logs)} logs", flush=True)
            
            # Clean up old synced logs (older than 7 days)
            clear_old_synced_logs(days=7)
            
            return synced_count
            
        except Exception as e:
            print(f"[SYNC] [ERROR] Error in sync: {e}", flush=True)
            import traceback
            traceback.print_exc()
            return 0
    
    def start_background_sync(self):
        """Start background sync thread"""
        if not SYNC_ENABLED:
            print("[SYNC] [WARN] Log sync is disabled (set LOG_SYNC_ENABLED=true to enable)", flush=True)
            return
        
        if self.running:
            print("[SYNC] [WARN] Sync service already running", flush=True)
            return
        
        self.running = True
        self.sync_thread = threading.Thread(target=self._sync_loop, daemon=True)
        self.sync_thread.start()
        print(f"[SYNC] [OK] Log sync service started (interval: {SYNC_INTERVAL_SECONDS}s)", flush=True)
    
    def _sync_loop(self):
        """Background sync loop"""
        while self.running:
            try:
                self.sync_logs()
                time.sleep(SYNC_INTERVAL_SECONDS)
            except Exception as e:
                print(f"[SYNC] [ERROR] Error in sync loop: {e}", flush=True)
                time.sleep(60)  # Wait 1 minute before retrying
    
    def stop(self):
        """Stop background sync"""
        self.running = False
        if self.sync_thread:
            self.sync_thread.join(timeout=5)
        print("[SYNC] [OK] Log sync service stopped", flush=True)
    
    def get_status(self) -> Dict:
        """Get sync service status"""
        with self.sync_lock:
            return {
                "running": self.running,
                "enabled": SYNC_ENABLED,
                "last_sync": self.last_sync_time.isoformat() if self.last_sync_time else None,
                "interval_seconds": SYNC_INTERVAL_SECONDS
            }

# Global sync service instance
_sync_service = LogSyncService()

def start_sync():
    """Start the log sync service"""
    _sync_service.start_background_sync()

def stop_sync():
    """Stop the log sync service"""
    _sync_service.stop()

def get_sync_status():
    """Get sync service status"""
    return _sync_service.get_status()

def manual_sync():
    """Manually trigger a sync"""
    return _sync_service.sync_logs()

