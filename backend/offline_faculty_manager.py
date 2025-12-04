"""
Offline Faculty Manager
Complete tool for managing faculty in offline mode
- Add faculty members
- Delete faculty members
- List all faculty
- Fix Daniel Masligat issue
- Sync databases
"""
import sqlite3
import os
import shutil
import sys
from pathlib import Path
from datetime import datetime

# Check if bcrypt is installed
try:
    import bcrypt
except ImportError:
    print("\n" + "="*80)
    print("❌ ERROR: bcrypt module not found!")
    print("="*80)
    print("\nPlease install it by running:")
    print("   py -3.13 -m pip install bcrypt")
    print("\nOr run the installer:")
    print("   install_offline_tools.bat")
    print("\n" + "="*80)
    input("\nPress Enter to exit...")
    sys.exit(1)

# Database paths
SCRIPT_DIR = Path(__file__).parent.resolve()
OFFLINE_DB = SCRIPT_DIR / "offline_data.db"
EMBEDDINGS_DB = SCRIPT_DIR / "face_embeddings.db"
FACE_DETECTION_DB = SCRIPT_DIR / "face_detection_data.db"
FACES_DIR = SCRIPT_DIR.parent / "streaming-server" / "faces"

def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    import bcrypt
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def generate_id() -> str:
    """Generate MongoDB-style ID"""
    import secrets
    timestamp = hex(int(datetime.now().timestamp()))[2:]
    random_part = secrets.token_hex(12)
    return (timestamp + random_part)[:24]

