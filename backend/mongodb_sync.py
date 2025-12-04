"""
MongoDB Sync Service (Optional Background Sync)
Syncs face embeddings between MongoDB Atlas and local SQLite database
"""
import os
import sys
import time
import threading
from pathlib import Path
from typing import Optional, List, Dict
import requests
import json
from datetime import datetime

# Import SQLite functions
try:
    from embedding_db import (
        save_embedding,
        save_embeddings_batch,
        load_embeddings_from_db,
        delete_embedding,
        get_embedding_count
    )
    SQLITE_AVAILABLE = True
except ImportError:
    print("[SYNC] SQLite not available", flush=True)
    SQLITE_AVAILABLE = False

# Configuration
BACKEND_API = os.getenv("BACKEND_API", "http://localhost:5000/api")
SYNC_INTERVAL_SECONDS = int(os.getenv("MONGODB_SYNC_INTERVAL", "300"))  # 5 minutes default
SYNC_ENABLED = os.getenv("MONGODB_SYNC_ENABLED", "false").lower() == "true"

class MongoDBSyncService:
    """Background service to sync embeddings between MongoDB and SQLite"""
    
    def __init__(self):
        self.running = False
        self.sync_thread: Optional[threading.Thread] = None
        self.last_sync_time: Optional[datetime] = None
        self.sync_lock = threading.Lock()
    
    def sync_from_mongodb(self) -> bool:
        """Sync embeddings from MongoDB Atlas to local SQLite"""
        if not SQLITE_AVAILABLE:
            print("[SYNC] [ERROR] SQLite not available, cannot sync", flush=True)
            return False
        
        if not SYNC_ENABLED:
            return False
        
        try:
            print("[SYNC] [SYNC] Starting sync from MongoDB Atlas...", flush=True)
            
            # Call backend API to get all face embeddings from MongoDB
            response = requests.get(
                f"{BACKEND_API}/face/all-embeddings",
                timeout=30
            )
            
            if response.status_code != 200:
                print(f"[SYNC] [ERROR] Failed to fetch embeddings from MongoDB: {response.status_code}", flush=True)
                return False
            
            data = response.json()
            embeddings_data = data.get("embeddings", [])
            
            if not embeddings_data:
                print("[SYNC] [WARN] No embeddings found in MongoDB", flush=True)
                return True  # Not an error, just no data
            
            print(f"[SYNC] [RECV] Received {len(embeddings_data)} embeddings from MongoDB", flush=True)
            
            # Convert MongoDB format to SQLite format
            batch_data = []
            for emb_data in embeddings_data:
                person_name = emb_data.get("person_name")
                embedding_array = emb_data.get("embedding")  # Should be a list/array
                image_path = emb_data.get("image_path")
                user_id = emb_data.get("user_id")
                
                if not person_name or not embedding_array:
                    continue
                
                # Convert list to numpy array
                import numpy as np
                embedding = np.array(embedding_array, dtype=np.float32)
                
                batch_data.append((person_name, embedding, image_path, user_id))
            
            if batch_data:
                # Save to SQLite
                save_embeddings_batch(batch_data)
                print(f"[SYNC] [OK] Synced {len(batch_data)} embeddings to SQLite", flush=True)
                
                with self.sync_lock:
                    self.last_sync_time = datetime.now()
                
                return True
            else:
                print("[SYNC] [WARN] No valid embeddings to sync", flush=True)
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"[SYNC] [ERROR] Network error during sync: {e}", flush=True)
            return False
        except Exception as e:
            print(f"[SYNC] [ERROR] Error during sync: {e}", flush=True)
            import traceback
            traceback.print_exc()
            return False
    
    def sync_to_mongodb(self) -> bool:
        """Sync embeddings from local SQLite to MongoDB Atlas (optional - for backup)"""
        if not SQLITE_AVAILABLE:
            return False
        
        if not SYNC_ENABLED:
            return False
        
        try:
            print("[SYNC] [SYNC] Starting sync to MongoDB Atlas...", flush=True)
            
            # Load embeddings from SQLite
            embeddings, names = load_embeddings_from_db()
            
            if embeddings is None or len(embeddings) == 0:
                print("[SYNC] [WARN] No embeddings in SQLite to sync", flush=True)
                return True
            
            # Convert to MongoDB format
            embeddings_list = []
            for i, (name, emb) in enumerate(zip(names, embeddings)):
                embeddings_list.append({
                    "person_name": name,
                    "embedding": emb.tolist(),  # Convert numpy array to list
                    "user_id": None  # Can be enhanced to include user_id
                })
            
            # Send to backend API
            response = requests.post(
                f"{BACKEND_API}/face/sync-embeddings",
                json={"embeddings": embeddings_list},
                timeout=60
            )
            
            if response.status_code == 200:
                print(f"[SYNC] [OK] Synced {len(embeddings_list)} embeddings to MongoDB", flush=True)
                return True
            else:
                print(f"[SYNC] [ERROR] Failed to sync to MongoDB: {response.status_code}", flush=True)
                return False
                
        except Exception as e:
            print(f"[SYNC] [ERROR] Error syncing to MongoDB: {e}", flush=True)
            return False
    
    def start_background_sync(self):
        """Start background sync thread"""
        if not SYNC_ENABLED:
            print("[SYNC] [WARN] MongoDB sync is disabled (set MONGODB_SYNC_ENABLED=true to enable)", flush=True)
            return
        
        if self.running:
            print("[SYNC] [WARN] Sync service already running", flush=True)
            return
        
        self.running = True
        self.sync_thread = threading.Thread(target=self._sync_loop, daemon=True)
        self.sync_thread.start()
        print(f"[SYNC] [OK] Background sync started (interval: {SYNC_INTERVAL_SECONDS}s)", flush=True)
    
    def _sync_loop(self):
        """Background sync loop"""
        while self.running:
            try:
                # Sync from MongoDB to SQLite (primary direction)
                self.sync_from_mongodb()
                
                # Wait for next sync interval
                time.sleep(SYNC_INTERVAL_SECONDS)
            except Exception as e:
                print(f"[SYNC] [ERROR] Error in sync loop: {e}", flush=True)
                time.sleep(60)  # Wait 1 minute before retrying on error
    
    def stop(self):
        """Stop background sync"""
        self.running = False
        if self.sync_thread:
            self.sync_thread.join(timeout=5)
        print("[SYNC] [OK] Sync service stopped", flush=True)
    
    def get_status(self) -> Dict:
        """Get sync service status"""
        with self.sync_lock:
            return {
                "running": self.running,
                "enabled": SYNC_ENABLED,
                "last_sync": self.last_sync_time.isoformat() if self.last_sync_time else None,
                "interval_seconds": SYNC_INTERVAL_SECONDS,
                "sqlite_count": get_embedding_count() if SQLITE_AVAILABLE else 0
            }

# Global sync service instance
_sync_service = MongoDBSyncService()

def start_sync():
    """Start the MongoDB sync service"""
    _sync_service.start_background_sync()

def stop_sync():
    """Stop the MongoDB sync service"""
    _sync_service.stop()

def get_sync_status():
    """Get sync service status"""
    return _sync_service.get_status()

def manual_sync():
    """Manually trigger a sync (useful for testing)"""
    return _sync_service.sync_from_mongodb()

