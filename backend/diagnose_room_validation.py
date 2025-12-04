"""
Diagnose Room Validation Issue
This script helps identify why face detection shows yellow instead of green
"""

import os
import sqlite3
from pathlib import Path
from datetime import datetime
import json

# Colors for terminal
class Colors:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def print_header(text):
    print(f"\n{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BLUE}{text}{Colors.RESET}")
    print(f"{Colors.BLUE}{'='*60}{Colors.RESET}\n")

def print_ok(text):
    print(f"{Colors.GREEN}✅ {text}{Colors.RESET}")

def print_warn(text):
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.RESET}")

def print_error(text):
    print(f"{Colors.RED}❌ {text}{Colors.RESET}")

def print_info(text):
    print(f"{Colors.BLUE}ℹ️  {text}{Colors.RESET}")

def main():
    print_header("ROOM VALIDATION DIAGNOSTIC TOOL")
    
    # Check 1: Environment Variables
    print_header("1. CHECKING ENVIRONMENT VARIABLES")
    
    camera1_room = os.getenv("CAMERA1_ROOM", "")
    camera2_room = os.getenv("CAMERA2_ROOM", "")
    offline_mode = os.getenv("OFFLINE_MODE", "false")
    use_local_cache = os.getenv("USE_LOCAL_CACHE_FOR_DETECTION", "true")
    
    print(f"CAMERA1_ROOM = '{camera1_room}'")
    print(f"CAMERA2_ROOM = '{camera2_room}'")
    print(f"OFFLINE_MODE = '{offline_mode}'")
    print(f"USE_LOCAL_CACHE_FOR_DETECTION = '{use_local_cache}'")
    print()
    
    if not camera1_room:
        print_error("CAMERA1_ROOM is NOT SET or EMPTY!")
        print_info("This is likely the cause of yellow boxes!")
        print_info("Fix: Add CAMERA1_ROOM=Lab1 to backend/.env")
    else:
        print_ok(f"CAMERA1_ROOM is set to: '{camera1_room}'")
    
    # Check 2: Database
    print_header("2. CHECKING LOCAL DATABASE")
    
    db_path = Path(__file__).parent / "offline_data.db"
    
    if not db_path.exists():
        print_error(f"Database not found: {db_path}")
        return
    
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    # Check schedules
    cursor.execute("SELECT COUNT(*) FROM schedules")
    schedule_count = cursor.fetchone()[0]
    print(f"Total schedules in database: {schedule_count}")
    
    if schedule_count == 0:
        print_error("No schedules in database!")
        print_info("Run QUICK_SYNC.bat to sync schedules")
    else:
        print_ok(f"Found {schedule_count} schedules")
    
    # Check 3: Room names in schedules
    print_header("3. CHECKING ROOM NAMES IN SCHEDULES")
    
    cursor.execute("SELECT DISTINCT room FROM schedules")
    rooms = cursor.fetchall()
    
    print("Rooms found in schedules:")
    for room in rooms:
        room_name = room[0] or "(empty)"
        print(f"  - '{room_name}'")
    
    # Compare with CAMERA1_ROOM
    if camera1_room:
        print()
        print(f"Comparing with CAMERA1_ROOM = '{camera1_room}':")
        
        camera_room_lower = camera1_room.strip().lower()
        
        match_found = False
        for room in rooms:
            room_name = (room[0] or "").strip().lower()
            if room_name == camera_room_lower:
                print_ok(f"EXACT MATCH: '{room[0]}' == '{camera1_room}'")
                match_found = True
            elif camera_room_lower in room_name or room_name in camera_room_lower:
                print_warn(f"PARTIAL MATCH: '{room[0]}' ~ '{camera1_room}'")
                match_found = True
        
        if not match_found:
            print_error(f"NO MATCH FOUND for '{camera1_room}'!")
            print_info("The room name in your schedule doesn't match CAMERA1_ROOM")
            print_info(f"Either change CAMERA1_ROOM to match one of the rooms above,")
            print_info(f"or update the schedule room to '{camera1_room}'")
    
    # Check 4: Current schedules
    print_header("4. CHECKING CURRENT SCHEDULES (RIGHT NOW)")
    
    today = datetime.now().date().isoformat()
    current_time = datetime.now().strftime("%H:%M")
    day_names = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    current_day = day_names[datetime.now().weekday()]
    current_minutes = datetime.now().hour * 60 + datetime.now().minute
    
    print(f"Current date: {today}")
    print(f"Current time: {current_time}")
    print(f"Current day: {current_day}")
    print()
    
    # Find active schedules
    cursor.execute("""
        SELECT instructor_name, course_code, room, start_time, end_time, days,
               semester_start_date, semester_end_date
        FROM schedules
        WHERE semester_start_date <= ? AND semester_end_date >= ?
    """, (today, today))
    
    rows = cursor.fetchall()
    
    active_now = []
    for row in rows:
        instructor, course, room, start, end, days_json, sem_start, sem_end = row
        
        # Check day
        days = json.loads(days_json) if days_json else {}
        if not days.get(current_day, False):
            continue
        
        # Check time
        try:
            start_h, start_m = map(int, start.split(':'))
            end_h, end_m = map(int, end.split(':'))
            start_mins = start_h * 60 + start_m
            end_mins = end_h * 60 + end_m
            
            # Include 30 min before class
            if (start_mins - 30) <= current_minutes <= end_mins:
                active_now.append({
                    'instructor': instructor,
                    'course': course,
                    'room': room,
                    'time': f"{start}-{end}"
                })
        except:
            pass
    
    if active_now:
        print("Schedules active RIGHT NOW:")
        for sched in active_now:
            room = sched['room'] or "(no room)"
            print(f"  {sched['instructor']}: {sched['course']} in '{room}' ({sched['time']})")
            
            # Check room match
            if camera1_room:
                room_lower = room.lower()
                camera_lower = camera1_room.lower()
                
                if room_lower == camera_lower:
                    print_ok(f"    Room MATCHES CAMERA1_ROOM → Should be GREEN")
                elif camera_lower in room_lower or room_lower in camera_lower:
                    print_warn(f"    Room PARTIALLY matches → Should be GREEN")
                else:
                    print_error(f"    Room DOES NOT match '{camera1_room}' → Will be YELLOW")
    else:
        print_warn("No schedules active right now!")
        print_info("This would cause yellow boxes for any detected faculty")
    
    # Check 5: Summary
    print_header("5. DIAGNOSIS SUMMARY")
    
    issues = []
    
    if not camera1_room:
        issues.append("CAMERA1_ROOM not set in .env")
    
    if schedule_count == 0:
        issues.append("No schedules in database - run QUICK_SYNC.bat")
    
    if camera1_room and rooms:
        match_found = False
        for room in rooms:
            room_name = (room[0] or "").strip().lower()
            if camera1_room.lower() in room_name or room_name in camera1_room.lower():
                match_found = True
                break
        if not match_found:
            issues.append(f"Room name mismatch: CAMERA1_ROOM='{camera1_room}' doesn't match any schedule room")
    
    if not active_now:
        issues.append("No active schedule at current time")
    
    if issues:
        print_error("ISSUES FOUND:")
        for i, issue in enumerate(issues, 1):
            print(f"  {i}. {issue}")
        print()
        print("FIX STEPS:")
        if "CAMERA1_ROOM not set" in str(issues):
            print("  1. Edit backend/.env")
            print("  2. Add: CAMERA1_ROOM=Lab1  (use your actual room name)")
            print("  3. Restart face recognition: py -3.13 recognizer_arcface.py")
        if "mismatch" in str(issues):
            print("  1. Check room names in your schedules")
            print("  2. Update CAMERA1_ROOM to match exactly")
            print("  3. Or update schedule room to match CAMERA1_ROOM")
    else:
        print_ok("No obvious issues found!")
        print_info("If still seeing yellow boxes, check:")
        print("  1. Is the faculty's schedule active at this exact time?")
        print("  2. Is the camera ID correct? (CAMERA_ID in .env)")
        print("  3. Check face recognition logs for [WARN] messages")
    
    conn.close()
    
    # Final tips
    print_header("6. QUICK FIXES")
    print("""
Most common cause: CAMERA1_ROOM not set!

Fix:
1. Edit backend/.env and add:
   CAMERA1_ROOM=Lab1

2. Make sure the room name matches your schedule exactly!
   Schedule room: "Lab1" → CAMERA1_ROOM=Lab1
   Schedule room: "Lab 1" → CAMERA1_ROOM=Lab 1
   Schedule room: "Computer Lab 1" → CAMERA1_ROOM=Computer Lab 1

3. Restart face recognition:
   py -3.13 recognizer_arcface.py

4. Check logs for:
   [OK] VALID → Green box
   [WARN] WRONG ROOM → Yellow box
""")

if __name__ == "__main__":
    main()
    input("\nPress Enter to exit...")

