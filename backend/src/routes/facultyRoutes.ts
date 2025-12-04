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
        existingLogs.map(log => log.schedule.toString())
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
      
      // Use data service (works both online and offline)
      const schedule = await ScheduleService.findById(scheduleId);
      if (!schedule) {
        console.log('[API] ❌ Schedule not found');
        res.status(404).json({ message: 'Schedule not found' });
        return;
      }

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
      
      // Use data service (works both online and offline)
      const schedule = await ScheduleService.findById(scheduleId);
      if (!schedule) {
        console.log('[API] ❌ Schedule not found');
        res.status(404).json({ message: 'Schedule not found' });
        return;
      }

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
        const instructor = typeof s.instructor === 'object' ? s.instructor : null;
        return {
          _id: s._id || s.id,
          courseTitle: s.courseTitle,
          courseCode: s.courseCode,
          room: s.room,
          startTime: s.startTime,
          endTime: s.endTime,
          days: s.days,
          semesterStartDate: s.semesterStartDate,
          semesterEndDate: s.semesterEndDate,
          instructor: instructor ? {
            first_name: (instructor as any).first_name,
            last_name: (instructor as any).last_name
          } : null
        };
      });
      
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
      const instructor = allInstructors.find(u => 
        u.first_name.toLowerCase() === firstName.toLowerCase() &&
        u.last_name.toLowerCase() === lastName.toLowerCase()
      );

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
      
      // Filter active schedules (within semester dates and active on current day)
      const activeSchedules: typeof instructorSchedules = instructorSchedules.filter(s => {
        const withinDates = s.semesterStartDate <= currentDateStr && s.semesterEndDate >= currentDateStr;
        const days = s.days as { [key: string]: boolean };
        const activeToday = days && days[dayOfWeek] === true;
        return withinDates && activeToday;
      });

      console.log(`[API] Found ${activeSchedules.length} active schedules for today`);

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

      // Find schedule that matches current time
      let schedule: typeof activeSchedules[0] | undefined = activeSchedules.find((s: typeof activeSchedules[0]) => {
        const [startH, startM] = s.startTime.split(':').map(Number);
        const [endH, endM] = s.endTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      });

      if (!schedule) {
        // No schedule at current time, return first schedule found
        schedule = activeSchedules[0];
        const [startH, startM] = schedule.startTime.split(':').map(Number);
        const [endH, endM] = schedule.endTime.split(':').map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        console.log(`[API] ⏰ Schedule found but not active at current time`);
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
            scheduleFound: true,
            timeInRange: false,
            scheduleTime: `${schedule.startTime}-${schedule.endTime}`
          }
        });
        return;
      }

      console.log(`[API] ✅ Active schedule found for ${instructorName} - Time matches`);
      
      // If roomName is provided, validate it matches the schedule room
      let roomMatch = null;
      let isValidSchedule = true;
      
      if (roomName) {
        const scheduleRoom = (schedule.room || "").trim().toLowerCase();
        const providedRoom = roomName.trim().toLowerCase();
        
        // Check if rooms match (exact match or partial match)
        roomMatch = scheduleRoom === providedRoom ||
                   scheduleRoom.includes(providedRoom) ||
                   providedRoom.includes(scheduleRoom);
        
        if (!roomMatch) {
          console.log(`[API] ⚠️ Schedule time matches but room does not match. Expected: "${schedule.room}", Provided: "${roomName}"`);
          isValidSchedule = false;
        } else {
          console.log(`[API] ✅ Room matches: "${schedule.room}"`);
        }
      }
      
      // Ensure days object is properly formatted
      const scheduleObj: any = { ...schedule };
      if (!scheduleObj.days || Object.keys(scheduleObj.days).length === 0) {
        scheduleObj.days = {
          mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false
        };
      }
      
      // Add validation flags to schedule object
      scheduleObj.isValidSchedule = isValidSchedule;
      scheduleObj.timeMatch = true;
      scheduleObj.roomMatch = roomMatch;
      scheduleObj.roomValidated = roomName ? true : false;

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
    } catch (error) {
      console.error('[API] ❌ Error in get-current-schedule:', error);
      res.status(500).json({ schedule: null, error: String(error), mode: isOfflineMode() ? 'offline' : 'online' });
    }
  });


  

export default router;