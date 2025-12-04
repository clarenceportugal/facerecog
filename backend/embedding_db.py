"""
SQLite Database for Face Embeddings
Provides fast local storage for face embeddings with in-memory caching
"""
import sqlite3
import numpy as np
import json
import os
from pathlib import Path
from typing import List, Tuple, Optional
import threading
from datetime import datetime

# Database file location
SCRIPT_DIR = Path(__file__).parent.resolve()
DB_PATH = SCRIPT_DIR / "face_embeddings.db"

# In-memory cache
_cache_lock = threading.Lock()
_embeddings_cache: Optional[np.ndarray] = None
_names_cache: Optional[List[str]] = None
_cache_timestamp: Optional[datetime] = None

def init_database():
    """Initialize SQLite database with embeddings table"""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    # Create embeddings table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS embeddings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_name TEXT NOT NULL,
            embedding BLOB NOT NULL,
            image_path TEXT,
            user_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(person_name, image_path)
        )
    """)
    
    # Create index for faster lookups
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_person_name ON embeddings(person_name)
    """)
    
    conn.commit()
    conn.close()
    print(f"[DB] [OK] Database initialized at: {DB_PATH}", flush=True)

def embedding_to_blob(embedding: np.ndarray) -> bytes:
    """Convert numpy array to binary blob for SQLite storage"""
    return embedding.tobytes()

def blob_to_embedding(blob: bytes, shape: Tuple[int, ...] = (512,)) -> np.ndarray:
    """Convert binary blob back to numpy array"""
    array = np.frombuffer(blob, dtype=np.float32)
    if shape:
        return array.reshape(shape)
    return array

def save_embedding(person_name: str, embedding: np.ndarray, image_path: Optional[str] = None, user_id: Optional[str] = None):
    """Save a single embedding to SQLite database"""
    global _embeddings_cache, _names_cache, _cache_timestamp
    
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        embedding_blob = embedding_to_blob(embedding)
        
        cursor.execute("""
            INSERT OR REPLACE INTO embeddings 
            (person_name, embedding, image_path, user_id, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (person_name, embedding_blob, image_path, user_id))
        
        conn.commit()
        
        # Invalidate cache
        with _cache_lock:
            _embeddings_cache = None
            _names_cache = None
            _cache_timestamp = None
        
        print(f"[DB] [OK] Saved embedding for {person_name}", flush=True)
    except Exception as e:
        print(f"[DB] [ERROR] Error saving embedding for {person_name}: {e}", flush=True)
        conn.rollback()
    finally:
        conn.close()

def save_embeddings_batch(embeddings_data: List[Tuple[str, np.ndarray, Optional[str], Optional[str]]]):
    """Save multiple embeddings in a batch (faster)"""
    global _embeddings_cache, _names_cache, _cache_timestamp
    
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        batch_data = [
            (name, embedding_to_blob(emb), img_path, user_id)
            for name, emb, img_path, user_id in embeddings_data
        ]
        
        cursor.executemany("""
            INSERT OR REPLACE INTO embeddings 
            (person_name, embedding, image_path, user_id, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, batch_data)
        
        conn.commit()
        
        # Invalidate cache
        with _cache_lock:
            _embeddings_cache = None
            _names_cache = None
            _cache_timestamp = None
        
        print(f"[DB] [OK] Saved {len(embeddings_data)} embeddings in batch", flush=True)
    except Exception as e:
        print(f"[DB] [ERROR] Error saving embeddings batch: {e}", flush=True)
        conn.rollback()
    finally:
        conn.close()

def load_embeddings_from_db() -> Tuple[Optional[np.ndarray], Optional[List[str]]]:
    """Load all embeddings from SQLite database"""
    global _embeddings_cache, _names_cache, _cache_timestamp
    
    # Check cache first
    with _cache_lock:
        if _embeddings_cache is not None and _names_cache is not None:
            return _embeddings_cache.copy(), _names_cache.copy()
    
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT person_name, embedding FROM embeddings")
        rows = cursor.fetchall()
        
        if not rows:
            print("[DB] [WARN] No embeddings found in database", flush=True)
            return None, None
        
        embeddings_list = []
        names_list = []
        
        for person_name, embedding_blob in rows:
            embedding = blob_to_embedding(embedding_blob)
            embeddings_list.append(embedding)
            names_list.append(person_name)
        
        embeddings_array = np.array(embeddings_list)
        
        # Update cache
        with _cache_lock:
            _embeddings_cache = embeddings_array
            _names_cache = names_list
            _cache_timestamp = datetime.now()
        
        print(f"[DB] [OK] Loaded {len(embeddings_array)} embeddings from database", flush=True)
        return embeddings_array, names_list
        
    except Exception as e:
        print(f"[DB] [ERROR] Error loading embeddings: {e}", flush=True)
        return None, None
    finally:
        conn.close()

def delete_embedding(person_name: str, image_path: Optional[str] = None):
    """Delete embedding(s) for a person"""
    global _embeddings_cache, _names_cache, _cache_timestamp
    
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        if image_path:
            cursor.execute("DELETE FROM embeddings WHERE person_name = ? AND image_path = ?", 
                         (person_name, image_path))
        else:
            cursor.execute("DELETE FROM embeddings WHERE person_name = ?", (person_name,))
        
        conn.commit()
        
        # Invalidate cache
        with _cache_lock:
            _embeddings_cache = None
            _names_cache = None
            _cache_timestamp = None
        
        print(f"[DB] [OK] Deleted embedding(s) for {person_name}", flush=True)
    except Exception as e:
        print(f"[DB] [ERROR] Error deleting embedding: {e}", flush=True)
        conn.rollback()
    finally:
        conn.close()

def get_embedding_count() -> int:
    """Get total number of embeddings in database"""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT COUNT(*) FROM embeddings")
        count = cursor.fetchone()[0]
        return count
    except Exception as e:
        print(f"[DB] [ERROR] Error getting count: {e}", flush=True)
        return 0
    finally:
        conn.close()

def clear_cache():
    """Clear the in-memory cache (force reload from DB on next access)"""
    with _cache_lock:
        global _embeddings_cache, _names_cache, _cache_timestamp
        _embeddings_cache = None
        _names_cache = None
        _cache_timestamp = None
    print("[DB] [OK] Cache cleared", flush=True)

def get_cache_info() -> dict:
    """Get information about the cache"""
    with _cache_lock:
        return {
            "cached": _embeddings_cache is not None,
            "count": len(_names_cache) if _names_cache else 0,
            "timestamp": _cache_timestamp.isoformat() if _cache_timestamp else None
        }

# Initialize database on import
init_database()

