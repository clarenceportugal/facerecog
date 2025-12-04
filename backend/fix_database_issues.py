"""
Database Issues Fix Script
Diagnoses and fixes common database problems:
- Locked databases
- Stale cache
- WAL mode issues
- Permission problems
"""
import sqlite3
import os
import sys
import time
from pathlib import Path

# Database paths
SCRIPT_DIR = Path(__file__).parent.resolve()
EMBEDDINGS_DB = SCRIPT_DIR / "face_embeddings.db"
FACE_DETECTION_DB = SCRIPT_DIR / "face_detection_data.db"
OFFLINE_DB = SCRIPT_DIR / "offline_data.db"

def check_database_lock(db_path):
    """Check if database is locked"""
    try:
        conn = sqlite3.connect(str(db_path), timeout=1)
        conn.execute("BEGIN EXCLUSIVE")
        conn.rollback()
        conn.close()
        return False  # Not locked
    except sqlite3.OperationalError as e:
        if "locked" in str(e):
            return True  # Locked
        return False
    except Exception:
        return False

def force_checkpoint(db_path):
    """Force WAL checkpoint to flush all changes"""
    try:
        conn = sqlite3.connect(str(db_path))
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.execute("PRAGMA optimize")
        conn.close()
        print(f"   ✅ Checkpointed: {db_path.name}")
        return True
    except Exception as e:
        print(f"   ❌ Failed to checkpoint {db_path.name}: {e}")
        return False

def vacuum_database(db_path):
    """Vacuum database to reclaim space and fix corruption"""
    try:
        conn = sqlite3.connect(str(db_path))
        conn.execute("VACUUM")
        conn.close()
        print(f"   ✅ Vacuumed: {db_path.name}")
        return True
    except Exception as e:
        print(f"   ❌ Failed to vacuum {db_path.name}: {e}")
        return False

def check_wal_files():
    """Check for WAL and SHM files that might be causing issues"""
    print("\n[CHECK] Looking for WAL/SHM files...")
    found = []
    for db_file in [EMBEDDINGS_DB, FACE_DETECTION_DB, OFFLINE_DB]:
        wal_file = Path(str(db_file) + "-wal")
        shm_file = Path(str(db_file) + "-shm")
        
        if wal_file.exists():
            size = wal_file.stat().st_size
            found.append(f"{wal_file.name} ({size} bytes)")
        if shm_file.exists():
            size = shm_file.stat().st_size
            found.append(f"{shm_file.name} ({size} bytes)")
    
    if found:
        print(f"   Found {len(found)} WAL/SHM file(s):")
        for f in found:
            print(f"   - {f}")
        return True
    else:
        print("   ✅ No WAL/SHM files found")
        return False

def force_delete_person(db_path, person_name):
    """Forcefully delete a person from database with multiple attempts"""
    if not db_path.exists():
        return 0
    
    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            conn = sqlite3.connect(str(db_path), timeout=10)
            conn.execute("PRAGMA journal_mode=WAL")
            cursor = conn.cursor()
            
            # Different delete strategies based on database
            if "embeddings" in db_path.name:
                cursor.execute("DELETE FROM embeddings WHERE person_name LIKE ?", (f"%{person_name}%",))
            elif "face_detection" in db_path.name:
                cursor.execute(
                    "DELETE FROM instructors WHERE full_name LIKE ? OR first_name LIKE ? OR last_name LIKE ?",
                    (f"%{person_name}%", f"%{person_name}%", f"%{person_name}%")
                )
            elif "offline" in db_path.name:
                cursor.execute(
                    """DELETE FROM users 
                       WHERE first_name LIKE ? OR last_name LIKE ? 
                       OR (first_name || ' ' || last_name) LIKE ?""",
                    (f"%{person_name}%", f"%{person_name}%", f"%{person_name}%")
                )
            
            deleted = cursor.rowcount
            conn.commit()
            
            # Force checkpoint
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.close()
            
            print(f"   ✅ Deleted {deleted} record(s) from {db_path.name}")
            return deleted
        except sqlite3.OperationalError as e:
            if "locked" in str(e) and attempt < max_attempts - 1:
                print(f"   ⏳ Database locked, retry {attempt + 1}/{max_attempts}...")
                time.sleep(2)
                continue
            else:
                print(f"   ❌ Failed to delete from {db_path.name}: {e}")
                return 0
        except Exception as e:
            print(f"   ❌ Error deleting from {db_path.name}: {e}")
            return 0
    
    return 0

