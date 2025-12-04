"""
Test API Endpoints - Check if backend is working
Tests faculty add/delete operations
"""
import requests
import json

BACKEND_URL = "http://localhost:5000"

def test_connection():
    """Test if backend is reachable"""
    print("\n[TEST] Checking backend connection...")
    try:
        response = requests.get(f"{BACKEND_URL}/api/superadmin/dean", timeout=5)
        print(f"   ✅ Backend is reachable (Status: {response.status_code})")
        return True
    except requests.exceptions.ConnectionError:
        print(f"   ❌ Cannot connect to backend at {BACKEND_URL}")
        print(f"   → Make sure backend server is running: npm run dev")
        return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def check_offline_mode():
    """Check if system is in offline mode"""
    print("\n[TEST] Checking system mode...")
    try:
        # Try to get colleges which should work in both modes
        response = requests.get(f"{BACKEND_URL}/api/superadmin/colleges", timeout=5)
        if response.status_code == 200:
            colleges = response.json()
            print(f"   ✅ API is responding ({len(colleges)} colleges)")
            return True
        else:
            print(f"   ⚠️  API returned status: {response.status_code}")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def test_get_faculty():
    """Test getting faculty list"""
    print("\n[TEST] Testing GET faculty list...")
    try:
        response = requests.get(f"{BACKEND_URL}/api/superadmin/instructorinfo-only", timeout=5)
        if response.status_code == 200:
            faculty = response.json()
            print(f"   ✅ Got {len(faculty)} faculty members")
            
            # Look for Daniel Masligat
            daniel = [f for f in faculty if 'daniel' in f.get('first_name', '').lower() 
                      or 'masligat' in f.get('last_name', '').lower()]
            if daniel:
                print(f"   ⚠️  Found Daniel Masligat in API response:")
                for d in daniel:
                    print(f"      - {d.get('first_name')} {d.get('last_name')} ({d.get('_id')})")
            else:
                print(f"   ✅ Daniel Masligat not in API response")
            
            return True
        else:
            print(f"   ❌ Failed to get faculty (Status: {response.status_code})")
            print(f"   Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def check_mongodb_connection():
    """Check if MongoDB is connected"""
    print("\n[TEST] Checking MongoDB connection...")
    try:
        # Try an operation that requires MongoDB
        response = requests.get(f"{BACKEND_URL}/api/superadmin/user-counts", timeout=5)
        if response.status_code == 200:
            counts = response.json()
            print(f"   ✅ MongoDB connected")
            print(f"      - Instructors: {counts.get('instructor', 0)}")
            print(f"      - Deans: {counts.get('dean', 0)}")
            print(f"      - Program Chairs: {counts.get('programChairperson', 0)}")
            return True
        else:
            print(f"   ⚠️  MongoDB might be disconnected (Status: {response.status_code})")
            return False
    except Exception as e:
        print(f"   ❌ Error checking MongoDB: {e}")
        return False

def test_delete_faculty(faculty_id):
    """Test deleting a faculty member"""
    print(f"\n[TEST] Testing DELETE faculty (ID: {faculty_id})...")
    try:
        response = requests.delete(
            f"{BACKEND_URL}/api/dean/delete-faculty/{faculty_id}",
            timeout=5
        )
        if response.status_code == 200:
            print(f"   ✅ Delete successful")
            return True
        else:
            print(f"   ❌ Delete failed (Status: {response.status_code})")
            print(f"   Response: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def diagnose_add_delete_issues():
    """Diagnose why add/delete might not be working"""
    print("\n" + "="*60)
    print("DIAGNOSING ADD/DELETE ISSUES")
    print("="*60)
    
    issues = []
    
    # Test 1: Backend connection
    if not test_connection():
        issues.append("Backend not reachable - Start backend server")
        return issues
    
    # Test 2: System mode
    if not check_offline_mode():
        issues.append("System mode issue - Check .env OFFLINE_MODE setting")
    
    # Test 3: MongoDB connection
    if not check_mongodb_connection():
        issues.append("MongoDB not connected - Start MongoDB or set OFFLINE_MODE=true")
    
    # Test 4: Get faculty
    if not test_get_faculty():
        issues.append("Cannot retrieve faculty list")
    
    print("\n" + "="*60)
    if issues:
        print(f"⚠️  FOUND {len(issues)} ISSUE(S):")
        for i, issue in enumerate(issues, 1):
            print(f"{i}. {issue}")
    else:
        print("✅ All API tests passed")
    print("="*60)
    
    return issues

def search_daniel_in_api():
    """Search for Daniel Masligat in API"""
    print("\n" + "="*60)
    print("SEARCHING FOR DANIEL MASLIGAT IN API")
    print("="*60)
    
    try:
        response = requests.get(f"{BACKEND_URL}/api/superadmin/instructorinfo-only", timeout=5)
        if response.status_code != 200:
            print(f"❌ Cannot get faculty list (Status: {response.status_code})")
            return None
        
        faculty = response.json()
        daniel_list = []
        
        for f in faculty:
            first = f.get('first_name', '').lower()
            last = f.get('last_name', '').lower()
            
            if 'daniel' in first or 'masligat' in last:
                daniel_list.append(f)
                print(f"\n✓ Found: {f.get('first_name')} {f.get('last_name')}")
                print(f"  ID: {f.get('_id')}")
                print(f"  Username: {f.get('username')}")
                print(f"  Email: {f.get('email')}")
                print(f"  Role: {f.get('role')}")
                print(f"  Status: {f.get('status')}")
        
        if not daniel_list:
            print("\n✅ Daniel Masligat NOT found in API (MongoDB)")
        
        print("="*60)
        return daniel_list
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

if __name__ == "__main__":
    print("\n" + "="*60)
    print("API ENDPOINT TESTER")
    print("="*60)
    
    print("\n1. Diagnose add/delete issues")
    print("2. Search for Daniel Masligat in API")
    print("3. Test specific faculty delete")
    print("4. Exit")
    
    choice = input("\nSelect option (1-4): ").strip()
    
    if choice == "1":
        issues = diagnose_add_delete_issues()
        
        if issues:
            print("\n" + "="*60)
            print("RECOMMENDED ACTIONS:")
            print("="*60)
            
            if "Backend not reachable" in str(issues):
                print("\n1. Start backend server:")
                print("   cd backend")
                print("   npm run dev")
            
            if "MongoDB not connected" in str(issues):
                print("\n2. Either:")
                print("   a) Start MongoDB:")
                print("      mongod --dbpath C:\\data\\db")
                print("   OR")
                print("   b) Switch to offline mode:")
                print("      Edit backend/.env and set: OFFLINE_MODE=true")
            
            print("\n3. After fixing, restart backend and try again")
    
    elif choice == "2":
        daniel_list = search_daniel_in_api()
        
        if daniel_list:
            print("\n⚠️  Found Daniel Masligat in MongoDB!")
            print("\nTo remove from MongoDB, you need to:")
            print("1. Use the UI delete button")
            print("2. Or connect to MongoDB and delete manually:")
            print(f"   mongo")
            print(f"   use eduvision")
            for d in daniel_list:
                print(f"   db.users.deleteOne({{_id: ObjectId('{d.get('_id')}')}});")
    
    elif choice == "3":
        faculty_id = input("\nEnter faculty ID to delete: ").strip()
        if faculty_id:
            test_delete_faculty(faculty_id)
    
    elif choice == "4":
        print("\nGoodbye!")
    else:
        print("\n❌ Invalid choice")

