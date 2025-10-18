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
  
  


  

export default router;