def list_all_people(db_path):
    """List all people in a database"""
    if not db_path.exists():
        return []
    
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        
        people = []
        if "embeddings" in db_path.name:
            cursor.execute("SELECT DISTINCT person_name FROM embeddings ORDER BY person_name")
            people = [row[0] for row in cursor.fetchall()]
        elif "face_detection" in db_path.name:
            cursor.execute("SELECT full_name FROM instructors ORDER BY full_name")
            people = [row[0] for row in cursor.fetchall()]
        elif "offline" in db_path.name:
            cursor.execute("SELECT first_name || ' ' || last_name FROM users ORDER BY last_name, first_name")
            people = [row[0] for row in cursor.fetchall()]
        
        conn.close()
        return people
    except Exception as e:
        print(f"   ❌ Error listing people from {db_path.name}: {e}")
        return []

def diagnose_system():
    """Run comprehensive system diagnostics"""
    print("\n" + "="*60)
    print("SYSTEM DIAGNOSTICS")
    print("="*60)
    
    issues = []
    
    # Check if databases exist
    print("\n[1/5] Checking database files...")
    for db in [EMBEDDINGS_DB, FACE_DETECTION_DB, OFFLINE_DB]:
        if db.exists():
            size = db.stat().st_size
            print(f"   ✅ {db.name}: {size:,} bytes")
        else:
            print(f"   ❌ {db.name}: NOT FOUND")
            issues.append(f"Missing database: {db.name}")
    
    # Check for locks
    print("\n[2/5] Checking for database locks...")
    for db in [EMBEDDINGS_DB, FACE_DETECTION_DB, OFFLINE_DB]:
        if db.exists():
            if check_database_lock(db):
                print(f"   ⚠️  {db.name}: LOCKED")
                issues.append(f"Database locked: {db.name}")
            else:
                print(f"   ✅ {db.name}: Not locked")
    
    # Check WAL files
    print("\n[3/5] Checking for WAL/SHM files...")
    has_wal = check_wal_files()
    if has_wal:
        issues.append("WAL/SHM files present (might need checkpoint)")
    
    # Check database contents
    print("\n[4/5] Checking database contents...")
    for db in [EMBEDDINGS_DB, FACE_DETECTION_DB, OFFLINE_DB]:
        if db.exists():
            people = list_all_people(db)
            if people:
                print(f"   {db.name}: {len(people)} person(s)")
                # Show first 5 people
                for person in people[:5]:
                    print(f"      - {person}")
                if len(people) > 5:
                    print(f"      ... and {len(people) - 5} more")
            else:
                print(f"   {db.name}: Empty")
    
    # Check for processes
    print("\n[5/5] Checking for running processes...")
    print("   ℹ️  Please manually check if these are running:")
    print("      - recognizer_arcface.py")
    print("      - backend server (npm run dev)")
    print("      - frontend server")
    
    # Summary
    print("\n" + "="*60)
    if issues:
        print(f"⚠️  FOUND {len(issues)} ISSUE(S):")
        for i, issue in enumerate(issues, 1):
            print(f"{i}. {issue}")
    else:
        print("✅ No issues detected")
    print("="*60)
    
    return issues

