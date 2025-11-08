import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User";
import Schedule from "../models/Schedule";
import Log from "../models/AttendanceLogs";
import dotenv from "dotenv";
import mongoose from "mongoose";


dotenv.config();
const router = express.Router();

// UPDATE CREDENTIALS ROUTE
router.put(
  "/update-credentials/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { username, password } = req.body;

      const faculty = await User.findById(id);
      if (!faculty) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      // Check if username is already taken by someone else
      const existingUser = await User.findOne({ username, _id: { $ne: id } });
      if (existingUser) {
        res.status(400).json({ message: "Username is already taken" });
        return;
      }

      // Hash the password before saving
      const hashedPassword = await bcrypt.hash(password, 10);

      faculty.username = username;
      faculty.password = hashedPassword;
      faculty.status = "active";

      // ✅ Ensure role stays lowercase & matches your union type
      if (faculty.role) {
        faculty.role = faculty.role.toLowerCase() as any; // cast back to UserRole
      }

      await faculty.save();

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

  // UPDATE LOG STATUS AND REMARKS
  router.put("/logs/:logId", async (req: Request, res: Response): Promise<void> => {
    try {
      const { logId } = req.params;
      const { status, remarks } = req.body;

      if (!mongoose.Types.ObjectId.isValid(logId)) {
        res.status(400).json({ message: "Invalid log ID" });
        return;
      }

      // Validate status
      const validStatuses = ["present", "late", "absent", "excuse", "Returned", "Left early"];
      if (status && !validStatuses.includes(status)) {
        res.status(400).json({ 
          message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` 
        });
        return;
      }

      const log = await Log.findById(logId);
      if (!log) {
        res.status(404).json({ message: "Log not found" });
        return;
      }

      // Update status if provided
      if (status) {
        log.status = status as any;
      }

      // Update remarks if provided
      if (remarks !== undefined) {
        log.remarks = remarks;
      }

      await log.save();

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
  
  
  // LOG TIME IN FOR FACE RECOGNITION (called by Python recognizer)
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
      
      console.log(`[API] Logging ${logType || 'TIME IN'} for: ${instructorName} (Late: ${isLate})`);
      
      const schedule = await Schedule.findById(scheduleId);
      if (!schedule) {
        console.log('[API] ❌ Schedule not found');
        res.status(404).json({ message: 'Schedule not found' });
        return;
      }

      // Check if already logged in today for this schedule
      const today = new Date(timestamp);
      const todayStr = today.toISOString().slice(0, 10); // YYYY-MM-DD format
      
      const existingLog = await Log.findOne({
        schedule: scheduleId,
        date: todayStr,
        timeIn: { $exists: true }
      });

      if (existingLog) {
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

      // Get course from schedule
      const populatedSchedule = await Schedule.findById(scheduleId).populate('section');
      
      // Create time log
      const timeLog = new Log({
        date: todayStr,
        schedule: scheduleId,
        timeIn: timeInDate.toTimeString().slice(0, 8), // HH:MM:SS
        status: status,
        remarks: remarks,
        course: schedule.courseCode || 'N/A'
      });

      await timeLog.save();
      
      const emoji = isLate ? '⚠️' : '✅';
      console.log(`[API] ${emoji} ${logType || 'TIME IN'} logged successfully - Status: ${status}`);
      
      res.json({ success: true, timeLog });
    } catch (error: any) {
      console.error('[API] Error logging time in:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // LOG TIME OUT FOR FACE RECOGNITION (called by Python recognizer)
  router.post("/log-time-out", async (req: Request, res: Response): Promise<void> => {
    try {
      const { instructorName, scheduleId, timestamp, totalMinutes } = req.body;
      console.log(`[API] Logging TIME OUT for: ${instructorName}`);
      
      const schedule = await Schedule.findById(scheduleId);
      if (!schedule) {
        console.log('[API] ❌ Schedule not found');
        res.status(404).json({ message: 'Schedule not found' });
        return;
      }

      // Find today's time log
      const today = new Date(timestamp);
      const todayStr = today.toISOString().slice(0, 10);

      const timeLog = await Log.findOne({
        schedule: scheduleId,
        date: todayStr
      });

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
      
      if (diffMinutes < -15) {
        timeLog.status = 'Left early' as any;
        remarks += (remarks ? ' | ' : '') + `Left ${Math.floor(Math.abs(diffMinutes))} minutes early`;
      }
      
      timeLog.timeout = timeOutDate.toTimeString().slice(0, 8);
      timeLog.remarks = remarks;

      await timeLog.save();
      console.log(`[API] ✅ TIME OUT logged successfully - Total: ${totalMinutes} min`);
      res.json({ success: true, timeLog });
    } catch (error: any) {
      console.error('[API] Error logging time out:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET CURRENT SCHEDULE FOR FACE RECOGNITION (called by Python recognizer)
  router.post("/get-current-schedule", async (req: Request, res: Response): Promise<void> => {
    try {
      const { instructorName } = req.body;
      console.log(`[API] === GET CURRENT SCHEDULE REQUEST ===`);
      console.log(`[API] Received instructor name: "${instructorName}"`);

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

      console.log(`[API] Searching User collection for first_name: "${firstName}", last_name: "${lastName}"`);
      
      // Find the instructor in the User collection
      const instructor = await User.findOne({
        first_name: { $regex: new RegExp(`^${firstName}$`, 'i') },
        last_name: { $regex: new RegExp(`^${lastName}$`, 'i') }
      });

      if (!instructor) {
        console.log(`[API] ❌ Instructor not found: ${instructorName}`);
        console.log(`[API] Searched for: first_name="${firstName}", last_name="${lastName}"`);
        
        // Try to find any users to help with debugging
        const allUsers = await User.find({ role: 'instructor' }).limit(5);
        console.log(`[API] Sample instructors in database:`, allUsers.map(u => `${u.first_name} ${u.last_name}`));
        
        res.json({ 
          schedule: null,
          debug: {
            searchedFor: { firstName, lastName, originalName: instructorName },
            instructorNotFound: true
          }
        });
        return;
      }

      console.log(`[API] ✅ Found instructor: ${instructor.first_name} ${instructor.last_name} (${instructor._id})`);

      // Get current time and day
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = currentHours * 60 + now.getMinutes();
      const currentTime = `${String(currentHours).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
      const currentDateStr = now.toISOString().slice(0, 10);

      console.log(`[API] Current time: ${currentTime} (${currentMinutes} minutes), Current day: ${dayOfWeek}`);

      // Build query object for the days field
      const daysQuery: any = {};
      daysQuery[`days.${dayOfWeek}`] = true;

      console.log(`[API] Querying schedules with instructor: ${instructor._id}, day: ${dayOfWeek}`);

      // Find schedule for this instructor, current day, within semester dates
      let schedule = await Schedule.findOne({
        instructor: instructor._id,
        ...daysQuery,
        semesterStartDate: { $lte: currentDateStr },
        semesterEndDate: { $gte: currentDateStr }
      }).populate('instructor section');

      console.log(`[API] Initial query returned: ${schedule ? 'Found' : 'Not found'}`);

      // Fallback: manually filter if no results
      if (!schedule) {
        console.log(`[API] Trying fallback query (manual day filtering)...`);
        const allSchedules = await Schedule.find({
          instructor: instructor._id,
          semesterStartDate: { $lte: currentDateStr },
          semesterEndDate: { $gte: currentDateStr }
        }).populate('instructor section');

        console.log(`[API] Found ${allSchedules.length} schedules for this instructor (any day)`);
        
        schedule = allSchedules.find((s: any) => {
          const days = s.days || {};
          const isActiveToday = days[dayOfWeek] === true;
          console.log(`[API] Schedule ${s._id}: days=${JSON.stringify(days)}, ${dayOfWeek}=${isActiveToday}`);
          return isActiveToday;
        }) || null;

        console.log(`[API] Manual filter result: ${schedule ? 'Found' : 'Still not found'}`);
      }

      if (!schedule) {
        console.log(`[API] ❌ No schedule found for ${instructorName} on ${dayOfWeek} at ${currentTime}`);
        res.json({ 
          schedule: null,
          debug: {
            instructor: { firstName, lastName, id: instructor._id },
            currentTime,
            currentDay: dayOfWeek,
            noScheduleFound: true
          }
        });
        return;
      }

      // Parse schedule start and end times
      const [startH, startM] = schedule.startTime.split(':').map(Number);
      const [endH, endM] = schedule.endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      console.log(`[API] Schedule time range: ${schedule.startTime} (${startMinutes}min) - ${schedule.endTime} (${endMinutes}min)`);
      console.log(`[API] Current time: ${currentTime} (${currentMinutes}min)`);
      console.log(`[API] In range: ${currentMinutes >= startMinutes && currentMinutes <= endMinutes}`);

      // Check if current time is within schedule time
      if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
        console.log(`[API] ✅ Active schedule found for ${instructorName}`);
        
        // Ensure days object is properly formatted
        const scheduleObj: any = schedule.toObject();
        if (!scheduleObj.days || Object.keys(scheduleObj.days).length === 0) {
          scheduleObj.days = {
            mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false
          };
        }

        res.json({ 
          schedule: scheduleObj,
          debug: {
            instructor: { firstName, lastName, id: instructor._id },
            currentTime,
            currentDay: dayOfWeek,
            scheduleFound: true,
            timeInRange: true
          }
        });
      } else {
        console.log(`[API] ⏰ Schedule found but not active at current time`);
        res.json({ 
          schedule: null,
          debug: {
            instructor: { firstName, lastName, id: instructor._id },
            currentTime,
            currentDay: dayOfWeek,
            scheduleFound: true,
            timeInRange: false,
            scheduleTime: `${schedule.startTime}-${schedule.endTime}`
          }
        });
      }
    } catch (error) {
      console.error('[API] ❌ Error in get-current-schedule:', error);
      res.status(500).json({ schedule: null, error: String(error) });
    }
  });


  

export default router;