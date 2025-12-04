"""
Local SQLite Database for All Face Detection Data
Stores schedules, rooms, instructors, and attendance logs locally
"""
import sqlite3
import json
import os
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import threading
from datetime import datetime, date, time as dt_time

# Database file location
SCRIPT_DIR = Path(__file__).parent.resolve()
DB_PATH = SCRIPT_DIR / "face_detection_data.db"

_db_lock = threading.Lock()

def init_database():
    """Initialize SQLite database with all required tables"""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    # Schedules table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS schedules (
            id TEXT PRIMARY KEY,
            instructor_id TEXT NOT NULL,
            instructor_name TEXT NOT NULL,
            course_code TEXT NOT NULL,
            course_title TEXT NOT NULL,
            room TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            semester_start_date TEXT NOT NULL,
            semester_end_date TEXT NOT NULL,
            days TEXT NOT NULL,  -- JSON string: {"mon": true, "tue": false, ...}
            section_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Instructors table (for quick lookup)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS instructors (
            id TEXT PRIMARY KEY,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            full_name TEXT NOT NULL,  -- "LastName, FirstName" format
            folder_name TEXT,  -- Folder name in faces directory
            user_id TEXT,
            college_id TEXT,
            role TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Rooms table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rooms (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            location TEXT,
            college_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Attendance logs queue (for offline logging)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance_logs_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            instructor_name TEXT NOT NULL,
            schedule_id TEXT NOT NULL,
            camera_id TEXT,
            date TEXT NOT NULL,
            time_in TEXT,
            time_out TEXT,
            status TEXT NOT NULL,
            remarks TEXT,
            log_type TEXT,
            is_late INTEGER DEFAULT 0,
            synced INTEGER DEFAULT 0,  -- 0 = not synced, 1 = synced
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            synced_at TIMESTAMP
        )
    """)
    
    # Create indexes for faster lookups
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_schedules_instructor ON schedules(instructor_id, instructor_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_schedules_dates ON schedules(semester_start_date, semester_end_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_instructors_name ON instructors(full_name, folder_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_synced ON attendance_logs_queue(synced, created_at)")
    
    conn.commit()
    conn.close()
    print(f"[LOCAL DB] [OK] Database initialized at: {DB_PATH}", flush=True)

def save_schedule(schedule_data: Dict):
    """Save a schedule to local database"""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        # Convert days dict to JSON string
        days_json = json.dumps(schedule_data.get('days', {}))
        
        cursor.execute("""
            INSERT OR REPLACE INTO schedules 
            (id, instructor_id, instructor_name, course_code, course_title, room,
             start_time, end_time, semester_start_date, semester_end_date, days, section_id, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            schedule_data.get('_id') or schedule_data.get('id'),
            schedule_data.get('instructor_id') or schedule_data.get('instructor', {}).get('_id', ''),
            schedule_data.get('instructor_name') or f"{schedule_data.get('instructor', {}).get('first_name', '')} {schedule_data.get('instructor', {}).get('last_name', '')}",
            schedule_data.get('courseCode') or schedule_data.get('course_code', ''),
            schedule_data.get('courseTitle') or schedule_data.get('course_title', ''),
            schedule_data.get('room', ''),
            schedule_data.get('startTime') or schedule_data.get('start_time', ''),
            schedule_data.get('endTime') or schedule_data.get('end_time', ''),
            schedule_data.get('semesterStartDate') or schedule_data.get('semester_start_date', ''),
            schedule_data.get('semesterEndDate') or schedule_data.get('semester_end_date', ''),
            days_json,
            schedule_data.get('section_id') or schedule_data.get('section', {}).get('_id', '')
        ))
        
        conn.commit()
        print(f"[LOCAL DB] [OK] Saved schedule: {schedule_data.get('courseCode', 'N/A')}", flush=True)
    except Exception as e:
        print(f"[LOCAL DB] [ERROR] Error saving schedule: {e}", flush=True)
        conn.rollback()
    finally:
        conn.close()