def fix_databases():
    """Fix common database issues"""
    print("\n" + "="*60)
    print("FIXING DATABASE ISSUES")
    print("="*60)
    
    # Step 1: Force checkpoint all databases
    print("\n[1/3] Forcing WAL checkpoint...")
    for db in [EMBEDDINGS_DB, FACE_DETECTION_DB, OFFLINE_DB]:
        if db.exists():
            force_checkpoint(db)
    
    # Step 2: Vacuum databases
    print("\n[2/3] Vacuuming databases...")
    for db in [EMBEDDINGS_DB, FACE_DETECTION_DB, OFFLINE_DB]:
        if db.exists():
            vacuum_database(db)
    
    # Step 3: Check results
    print("\n[3/3] Verifying fixes...")
    for db in [EMBEDDINGS_DB, FACE_DETECTION_DB, OFFLINE_DB]:
        if db.exists():
            if not check_database_lock(db):
                print(f"   ✅ {db.name}: Ready")
            else:
                print(f"   ⚠️  {db.name}: Still locked (stop services)")
    
    print("\n" + "="*60)
    print("DATABASE FIX COMPLETE")
    print("="*60)

def nuclear_delete_person(person_name):
    """Nuclear option - forcefully delete person from everywhere"""
    print("\n" + "="*60)
    print(f"NUCLEAR DELETE: '{person_name}'")
    print("="*60)
    
    total_deleted = 0
    
    # Delete from embeddings
    print("\n[1/3] Force deleting from face_embeddings.db...")
    total_deleted += force_delete_person(EMBEDDINGS_DB, person_name)
    
    # Delete from face_detection
    print("\n[2/3] Force deleting from face_detection_data.db...")
    total_deleted += force_delete_person(FACE_DETECTION_DB, person_name)
    
    # Delete from offline
    print("\n[3/3] Force deleting from offline_data.db...")
    total_deleted += force_delete_person(OFFLINE_DB, person_name)
    
    print("\n" + "="*60)
    print(f"TOTAL DELETED: {total_deleted} record(s)")
    print("="*60)
    
    return total_deleted

def main_menu():
    """Interactive menu for fixing issues"""
    while True:
        print("\n" + "="*60)
        print("DATABASE FIX UTILITY")
        print("="*60)
        print("\n1. Run diagnostics")
        print("2. Fix database issues (checkpoint + vacuum)")
        print("3. Nuclear delete 'Daniel Masligat'")
        print("4. Nuclear delete other person")
        print("5. List all people in databases")
        print("6. Exit")
        print("\n" + "="*60)
        
        choice = input("Select option (1-6): ").strip()
        
        if choice == "1":
            diagnose_system()
        elif choice == "2":
            fix_databases()
        elif choice == "3":
            nuclear_delete_person("daniel masligat")
            print("\n⚠️  IMPORTANT: Restart face recognition service!")
        elif choice == "4":
            name = input("Enter person name to delete: ").strip()
            if name:
                nuclear_delete_person(name)
                print("\n⚠️  IMPORTANT: Restart face recognition service!")
        elif choice == "5":
            for db in [EMBEDDINGS_DB, FACE_DETECTION_DB, OFFLINE_DB]:
                print(f"\n{db.name}:")
                people = list_all_people(db)
                if people:
                    for person in people:
                        print(f"  - {person}")
                else:
                    print("  (empty)")
        elif choice == "6":
            print("\nGoodbye!")
            break
        else:
            print("\n❌ Invalid choice. Please select 1-6.")

if __name__ == "__main__":
    print("\n" + "="*60)
    print("DATABASE ISSUE FIX SCRIPT")
    print("="*60)
    print("\n⚠️  WARNING: Close these first:")
    print("   1. Stop recognizer_arcface.py (Ctrl+C)")
    print("   2. Stop backend server if running")
    print("   3. Close any DB browser tools")
    print("\n" + "="*60)
    
    response = input("\nHave you stopped all services? (y/n): ").strip().lower()
    
    if response != 'y':
        print("\n❌ Please stop all services first, then run this script again.")
        sys.exit(1)
    
    main_menu()

