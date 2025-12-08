import express, { Request, Response } from "express";
import UserModel from "../models/User";
import "../models/User";
import College from "../models/College";
import Room from "../models/Room";
import Course from "../models/Course";
import Schedule from "../models/Schedule";
import TempAccount from "../models/TempAccount";
import Section from "../models/Section";
import Log from "../models/AttendanceLogs";
import Subject from "../models/Subject";
import path from "path";
import fs from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import User from "../models/User";
import { 
  UserService, 
  CollegeService, 
  CourseService, 
  ScheduleService, 
  LogService 
} from "../services/dataService";
import { isOfflineMode } from "../utils/systemMode";

const router = express.Router();

// COLLEGE COURSES - WORKS OFFLINE
router.post(
  "/college-courses",
  async (req: Request, res: Response): Promise<void> => {
    const { collegeCode } = req.body;

    if (!collegeCode) {
      res.status(400).json({ message: "collegeCode is required." });
      return;
    }

    try {
      // Use data service (works both online and offline)
      const college = await CollegeService.findByCode(collegeCode);

      if (!college) {
        res.status(404).json({ message: "College not found." });
        return;
      }

      const collegeId = college._id || college.id || '';
      const courses = await CourseService.findByCollege(collegeId);

      res.status(200).json({
        collegeId: collegeId,
        courses,
      });
    } catch (error) {
      console.error("Error fetching college and courses:", error);
      res.status(500).json({ message: "Server error." });
    }
  }
);

