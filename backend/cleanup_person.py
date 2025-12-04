"""
Cleanup Script - Remove a person from all face recognition databases
This script removes a person from:
1. Face embeddings database (face_embeddings.db)
2. Local face detection database (face_detection_data.db)
3. Offline user database (offline_data.db)
4. Face images folder (streaming-server/faces/)
"""
import sqlite3
import os
import shutil
from pathlib import Path

# Database paths
SCRIPT_DIR = Path(__file__).parent.resolve()
EMBEDDINGS_DB = SCRIPT_DIR / "face_embeddings.db"
FACE_DETECTION_DB = SCRIPT_DIR / "face_detection_data.db"
OFFLINE_DB = SCRIPT_DIR / "offline_data.db"
FACES_DIR = SCRIPT_DIR.parent / "streaming-server" / "faces"

def remove_from_embeddings_db(person_name: str):
    """Remove person from face embeddings database"""
    if not EMBEDDINGS_DB.exists():
        print(f"[SKIP] Embeddings database not found: {EMBEDDINGS_DB}")
        return 0
    
    conn = sqlite3.connect(str(EMBEDDINGS_DB))
    cursor = conn.cursor()
    
    try:
        # Count before deletion
        cursor.execute("SELECT COUNT(*) FROM embeddings WHERE person_name LIKE ?", (f"%{person_name}%",))
        count = cursor.fetchone()[0]
        
        if count == 0:
            print(f"[INFO] No embeddings found for '{person_name}' in face_embeddings.db")
            return 0
        
        # Delete all embeddings for this person
        cursor.execute("DELETE FROM embeddings WHERE person_name LIKE ?", (f"%{person_name}%",))
        conn.commit()
        
        print(f"[OK] Removed {count} embedding(s) for '{person_name}' from face_embeddings.db")
        return count
    except Exception as e:
        print(f"[ERROR] Failed to remove from embeddings DB: {e}")
        conn.rollback()
        return 0
    finally:
        conn.close()

def remove_from_instructors_db(person_name: str):
    """Remove person from instructors table in face_detection_data.db"""
    if not FACE_DETECTION_DB.exists():
        print(f"[SKIP] Face detection database not found: {FACE_DETECTION_DB}")
        return 0
    
    conn = sqlite3.connect(str(FACE_DETECTION_DB))
    cursor = conn.cursor()
    
    try:
        # Count before deletion
        cursor.execute(
            "SELECT COUNT(*) FROM instructors WHERE full_name LIKE ? OR first_name LIKE ? OR last_name LIKE ?",
            (f"%{person_name}%", f"%{person_name}%", f"%{person_name}%")
        )
        count = cursor.fetchone()[0]
        
        if count == 0:
            print(f"[INFO] No instructor found for '{person_name}' in face_detection_data.db")
            return 0
        
        # Delete instructor
        cursor.execute(
            "DELETE FROM instructors WHERE full_name LIKE ? OR first_name LIKE ? OR last_name LIKE ?",
            (f"%{person_name}%", f"%{person_name}%", f"%{person_name}%")
        )
        conn.commit()
        
        print(f"[OK] Removed {count} instructor record(s) for '{person_name}' from face_detection_data.db")
        return count
    except Exception as e:
        print(f"[ERROR] Failed to remove from instructors DB: {e}")
        conn.rollback()
        return 0
    finally:
        conn.close()