def list_all_faculty():
    """List all faculty members in offline database"""
    print("\n" + "="*80)
    print("ALL FACULTY MEMBERS IN OFFLINE DATABASE")
    print("="*80)
    
    if not OFFLINE_DB.exists():
        print("❌ Offline database not found!")
        return []
    
    try:
        conn = sqlite3.connect(str(OFFLINE_DB))
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, first_name, middle_name, last_name, username, email, role, status 
            FROM users 
            WHERE role IN ('instructor', 'dean', 'programchairperson')
            ORDER BY last_name, first_name
        """)
        
        faculty = cursor.fetchall()
        conn.close()
        
        if not faculty:
            print("\n📭 No faculty members found in database")
            return []
        
        print(f"\n✓ Found {len(faculty)} faculty member(s):\n")
        print(f"{'No.':<4} {'Name':<35} {'Username':<20} {'Role':<20} {'Status':<15}")
        print("-"*95)
        
        for i, (id, first, middle, last, username, email, role, status) in enumerate(faculty, 1):
            middle_initial = f"{middle[0]}." if middle else ""
            full_name = f"{last}, {first} {middle_initial}".strip()
            print(f"{i:<4} {full_name:<35} {username:<20} {role:<20} {status:<15}")
        
        print("\n" + "="*80)
        return faculty
    except Exception as e:
        print(f"❌ Error: {e}")
        return []

def get_faculty_by_id(faculty_id: str):
    """Get faculty details by ID"""
    try:
        conn = sqlite3.connect(str(OFFLINE_DB))
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM users WHERE id = ?", (faculty_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            columns = [desc[0] for desc in cursor.description]
            return dict(zip(columns, row))
        return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def add_faculty_member():
    """Add a new faculty member to offline database"""
    print("\n" + "="*80)
    print("ADD FACULTY MEMBER (OFFLINE MODE)")
    print("="*80)
    
    print("\nEnter faculty information:")
    
    first_name = input("First Name: ").strip()
    middle_name = input("Middle Name (optional): ").strip()
    last_name = input("Last Name: ").strip()
    ext_name = input("Extension Name (Jr., Sr., III, optional): ").strip()
    
    username = input("Username: ").strip()
    email = input("Email: ").strip()
    password = input("Password: ").strip()
    
    print("\nRole Options:")
    print("1. instructor")
    print("2. dean")
    print("3. programchairperson")
    role_choice = input("Select role (1-3): ").strip()
    role_map = {"1": "instructor", "2": "dean", "3": "programchairperson"}
    role = role_map.get(role_choice, "instructor")
    
    # List colleges
    print("\nAvailable Colleges:")
    conn = sqlite3.connect(str(OFFLINE_DB))
    cursor = conn.cursor()
    cursor.execute("SELECT id, code, name FROM colleges ORDER BY code")
    colleges = cursor.fetchall()
    
    if not colleges:
        print("❌ No colleges found! Please add colleges first.")
        conn.close()
        return
    
    for i, (id, code, name) in enumerate(colleges, 1):
        print(f"{i}. {code} - {name}")
    
    college_idx = int(input(f"Select college (1-{len(colleges)}): ").strip()) - 1
    college_id = colleges[college_idx][0]
    
    # List courses
    print("\nAvailable Courses:")
    cursor.execute("SELECT id, code, name FROM courses WHERE college_id = ? ORDER BY code", (college_id,))
    courses = cursor.fetchall()
    
    if not courses:
        print("❌ No courses found for this college!")
        conn.close()
        return
    
    for i, (id, code, name) in enumerate(courses, 1):
        print(f"{i}. {code} - {name}")
    
    course_idx = int(input(f"Select course (1-{len(courses)}): ").strip()) - 1
    course_id = courses[course_idx][0]
    
    # Optional fields
    print("\nOptional Information (press Enter to skip):")
    education = input("Highest Educational Attainment: ").strip()
    rank = input("Academic Rank: ").strip()
    appointment = input("Status of Appointment: ").strip()
    prep = input("Number of Preparations: ").strip() or "0"
    load = input("Total Teaching Load: ").strip() or "0"
    
    # Confirm
    print("\n" + "="*80)
    print("CONFIRM FACULTY INFORMATION")
    print("="*80)
    print(f"Name: {last_name}, {first_name} {middle_name} {ext_name}")
    print(f"Username: {username}")
    print(f"Email: {email}")
    print(f"Role: {role}")
    print(f"College: {colleges[college_idx][1]} - {colleges[college_idx][2]}")
    print(f"Course: {courses[course_idx][1]} - {courses[course_idx][2]}")
    
    confirm = input("\nAdd this faculty member? (y/n): ").strip().lower()
    
    if confirm != 'y':
        print("❌ Cancelled")
        conn.close()
        return
    
    try:
        # Hash password
        hashed_pwd = hash_password(password)
        
        # Generate ID
        faculty_id = generate_id()
        
        # Insert into database
        cursor.execute("""
            INSERT INTO users (
                id, first_name, middle_name, last_name, ext_name,
                username, email, password, role, status,
                college_id, course_id,
                highest_educational_attainment, academic_rank, status_of_appointment,
                number_of_prep, total_teaching_load,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """, (
            faculty_id, first_name, middle_name, last_name, ext_name,
            username, email, hashed_pwd, role, "active",
            college_id, course_id,
            education or "", rank or "", appointment or "",
            int(prep), int(load)
        ))
        
        conn.commit()
        conn.close()
        
        print(f"\n✅ Faculty member added successfully!")
        print(f"   ID: {faculty_id}")
        print(f"   Name: {last_name}, {first_name}")
        print(f"   Role: {role}")
        
        print("\n⚠️  IMPORTANT: Restart face recognition service to reload cache")
        
    except Exception as e:
        print(f"\n❌ Error adding faculty: {e}")
        conn.close()

def delete_faculty_member():
    """Delete a faculty member from all databases"""
    print("\n" + "="*80)
    print("DELETE FACULTY MEMBER (OFFLINE MODE)")
    print("="*80)
    
    # List all faculty
    faculty = list_all_faculty()
    if not faculty:
        return
    
    # Get selection
    choice = input("\nEnter faculty number to delete (or 'c' to cancel): ").strip()
    
    if choice.lower() == 'c':
        print("❌ Cancelled")
        return
    
    try:
        idx = int(choice) - 1
        if idx < 0 or idx >= len(faculty):
            print("❌ Invalid selection")
            return
        
        faculty_id, first, middle, last, username, email, role, status = faculty[idx]
        full_name = f"{last}, {first} {middle or ''}"
        
        # Confirm
        print(f"\n⚠️  WARNING: This will delete:")
        print(f"   Name: {full_name}")
        print(f"   Username: {username}")
        print(f"   Email: {email}")
        print(f"   Role: {role}")
        print(f"\n   This will also delete:")
        print(f"   - Face embeddings from face_embeddings.db")
        print(f"   - Instructor records from face_detection_data.db")
        print(f"   - Face image folder from streaming-server/faces/")
        
        confirm = input("\nProceed with deletion? (y/n): ").strip().lower()
        
        if confirm != 'y':
            print("❌ Cancelled")
            return
        
        # Delete from offline_data.db
        conn = sqlite3.connect(str(OFFLINE_DB))
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE id = ?", (faculty_id,))
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.commit()
        conn.close()
        print(f"✅ Deleted from offline_data.db")
        
        # Delete from face_embeddings.db
        if EMBEDDINGS_DB.exists():
            conn = sqlite3.connect(str(EMBEDDINGS_DB))
            cursor = conn.cursor()
            folder_name = f"{first}_{last}".replace(' ', '_')
            cursor.execute("DELETE FROM embeddings WHERE person_name LIKE ? OR person_name LIKE ?", 
                          (f"%{first}%{last}%", f"%{last}%{first}%"))
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.commit()
            deleted_count = cursor.rowcount
            conn.close()
            print(f"✅ Deleted {deleted_count} embedding(s) from face_embeddings.db")
        
        # Delete from face_detection_data.db
        if FACE_DETECTION_DB.exists():
            conn = sqlite3.connect(str(FACE_DETECTION_DB))
            cursor = conn.cursor()
            cursor.execute("DELETE FROM instructors WHERE full_name LIKE ?", (f"%{full_name}%",))
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            conn.commit()
            deleted_count = cursor.rowcount
            conn.close()
            print(f"✅ Deleted {deleted_count} instructor record(s) from face_detection_data.db")
        
        # Delete face images folder
        folder_patterns = [
            f"{first}_{last}",
            f"{last}_{first}",
            f"{first.replace(' ', '_')}_{last.replace(' ', '_')}"
        ]
        
        deleted_folders = 0
        if FACES_DIR.exists():
            for folder in FACES_DIR.iterdir():
                if folder.is_dir():
                    folder_name = folder.name.lower()
                    first_lower = first.lower()
                    last_lower = last.lower()
                    
                    if (first_lower in folder_name and last_lower in folder_name):
                        try:
                            shutil.rmtree(folder)
                            print(f"✅ Deleted face folder: {folder.name}")
                            deleted_folders += 1
                        except Exception as e:
                            print(f"⚠️  Could not delete folder {folder.name}: {e}")
        
        if deleted_folders == 0:
            print(f"ℹ️  No face folders found for {full_name}")
        
        print(f"\n✅ Faculty member deleted successfully!")
        print(f"\n⚠️  IMPORTANT: Restart face recognition service to reload cache:")
        print(f"   1. Stop: Press Ctrl+C in recognizer_arcface.py window")
        print(f"   2. Start: py -3.13 recognizer_arcface.py")
        
    except ValueError:
        print("❌ Invalid input")
    except Exception as e:
        print(f"❌ Error: {e}")

def fix_daniel_masligat():
    """Nuclear delete Daniel Masligat from all databases"""
    print("\n" + "="*80)
    print("FIX DANIEL MASLIGAT ISSUE")
    print("="*80)
    
    print("\n⚠️  IMPORTANT: Make sure all services are stopped:")
    print("   - Face recognition (recognizer_arcface.py)")
    print("   - Backend server (npm run dev)")
    print()
    response = input("Have you stopped all services? (y/n): ").strip().lower()
    
    if response != 'y':
        print("\n❌ Please stop all services first, then try again.")
        print("\n   1. Go to face recognition window → Press Ctrl+C")
        print("   2. Go to backend window → Press Ctrl+C")
        print("   3. Wait a few seconds")
        print("   4. Run this script again")
        return
    
    print("\nSearching for Daniel Masligat in all databases...")
    
    total_deleted = 0
    errors = []
    
    # offline_data.db
    if OFFLINE_DB.exists():
        try:
            conn = sqlite3.connect(str(OFFLINE_DB), timeout=10)
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, first_name, last_name FROM users 
                WHERE first_name LIKE '%daniel%' OR last_name LIKE '%masligat%'
            """)
            results = cursor.fetchall()
            
            if results:
                print(f"\n✓ Found {len(results)} in offline_data.db:")
                for id, first, last in results:
                    print(f"  - {first} {last} (ID: {id})")
                
                confirm = input("\nDelete these users? (y/n): ").strip().lower()
                if confirm == 'y':
                    cursor.execute("""
                        DELETE FROM users 
                        WHERE first_name LIKE '%daniel%' OR last_name LIKE '%masligat%'
                    """)
                    deleted = cursor.rowcount
                    conn.commit()
                    try:
                        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                    except:
                        pass  # Checkpoint is optional
                    total_deleted += deleted
                    print(f"✅ Deleted {deleted} user(s)")
            else:
                print("✓ Not found in offline_data.db")
            conn.close()
        except sqlite3.OperationalError as e:
            error_msg = f"offline_data.db: {str(e)}"
            errors.append(error_msg)
            print(f"❌ Error: Database is locked. Stop all services first!")
        except Exception as e:
            error_msg = f"offline_data.db: {str(e)}"
            errors.append(error_msg)
            print(f"❌ Error: {e}")
    
    # face_embeddings.db
    if EMBEDDINGS_DB.exists():
        try:
            conn = sqlite3.connect(str(EMBEDDINGS_DB), timeout=10)
            cursor = conn.cursor()
            cursor.execute("""
                DELETE FROM embeddings 
                WHERE person_name LIKE '%daniel%masligat%' 
                OR person_name LIKE '%masligat%daniel%'
            """)
            deleted = cursor.rowcount
            conn.commit()
            try:
                conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            except:
                pass  # Checkpoint is optional
            conn.close()
            if deleted > 0:
                print(f"✅ Deleted {deleted} embedding(s) from face_embeddings.db")
                total_deleted += deleted
            else:
                print("✓ Not found in face_embeddings.db")
        except sqlite3.OperationalError as e:
            error_msg = f"face_embeddings.db: {str(e)}"
            errors.append(error_msg)
            print(f"❌ Error: Database is locked. Stop all services first!")
        except Exception as e:
            error_msg = f"face_embeddings.db: {str(e)}"
            errors.append(error_msg)
            print(f"❌ Error: {e}")
    
    # face_detection_data.db
    if FACE_DETECTION_DB.exists():
        try:
            conn = sqlite3.connect(str(FACE_DETECTION_DB), timeout=10)
            cursor = conn.cursor()
            cursor.execute("""
                DELETE FROM instructors 
                WHERE full_name LIKE '%daniel%masligat%' 
                OR full_name LIKE '%masligat%daniel%'
            """)
            deleted = cursor.rowcount
            conn.commit()
            try:
                conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            except:
                pass  # Checkpoint is optional
            conn.close()
            if deleted > 0:
                print(f"✅ Deleted {deleted} instructor(s) from face_detection_data.db")
                total_deleted += deleted
            else:
                print("✓ Not found in face_detection_data.db")
        except sqlite3.OperationalError as e:
            error_msg = f"face_detection_data.db: {str(e)}"
            errors.append(error_msg)
            print(f"❌ Error: Database is locked. Stop all services first!")
        except Exception as e:
            error_msg = f"face_detection_data.db: {str(e)}"
            errors.append(error_msg)
            print(f"❌ Error: {e}")
    
    # Face folders
    if FACES_DIR.exists():
        deleted_folders = []
        for folder in FACES_DIR.iterdir():
            if folder.is_dir():
                folder_lower = folder.name.lower()
                if 'daniel' in folder_lower and 'masligat' in folder_lower:
                    try:
                        shutil.rmtree(folder)
                        deleted_folders.append(folder.name)
                        print(f"✅ Deleted face folder: {folder.name}")
                        total_deleted += 1
                    except Exception as e:
                        print(f"⚠️  Could not delete folder: {e}")
        
        if not deleted_folders:
            print("✓ No face folders found")
    
    print(f"\n{'='*80}")
    if errors:
        print(f"⚠️  COMPLETED WITH {len(errors)} ERROR(S):")
        for err in errors:
            print(f"   - {err}")
        print(f"\n💡 If you see 'database is locked' errors:")
        print(f"   1. Make sure you stopped ALL services (Ctrl+C in each window)")
        print(f"   2. Wait 5-10 seconds for databases to unlock")
        print(f"   3. Run this script again")
    elif total_deleted > 0:
        print(f"✅ DELETED {total_deleted} TOTAL RECORD(S)")
        print(f"\n⚠️  RESTART FACE RECOGNITION SERVICE!")
    else:
        print(f"✅ Daniel Masligat NOT FOUND in any database")
    print(f"{'='*80}")

