import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User";
import Schedule from "../models/Schedule";
import Log from "../models/AttendanceLogs";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { 
  UserService, 
  ScheduleService, 
  LogService 
} from "../services/dataService";
import { isOfflineMode } from "../utils/systemMode";

// dotenv is loaded by systemMode.ts, app.ts, and server.ts - no need to load again here
const router = express.Router();

// UPDATE CREDENTIALS ROUTE - WORKS OFFLINE
router.put(
  "/update-credentials/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { username, password } = req.body;

      // Use data service (works both online and offline)
      const faculty = await UserService.findById(id);
      if (!faculty) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      // Check if username is already taken by someone else
      const existingUser = await UserService.findByUsername(username);
      if (existingUser && existingUser._id !== id && existingUser.id !== id) {
        res.status(400).json({ message: "Username is already taken" });
        return;
      }

      // Update user
      const updated = await UserService.update(id, {
        username,
        password, // Will be hashed by UserService.update
        status: "active",
      });

      if (!updated) {
        res.status(500).json({ message: "Failed to update credentials" });
        return;
      }

      res.json({
        message: "Credentials updated successfully",
        role: faculty.role,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);


// GET SCHEDULES FOR SPECIFIC FACULTY
router.get("/faculty-schedules/:facultyId", async (req: Request, res: Response): Promise<void> => {
    try {
      const { facultyId } = req.params;
  
      if (!mongoose.Types.ObjectId.isValid(facultyId)) {
        res.status(400).json({ message: "Invalid faculty ID" });
        return;
      }
  
      const schedules = await Schedule.find({ instructor: facultyId }).populate("section instructor");
  
      res.json(schedules);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Error fetching faculty schedules" });
    }
  });
  
  // GET NEXT SUBJECT
  router.get("/next-schedule/:facultyId", async (req: Request, res: Response): Promise<void> => {
    const { facultyId } = req.params;
  
    try {
      if (!mongoose.Types.ObjectId.isValid(facultyId)) {
        res.status(400).json({ message: "Invalid faculty ID" });
        return;
      }
  
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5); // e.g. "14:30"
      const currentDateOnly = now.toISOString().slice(0, 10);
      const currentDate = new Date(currentDateOnly);
  
      // Fetch all schedules sorted by startTime
      const allSchedules = await Schedule.find({
        instructor: facultyId,
      }).sort({ startTime: 1 });
  
      // Convert "HH:mm" string to total minutes
      const timeToMinutes = (timeStr: string): number => {
        const [hours, minutes] = timeStr.split(":").map(Number);
        return hours * 60 + minutes;
      };
  
      const currentMinutes = timeToMinutes(currentTime);
  
      type DayName = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
      const weekdays: DayName[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  
      // Loop through today and the next 6 days
      for (let i = 0; i < 7; i++) {
        const futureDate = new Date(currentDate);
        futureDate.setDate(futureDate.getDate() + i);
  
        const dayName = weekdays[futureDate.getDay()];
        const dateStr = futureDate.toISOString().slice(0, 10);
  
        const nextSchedule = allSchedules.find((schedule) => {
          const semesterStart = new Date(schedule.semesterStartDate);
          const semesterEnd = new Date(schedule.semesterEndDate);
          const isValidDay = schedule.days[dayName as keyof typeof schedule.days];
          const isInSemester = semesterStart <= futureDate && semesterEnd >= futureDate;
          const isAfterNow = i > 0 || timeToMinutes(schedule.startTime) > currentMinutes;
  
          return isValidDay && isInSemester && isAfterNow;
        });
  
        if (nextSchedule) {
          res.json(nextSchedule);
          return;
        }
      }
  
      res.status(404).json({ message: "No upcoming schedule found" });
    } catch (error) {
      console.error("Error getting next schedule:", error);
      res.status(500).json({ message: "Server error" });
    }
  });
  

  
  // GET TODAY SCHEDULE FOR A SPECIFIC INSTRUCTOR
  router.get("/schedules/today/:instructorId", async (req: Request, res: Response): Promise<void> => {
    const { instructorId } = req.params;

    try {
        if (!mongoose.Types.ObjectId.isValid(instructorId)) {
            res.status(400).json({ message: "Invalid instructor ID" });
            return;
        }

        const now = new Date();
        const dayOfWeek = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getDay()];
        const currentDateOnly = now.toISOString().slice(0, 10);
        const currentDate = new Date(currentDateOnly);

        const schedules = await Schedule.find({
            instructor: instructorId,
            [`days.${dayOfWeek}`]: true,
            semesterStartDate: { $lte: currentDate.toISOString() }, 
            semesterEndDate: { $gte: currentDate.toISOString() }  
        })
        .select("startTime endTime room")

        if (!schedules.length) {
            res.status(404).json({ message: "No schedules found for today" });
            return;
        }

        res.status(200).json(schedules);
    } catch (error) {
        console.error("Error fetching instructor schedules:", error);
        res.status(500).json({ message: "Server error" });
    }
});

  // GET TOTAL HOURS (TODAY, THIS WEEK, THIS MONTH) FOR A SPECIFIC INSTRUCTOR
  router.get("/logs/today/:instructorId", async (req: Request, res: Response): Promise<void> => {
    const { instructorId } = req.params;

    try {
      if (!mongoose.Types.ObjectId.isValid(instructorId)) {
        res.status(400).json({ message: "Invalid instructor ID" });
        return;
      }

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);

      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
      endOfWeek.setHours(23, 59, 59, 999);

      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);

      const schedules = await Schedule.find({ instructor: instructorId }).select("_id");
      const scheduleIds = schedules.map((s) => s._id);

      const logs = await Log.find({
        schedule: { $in: scheduleIds },
        date: { $gte: startOfMonth.toISOString().slice(0, 10), $lte: endOfMonth.toISOString().slice(0, 10) },
        timeIn: { $exists: true },
        timeout: { $exists: true }
      }).select("timeIn timeout date");

      // Helper to parse "HH:mm" to Date
      const parseTime = (timeStr: string, baseDate: string) => {
        const [hours, minutes] = timeStr.split(":").map(Number);
        const date = new Date(baseDate);
        date.setHours(hours, minutes, 0, 0);
        return date;
      };

      let todayHours = 0;
      let weekHours = 0;
      let monthHours = 0;

      logs.forEach((log) => {
        const timeIn = parseTime(log.timeIn!, log.date);
        const timeout = parseTime(log.timeout!, log.date);
        const diffInMs = timeout.getTime() - timeIn.getTime();
        const diffInHours = diffInMs / (1000 * 60 * 60);

        const logDate = new Date(log.date);

        // Add to month total
        monthHours += diffInHours;

        // Add to week total
        if (logDate >= startOfWeek && logDate <= endOfWeek) {
          weekHours += diffInHours;
        }

        // Add to today total
        if (log.date === todayStr && now.getDay() !== 0) {
          todayHours += diffInHours;
        }
      });

      // Force todayHours to 0 if Sunday
      if (now.getDay() === 0) {
        todayHours = 0;
      }

      res.json({
        totalTodayHours: parseFloat(todayHours.toFixed(2)),
        totalWeekHours: parseFloat(weekHours.toFixed(2)),
        totalMonthHours: parseFloat(monthHours.toFixed(2)),
      });
    } catch (error) {
      console.error("Error fetching log totals:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // GET TOTAL SCHEDULE HOURS FOR TODAY, THIS WEEK, AND THIS MONTH FOR A SPECIFIC FACULTY
  router.get("/expected-hours/today/:facultyId", async (req: Request, res: Response): Promise<void> => {
    try {
      const { facultyId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(facultyId)) {
        res.status(400).json({ message: "Invalid faculty ID" });
        return;
      }

      const now = new Date();
      const currentDateStr = now.toISOString().slice(0, 10);
      const currentDate = new Date(currentDateStr);
      const currentDay = now.getDay(); // 0 = Sunday, ..., 6 = Saturday
      const dayOfWeekStr = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][currentDay];

      // Get start and end of current week (Sunday to Saturday)
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - currentDay);
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      // Get start and end of current month
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const schedules = await Schedule.find({
        instructor: facultyId,
        semesterStartDate: { $lte: currentDateStr },
        semesterEndDate: { $gte: currentDateStr },
      });

      // Convert "HH:mm" string to hour diff
      const getHourDiff = (startTime: string, endTime: string): number => {
        const [startH, startM] = startTime.split(":").map(Number);
        const [endH, endM] = endTime.split(":").map(Number);
        return (endH + endM / 60) - (startH + startM / 60);
      };

      let totalTodayScheduleHours = 0;
      let totalThisWeekScheduleHours = 0;
      let totalThisMonthScheduleHours = 0;

      schedules.forEach(schedule => {
        const duration = getHourDiff(schedule.startTime, schedule.endTime);
        const days = schedule.days as { [key: string]: boolean };


        // Today
        if (days[dayOfWeekStr]) {
          totalTodayScheduleHours += duration;
        }

        // This week: count how many days this class is scheduled in the current week
        Object.entries(schedule.days).forEach(([day, isActive]) => {
          if (isActive) {
            const dayIndex = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(day);
            const dateOfThisWeek = new Date(startOfWeek);
            dateOfThisWeek.setDate(startOfWeek.getDate() + dayIndex);

            if (dateOfThisWeek >= startOfWeek && dateOfThisWeek <= endOfWeek) {
              totalThisWeekScheduleHours += duration;
            }
          }
        });

        // This month: count how many times the subject occurs this month
        Object.entries(schedule.days).forEach(([day, isActive]) => {
          if (isActive) {
            const dayIndex = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(day);

            let count = 0;
            const tempDate = new Date(startOfMonth);

            while (tempDate <= endOfMonth) {
              if (tempDate.getDay() === dayIndex) count++;
              tempDate.setDate(tempDate.getDate() + 1);
            }

            totalThisMonthScheduleHours += duration * count;
          }
        });
      });

      res.json({
        totalTodayScheduleHours: parseFloat(totalTodayScheduleHours.toFixed(2)),
        totalThisWeekScheduleHours: parseFloat(totalThisWeekScheduleHours.toFixed(2)),
        totalThisMonthScheduleHours: parseFloat(totalThisMonthScheduleHours.toFixed(2)),
      });
    } catch (error) {
      console.error("Error calculating schedule hours:", error);
      res.status(500).json({ message: "Server error" });
    }
  });


  //GET ALL LOGS OF A SPECIFIC FACULTY
  router.get("/logs/all/today/:instructorId", async (req: Request, res: Response): Promise<void> => {
    const { instructorId } = req.params;
  
    try {
      if (!mongoose.Types.ObjectId.isValid(instructorId)) {
        res.status(400).json({ message: "Invalid instructor ID" });
        return;
      }
  
      const now = new Date();
      const todayStr = now.toLocaleDateString("en-CA");
  
      const schedules = await Schedule.find({ instructor: instructorId }).select("_id");
      const scheduleIds = schedules.map((s) => s._id);
  
      const logsToday = await Log.find({
        schedule: { $in: scheduleIds },
        date: todayStr
      }).select("timeIn timeout");
  
      res.status(200).json(logsToday);
    } catch (error) {
      console.error("Error fetching today's logs:", error);
      res.status(500).json({ message: "Server error" });
    }
  });

  // UPDATE LOG STATUS AND REMARKS - WORKS OFFLINE
  router.put("/logs/:logId", async (req: Request, res: Response): Promise<void> => {
    try {
      const { logId } = req.params;
      const { status, remarks } = req.body;

      // Validate status
      const validStatuses = ["present", "late", "absent", "excuse", "Returned", "Left early"];
      if (status && !validStatuses.includes(status)) {
        res.status(400).json({ 
          message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` 
        });
        return;
      }

      // Use data service (works both online and offline)
      const log = await LogService.findById(logId);
      if (!log) {
        res.status(404).json({ message: "Log not found" });
        return;
      }

      // Update log
      const updates: any = {};
      if (status) {
        updates.status = status;
      }
      if (remarks !== undefined) {
        updates.remarks = remarks;
      }

      const updated = await LogService.update(logId, updates);
      if (!updated) {
        res.status(500).json({ message: "Failed to update log" });
        return;
      }

      console.log(`[UPDATE-LOG] Updated log ${logId}: status=${status || 'unchanged'}, remarks=${remarks !== undefined ? 'updated' : 'unchanged'}`);

      res.json({
        message: "Log updated successfully",
        log: log
      });
    } catch (error: any) {
      console.error("Error updating log:", error);
      res.status(500).json({ 
        message: "Server error while updating log",
        error: error.message 
      });
    }
  });

  // MARK ABSENT FOR MISSING ATTENDANCE (Automatic Absent Detection)
  router.post("/mark-absent-for-day", async (req: Request, res: Response): Promise<void> => {
    try {
      const { date } = req.body; // Optional: YYYY-MM-DD format, defaults to today
      
      // Get the target date (today if not provided) - use same format as other logs
      const now = new Date();
      const targetDate = date || now.toLocaleDateString("en-CA"); // YYYY-MM-DD format
      const targetDateObj = new Date(targetDate);
      const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][targetDateObj.getDay()];
      
      console.log(`[AUTO-ABSENT] Checking for absent faculty on ${targetDate} (${dayOfWeek})`);

      // Find all schedules that should have occurred on this date
      const schedules = await Schedule.find({
        semesterStartDate: { $lte: targetDate },
        semesterEndDate: { $gte: targetDate },
        [`days.${dayOfWeek}`]: true
      }).populate('instructor');

      if (schedules.length === 0) {
        console.log(`[AUTO-ABSENT] No schedules found for ${targetDate}`);
        res.json({ 
          message: `No schedules found for ${targetDate}`,
          absentCount: 0,
          checkedSchedules: 0
        });
        return;
      }

      console.log(`[AUTO-ABSENT] Found ${schedules.length} schedules for ${targetDate}`);

      // Get all existing logs for this date
      const existingLogs = await Log.find({
        date: targetDate
      });
      const loggedScheduleIds = new Set(
        existingLogs
          .filter(log => log.schedule !== null && log.schedule !== undefined)
          .map(log => log.schedule!.toString())
      );

      let absentCount = 0;
      const absentLogs = [];

      // Check each schedule
      for (const schedule of schedules) {
        const scheduleId = (schedule._id as mongoose.Types.ObjectId).toString();
        
        // Skip if already logged (present, late, or already marked absent)
        if (loggedScheduleIds.has(scheduleId)) {
          continue;
        }

        // Check if class time has passed (only mark absent after class end time)
        const [endHour, endMinute] = schedule.endTime.split(':').map(Number);
        const classEndTime = new Date(targetDate);
        classEndTime.setHours(endHour, endMinute, 0, 0);
        const now = new Date();

        // Only mark absent if class has ended
        if (now < classEndTime) {
          console.log(`[AUTO-ABSENT] Skipping ${schedule.courseCode} - class hasn't ended yet (ends at ${schedule.endTime})`);
          continue;
        }

        // Get instructor's college
        const instructor: any = schedule.instructor;
        const collegeId = instructor?.college || null;

        // Create absent log
        const absentLog = new Log({
          date: targetDate,
          schedule: schedule._id,
          status: 'absent',
          remarks: 'Automatically marked absent - no attendance detected',
          course: schedule.courseCode || 'N/A',
          college: collegeId
        });

        await absentLog.save();
        absentCount++;
        absentLogs.push({
          scheduleId: schedule._id,
          courseCode: schedule.courseCode,
          instructorName: instructor ? `${instructor.last_name}, ${instructor.first_name}` : 'Unknown',
          time: `${schedule.startTime} - ${schedule.endTime}`
        });

        console.log(`[AUTO-ABSENT] ✅ Marked absent: ${schedule.courseCode} (${schedule.startTime}-${schedule.endTime})`);
      }

      console.log(`[AUTO-ABSENT] Completed: ${absentCount} absent logs created for ${targetDate}`);

      res.json({
        message: `Absent detection completed for ${targetDate}`,
        absentCount,
        checkedSchedules: schedules.length,
        absentLogs
      });
    } catch (error: any) {
      console.error('[AUTO-ABSENT] Error marking absent:', error);
      res.status(500).json({ 
        message: "Server error while marking absent",
        error: error.message 
      });
    }
  });
  
  
  // LOG TIME IN FOR FACE RECOGNITION (called by Python recognizer) - WORKS OFFLINE
  router.post("/log-time-in", async (req: Request, res: Response): Promise<void> => {
    try {
      const { 
        instructorName, 
        scheduleId, 
        cameraId, 
        timestamp,
        logType,    // "time in" or "late"
        isLate      // boolean
      } = req.body;
      
      console.log(`[API] Logging ${logType || 'TIME IN'} for: ${instructorName} (Late: ${isLate}) [${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}]`);
      console.log(`[API] Looking for schedule ID: ${scheduleId}`);
      
      // ⚡ VALIDATION: Check if scheduleId is valid before querying MongoDB
      if (!scheduleId || scheduleId === '' || typeof scheduleId !== 'string') {
        console.log(`[API] ❌ Invalid schedule ID: ${scheduleId}`);
        res.status(400).json({ 
          message: 'Invalid schedule ID',
          scheduleId: scheduleId,
          instructorName: instructorName
        });
        return;
      }
      
      // Use data service (works both online and offline)
      const schedule = await ScheduleService.findById(scheduleId);
      if (!schedule) {
        console.log(`[API] ❌ Schedule not found for ID: ${scheduleId}`);
        console.log(`[API] ⚠️ This might happen if schedule was deleted or ID format is incorrect`);
        // Return error but don't crash - allow system to continue
        res.status(404).json({ 
          message: 'Schedule not found',
          scheduleId: scheduleId,
          instructorName: instructorName
        });
        return;
      }
      
      console.log(`[API] ✅ Found schedule: ${schedule.courseCode} - ${schedule.courseTitle}`);

      // Check if already logged in today for this schedule
      const today = new Date(timestamp);
      const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD format
      
      const existingLog = await LogService.findByScheduleAndDate(scheduleId, todayStr);

      if (existingLog && existingLog.timeIn) {
        console.log('[API] ℹ️ Already logged in today');
        res.json({ message: 'Already logged in today', timeLog: existingLog });
        return;
      }

      // Determine status based on isLate flag
      const timeInDate = new Date(timestamp);
      let status: 'present' | 'late' = 'present';
      let remarks = '';
      
      if (isLate) {
        status = 'late';
        remarks = 'Late (arrived after grace period)';
      } else {
        remarks = 'On time';
      }
      
      // Create time log using data service
      const timeLog = await LogService.create({
        date: todayStr,
        schedule: scheduleId,
        timeIn: timeInDate.toTimeString().slice(0, 8), // HH:MM:SS
        status: status,
        remarks: remarks,
        course: schedule.courseCode || 'N/A'
      });
      
      const emoji = isLate ? '⚠️' : '✅';
      console.log(`[API] ${emoji} ${logType || 'TIME IN'} logged successfully - Status: ${status} [${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}]`);
      
      res.json({ success: true, timeLog, mode: isOfflineMode() ? 'offline' : 'online' });
    } catch (error: any) {
      console.error('[API] Error logging time in:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // LOG TIME OUT FOR FACE RECOGNITION (called by Python recognizer) - WORKS OFFLINE
  router.post("/log-time-out", async (req: Request, res: Response): Promise<void> => {
    try {
      const { instructorName, scheduleId, timestamp, totalMinutes } = req.body;
      console.log(`[API] Logging TIME OUT for: ${instructorName} [${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}]`);
      console.log(`[API] Looking for schedule ID: ${scheduleId}`);
      
      // ⚡ VALIDATION: Check if scheduleId is valid before querying MongoDB
      if (!scheduleId || scheduleId === '' || typeof scheduleId !== 'string') {
        console.log(`[API] ❌ Invalid schedule ID: ${scheduleId}`);
        res.status(400).json({ 
          message: 'Invalid schedule ID',
          scheduleId: scheduleId,
          instructorName: instructorName
        });
        return;
      }
      
      // Use data service (works both online and offline)
      const schedule = await ScheduleService.findById(scheduleId);
      if (!schedule) {
        console.log(`[API] ❌ Schedule not found for ID: ${scheduleId}`);
        console.log(`[API] ⚠️ This might happen if schedule was deleted or ID format is incorrect`);
        // Return error but don't crash - allow system to continue
        res.status(404).json({ 
          message: 'Schedule not found',
          scheduleId: scheduleId,
          instructorName: instructorName
        });
        return;
      }
      
      console.log(`[API] ✅ Found schedule: ${schedule.courseCode} - ${schedule.courseTitle}`);

      // Find today's time log
      const today = new Date(timestamp);
      const todayStr = today.toISOString().slice(0, 10);

      const timeLog = await LogService.findByScheduleAndDate(scheduleId, todayStr);

      if (!timeLog) {
        console.log('[API] ❌ Time in log not found');
        res.status(404).json({ message: 'Time in log not found' });
        return;
      }

      // Update time out
      const timeOutDate = new Date(timestamp);
      const scheduleEndTime = new Date(`${todayStr}T${schedule.endTime}:00`);
      const diffMinutes = (timeOutDate.getTime() - scheduleEndTime.getTime()) / (1000 * 60);
      
      let remarks = timeLog.remarks || '';
      let status = timeLog.status;
      
      if (diffMinutes < -15) {
        status = 'Left early';
        remarks += (remarks ? ' | ' : '') + `Left ${Math.floor(Math.abs(diffMinutes))} minutes early`;
      }
      
      // Update log using data service
      await LogService.update(timeLog._id || timeLog.id || '', {
        timeout: timeOutDate.toTimeString().slice(0, 8),
        remarks: remarks,
        status: status
      });

      console.log(`[API] ✅ TIME OUT logged successfully - Total: ${totalMinutes} min [${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}]`);
      res.json({ success: true, timeLog: { ...timeLog, timeout: timeOutDate.toTimeString().slice(0, 8), remarks }, mode: isOfflineMode() ? 'offline' : 'online' });
    } catch (error: any) {
      console.error('[API] Error logging time out:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // LOG TIME IN FOR NO-SCHEDULE USER (called by frontend LiveVideo) - WORKS OFFLINE
  router.post("/log-time-in-no-schedule", async (req: Request, res: Response): Promise<void> => {
    try {
      const { 
        instructorName, 
        cameraId, 
        timestamp
      } = req.body;
      
      console.log(`[API] Logging TIME IN (No Schedule) for: ${instructorName} [${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}]`);
      
      // Map camera ID to room name (match the format used in schedules: "Lab 1", "Lab 2", etc.)
      const roomMap: Record<string, string> = {
        'camera1': 'Lab 1',
        'camera2': 'Lab 2',
        'camera3': 'Lab 3'
      };
      const room = roomMap[cameraId || 'camera1'] || 'Lab 1';
      
      // Check if already logged in today for this user (no schedule)
      const today = new Date(timestamp);
      const todayStr = today.toISOString().slice(0, 10);
      
      // Find existing no-schedule log for today
      const allLogs = await LogService.findAll();
      const existingLog = allLogs.find(log => {
        const logDate = new Date(log.date).toISOString().slice(0, 10);
        return logDate === todayStr && 
               (log as any).isNoSchedule === true && 
               (log as any).instructorName === instructorName &&
               !log.timeout &&
               (log.schedule === null || !log.schedule);
      });

      if (existingLog) {
        console.log('[API] ℹ️ Already logged in today (no schedule)');
        res.json({ message: 'Already logged in today', timeLog: existingLog });
        return;
      }

      // Create no-schedule log
      const timeLog = await LogService.create({
        date: todayStr,
        schedule: null as any, // No schedule
        timeIn: new Date(timestamp).toTimeString().slice(0, 8), // HH:MM:SS
        status: 'no schedule',
        remarks: 'No scheduled class',
        course: 'No Schedule',
        instructorName: instructorName,
        room: room,
        isNoSchedule: true
      } as any);
      
      console.log(`[API] ✅ TIME IN (No Schedule) logged successfully for ${instructorName} in ${room} [${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}]`);
      
      res.json({ success: true, timeLog, mode: isOfflineMode() ? 'offline' : 'online' });
    } catch (error: any) {
      console.error('[API] Error logging time in (no schedule):', error);
      res.status(500).json({ error: error.message });
    }
  });

  // LOG TIME OUT FOR NO-SCHEDULE USER (called by frontend LiveVideo) - WORKS OFFLINE
  router.post("/log-time-out-no-schedule", async (req: Request, res: Response): Promise<void> => {
    try {
      const { instructorName, timestamp, totalMinutes } = req.body;
      console.log(`[API] Logging TIME OUT (No Schedule) for: ${instructorName} [${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}]`);

      // Find today's no-schedule time log
      const today = new Date(timestamp);
      const todayStr = today.toISOString().slice(0, 10);

      const allLogs = await LogService.findAll();
      const timeLog = allLogs.find(log => {
        const logDate = new Date(log.date).toISOString().slice(0, 10);
        return logDate === todayStr && 
               (log as any).isNoSchedule === true && 
               (log as any).instructorName === instructorName &&
               log.timeIn && !log.timeout;
      });

      if (!timeLog) {
        console.log('[API] ❌ Time in log not found (no schedule)');
        res.status(404).json({ message: 'Time in log not found' });
        return;
      }

      // Update time out
      const timeOutDate = new Date(timestamp);
      const remarks = `No scheduled class - Total: ${totalMinutes} min`;
      
      // Update log using data service
      await LogService.update(timeLog._id || timeLog.id || '', {
        timeout: timeOutDate.toTimeString().slice(0, 8),
        remarks: remarks
      });

      console.log(`[API] ✅ TIME OUT (No Schedule) logged successfully - Total: ${totalMinutes} min [${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}]`);
      res.json({ success: true, timeLog: { ...timeLog, timeout: timeOutDate.toTimeString().slice(0, 8), remarks }, mode: isOfflineMode() ? 'offline' : 'online' });
    } catch (error: any) {
      console.error('[API] Error logging time out (no schedule):', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET ALL SCHEDULES FOR FACE RECOGNITION CACHE (called by Python recognizer) - WORKS OFFLINE
  router.get("/all-schedules-for-recognition", async (req: Request, res: Response): Promise<void> => {
    try {
      console.log(`[API] Fetching schedules for recognition [${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}]`);
      
      // Use data service (works both online and offline)
      const allSchedules = await ScheduleService.findAll();
      
      // Filter active schedules (within current semester dates)
      const currentDateStr = new Date().toISOString().slice(0, 10);
      const schedules = allSchedules.filter(s => 
        s.semesterStartDate <= currentDateStr && s.semesterEndDate >= currentDateStr
      );
      
      // Format response
      const formattedSchedules = schedules.map(s => {
        // ⚡ CRITICAL: Ensure _id is always a string (MongoDB ObjectId needs conversion)
        const scheduleId = s._id ? String(s._id) : (s.id ? String(s.id) : null);
        if (!scheduleId) {
          console.log(`[API] ⚠️ Schedule missing ID: ${s.courseCode || 'N/A'} - Skipping schedule`);
          return null; // Skip schedules without ID
        }
        
        // ⚡ CRITICAL: Extract instructor data properly
        let instructorData = null;
        if (s.instructor) {
          if (typeof s.instructor === 'object') {
            // Instructor is populated (UserData object)
            const inst = s.instructor as any;
            if (inst.first_name && inst.last_name) {
              instructorData = {
                first_name: inst.first_name,
                last_name: inst.last_name
              };
            } else {
              console.log(`[API] ⚠️ Schedule ${scheduleId} has instructor object but missing first_name or last_name`);
            }
          } else if (typeof s.instructor === 'string') {
            // Instructor is just an ID string - need to fetch it
            console.log(`[API] ⚠️ Schedule ${scheduleId} has instructor as ID string, not populated`);
          }
        } else {
          console.log(`[API] ⚠️ Schedule ${scheduleId} has no instructor data`);
        }
        
        return {
          _id: scheduleId,
          courseTitle: s.courseTitle || 'N/A',
          courseCode: s.courseCode || 'N/A',
          room: s.room || 'N/A',
          startTime: s.startTime || '00:00',
          endTime: s.endTime || '00:00',
          days: s.days || {},
          semesterStartDate: s.semesterStartDate || '',
          semesterEndDate: s.semesterEndDate || '',
          instructor: instructorData
        };
      }).filter(s => s !== null); // Remove null entries (schedules without ID)
      
      console.log(`[API] ✅ Found ${formattedSchedules.length} active schedules [${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}]`);
      res.json(formattedSchedules);
    } catch (error: any) {
      console.error('[API] ❌ Error fetching all schedules:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // LEGACY: Original route (kept for backward compatibility)
  router.get("/all-schedules-for-recognition-legacy", async (req: Request, res: Response): Promise<void> => {
    try {
      const currentDateStr = new Date().toISOString().slice(0, 10);
      
      // Fetch all active schedules (within current semester dates)
      const schedules = await Schedule.find({
        semesterStartDate: { $lte: currentDateStr },
        semesterEndDate: { $gte: currentDateStr }
      })
        .populate('instructor', 'first_name last_name')
        .populate('section', 'course section block')
        .lean();
      
      console.log(`[API] Fetched ${schedules.length} active schedules for cache`);
      
      res.json(schedules);
    } catch (error) {
      console.error('[API] ❌ Error fetching all schedules:', error);
      res.status(500).json({ error: String(error) });
    }
  });

  // GET CURRENT SCHEDULE FOR FACE RECOGNITION (called by Python recognizer) - WORKS OFFLINE
  router.post("/get-current-schedule", async (req: Request, res: Response): Promise<void> => {
    try {
      const { instructorName, roomName, cameraId } = req.body;
      console.log(`[API] === GET CURRENT SCHEDULE REQUEST [${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}] ===`);
      console.log(`[API] Received instructor name: "${instructorName}", room: "${roomName || 'not provided'}", cameraId: "${cameraId || 'not provided'}"`);

      // Parse "Larbuiq, Kram" into first_name and last_name
      const parts = instructorName.split(',').map((s: string) => s.trim());
      let firstName, lastName;

      if (parts.length === 2) {
        lastName = parts[0];
        firstName = parts[1];
      } else {
        // If not in "Last, First" format, try space-separated
        const spaceParts = instructorName.split(' ');
        firstName = spaceParts[0] || '';
        lastName = spaceParts.slice(1).join(' ') || '';
      }

      console.log(`[API] Searching for instructor: first_name: "${firstName}", last_name: "${lastName}"`);
      
      // Find the instructor using data service (works both online and offline)
      const allInstructors = await UserService.findByRole('instructor');
      console.log(`[API] [DEBUG] Total instructors in database: ${allInstructors.length}`);
      
      const instructor = allInstructors.find(u => 
        u.first_name.toLowerCase() === firstName.toLowerCase() &&
        u.last_name.toLowerCase() === lastName.toLowerCase()
      );
      
      // ⚡ DEBUG: Log all instructor names for debugging
      if (!instructor && allInstructors.length > 0) {
        console.log(`[API] [DEBUG] Sample instructor names in database:`, allInstructors.slice(0, 10).map(u => `"${u.first_name} ${u.last_name}"`).join(', '));
      }

      if (!instructor) {
        console.log(`[API] ❌ Instructor not found: ${instructorName}`);
        console.log(`[API] Sample instructors in database:`, allInstructors.slice(0, 5).map(u => `${u.first_name} ${u.last_name}`));
        
        res.json({ 
          schedule: null,
          mode: isOfflineMode() ? 'offline' : 'online',
          debug: {
            searchedFor: { firstName, lastName, originalName: instructorName },
            instructorNotFound: true
          }
        });
        return;
      }

      const instructorId = instructor._id || instructor.id;
      console.log(`[API] ✅ Found instructor: ${instructor.first_name} ${instructor.last_name} (${instructorId})`);

      // Get current time and day
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = currentHours * 60 + now.getMinutes();
      const currentTime = `${String(currentHours).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
      const dayOfWeek: string = dayNames[now.getDay()];
      const currentDateStr = now.toISOString().slice(0, 10);

      console.log(`[API] Current time: ${currentTime} (${currentMinutes} minutes), Current day: ${dayOfWeek}`);

      // Get schedules for this instructor using data service
      const instructorSchedules = await ScheduleService.findByInstructor(instructorId || '');
      console.log(`[API] [DEBUG] Found ${instructorSchedules.length} total schedules for instructor ${instructorId}`);
      
      // Filter active schedules (within semester dates and active on current day)
      const activeSchedules: typeof instructorSchedules = instructorSchedules.filter(s => {
        const withinDates = s.semesterStartDate <= currentDateStr && s.semesterEndDate >= currentDateStr;
        const days = s.days as { [key: string]: boolean };
        const activeToday = days && days[dayOfWeek] === true;
        
        // ⚡ DEBUG: Log why schedules are filtered out
        if (!withinDates) {
          console.log(`[API] [DEBUG] Schedule ${s._id} filtered out: outside semester dates (${s.semesterStartDate} to ${s.semesterEndDate}, current: ${currentDateStr})`);
        }
        if (!activeToday) {
          console.log(`[API] [DEBUG] Schedule ${s._id} filtered out: not active on ${dayOfWeek} (days: ${JSON.stringify(days)})`);
        }
        
        return withinDates && activeToday;
      });

      console.log(`[API] Found ${activeSchedules.length} active schedules for today`);
      
      // ⚡ DEBUG: Log all active schedules
      if (activeSchedules.length > 0) {
        activeSchedules.forEach(s => {
          console.log(`[API] [DEBUG] Active schedule: _id=${s._id}, courseCode=${s.courseCode}, time=${s.startTime}-${s.endTime}, days=${JSON.stringify(s.days)}`);
        });
      }

      if (activeSchedules.length === 0) {
        console.log(`[API] ❌ No schedule found for ${instructorName} on ${dayOfWeek}`);
        res.json({ 
          schedule: null,
          mode: isOfflineMode() ? 'offline' : 'online',
          debug: {
            instructor: { firstName, lastName, id: instructorId },
            currentTime,
            currentDay: dayOfWeek,
            noScheduleFound: true
          }
        });
        return;
      }

      // Find schedule that matches current time (including 30 min before class start)
      // This matches the Python code logic which allows 30 minutes before class
      let schedule: typeof activeSchedules[0] | undefined = activeSchedules.find((s: typeof activeSchedules[0]) => {
        const [startH, startM] = s.startTime.split(':').map(Number);
        const [endH, endM] = s.endTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        const timeBeforeClass = startMinutes - 30; // 30 minutes before class start
        const matches = currentMinutes >= timeBeforeClass && currentMinutes <= endMinutes;
        
        // ⚡ DEBUG: Log time matching
        if (!matches) {
          console.log(`[API] [DEBUG] Schedule ${s._id} time doesn't match: current=${currentMinutes}min, range=${timeBeforeClass}-${endMinutes}min (start=${startMinutes}min, end=${endMinutes}min)`);
        }
        
        return matches;
      });

      if (!schedule) {
        // No schedule at current time (including 30 min buffer), return null
        console.log(`[API] ⏰ No active schedule found for ${instructorName} at current time ${currentTime} (day: ${dayOfWeek})`);
        if (activeSchedules.length > 0) {
          const firstSchedule = activeSchedules[0];
          console.log(`[API] Available schedules: ${activeSchedules.map(s => `${s.startTime}-${s.endTime}`).join(', ')}`);
        }
        res.json({ 
          schedule: null,
          isValidSchedule: false,
          timeMatch: false,
          roomMatch: null,
          mode: isOfflineMode() ? 'offline' : 'online',
          debug: {
            instructor: { firstName, lastName, id: instructorId },
            currentTime,
            currentDay: dayOfWeek,
            scheduleFound: activeSchedules.length > 0,
            timeInRange: false,
            availableSchedules: activeSchedules.map(s => `${s.startTime}-${s.endTime}`)
          }
        });
        return;
      }

      console.log(`[API] ✅ Active schedule found for ${instructorName} - Time matches`);
      
      // ⚡ ROOM VALIDATION: If roomName is provided, validate it matches the schedule room
      // Only users with schedules in the correct room should be green
      let roomMatch = null;
      let isValidSchedule = false; // ⚡ DEFAULT TO FALSE: Only set to true if room matches
      
      if (roomName && roomName.trim()) {
        // ⚡ FLEXIBLE ROOM MATCHING: Handle variations like "Lab 1", "Lab1", "lab 1", etc.
        // Normalize both room names by removing spaces and converting to lowercase
        const normalizeRoom = (room: string): string => {
          return room.trim().toLowerCase().replace(/\s+/g, ''); // Remove all spaces and lowercase
        };
        
        const scheduleRoom = normalizeRoom(schedule.room || "");
        const providedRoom = normalizeRoom(roomName);
        
        // Check if rooms match (normalized comparison)
        // Also check partial matches for cases like "Lab 1" vs "Computer Lab 1"
        roomMatch = scheduleRoom === providedRoom ||
                   scheduleRoom.includes(providedRoom) ||
                   providedRoom.includes(scheduleRoom) ||
                   // Additional check: "lab1" matches "lab 1", "lab-1", etc.
                   scheduleRoom.replace(/[^a-z0-9]/g, '') === providedRoom.replace(/[^a-z0-9]/g, '');
        
        if (roomMatch) {
          console.log(`[API] ✅ Room matches: "${schedule.room}" = "${roomName}" → isValidSchedule=true`);
          isValidSchedule = true; // ✅ Only set to true if room matches
        } else {
          console.log(`[API] ⚠️ Schedule time matches but room does not match. Expected: "${schedule.room}", Provided: "${roomName}" → isValidSchedule=false`);
          isValidSchedule = false; // ❌ Wrong room = yellow box
        }
      } else {
        // ⚡ NO ROOM PROVIDED: If roomName is not provided, cannot validate room
        // Default to false to be safe (user should always provide roomName)
        console.log(`[API] ⚠️ No roomName provided - cannot validate room. Setting isValidSchedule=false for safety.`);
        isValidSchedule = false;
      }
      
      // Ensure days object is properly formatted
      const scheduleObj: any = { ...schedule };
      if (!scheduleObj.days || Object.keys(scheduleObj.days).length === 0) {
        scheduleObj.days = {
          mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false
        };
      }
      
      // ⚡ ENSURE courseCode is always included (fix for manually added schedules)
      if (!scheduleObj.courseCode) {
        // Try alternative field names
        scheduleObj.courseCode = (scheduleObj as any).course_code || scheduleObj.courseCode || 'N/A';
        console.log(`[API] ⚠️ courseCode was missing, using: ${scheduleObj.courseCode}`);
      }
      
      // ⚡ CRITICAL: Ensure _id is always a string (MongoDB ObjectId needs conversion)
      if (scheduleObj._id) {
        scheduleObj._id = String(scheduleObj._id);
      } else if ((scheduleObj as any).id) {
        scheduleObj._id = String((scheduleObj as any).id);
      } else {
        console.log(`[API] ❌ Schedule missing _id: ${scheduleObj.courseCode} - Cannot return schedule without ID`);
        res.status(500).json({ 
          schedule: null,
          error: 'Schedule missing _id field',
          mode: isOfflineMode() ? 'offline' : 'online'
        });
        return;
      }
      
      // ⚡ VALIDATION: Ensure _id is not empty
      if (!scheduleObj._id || scheduleObj._id === 'None' || scheduleObj._id === 'N/A') {
        console.log(`[API] ❌ Schedule has invalid _id: ${scheduleObj._id} for ${scheduleObj.courseCode}`);
        res.status(500).json({ 
          schedule: null,
          error: 'Schedule has invalid _id',
          mode: isOfflineMode() ? 'offline' : 'online'
        });
        return;
      }
      
      // Add validation flags to schedule object
      scheduleObj.isValidSchedule = isValidSchedule;
      scheduleObj.timeMatch = true;
      scheduleObj.roomMatch = roomMatch;
      scheduleObj.roomValidated = roomName ? true : false;
      
      console.log(`[API] 📋 Returning schedule with courseCode: ${scheduleObj.courseCode}, _id: ${scheduleObj._id}`);

      // Return schedule even if room doesn't match (for backward compatibility)
      res.json({ 
        schedule: scheduleObj,
        isValidSchedule: isValidSchedule,
        timeMatch: true,
        roomMatch: roomMatch,
        mode: isOfflineMode() ? 'offline' : 'online',
        debug: {
          instructor: { firstName, lastName, id: instructorId },
          currentTime,
          currentDay: dayOfWeek,
          scheduleFound: true,
          timeInRange: true,
          roomValidated: roomName ? true : false,
          expectedRoom: schedule.room,
          providedRoom: roomName || null
        }
      });
    } catch (error: any) {
      // ⚡ IMPROVED ERROR HANDLING: Handle MongoDB connection errors gracefully
      const isMongoError = error?.name === 'MongoServerSelectionError' || 
                          error?.name === 'MongoNetworkError' ||
                          error?.message?.includes('ETIMEDOUT') ||
                          error?.message?.includes('ENETUNREACH') ||
                          error?.message?.includes('MongoServerSelectionError');
      
      if (isMongoError) {
        console.error('[API] ❌ MongoDB connection error in get-current-schedule:', error?.message || String(error));
        console.error('[API] ⚠️ MongoDB is unreachable - returning null schedule to allow Python fallback to cache');
        // Return 200 with null schedule (not 500) so Python recognizer can fall back to cache
        res.status(200).json({ 
          schedule: null, 
          isValidSchedule: false,
          timeMatch: false,
          roomMatch: null,
          mode: isOfflineMode() ? 'offline' : 'online',
          error: 'MongoDB connection failed',
          mongoError: true
        });
        return;
      }
      
      // For other errors, still return 200 with null schedule (graceful degradation)
      console.error('[API] ❌ Error in get-current-schedule:', error);
      res.status(200).json({ 
        schedule: null, 
        isValidSchedule: false,
        timeMatch: false,
        roomMatch: null,
        mode: isOfflineMode() ? 'offline' : 'online',
        error: error?.message || String(error)
      });
    }
  });


  

export default router;