def remove_from_offline_db(person_name: str):
    """Remove person from users table in offline_data.db"""
    if not OFFLINE_DB.exists():
        print(f"[SKIP] Offline database not found: {OFFLINE_DB}")
        return 0
    
    conn = sqlite3.connect(str(OFFLINE_DB))
    cursor = conn.cursor()
    
    try:
        # Count before deletion
        cursor.execute(
            """SELECT COUNT(*) FROM users 
               WHERE first_name LIKE ? OR last_name LIKE ? 
               OR (first_name || ' ' || last_name) LIKE ?""",
            (f"%{person_name}%", f"%{person_name}%", f"%{person_name}%")
        )
        count = cursor.fetchone()[0]
        
        if count == 0:
            print(f"[INFO] No user found for '{person_name}' in offline_data.db")
            return 0
        
        # Delete user
        cursor.execute(
            """DELETE FROM users 
               WHERE first_name LIKE ? OR last_name LIKE ? 
               OR (first_name || ' ' || last_name) LIKE ?""",
            (f"%{person_name}%", f"%{person_name}%", f"%{person_name}%")
        )
        conn.commit()
        
        # Force checkpoint to ensure WAL is flushed
        conn.execute('PRAGMA wal_checkpoint(FULL)')
        
        print(f"[OK] Removed {count} user record(s) for '{person_name}' from offline_data.db")
        return count
    except Exception as e:
        print(f"[ERROR] Failed to remove from offline DB: {e}")
        conn.rollback()
        return 0
    finally:
        conn.close()

def remove_from_faces_folder(person_name: str):
    """Remove person's face images folder"""
    if not FACES_DIR.exists():
        print(f"[SKIP] Faces directory not found: {FACES_DIR}")
        return 0
    
    removed_folders = []
    
    try:
        # Search for matching folders (case-insensitive)
        for folder in FACES_DIR.iterdir():
            if folder.is_dir():
                # Check if folder name contains the person name
                folder_name_lower = folder.name.lower().replace('_', ' ')
                person_name_lower = person_name.lower()
                
                if person_name_lower in folder_name_lower:
                    print(f"[FOUND] Face folder: {folder.name}")
                    
                    # Ask for confirmation
                    response = input(f"Delete folder '{folder.name}'? (y/n): ").strip().lower()
                    
                    if response == 'y':
                        shutil.rmtree(folder)
                        removed_folders.append(folder.name)
                        print(f"[OK] Removed face folder: {folder.name}")
                    else:
                        print(f"[SKIP] Keeping folder: {folder.name}")
        
        if not removed_folders:
            print(f"[INFO] No face folders found for '{person_name}'")
        
        return len(removed_folders)
    except Exception as e:
        print(f"[ERROR] Failed to remove from faces folder: {e}")
        return 0

def search_person(person_name: str):
    """Search for a person in all databases and show results"""
    print(f"\n{'='*60}")
    print(f"SEARCHING FOR: '{person_name}'")
    print(f"{'='*60}\n")
    
    total_found = 0
    
    # Search embeddings database
    print("[1/4] Searching face_embeddings.db...")
    if EMBEDDINGS_DB.exists():
        conn = sqlite3.connect(str(EMBEDDINGS_DB))
        cursor = conn.cursor()
        cursor.execute("SELECT person_name, image_path FROM embeddings WHERE person_name LIKE ?", (f"%{person_name}%",))
        results = cursor.fetchall()
        if results:
            print(f"   Found {len(results)} embedding(s):")
            for name, path in results:
                print(f"   - {name} ({path or 'no path'})")
                total_found += 1
        else:
            print("   No embeddings found")
        conn.close()
    else:
        print("   Database not found")
    
    # Search face_detection_data.db
    print("\n[2/4] Searching face_detection_data.db...")
    if FACE_DETECTION_DB.exists():
        conn = sqlite3.connect(str(FACE_DETECTION_DB))
        cursor = conn.cursor()
        cursor.execute(
            "SELECT first_name, last_name, full_name FROM instructors WHERE full_name LIKE ? OR first_name LIKE ? OR last_name LIKE ?",
            (f"%{person_name}%", f"%{person_name}%", f"%{person_name}%")
        )
        results = cursor.fetchall()
        if results:
            print(f"   Found {len(results)} instructor(s):")
            for first, last, full in results:
                print(f"   - {full} ({first} {last})")
                total_found += 1
        else:
            print("   No instructors found")
        conn.close()
    else:
        print("   Database not found")
    
    # Search offline_data.db
    print("\n[3/4] Searching offline_data.db...")
    if OFFLINE_DB.exists():
        conn = sqlite3.connect(str(OFFLINE_DB))
        cursor = conn.cursor()
        cursor.execute(
            """SELECT first_name, last_name, username, role FROM users 
               WHERE first_name LIKE ? OR last_name LIKE ? 
               OR (first_name || ' ' || last_name) LIKE ?""",
            (f"%{person_name}%", f"%{person_name}%", f"%{person_name}%")
        )
        results = cursor.fetchall()
        if results:
            print(f"   Found {len(results)} user(s):")
            for first, last, username, role in results:
                print(f"   - {first} {last} ({username}) - {role}")
                total_found += 1
        else:
            print("   No users found")
        conn.close()
    else:
        print("   Database not found")
    
    # Search faces folder
    print("\n[4/4] Searching streaming-server/faces/...")
    if FACES_DIR.exists():
        found_folders = []
        for folder in FACES_DIR.iterdir():
            if folder.is_dir():
                folder_name_lower = folder.name.lower().replace('_', ' ')
                person_name_lower = person_name.lower()
                if person_name_lower in folder_name_lower:
                    found_folders.append(folder.name)
                    total_found += 1
        
        if found_folders:
            print(f"   Found {len(found_folders)} face folder(s):")
            for folder_name in found_folders:
                print(f"   - {folder_name}")
        else:
            print("   No face folders found")
    else:
        print("   Faces directory not found")
    
    print(f"\n{'='*60}")
    print(f"TOTAL RECORDS FOUND: {total_found}")
    print(f"{'='*60}\n")
    
    return total_found

