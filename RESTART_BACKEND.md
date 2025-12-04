# Restart Backend Server Instructions

## ✅ Database Connection Verified!

Your MongoDB connection is now working with the updated .env file:
- ✅ Connected to MongoDB Atlas
- ✅ Found 21 users (12 instructors)
- ✅ Found 4 colleges, 2 courses
- ✅ Found 65 schedules

## 🔄 Next Step: Restart Backend Server

The backend server needs to be restarted to pick up the new .env file configuration.

### Option 1: Restart via Terminal
1. Stop the current backend server (Ctrl+C in the terminal where it's running)
2. Navigate to backend directory:
   ```bash
   cd backend
   ```
3. Start the server:
   ```bash
   npm start
   # or
   npm run dev
   # or
   node src/server.ts
   ```

### Option 2: Restart via Task Manager
1. Open Task Manager (Ctrl+Shift+Esc)
2. Find Node.js processes
3. End the process running your backend server
4. Restart it from your terminal/IDE

### Option 3: If using PM2
```bash
pm2 restart backend
# or
pm2 restart all
```

## ✅ After Restart

Once the backend restarts, you should see:
- "Connected to MongoDB" in the console
- The API endpoints should now return data
- Face registration should show faculties
- Schedules should be accessible

## 🧪 Test the Connection

After restarting, test if it's working:
```bash
# In a new terminal
curl http://localhost:5000/api/auth/faculty?courseName=bsit
```

Or check the browser console - the API calls should now return data instead of empty arrays.

