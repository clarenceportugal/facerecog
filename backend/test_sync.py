"""
Test Sync Between Offline and Online Databases
This script helps you verify that syncing works correctly
"""

import requests
import json
import time
from colorama import init, Fore, Style

init(autoreset=True)

BASE_URL = "http://localhost:5000"

def print_header(text):
    print(f"\n{Fore.CYAN}{'='*60}")
    print(f"{Fore.CYAN}{text}")
    print(f"{Fore.CYAN}{'='*60}\n")

def print_success(text):
    print(f"{Fore.GREEN}✓ {text}")

def print_error(text):
    print(f"{Fore.RED}✗ {text}")

def print_info(text):
    print(f"{Fore.YELLOW}ℹ {text}")

def check_server():
    """Check if the server is running"""
    try:
        response = requests.get(f"{BASE_URL}/api/system/status", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print_success("Server is running")
            print_info(f"Mode: {data.get('mode', 'unknown')}")
            print_info(f"MongoDB Connected: {data.get('mongoConnected', False)}")
            return True, data
        else:
            print_error(f"Server returned status code {response.status_code}")
            return False, None
    except requests.exceptions.RequestException as e:
        print_error(f"Cannot connect to server: {e}")
        print_info("Make sure the backend server is running on http://localhost:5000")
        return False, None

def sync_to_offline():
    """Sync MongoDB → SQLite"""
    print_header("Syncing MongoDB → SQLite")
    try:
        response = requests.post(f"{BASE_URL}/api/system/sync-to-offline", timeout=30)
        if response.status_code == 200:
            data = response.json()
            print_success("Sync completed successfully!")
            print(json.dumps(data, indent=2))
            return True
        else:
            print_error(f"Sync failed with status {response.status_code}")
            print(response.text)
            return False
    except requests.exceptions.RequestException as e:
        print_error(f"Sync failed: {e}")
        return False

def sync_offline_to_mongo():
    """Sync SQLite → MongoDB"""
    print_header("Syncing SQLite → MongoDB")
    try:
        response = requests.post(f"{BASE_URL}/api/system/sync-offline-to-mongo", timeout=30)
        if response.status_code == 200:
            data = response.json()
            if data.get('success', False):
                print_success("Sync completed successfully!")
                print_info(f"Users synced: {data['synced']['users']}")
                print_info(f"Schedules synced: {data['synced']['schedules']}")
                if data.get('errors'):
                    print_error(f"Errors occurred: {len(data['errors'])}")
                    for error in data['errors'][:5]:
                        print(f"  - {error}")
            else:
                print_error("Sync completed with errors")
                print(json.dumps(data, indent=2))
            return data.get('success', False)
        else:
            print_error(f"Sync failed with status {response.status_code}")
            print(response.text)
            return False
    except requests.exceptions.RequestException as e:
        print_error(f"Sync failed: {e}")
        return False

def sync_logs_to_mongo():
    """Sync attendance logs to MongoDB"""
    print_header("Syncing Attendance Logs → MongoDB")
    try:
        response = requests.post(f"{BASE_URL}/api/system/sync-logs-to-mongo", timeout=30)
        if response.status_code == 200:
            data = response.json()
            if data.get('success', False):
                print_success("Sync completed successfully!")
                print_info(f"Logs synced: {data.get('synced', 0)}")
            else:
                print_error("Sync completed with errors")
                print(json.dumps(data, indent=2))
            return data.get('success', False)
        else:
            print_error(f"Sync failed with status {response.status_code}")
            print(response.text)
            return False
    except requests.exceptions.RequestException as e:
        print_error(f"Sync failed: {e}")
        return False

def get_sync_status():
    """Get current sync status"""
    print_header("Sync Status")
    try:
        response = requests.get(f"{BASE_URL}/api/system/sync-status", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(json.dumps(data, indent=2))
            return True
        else:
            print_error(f"Failed to get status: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print_error(f"Failed to get status: {e}")
        return False

def main():
    print_header("EduVision Sync Tester")
    
    # Check server
    server_ok, status = check_server()
    if not server_ok:
        print_error("Server is not running. Start the backend first!")
        return
    
    mode = status.get('mode', 'unknown')
    mongo_connected = status.get('mongoConnected', False)
    
    print(f"\n{Fore.MAGENTA}Available Sync Options:")
    print(f"{Fore.WHITE}1. Sync MongoDB → SQLite (download data for offline use)")
    print(f"{Fore.WHITE}2. Sync SQLite → MongoDB (upload offline changes)")
    print(f"{Fore.WHITE}3. Sync Attendance Logs → MongoDB")
    print(f"{Fore.WHITE}4. Get Sync Status")
    print(f"{Fore.WHITE}5. Exit")
    
    while True:
        try:
            choice = input(f"\n{Fore.YELLOW}Enter your choice (1-5): {Style.RESET_ALL}").strip()
            
            if choice == '1':
                if not mongo_connected:
                    print_error("MongoDB is not connected! Set OFFLINE_MODE=false and restart the server.")
                    continue
                sync_to_offline()
            
            elif choice == '2':
                if not mongo_connected:
                    print_error("MongoDB is not connected! Set OFFLINE_MODE=false and restart the server.")
                    continue
                sync_offline_to_mongo()
            
            elif choice == '3':
                if not mongo_connected:
                    print_error("MongoDB is not connected! Set OFFLINE_MODE=false and restart the server.")
                    continue
                sync_logs_to_mongo()
            
            elif choice == '4':
                get_sync_status()
            
            elif choice == '5':
                print_info("Goodbye!")
                break
            
            else:
                print_error("Invalid choice. Please enter 1-5.")
        
        except KeyboardInterrupt:
            print(f"\n{Fore.YELLOW}Exiting...")
            break

if __name__ == "__main__":
    main()