def save_schedules_batch(schedules: List[Dict]):
    """Save multiple schedules in batch"""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        batch_data = []
        for schedule_data in schedules:
            days_json = json.dumps(schedule_data.get('days', {}))
            batch_data.append((
                schedule_data.get('_id') or schedule_data.get('id'),
                schedule_data.get('instructor_id') or schedule_data.get('instructor', {}).get('_id', ''),
                schedule_data.get('instructor_name') or f"{schedule_data.get('instructor', {}).get('first_name', '')} {schedule_data.get('instructor', {}).get('last_name', '')}",
                schedule_data.get('courseCode') or schedule_data.get('course_code', ''),
                schedule_data.get('courseTitle') or schedule_data.get('course_title', ''),
                schedule_data.get('room', ''),
                schedule_data.get('startTime') or schedule_data.get('start_time', ''),
                schedule_data.get('endTime') or schedule_data.get('end_time', ''),
                schedule_data.get('semesterStartDate') or schedule_data.get('semester_start_date', ''),
                schedule_data.get('semesterEndDate') or schedule_data.get('semester_end_date', ''),
                days_json,
                schedule_data.get('section_id') or schedule_data.get('section', {}).get('_id', '')
            ))
        
        cursor.executemany("""
            INSERT OR REPLACE INTO schedules 
            (id, instructor_id, instructor_name, course_code, course_title, room,
             start_time, end_time, semester_start_date, semester_end_date, days, section_id, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, batch_data)
        
        conn.commit()
        print(f"[LOCAL DB] [OK] Saved {len(batch_data)} schedules in batch", flush=True)
    except Exception as e:
        print(f"[LOCAL DB] [ERROR] Error saving schedules batch: {e}", flush=True)
        conn.rollback()
    finally:
        conn.close()

def get_current_schedule(instructor_name: str, room_name: Optional[str] = None) -> Optional[Dict]:
    """Get current schedule for an instructor from local database"""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        # Get current date and day
        today = date.today().isoformat()
        day_names = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
        current_day = day_names[datetime.now().weekday()]
        current_time = datetime.now().time()
        current_minutes = current_time.hour * 60 + current_time.minute
        
        # Query schedules
        query = """
            SELECT * FROM schedules 
            WHERE instructor_name LIKE ? 
            AND semester_start_date <= ? 
            AND semester_end_date >= ?
        """
        params = [f"%{instructor_name}%", today, today]
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        # Get column names
        columns = [desc[0] for desc in cursor.description]
        
        for row in rows:
            schedule = dict(zip(columns, row))
            
            # Parse days JSON
            days = json.loads(schedule.get('days', '{}'))
            if not days.get(current_day, False):
                continue  # Not scheduled for today
            
            # Check time range
            start_time_str = schedule.get('start_time', '')
            end_time_str = schedule.get('end_time', '')
            
            try:
                start_h, start_m = map(int, start_time_str.split(':'))
                end_h, end_m = map(int, end_time_str.split(':'))
                start_minutes = start_h * 60 + start_m
                end_minutes = end_h * 60 + end_m
            except:
                continue
            
            # Check if current time is within schedule (including 30 min before class)
            time_before_class = start_minutes - 30
            if time_before_class <= current_minutes <= end_minutes:
                # Check room if provided
                schedule_room = (schedule.get('room') or '').strip().lower()
                room_match = True
                
                if room_name:
                    provided_room = room_name.strip().lower()
                    room_match = (
                        schedule_room == provided_room or
                        schedule_room in provided_room or
                        provided_room in schedule_room
                    )
                
                # Format schedule for return
                result = {
                    '_id': schedule.get('id'),
                    'courseCode': schedule.get('course_code'),
                    'courseTitle': schedule.get('course_title'),
                    'room': schedule.get('room'),
                    'startTime': schedule.get('start_time'),
                    'endTime': schedule.get('end_time'),
                    'days': days,
                    'instructor_name': schedule.get('instructor_name'),
                    'isValidSchedule': room_match,
                    'timeMatch': True,
                    'roomMatch': room_match if room_name else None
                }
                
                return result
        
        return None
        
    except Exception as e:
        print(f"[LOCAL DB] [ERROR] Error getting schedule: {e}", flush=True)
        return None
    finally:
        conn.close()

def save_instructor(instructor_data: Dict):
    """Save instructor information to local database"""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        first_name = instructor_data.get('first_name', '')
        last_name = instructor_data.get('last_name', '')
        full_name = f"{last_name}, {first_name}"
        folder_name = instructor_data.get('folder_name') or f"{first_name}_{last_name}".replace(' ', '_')
        
        cursor.execute("""
            INSERT OR REPLACE INTO instructors 
            (id, first_name, last_name, full_name, folder_name, user_id, college_id, role, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            instructor_data.get('_id') or instructor_data.get('id', ''),
            first_name,
            last_name,
            full_name,
            folder_name,
            instructor_data.get('user_id') or instructor_data.get('_id', ''),
            instructor_data.get('college_id') or instructor_data.get('college', {}).get('_id', ''),
            instructor_data.get('role', 'instructor')
        ))
        
        conn.commit()
    except Exception as e:
        print(f"[LOCAL DB] [ERROR] Error saving instructor: {e}", flush=True)
        conn.rollback()
    finally:
        conn.close()

