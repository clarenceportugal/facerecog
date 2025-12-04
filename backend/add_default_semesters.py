"""
Add Default Semesters to Offline Database
This script adds default semesters to your offline SQLite database
"""

import sqlite3
import sys
from pathlib import Path
from datetime import datetime
import uuid

# Database path
DB_PATH = Path(__file__).parent / "offline_data.db"

def generate_id():
    """Generate a unique ID"""
    return str(uuid.uuid4())

def add_default_semesters():
    """Add default semesters to the database"""
    
    print("=" * 60)
    print("  ADD DEFAULT SEMESTERS TO OFFLINE DATABASE")
    print("=" * 60)
    print()
    
    # Check if database exists
    if not DB_PATH.exists():
        print(f"❌ Database not found: {DB_PATH}")
        print("   Run the backend server first to create the database.")
        return False
    
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    try:
        # Check current semesters
        cursor.execute("SELECT COUNT(*) FROM semesters")
        count = cursor.fetchone()[0]
        
        print(f"Current semesters in database: {count}")
        print()
        
        if count > 0:
            print("Existing semesters:")
            cursor.execute("SELECT semester_name, academic_year, start_date, end_date, is_active FROM semesters")
            for row in cursor.fetchall():
                active = "✅ ACTIVE" if row[4] == 1 else "  "
                print(f"  {active} {row[0]} - {row[1]} ({row[2]} to {row[3]})")
            print()
            
            response = input("Do you want to add more semesters? (y/n): ").strip().lower()
            if response != 'y':
                print("Cancelled.")
                return True
        
        # Default semesters to add
        current_year = datetime.now().year
        
        default_semesters = [
            {
                "semester_name": "1st Semester",
                "academic_year": f"{current_year-1}-{current_year}",
                "start_date": f"{current_year-1}-08-01",
                "end_date": f"{current_year-1}-12-31",
                "is_active": 0
            },
            {
                "semester_name": "2nd Semester",
                "academic_year": f"{current_year-1}-{current_year}",
                "start_date": f"{current_year}-01-01",
                "end_date": f"{current_year}-05-31",
                "is_active": 0
            },
            {
                "semester_name": "1st Semester",
                "academic_year": f"{current_year}-{current_year+1}",
                "start_date": f"{current_year}-08-01",
                "end_date": f"{current_year}-12-31",
                "is_active": 1  # Make this the active semester
            },
            {
                "semester_name": "2nd Semester",
                "academic_year": f"{current_year}-{current_year+1}",
                "start_date": f"{current_year+1}-01-01",
                "end_date": f"{current_year+1}-05-31",
                "is_active": 0
            },
            {
                "semester_name": "1st Semester",
                "academic_year": f"{current_year+1}-{current_year+2}",
                "start_date": f"{current_year+1}-08-01",
                "end_date": f"{current_year+1}-12-31",
                "is_active": 0
            },
        ]
        
        print("Adding the following semesters:")
        print()
        for sem in default_semesters:
            active = "✅ ACTIVE" if sem['is_active'] == 1 else "  "
            print(f"  {active} {sem['semester_name']} - {sem['academic_year']}")
            print(f"       {sem['start_date']} to {sem['end_date']}")
        print()
        
        response = input("Continue? (y/n): ").strip().lower()
        if response != 'y':
            print("Cancelled.")
            return True
        
        # Insert semesters
        added = 0
        skipped = 0
        
        for sem in default_semesters:
            try:
                # Check if already exists
                cursor.execute(
                    "SELECT id FROM semesters WHERE academic_year = ? AND semester_name = ?",
                    (sem['academic_year'], sem['semester_name'])
                )
                existing = cursor.fetchone()
                
                if existing:
                    print(f"⚠️  Skipped: {sem['semester_name']} {sem['academic_year']} (already exists)")
                    skipped += 1
                    continue
                
                # Insert new semester
                semester_id = generate_id()
                cursor.execute("""
                    INSERT INTO semesters (id, semester_name, academic_year, start_date, end_date, is_active)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    semester_id,
                    sem['semester_name'],
                    sem['academic_year'],
                    sem['start_date'],
                    sem['end_date'],
                    sem['is_active']
                ))
                
                active_flag = "✅" if sem['is_active'] == 1 else "✓"
                print(f"{active_flag}  Added: {sem['semester_name']} {sem['academic_year']}")
                added += 1
                
            except sqlite3.IntegrityError as e:
                print(f"⚠️  Skipped: {sem['semester_name']} {sem['academic_year']} ({e})")
                skipped += 1
        
        conn.commit()
        
        print()
        print("=" * 60)
        print(f"✅ Successfully added {added} semester(s)")
        if skipped > 0:
            print(f"⚠️  Skipped {skipped} semester(s) (already exist)")
        print()
        
        # Show final count
        cursor.execute("SELECT COUNT(*) FROM semesters")
        final_count = cursor.fetchone()[0]
        print(f"Total semesters in database: {final_count}")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    success = add_default_semesters()
    sys.exit(0 if success else 1)