def main_menu():
    """Interactive menu"""
    while True:
        print("\n" + "="*80)
        print("OFFLINE FACULTY MANAGER")
        print("="*80)
        print("\n1. List all faculty members")
        print("2. Add new faculty member")
        print("3. Delete faculty member")
        print("4. Fix Daniel Masligat issue")
        print("5. Search for faculty member")
        print("6. Exit")
        print("\n" + "="*80)
        
        choice = input("Select option (1-6): ").strip()
        
        if choice == "1":
            list_all_faculty()
        elif choice == "2":
            add_faculty_member()
        elif choice == "3":
            delete_faculty_member()
        elif choice == "4":
            fix_daniel_masligat()
        elif choice == "5":
            name = input("\nEnter name to search: ").strip()
            search_faculty(name)
        elif choice == "6":
            print("\nGoodbye!")
            break
        else:
            print("\n❌ Invalid choice")

def search_faculty(name: str):
    """Search for faculty by name"""
    print(f"\n{'='*80}")
    print(f"SEARCHING FOR: '{name}'")
    print(f"{'='*80}")
    
    if not OFFLINE_DB.exists():
        print("❌ Offline database not found!")
        return
    
    try:
        conn = sqlite3.connect(str(OFFLINE_DB))
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, first_name, middle_name, last_name, username, email, role, status 
            FROM users 
            WHERE (first_name LIKE ? OR last_name LIKE ? OR username LIKE ? OR email LIKE ?)
            AND role IN ('instructor', 'dean', 'programchairperson')
            ORDER BY last_name, first_name
        """, (f"%{name}%", f"%{name}%", f"%{name}%", f"%{name}%"))
        
        results = cursor.fetchall()
        conn.close()
        
        if not results:
            print(f"\n📭 No faculty found matching '{name}'")
            return
        
        print(f"\n✓ Found {len(results)} faculty member(s):\n")
        print(f"{'Name':<35} {'Username':<20} {'Email':<30} {'Role':<15}")
        print("-"*100)
        
        for id, first, middle, last, username, email, role, status in results:
            middle_initial = f"{middle[0]}." if middle else ""
            full_name = f"{last}, {first} {middle_initial}".strip()
            print(f"{full_name:<35} {username:<20} {email:<30} {role:<15}")
        
        print(f"{'='*80}")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    print("\n" + "="*80)
    print("OFFLINE FACULTY MANAGER")
    print("Manage faculty members in offline mode")
    print("="*80)
    
    # Check if databases exist
    if not OFFLINE_DB.exists():
        print("\n⚠️  WARNING: offline_data.db not found!")
        print("   Make sure you're in offline mode and the database is initialized.")
        print(f"   Expected location: {OFFLINE_DB}")
        input("\nPress Enter to continue anyway...")
    
    main_menu()