def get_instructor_by_name(name: str) -> Optional[Dict]:
    """Get instructor by name (supports various name formats)"""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        # Try different name formats
        cursor.execute("""
            SELECT * FROM instructors 
            WHERE full_name LIKE ? 
            OR folder_name LIKE ?
            OR (first_name || ' ' || last_name) LIKE ?
            OR (last_name || ', ' || first_name) LIKE ?
        """, [f"%{name}%", f"%{name}%", f"%{name}%", f"%{name}%"])
        
        row = cursor.fetchone()
        if row:
            columns = [desc[0] for desc in cursor.description]
            return dict(zip(columns, row))
        return None
    except Exception as e:
        print(f"[LOCAL DB] [ERROR] Error getting instructor: {e}", flush=True)
        return None
    finally:
        conn.close()

def queue_attendance_log(log_data: Dict) -> int:
    """Queue an attendance log for later sync (offline logging)"""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            INSERT INTO attendance_logs_queue 
            (instructor_name, schedule_id, camera_id, date, time_in, time_out, 
             status, remarks, log_type, is_late, synced)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """, (
            log_data.get('instructorName') or log_data.get('instructor_name', ''),
            log_data.get('scheduleId') or log_data.get('schedule_id', ''),
            log_data.get('cameraId') or log_data.get('camera_id', 'camera1'),
            log_data.get('date') or datetime.now().date().isoformat(),
            log_data.get('timeIn') or log_data.get('time_in'),
            log_data.get('timeOut') or log_data.get('time_out'),
            log_data.get('status', 'present'),
            log_data.get('remarks', ''),
            log_data.get('logType') or log_data.get('log_type'),
            1 if log_data.get('isLate') or log_data.get('is_late') else 0
        ))
        
        conn.commit()
        log_id = cursor.lastrowid
        print(f"[LOCAL DB] [OK] Queued attendance log (ID: {log_id})", flush=True)
        return log_id
    except Exception as e:
        print(f"[LOCAL DB] [ERROR] Error queueing log: {e}", flush=True)
        conn.rollback()
        return -1
    finally:
        conn.close()

def get_unsynced_logs(limit: int = 100) -> List[Dict]:
    """Get unsynced attendance logs for syncing"""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT * FROM attendance_logs_queue 
            WHERE synced = 0 
            ORDER BY created_at ASC 
            LIMIT ?
        """, [limit])
        
        rows = cursor.fetchall()
        columns = [desc[0] for desc in cursor.description]
        
        return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        print(f"[LOCAL DB] [ERROR] Error getting unsynced logs: {e}", flush=True)
        return []
    finally:
        conn.close()

def mark_log_synced(log_id: int):
    """Mark a log as synced"""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            UPDATE attendance_logs_queue 
            SET synced = 1, synced_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        """, [log_id])
        
        conn.commit()
    except Exception as e:
        print(f"[LOCAL DB] [ERROR] Error marking log as synced: {e}", flush=True)
        conn.rollback()
    finally:
        conn.close()

def clear_old_synced_logs(days: int = 7):
    """Clear synced logs older than specified days"""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            DELETE FROM attendance_logs_queue 
            WHERE synced = 1 
            AND synced_at < datetime('now', '-' || ? || ' days')
        """, [days])
        
        conn.commit()
        deleted = cursor.rowcount
        print(f"[LOCAL DB] [OK] Deleted {deleted} old synced logs", flush=True)
    except Exception as e:
        print(f"[LOCAL DB] [ERROR] Error clearing old logs: {e}", flush=True)
        conn.rollback()
    finally:
        conn.close()

def get_stats() -> Dict:
    """Get database statistics"""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    cursor = conn.cursor()
    
    try:
        stats = {}
        
        cursor.execute("SELECT COUNT(*) FROM schedules")
        stats['schedules'] = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM instructors")
        stats['instructors'] = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM attendance_logs_queue WHERE synced = 0")
        stats['unsynced_logs'] = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM attendance_logs_queue WHERE synced = 1")
        stats['synced_logs'] = cursor.fetchone()[0]
        
        return stats
    except Exception as e:
        print(f"[LOCAL DB] [ERROR] Error getting stats: {e}", flush=True)
        return {}
    finally:
        conn.close()

# Initialize database on import
init_database()