// ✅ GET sections filtered by CollegeName (code), with populated college info
router.get(
  "/all-courses/college",
  async (req: Request, res: Response): Promise<void> => {
    const { CollegeName } = req.query;

    try {
      const college = await College.findOne({ code: CollegeName });

      if (!college) {
        res.status(404).json({ error: "College not found" });
        return;
      }
      const course = await Course.find({ college: college._id })
        .populate("college", "code name") // populate college code and name only
        .lean();

      res.json(course);
    } catch (error) {
      console.error("Error fetching sections:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post("/all-courses", async (req: Request, res: Response): Promise<void> => {
  try {
    const { CollegeName } = req.body; // Get from request body

    let filter = {};

    if (CollegeName) {
      // 1️⃣ Find the college whose CODE matches the given CollegeName
      const college = await College.findOne({ code: CollegeName });

      if (!college) {
        res.status(404).json({
          success: false,
          message: `College with code "${CollegeName}" not found.`,
        });
        return;
      }

      // 2️⃣ Filter courses by that college’s _id
      filter = { college: college._id };
    }

    // 3️⃣ Fetch courses (filtered or all)
    const courses = await Course.find(filter).populate("college", "collegeName code").lean();

    res.status(200).json({
      success: true,
      count: courses.length,
      data: courses,
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching courses.",
    });
  }
});

// DEAN SHOW MONTHLY LOGS - WORKS OFFLINE
router.post(
  "/dean-show-monthly-department-logs",
  async (req: Request, res: Response) => {
    try {
      const { courseCode } = req.body;

      // Use data service (works both online and offline)
      let logs = await LogService.findAll();
      
      // Filter by course code if provided
      if (courseCode) {
        logs = logs.filter(log => log.course === courseCode);
      }

      // Enrich logs with schedule and instructor info
      const enrichedLogs = await Promise.all(logs.map(async (log) => {
        const scheduleId = typeof log.schedule === 'string' ? log.schedule : (log.schedule as any)?._id;
        let schedule = null;
        let instructor = null;
        
        if (scheduleId) {
          schedule = await ScheduleService.findById(scheduleId);
          if (schedule && typeof schedule.instructor === 'object') {
            instructor = schedule.instructor;
          }
        }
        
        return {
          ...log,
          schedule: schedule ? {
            ...schedule,
            instructor: instructor
          } : null
        };
      }));

      res.status(200).json({
        success: true,
        count: enrichedLogs.length,
        data: enrichedLogs,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("❌ Error fetching logs:", error.message);
        res.status(500).json({ success: false, message: error.message });
      } else {
        console.error("❌ Unknown error fetching logs:", error);
        res.status(500).json({ success: false, message: "Unknown error occurred" });
      }
    }
  }
);

// DEAN GENERATE MONTHLY REPORT - WORKS OFFLINE
router.post(
  "/dean-generate-monthly-department-logs",
  async (req: Request, res: Response) => {
    try {
      const { courseCode, selectedMonth, selectedYear } = req.body;

      console.log(`[REPORT] Generating dean report for courseCode: "${courseCode}", Month: ${selectedMonth}, Year: ${selectedYear}`);

      // Use data service (works both online and offline)
      let allLogs = await LogService.findAll();
      
      // Filter by course code if provided
      if (courseCode) {
        allLogs = allLogs.filter(log => log.course === courseCode);
      }

      // Enrich logs with schedule and instructor info
      const logs = await Promise.all(allLogs.map(async (log) => {
        const scheduleId = typeof log.schedule === 'string' ? log.schedule : (log.schedule as any)?._id;
        let schedule = null;
        
        if (scheduleId) {
          schedule = await ScheduleService.findById(scheduleId);
        }
        
        return {
          ...log,
          schedule: schedule,
          timeIn: log.timeIn,
          timeout: log.timeout
        };
      }));

      console.log(`[REPORT] Fetched ${logs.length} total logs from database`);

      // 🔹 Filter logs by month and year before grouping, and filter out logs with null schedules
      const filteredLogs = logs.filter((log: any) => {
        // Filter out logs with null/undefined schedules
        if (!log.schedule || log.schedule === null || log.schedule === undefined) {
          return false;
        }
        
        if (!log.date) return false;
        const logDate = new Date(log.date);
        const logYear = logDate.getFullYear();
        const logMonth = logDate.getMonth() + 1; // 0-indexed in JS

        const matchesYear = selectedYear
          ? logYear === Number(selectedYear)
          : true;
        const matchesMonth = selectedMonth
          ? logMonth === Number(selectedMonth)
          : true;

        return matchesYear && matchesMonth;
      });

      console.log(`[REPORT] Filtered ${filteredLogs.length} logs for report generation`);

      // 🔹 Group filtered logs by schedule
      const grouped: Record<string, any> = {};
      for (const log of filteredLogs) {
        const schedule: any = log.schedule || {};
        const instructorObj = schedule?.instructor;

        // Skip if no schedule ID
        if (!schedule._id) {
          continue;
        }

        const instructorName = instructorObj
          ? `${instructorObj.last_name}, ${instructorObj.first_name} ${
              instructorObj.middle_name
                ? instructorObj.middle_name.charAt(0) + "."
                : ""
            }`.trim()
          : "N/A";

        const key = `${schedule._id}`;

        // Compute scheduled session duration
        let sessionHours = 0;
        if (schedule?.startTime && schedule?.endTime) {
          const [sh, sm] = schedule.startTime.split(":").map(Number);
          const [eh, em] = schedule.endTime.split(":").map(Number);
          if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
            sessionHours = (eh * 60 + em - (sh * 60 + sm)) / 60;
          }
        }

        if (!grouped[key]) {
          grouped[key] = {
            instructorName,
            courseCode: schedule.courseCode || "N/A",
            courseTitle: schedule.courseTitle || "N/A",
            room: schedule.room || "N/A",
            totalHours: 0, // attended
            requiredHours: 0, // scheduled
            absences: 0,
            late: 0,
          };
        }

        grouped[key].requiredHours += sessionHours;

        let attendedHours = 0;
        if (log.timeIn && log.timeout) {
          const [inH, inM] = log.timeIn.split(":").map(Number);
          const [outH, outM] = log.timeout.split(":").map(Number);
          if (!isNaN(inH) && !isNaN(inM) && !isNaN(outH) && !isNaN(outM)) {
            attendedHours = (outH * 60 + outM - (inH * 60 + inM)) / 60;
          }
        }
        grouped[key].totalHours += attendedHours;

        if (log.status?.toLowerCase() === "absent") grouped[key].absences += 1;
        if (log.status?.toLowerCase() === "late") grouped[key].late += 1;
      }

      const tableData = Object.values(grouped);

      console.log(`[REPORT] Generated ${tableData.length} grouped records for report`);

      if (tableData.length === 0) {
        res.status(400).json({ 
          success: false, 
          message: "No attendance data found for the selected filters. Please adjust your filters and try again." 
        });
        return;
      }

      // 🔹 Report metadata — based on selected filters
      const reportMonth = selectedMonth
        ? new Date(0, Number(selectedMonth) - 1).toLocaleString("en-US", {
            month: "long",
          })
        : "All Months";

      const reportYear = selectedYear || "All Years";
      const reportDate = `${reportMonth} ${reportYear}`;

      // 🔹 Load DOCX template
      const templatePath = path.join(
        __dirname,
        "../../templates/MonthlyReports.docx"
      );

      // Check if template exists
      if (!fs.existsSync(templatePath)) {
        console.error(`[REPORT] Template not found at: ${templatePath}`);
        res.status(500).json({ 
          success: false, 
          message: "Report template not found. Please contact administrator." 
        });
        return;
      }

      const content = fs.readFileSync(templatePath, "binary");
      const zip = new PizZip(content);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      // 🔹 Bind data to DOCX
      doc.render({
        reportDate,
        courseName: courseCode?.toUpperCase() || "N/A",
        logs: tableData,
      });

      // 🔹 Generate and send file
      const buffer = doc.getZip().generate({ type: "nodebuffer" });

      const outputDir = path.join(__dirname, "../generated");
      if (!fs.existsSync(outputDir))
        fs.mkdirSync(outputDir, { recursive: true });
      const outputPath = path.join(outputDir, "MonthlyDepartmentReport.docx");

      fs.writeFileSync(outputPath, buffer);
      
      console.log(`[REPORT] Report generated successfully with ${tableData.length} records`);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="MonthlyDepartmentReport.docx"`);
      res.send(buffer);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(
          "❌ Error generating monthly department report:",
          error.stack
        );
        res.status(500).json({ success: false, message: error.message });
      } else {
        console.error(
          "❌ Unknown error generating monthly department report:",
          error
        );
        res
          .status(500)
          .json({ success: false, message: "Unknown error occurred" });
      }
    }
  }
);

// ✅ GET rooms filtered by CollegeName (code), with populated college info
router.get(
  "/all-rooms/college",
  async (req: Request, res: Response): Promise<void> => {
    const { CollegeName } = req.query;

    try {
      const college = await College.findOne({ code: CollegeName });

      if (!college) {
        res.status(404).json({ error: "College not found" });
        return;
      }
      const course = await Room.find({ college: college._id })
        .populate("name", "location") // populate college code and name only
        .lean();

      res.json(course);
    } catch (error) {
      console.error("Error fetching sections:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// FETCH ALL FULL SCHEDULES TODAY BASED ON COURSE - WORKS OFFLINE
router.post(
  "/dean/all-schedules/today",
  async (req: Request, res: Response): Promise<void> => {
    const { shortCourseValue } = req.body;

    if (!shortCourseValue) {
      res.status(400).json({ message: "shortCourseName is missing" });
      return;
    }

    try {
      const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      const today = dayNames[new Date().getDay()];

      // Use data service (works both online and offline)
      const allSchedules = await ScheduleService.findAll();
      
      // Filter by course code and today's day
      const schedules = allSchedules.filter(s => {
        const courseMatch = s.courseCode.toLowerCase().startsWith(shortCourseValue.toLowerCase());
        const days = s.days as { [key: string]: boolean };
        const dayMatch = days && days[today] === true;
        return courseMatch && dayMatch;
      });

      res.status(200).json(schedules);
    } catch (error) {
      console.error("Error fetching schedules:", error);
      res.status(500).json({ message: "Error fetching schedules" });
    }
  }
);

// GET Program Chairpersons based on College Code - WORKS OFFLINE
router.get(
  "/programchairs",
  async (req: Request, res: Response): Promise<void> => {
    const { collegeCode } = req.query;

    if (!collegeCode) {
      res.status(400).json({ message: "collegeCode is missing" });
      return;
    }

    try {
      // Use data service (works both online and offline)
      const college = await CollegeService.findByCode(collegeCode as string);
      if (!college) {
        res.status(404).json({ message: "College not found" });
        return;
      }
      
      const collegeId = college._id || college.id || '';
      const allUsers = await UserService.findByCollege(collegeId);
      
      // Filter for program chairs and instructors
      const programChairs = allUsers.filter(u => 
        u.role === 'programchairperson' || u.role === 'instructor'
      );
      
      res.status(200).json(programChairs);
    } catch (error) {
      console.error("Error fetching program chairs:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// LEGACY: Original programchairs route (kept for reference)
router.get(
  "/programchairs-legacy",
  async (req: Request, res: Response): Promise<void> => {
    const { collegeCode } = req.query;

    if (!collegeCode) {
      res.status(400).json({ message: "collegeCode is missing" });
      return;
    }

    try {
      const programChairs = await UserModel.find({
        role: { $in: ["programchairperson", "instructor"] },
      })
        .populate({
          path: "college",
          select: "code",
          match: { code: collegeCode as string },
        })
        .populate({
          path: "course",
          select: "code",
        })
        .select(
          "first_name middle_name last_name username email role status course college"
        )
        .exec();

      const filteredChairs = programChairs
        .filter((user) => user.college)
        .map((user) => ({
          ...user.toObject(),
          course: (user.course as any)?.code || null, // safely get course code
        }));

      res.json(filteredChairs);
    } catch (error) {
      console.error("Error fetching program chairpersons:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

//Count of Faculty and Program Chairperson
router.get(
  "/count-all/instructors",
  async (req: Request, res: Response): Promise<void> => {
    const { CollegeName } = req.query;

    try {
      const college = await College.findOne({ code: CollegeName });

      if (!college) {
        res.status(404).json({ error: "College not found" });
        return;
      }

      const instructorCount = await UserModel.countDocuments({
        role: "instructor",
        college: college._id,
      });

      const programChairCount = await UserModel.countDocuments({
        role: "programchairperson",
        college: college._id,
      });

      res.json({
        instructorCount,
        programChairCount,
      });
    } catch (error) {
      console.error("Error fetching counts:", error);
      res.status(500).json({ error: "Server error" });
    }
  }
);

router.get(
  "/initial-staff",
  async (req: Request, res: Response): Promise<void> => {
    const { collegeName } = req.query;

    if (!collegeName) {
      res.status(400).json({ message: "collegeName is missing" });
      return;
    }

    try {
      // 🔎 Find the college by its code
      const college = await College.findOne({ code: collegeName });
      if (!college) {
        res.status(404).json({ message: "College not found" });
        return;
      }

      // 🔎 Match department with the found college._id
      const facultyList = await TempAccount.find({
        signUpStatus: "for_approval",
        role: { $in: ["instructor", "programchairperson"] },
        department: college._id,
      }).populate("department program");

      res.json(facultyList);
    } catch (error) {
      console.error("Error fetching faculty by college:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// ✅ VALIDATE FACULTY SCHEDULE WITH TIME AND ROOM
// This function checks if a faculty member has a valid schedule at the current time AND in the specified room
// Returns: { isValid: boolean, schedule: Schedule | null, reason: string }
router.post(
  "/validate-faculty-schedule",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { instructorName, roomName, cameraId } = req.body;

      if (!instructorName) {
        res.status(400).json({
          success: false,
          message: "instructorName is required",
          isValid: false,
        });
        return;
      }

      // Parse instructor name (format: "LastName, FirstName" or "FirstName LastName")
      const parts = instructorName.split(",").map((s: string) => s.trim());
      let firstName: string, lastName: string;

      if (parts.length === 2) {
        lastName = parts[0];
        firstName = parts[1];
      } else {
        // If not in "Last, First" format, try space-separated
        const spaceParts = instructorName.split(" ");
        firstName = spaceParts[0] || "";
        lastName = spaceParts.slice(1).join(" ") || "";
      }

      // Find the instructor in the User collection
      const instructor = await User.findOne({
        first_name: { $regex: new RegExp(`^${firstName}$`, "i") },
        last_name: { $regex: new RegExp(`^${lastName}$`, "i") },
        role: { $in: ["instructor", "programchairperson"] },
      });

      if (!instructor) {
        res.json({
          success: true,
          isValid: false,
          schedule: null,
          reason: "Instructor not found",
        });
        return;
      }

      // Get current time and day
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = currentHours * 60 + now.getMinutes();
      const currentTime = `${String(currentHours).padStart(2, "0")}:${String(
        now.getMinutes()
      ).padStart(2, "0")}`;
      const dayOfWeek = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
        now.getDay()
      ];
      const currentDateStr = now.toISOString().slice(0, 10);

      // Build query for the current day
      const daysQuery: any = {};
      daysQuery[`days.${dayOfWeek}`] = true;

      // Find schedules for this instructor, current day, within semester dates
      let schedules = await Schedule.find({
        instructor: instructor._id,
        ...daysQuery,
        semesterStartDate: { $lte: currentDateStr },
        semesterEndDate: { $gte: currentDateStr },
      })
        .populate("instructor section")
        .lean();

      // Fallback: manually filter if no results (in case day query doesn't work)
      if (schedules.length === 0) {
        const allSchedules = await Schedule.find({
          instructor: instructor._id,
          semesterStartDate: { $lte: currentDateStr },
          semesterEndDate: { $gte: currentDateStr },
        })
          .populate("instructor section")
          .lean();

        schedules = allSchedules.filter((s: any) => {
          const days = s.days || {};
          return days[dayOfWeek] === true;
        });
      }

      if (schedules.length === 0) {
        res.json({
          success: true,
          isValid: false,
          schedule: null,
          reason: "No schedule found for today",
        });
        return;
      }

      // Check each schedule to see if it matches current time AND room
      for (const schedule of schedules) {
        // Parse schedule start and end times
        const [startH, startM] = schedule.startTime.split(":").map(Number);
        const [endH, endM] = schedule.endTime.split(":").map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;

        // Check if current time is within schedule time
        const isTimeValid = currentMinutes >= startMinutes && currentMinutes <= endMinutes;

        if (!isTimeValid) {
          continue; // Skip this schedule, check next one
        }

        // If roomName is provided, validate it matches the schedule room
        if (roomName) {
          const scheduleRoom = (schedule.room || "").trim().toLowerCase();
          const providedRoom = roomName.trim().toLowerCase();

          // Check if rooms match (exact match or partial match)
          const isRoomValid =
            scheduleRoom === providedRoom ||
            scheduleRoom.includes(providedRoom) ||
            providedRoom.includes(scheduleRoom);

          if (isRoomValid) {
            // ✅ VALID: Both time AND room match
            res.json({
              success: true,
              isValid: true,
              schedule: schedule,
              reason: "Valid schedule - time and room match",
              timeMatch: true,
              roomMatch: true,
            });
            return;
          } else {
            // ⚠️ TIME MATCHES BUT ROOM DOESN'T
            res.json({
              success: true,
              isValid: false,
              schedule: schedule,
              reason: "Schedule time matches but room does not match",
              timeMatch: true,
              roomMatch: false,
              expectedRoom: schedule.room,
              providedRoom: roomName,
            });
            return;
          }
        } else {
          // No room provided - just validate time (for backward compatibility)
          res.json({
            success: true,
            isValid: true,
            schedule: schedule,
            reason: "Valid schedule - time matches (room not validated)",
            timeMatch: true,
            roomMatch: null,
          });
          return;
        }
      }

      // No matching schedule found
      res.json({
        success: true,
        isValid: false,
        schedule: null,
        reason: "No schedule found for current time",
        timeMatch: false,
        roomMatch: null,
      });
    } catch (error) {
      console.error("Error validating faculty schedule:", error);
      res.status(500).json({
        success: false,
        isValid: false,
        schedule: null,
        reason: "Server error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// ✅ CHECK DATA SOURCE STATUS (local DB vs MongoDB)
router.get(
  "/data-source-status",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const fs = require("fs");
      const path = require("path");
      
      const localDbPath = path.join(__dirname, "../../face_detection_data.db");
      const embeddingDbPath = path.join(__dirname, "../../face_embeddings.db");
      
      const localDbExists = fs.existsSync(localDbPath);
      const embeddingDbExists = fs.existsSync(embeddingDbPath);
      
      let localDbStats: any = null;
      let embeddingDbStats: any = null;
      
      if (localDbExists) {
        try {
          const stats = fs.statSync(localDbPath);
          localDbStats = {
            exists: true,
            size: stats.size,
            sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
            modified: stats.mtime.toISOString(),
            message: "Local database file exists",
          };
        } catch (e) {
          localDbStats = { exists: true, error: "Could not read stats" };
        }
      }
      
      if (embeddingDbExists) {
        try {
          const stats = fs.statSync(embeddingDbPath);
          embeddingDbStats = {
            exists: true,
            size: stats.size,
            sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
            modified: stats.mtime.toISOString(),
            message: "Embedding database file exists",
          };
        } catch (e) {
          embeddingDbStats = { exists: true, error: "Could not read stats" };
        }
      }
      
      // Check MongoDB connection
      const mongoose = require("mongoose");
      const mongoConnected = mongoose.connection.readyState === 1;
      
      // Determine system mode
      const usingLocal = localDbExists && embeddingDbExists;
      
      res.json({
        success: true,
        localDatabase: {
          schedules: localDbStats || { exists: false, message: "Local database not found" },
          embeddings: embeddingDbStats || { exists: false, message: "Embedding database not found" },
          status: usingLocal ? "Available" : "Not Available",
        },
        mongodb: {
          connected: mongoConnected,
          status: mongoConnected ? "Connected" : "Not Connected",
          message: mongoConnected 
            ? "MongoDB Atlas is connected (used for sync/backup)" 
            : "MongoDB Atlas is not connected (system works offline)",
        },
        systemMode: {
          primary: usingLocal ? "Local (Offline)" : "MongoDB (Online)",
          fallback: usingLocal ? "MongoDB (Sync only)" : "Local (if available)",
          message: usingLocal
            ? "System is using LOCAL databases (works offline). MongoDB used for sync only."
            : "System is using MONGODB (requires internet). Local databases not found.",
        },
        recommendation: usingLocal
          ? "System is configured for offline operation. All face detection data is stored locally."
          : "To enable offline mode, sync schedules to local database using /sync-schedules-to-local endpoint.",
        howToCheck: {
          logs: "Look for [DATA SOURCE] tags in Python recognizer output:",
          localDb: "[DATA SOURCE] [LOCAL DB] = Using local SQLite (OFFLINE)",
          cache: "[DATA SOURCE] [CACHE] = Using in-memory cache (OFFLINE)",
          mongodb: "[DATA SOURCE] [MONGODB API] = Using MongoDB Atlas (ONLINE)",
          fileSystem: "[DATA SOURCE] [FILE SYSTEM] = Processing images from disk",
        },
      });
    } catch (error) {
      console.error("Error checking data source status:", error);
      res.status(500).json({
        success: false,
        message: "Error checking status",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

// ✅ SYNC SCHEDULES TO LOCAL DATABASE (for offline face detection)
router.post(
  "/sync-schedules-to-local",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { collegeCode } = req.body;

      // Get all schedules (or filter by college if provided)
      let schedules;
      if (collegeCode) {
        const college = await College.findOne({ code: collegeCode });
        if (!college) {
          res.status(404).json({
            success: false,
            message: "College not found",
          });
          return;
        }

        // Get all instructors in this college
        const instructors = await UserModel.find({
          college: college._id,
          role: { $in: ["instructor", "programchairperson"] },
        });

        const instructorIds = instructors.map((inst) => inst._id);

        schedules = await Schedule.find({
          instructor: { $in: instructorIds },
        })
          .populate("instructor", "first_name last_name")
          .populate("section")
          .lean();
      } else {
        schedules = await Schedule.find()
          .populate("instructor", "first_name last_name")
          .populate("section")
          .lean();
      }

      // Format schedules for local database
      const formattedSchedules = schedules.map((schedule: any) => ({
        _id: schedule._id.toString(),
        instructor_id: schedule.instructor?._id?.toString() || "",
        instructor_name: schedule.instructor
          ? `${schedule.instructor.last_name}, ${schedule.instructor.first_name}`
          : "",
        courseCode: schedule.courseCode,
        courseTitle: schedule.courseTitle,
        room: schedule.room,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        semesterStartDate: schedule.semesterStartDate,
        semesterEndDate: schedule.semesterEndDate,
        days: schedule.days || {},
        section_id: schedule.section?._id?.toString() || "",
      }));

      res.status(200).json({
        success: true,
        message: `Prepared ${formattedSchedules.length} schedules for local database`,
        count: formattedSchedules.length,
        schedules: formattedSchedules,
        // Note: The Python recognizer will save these to local SQLite database
      });
    } catch (error) {
      console.error("Error syncing schedules:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

router.get("/dean-subjects-by-course", async (req: Request, res: Response): Promise<void> => {
  try {
    const courseQuery = (req.query.course as string | undefined)?.trim();
    // Allowed default prefixes when no course supplied
    const defaultPrefixes = ["IT", "IS"];

    // Determine prefixes to match: either the last two chars of the supplied course, or default (IT|IS)
    let prefixes: string[] = [];
    if (courseQuery && courseQuery.length > 0) {
      const lastTwo = courseQuery.toUpperCase().slice(-2);
      prefixes = [lastTwo];
    } else {
      prefixes = defaultPrefixes;
    }

    // Build DB regex to pre-filter subjects that start with any of the desired prefixes (ignoring leading spaces)
    // e.g. /^\\s*(?:IT|IS)/i
    const prefixRegex = new RegExp(`^\\s*(?:${prefixes.map((p) => p.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})`, "i");

    // Fetch matching subjects (DB-side pre-filter to avoid scanning entire collection if possible)
    const subjects = await Subject.find({
      courseCode: { $regex: prefixRegex },
    }).lean();

    // Deduplicate by normalized courseCode and keep first encountered _id
    const subjectsMap = new Map<string, { _id?: string; courseCode: string; courseTitle: string }>();

    subjects.forEach((s: any) => {
      if (!s || !s.courseCode) return;

      // Normalize stored courseCode (collapse spaces, uppercase)
      const normalizedCourseCode = String(s.courseCode).trim().replace(/\s+/g, " ").toUpperCase();

      // Extract the first TWO alphabetic letters from the stored courseCode (ignore digits/spaces/symbols)
      // e.g. "IT 101" -> "IT", " I S101" -> "IS"
      const letters = (String(s.courseCode).match(/[A-Za-z]/g) || []).slice(0, 2).join("").toUpperCase();

      // Include only if extracted letters match one of the prefixes
      if (prefixes.includes(letters)) {
        if (!subjectsMap.has(normalizedCourseCode)) {
          subjectsMap.set(normalizedCourseCode, {
            _id: s._id ? String(s._id) : undefined,
            courseCode: normalizedCourseCode,
            courseTitle: s.courseTitle ?? "",
          });
        }
      }
    });

    // Convert to array and sort
    const result = Array.from(subjectsMap.values()).sort((a, b) =>
      a.courseCode.localeCompare(b.courseCode, undefined, { numeric: true, sensitivity: "base" })
    );

    res.json(result);
  } catch (error) {
    console.error("Error fetching subjects dynamically:", error);
    res.status(500).json({ message: "Error fetching subjects" });
  }
});

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/dean-all-sections", async (req: Request, res: Response): Promise<void> => {
  try {
    const collegeQuery = (req.query.college as string)?.trim();

    if (!collegeQuery) {
      res.status(400).json({ message: "college query parameter is required" });
      return;
    }

    // Find college by its code (case-insensitive)
    const escaped = escapeRegExp(collegeQuery);
    const collegeDoc = await College.findOne({ code: { $regex: `^${escaped}$`, $options: "i" } }).lean();

    if (!collegeDoc) {
      res.status(404).json({ message: `College with code "${collegeQuery}" not found` });
      return;
    }

    const collegeId = collegeDoc._id;

    // Find sections whose `college` field references the found college _id
    const sections = await Section.find({ college: collegeId }).lean();

    // Return sections (you can map/shape fields here if you want)
    res.json(
      sections.map((s: any) => ({
        _id: s._id,
        college: s.college,
        course: s.course,
        section: s.section,
        block: s.block,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        // include any other fields from the section as needed
      }))
    );
  } catch (error) {
    console.error("Error fetching sections:", error);
    res.status(500).json({ message: "Error fetching sections" });
  }
});

export default router;