def cleanup_person(person_name: str):
    """Remove person from all databases and face folders"""
    print(f"\n{'='*60}")
    print(f"CLEANUP STARTED FOR: '{person_name}'")
    print(f"{'='*60}\n")
    
    total_removed = 0
    
    # Remove from embeddings database
    print("[1/4] Cleaning face_embeddings.db...")
    total_removed += remove_from_embeddings_db(person_name)
    
    # Remove from face_detection_data.db
    print("\n[2/4] Cleaning face_detection_data.db...")
    total_removed += remove_from_instructors_db(person_name)
    
    # Remove from offline_data.db
    print("\n[3/4] Cleaning offline_data.db...")
    total_removed += remove_from_offline_db(person_name)
    
    # Remove from faces folder
    print("\n[4/4] Cleaning streaming-server/faces/...")
    total_removed += remove_from_faces_folder(person_name)
    
    print(f"\n{'='*60}")
    print(f"CLEANUP COMPLETE - Removed {total_removed} total records")
    print(f"{'='*60}\n")
    
    if total_removed > 0:
        print("⚠️  IMPORTANT: Restart the face recognition service to reload the cache:")
        print("   1. Stop: Press Ctrl+C in the recognizer_arcface.py terminal")
        print("   2. Start: py -3.13 recognizer_arcface.py")
        print()

if __name__ == "__main__":
    import sys
    
    # Person to remove
    person_name = "daniel masligat"  # Change this to search for different person
    
    # Check if name provided as command line argument
    if len(sys.argv) > 1:
        person_name = " ".join(sys.argv[1:])
    
    print("\n" + "="*60)
    print("PERSON CLEANUP SCRIPT")
    print("="*60)
    
    # First, search to show what will be deleted
    total_found = search_person(person_name)
    
    if total_found == 0:
        print(f"\n✅ No records found for '{person_name}'. Nothing to clean up.")
        sys.exit(0)
    
    # Ask for confirmation
    print(f"\n⚠️  WARNING: This will delete {total_found} record(s) for '{person_name}'")
    response = input("Continue with cleanup? (y/n): ").strip().lower()
    
    if response == 'y':
        cleanup_person(person_name)
        print("✅ Cleanup finished successfully!")
    else:
        print("❌ Cleanup cancelled.")

