"""
Check Offline Database Contents
Quick diagnostic to see what data is in your offline database
"""

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "offline_data.db"

def check_database():
    """Check what's in the offline database"""
    
    print("=" * 60)
    print("  OFFLINE DATABASE CONTENTS")
    print("=" * 60)
    print()
    
    if not DB_PATH.exists():
        print(f"❌ Database not found: {DB_PATH}")
        print("   Run the backend server first to create it.")
        return
    
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    try:
        # Check each table
        tables = {
            "users": "Users (Faculty, Deans, etc.)",
            "schedules": "Schedules",
            "colleges": "Colleges",
            "courses": "Courses",
            "sections": "Sections",
            "rooms": "Rooms",
            "semesters": "Semesters",
            "attendance_logs": "Attendance Logs"
        }
        
        for table, description in tables.items():
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                
                if count == 0:
                    status = "❌ EMPTY"
                elif count < 5:
                    status = f"⚠️  {count} record(s)"
                else:
                    status = f"✅ {count} record(s)"
                
                print(f"{status:20} {description}")
                
                # Show details for critical empty tables
                if table == "semesters" and count == 0:
                    print(f"                     ⚠️  No semesters! Run ADD_SEMESTERS.bat")
                
            except sqlite3.OperationalError:
                print(f"⚠️  N/A             {description} (table doesn't exist)")
        
        print()
        print("=" * 60)
        
        # Check semesters in detail if they exist
        cursor.execute("SELECT COUNT(*) FROM semesters")
        sem_count = cursor.fetchone()[0]
        
        if sem_count > 0:
            print()
            print("SEMESTERS:")
            cursor.execute("""
                SELECT semester_name, academic_year, start_date, end_date, is_active 
                FROM semesters 
                ORDER BY start_date
            """)
            for row in cursor.fetchall():
                active = "✅ ACTIVE" if row[4] == 1 else "  "
                print(f"  {active} {row[0]:15} {row[1]:12} ({row[2]} to {row[3]})")
        else:
            print()
            print("⚠️  NO SEMESTERS FOUND!")
            print("   This is why you can't add schedules!")
            print()
            print("   Fix: Run 'ADD_SEMESTERS.bat' to add default semesters")
        
        print("=" * 60)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()

if __name__ == "__main__":
    check_database()
    print()
    input("Press Enter to exit...")

