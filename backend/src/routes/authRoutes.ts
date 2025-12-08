//authRoutes.ts
import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import UserModel from "../models/User";
import Schedule from "../models/Schedule";
import Subject from "../models/Subject";
import Room from "../models/Room";
import Section from "../models/Section";
import CollegeModel from "../models/College";
import Log from "../models/AttendanceLogs";
import Semester from "../models/Semester";
import dotenv from "dotenv";
import multer from "multer";
import mammoth from "mammoth";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { ILog } from "../models/AttendanceLogs";
import nodemailer from "nodemailer";
import TempAccount from "../models/TempAccount";
import Course from "../models/Course";
import facultyProfileUpload from "../middleware/facultyProfileUpload";
import { 
  UserService, 
  CollegeService, 
  CourseService, 
  ScheduleService, 
  LogService,
  SectionService,
  RoomService,
  SemesterService
} from "../services/dataService";
import { isOfflineMode } from "../utils/systemMode";

// dotenv is loaded by systemMode.ts, app.ts, and server.ts - no need to load again here
const router = express.Router();
const upload = multer({ dest: "uploads/" });

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const generateRandomPassword = () => {
  return Math.floor(1000 + Math.random() * 9000).toString(); // e.g. "8342"
};

router.post(
  "/upload-faculty-profile-photo",
  facultyProfileUpload.single("image"),
  async (req, res): Promise<void> => {
    try {
      const file = req.file as Express.Multer.File & {
        path?: string;
        secure_url?: string;
        url?: string;
      };
      const { facultyId } = req.body;

      if (!file || !facultyId) {
        res
          .status(400)
          .json({ message: "Image file and facultyId are required" });
        return;
      }

      // Use data service (works both online and offline)
      const faculty = await UserService.findById(facultyId);
      if (!faculty) {
        res.status(404).json({ message: "Faculty not found" });
        return;
      }

      // Always get the correct Cloudinary URL
      const imageUrl = file.path || file.secure_url || file.url;
      if (!imageUrl) {
        res
          .status(500)
          .json({ message: "Could not determine uploaded image URL" });
        return;
      }

      // Update existing faculty record
      await UserService.update(facultyId, { profilePhotoUrl: imageUrl });

      res.status(200).json({
        message: "Profile photo uploaded successfully",
        imageUrl,
      });
    } catch (error) {
      console.error("Profile photo upload error:", error);
      res.status(500).json({ message: "Internal server error", error });
    }
  }
);

// GET USER NAME - WORKS OFFLINE
router.get("/user/name", async (req: Request, res: Response): Promise<void> => {
  const userId = req.query.name as string;

  try {
    if (!userId) {
      res.status(400).json({ error: "User ID is required." });
      return;
    }

    // Use data service (works both online and offline)
    const user = await UserService.findById(userId);

    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    res.status(200).json({
      last_name: user.last_name,
      first_name: user.first_name,
      middle_name: user.middle_name,
    });
  } catch (error) {
    console.error("Error fetching user name:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// UPLOAD FACULTY PROFILE PHOTO - WORKS OFFLINE
router.post(
  "/upload-faculty-profile-photo",
  facultyProfileUpload.single("image"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const file = req.file as Express.Multer.File & { path: string };
      const { facultyId } = req.body;

      if (!file || !facultyId) {
        res.status(400).json({ message: "File and facultyId are required" });
        return;
      }

      // Use data service (works both online and offline)
      const updated = await UserService.update(facultyId, { profilePhotoUrl: file.path });

      if (!updated) {
        res.status(404).json({ message: "Faculty not found" });
        return;
      }

      const updatedUser = await UserService.findById(facultyId);

      res.status(200).json({
        message: "Contract uploaded and saved successfully",
        imageUrl: file.path,
        user: updatedUser,
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Internal server error", error });
    }
  }
);

// LOGS TODAY - WORKS OFFLINE
router.get("/logs/today", async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const today = `${year}-${month}-${day}`;

    // Use data service (works both online and offline)
    const logs = await LogService.findByDate(today);
    
    // Enrich with schedule info
    const enrichedLogs = await Promise.all(logs.map(async (log) => {
      const scheduleId = typeof log.schedule === 'string' ? log.schedule : (log.schedule as any)?._id;
      let schedule = null;
      if (scheduleId) {
        schedule = await ScheduleService.findById(scheduleId);
      }
      return { ...log, schedule };
    }));

    res.status(200).json(enrichedLogs);
  } catch (error) {
    console.error("Error fetching today's logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GENERATE MONTHLY DEPARTMENT LOGS REPORT - WORKS OFFLINE
router.post(
  "/generate-monthly-department-logs",
  async (req: Request, res: Response) => {
    try {
      const { CourseName, startDate, endDate, searchQuery } = req.body;

      console.log(`[REPORT] Generating report for CourseName: "${CourseName}", StartDate: ${startDate}, EndDate: ${endDate}, SearchQuery: "${searchQuery}"`);

      // Use data service (works both online and offline)
      const allLogs = await LogService.findAll();
      
      // Enrich logs with schedule info
      const logs = await Promise.all(allLogs.map(async (log) => {
        const scheduleId = typeof log.schedule === 'string' ? log.schedule : (log.schedule as any)?._id;
        let schedule = null;
        if (scheduleId) {
          schedule = await ScheduleService.findById(scheduleId);
        }
        return { ...log, schedule };
      }));

      console.log(`[REPORT] Fetched ${logs.length} total logs from database`);

      // 🔹 Filter logs by date range before grouping, and filter out logs with null schedules
      const filteredLogs = logs.filter((log: any) => {
        // Filter out logs with null/undefined schedules
        if (!log.schedule || log.schedule === null || log.schedule === undefined) {
          return false;
        }
        
        if (!log.date) return false;
        const logDate = new Date(log.date);
        logDate.setHours(0, 0, 0, 0); // Reset time to start of day for comparison

        // If no date range specified, include all logs
        if (!startDate && !endDate) {
          return true;
        }

        // Check if log date is within range (including time)
        // Parse the date string - could be YYYY-MM-DD or YYYY-MM-DD HH:mm:ss
        const parseDate = (dateStr: string) => {
          if (dateStr.includes(' ')) {
            // Has time: YYYY-MM-DD HH:mm:ss
            return new Date(dateStr.replace(' ', 'T'));
          } else {
            // No time: YYYY-MM-DD
            return new Date(dateStr + 'T00:00:00');
          }
        };
        
        const afterStart = startDate 
          ? logDate >= parseDate(startDate)
          : true;
        const beforeEnd = endDate 
          ? logDate <= parseDate(endDate)
          : true;

        return afterStart && beforeEnd;
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

      let tableData = Object.values(grouped);

      // Filter by instructor name if searchQuery is provided
      if (searchQuery && searchQuery.trim()) {
        const searchLower = searchQuery.toLowerCase().trim();
        tableData = tableData.filter((row: any) => {
          const instructorName = row.instructorName || "";
          return instructorName.toLowerCase().includes(searchLower);
        });
        console.log(`[REPORT] After filtering by name "${searchQuery}": ${tableData.length} records`);
      }

      console.log(`[REPORT] Generated ${tableData.length} grouped records for report`);

      if (tableData.length === 0) {
        res.status(400).json({ 
          success: false, 
          message: "No attendance data found for the selected filters. Please adjust your filters and try again." 
        });
        return;
      }

      // 🔹 Report metadata — based on selected filters
      // Format report date range (including time)
      const formatDateTime = (dateStr: string) => {
        const date = dateStr.includes(' ') 
          ? new Date(dateStr.replace(' ', 'T'))
          : new Date(dateStr + 'T00:00:00');
        return date.toLocaleString('en-US', { 
          month: 'long', 
          day: 'numeric', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      };
      
      let reportDate = "All Dates";
      if (startDate && endDate) {
        reportDate = `${formatDateTime(startDate)} - ${formatDateTime(endDate)}`;
      } else if (startDate) {
        reportDate = `From ${formatDateTime(startDate)}`;
      } else if (endDate) {
        reportDate = `Until ${formatDateTime(endDate)}`;
      }

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
        courseName: CourseName?.toUpperCase() || "N/A",
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

// SHOW DAILY REPORT - WORKS OFFLINE
router.post("/show-daily-report", async (req: Request, res: Response) => {
  try {
    const { CourseName } = req.body;
    const today = new Date().toISOString().slice(0, 10);

    // Use data service (works both online and offline)
    let logs = await LogService.findByDate(today);
    
    // Filter by course if provided
    if (CourseName) {
      logs = logs.filter(log => log.course === CourseName);
    }

    // Enrich logs with schedule info
    const tableData = await Promise.all(logs.map(async (log) => {
      const scheduleId = typeof log.schedule === 'string' ? log.schedule : (log.schedule as any)?._id;
      let schedule: any = null;
      if (scheduleId) {
        schedule = await ScheduleService.findById(scheduleId);
      }
      
      const instructor = schedule?.instructor && typeof schedule.instructor === 'object'
        ? `${(schedule.instructor as any).first_name} ${(schedule.instructor as any).last_name}`
        : "N/A";

      return {
        name: instructor,
        courseCode: schedule?.courseCode || "N/A",
        courseTitle: schedule?.courseTitle || "N/A",
        status: log.status || "N/A",
        timeInOut: `${log.timeIn || "-"} / ${log.timeout || "-"}`,
        room: schedule?.room || "N/A",
      };
    }));

    res.status(200).json({
      success: true,
      data: tableData,
    });
  } catch (error: unknown) {
    console.error("Error fetching daily report:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching attendance data",
    });
  }
});

// SHOW MONTHLY DEPARTMENT LOGS - WORKS OFFLINE
router.post(
  "/show-monthly-department-logs",
  async (req: Request, res: Response) => {
    try {
      const { CourseName } = req.body;
      console.log(`[API] 📋 Fetching logs for program/course: "${CourseName}"`);

      // Use data service (works both online and offline)
      const allLogs = await LogService.findAll();
      console.log(`[API] ✅ Found ${allLogs.length} total logs`);

      // Enrich logs with schedule and instructor info
      const enrichedLogs = await Promise.all(allLogs.map(async (log) => {
        const scheduleId = typeof log.schedule === 'string' ? log.schedule : (log.schedule as any)?._id;
        let schedule = null;
        if (scheduleId) {
          schedule = await ScheduleService.findById(scheduleId);
        }
        return {
          ...log,
          schedule: schedule
        };
      }));

      // Sort by most recent first
      enrichedLogs.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.timeIn || '').localeCompare(a.timeIn || '');
      });

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

// FETCH ALL FULL SCHEDULES TODAY BASED ON COURSE - WORKS OFFLINE
router.post(
  "/all-schedules/today",
  async (req: Request, res: Response): Promise<void> => {
    const { shortCourseName } = req.body;

    if (!shortCourseName) {
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
        const courseMatch = s.courseCode.toLowerCase().startsWith(shortCourseName.toLowerCase());
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

// COUNT OF INSTRUCTORS (filtered by course) - WORKS OFFLINE
router.get(
  "/count/instructors",
  async (req: Request, res: Response): Promise<void> => {
    const courseCode = req.query.course as string;

    if (!courseCode) {
      res.status(400).json({ message: "Course code is missing" });
      return;
    }

    try {
      // Use data service (works both online and offline)
      const courseDoc = await CourseService.findByCode(courseCode);

      if (!courseDoc) {
        res.status(404).json({ message: "Course not found" });
        return;
      }

      // Count instructors with this course
      const courseId = courseDoc._id || courseDoc.id || '';
      const count = await UserService.countByRoleAndCourse('instructor', courseId);

      res.json({ count });
    } catch (error) {
      console.error("Error fetching instructor count:", error);
      res.status(500).json({ message: "Error fetching instructor count" });
    }
  }
);

// COUNT OF SCHEDULES TODAY - WORKS OFFLINE
router.get("/schedules-count/today", async (req: Request, res: Response) => {
  try {
    const today = new Date();
    const course = req.query.course as string | undefined;

    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const dayOfWeek = days[today.getDay()];

    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // Use data service (works both online and offline)
    const allSchedules = await ScheduleService.findAll();
    
    // Filter schedules for today
    let filteredSchedules = allSchedules.filter(s => {
      const scheduleDays = s.days as { [key: string]: boolean };
      const isToday = scheduleDays && scheduleDays[dayOfWeek] === true;
      const inSemester = s.semesterStartDate <= todayStr && s.semesterEndDate >= todayStr;
      return isToday && inSemester;
    });

    // Filter by course if provided
    if (course) {
      const shortCourseName = course.replace(/^bs/i, "").toUpperCase();
      filteredSchedules = filteredSchedules.filter(s => 
        s.courseCode.toUpperCase().startsWith(shortCourseName)
      );
    }

    res.json({ count: filteredSchedules.length });
  } catch (error) {
    console.error("Error counting today's schedules:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// LOGS FOR FACULTY TODAY - WORKS OFFLINE
router.get(
  "/logs/faculty-today",
  async (req: Request, res: Response): Promise<void> => {
    const { facultyId } = req.query;

    if (!facultyId) {
      res.status(400).json({ message: "facultyId is missing" });
      return;
    }

    try {
      // Use data service (works both online and offline)
      const schedules = await ScheduleService.findByInstructor(facultyId as string);

      if (!schedules || schedules.length === 0) {
        res.status(404).json({ message: "No schedules found for this faculty" });
        return;
      }

      // Get schedule IDs
      const scheduleIds = schedules.map(s => s._id || s.id);
      
      // Get all logs and filter by schedule IDs
      const allLogs = await LogService.findAll();
      const logs = allLogs.filter(log => {
        const logScheduleId = typeof log.schedule === 'string' ? log.schedule : (log.schedule as any)?._id;
        return scheduleIds.includes(logScheduleId);
      });

      if (!logs || logs.length === 0) {
        res.status(404).json({ message: "No logs found for today for this faculty" });
        return;
      }

      // Add schedule details to logs
      const logsWithSchedule = logs.map(log => {
        const logScheduleId = typeof log.schedule === 'string' ? log.schedule : (log.schedule as any)?._id;
        const schedule = schedules.find(s => (s._id || s.id) === logScheduleId);
        return {
          ...log,
          schedule: schedule ? {
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            courseCode: schedule.courseCode,
            courseTitle: schedule.courseTitle,
            room: schedule.room,
            days: schedule.days
          } : null
        };
      });

      res.status(200).json(logsWithSchedule);
    } catch (error) {
      console.error("Error fetching logs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// LOGS FOR ALL FACULTIES TODAY - WORKS OFFLINE
router.get(
  "/logs/all-faculties/today",
  async (req: Request, res: Response): Promise<void> => {
    const { courseName } = req.query;

    if (!courseName) {
      res.status(400).json({ message: "courseName is missing" });
      return;
    }

    try {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD format

      // Use data service (works both online and offline)
      const todayLogs = await LogService.findByDate(todayStr);
      
      // Filter by course name
      const filteredLogs = todayLogs.filter(log => log.course === courseName);

      if (filteredLogs.length === 0) {
        res.status(404).json({ message: "No logs found for today" });
        return;
      }

      // Get instructor info for each log
      const logsWithInstructor = await Promise.all(filteredLogs.map(async (log) => {
        let instructorName = "Instructor name not found";
        
        // Get schedule to find instructor
        const scheduleId = typeof log.schedule === 'string' ? log.schedule : (log.schedule as any)?._id;
        if (scheduleId) {
          const schedule = await ScheduleService.findById(scheduleId);
          if (schedule && typeof schedule.instructor === 'object') {
            const instructor = schedule.instructor as any;
            instructorName = `${instructor.first_name || ''} ${instructor.last_name || ''}`.trim();
          }
        }

        return {
          timeIn: log.timeIn,
          timeout: log.timeout,
          instructorName: instructorName,
        };
      }));

      res.status(200).json(logsWithInstructor);
    } catch (error) {
      console.error("Error fetching today's logs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// GET FACULTY LIST - WORKS OFFLINE
router.get("/faculty", async (req: Request, res: Response): Promise<void> => {
  const { courseName } = req.query;
  console.log(`[GET FACULTY ROUTE] Received request for courseName: ${courseName}`);

  if (!courseName) {
    res.status(400).json({ message: "courseName is missing" });
    return;
  }

  try {
    // Use data service (works both online and offline)
    const courseDoc = await CourseService.findByCode(courseName as string);

    if (!courseDoc) {
      console.log(`[GET FACULTY ROUTE] Course not found: ${courseName}`);
      res.status(404).json({ message: "Course not found" });
      return;
    }

    const courseId = courseDoc._id || courseDoc.id || '';
    console.log(`[GET FACULTY ROUTE] Found course ${courseName} with ID: ${courseId}`);
    
    const facultyList = await UserService.findByCourse(courseId);
    console.log(`[GET FACULTY ROUTE] Returning ${facultyList.length} faculty members`);

    res.json(facultyList);
  } catch (error) {
    console.error("[GET FACULTY ROUTE] Error fetching faculty by course:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// GET INITIAL SIGNED UP FACULTY LIST
router.get(
  "/initial-faculty",
  async (req: Request, res: Response): Promise<void> => {
    const { courseName } = req.query;

    if (!courseName) {
      res.status(400).json({ message: "courseName is missing" });
      return;
    }

    try {
      // Case-insensitive search for course code
      const course = await Course.findOne({ 
        code: { $regex: new RegExp(`^${courseName}$`, "i") }
      });
      if (!course) {
        res.status(404).json({ message: "Course not found" });
        return;
      }

      const facultyList = await TempAccount.find({
        signUpStatus: "for_approval",
        role: "instructor",
        program: course._id,
      }).populate("department program");

      res.json(facultyList);
    } catch (error) {
      console.error("Error fetching faculty by course:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.put("/approve-faculty/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const faculty = await TempAccount.findById(id);
    if (!faculty) {
      res.status(404).json({ message: "Faculty not found" });
      return;
    }

    const randomPassword = generateRandomPassword();

    // Hash the random password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(randomPassword, saltRounds);

    // Update status and save hashed password
    faculty.signUpStatus = "accepted_needs_completion";
    faculty.tempPassword = hashedPassword;
    await faculty.save();

    // Send email
    const mailOptions = {
      from: `"EduVision Admin" <${process.env.EMAIL_USER}>`,
      to: faculty.email,
      subject: "Account Approved - EduVision",
      html: `
        <h2>Your account has been approved!</h2>
        <p>Welcome to EduVision! Your temporary login credentials are below:</p>
        <ul>
          <li><strong>Email:</strong> ${faculty.email}</li>
          <li><strong>Temporary Password:</strong> ${randomPassword}</li>
        </ul>
        <p>Please log in and complete your account setup as soon as possible.</p>
        <br/>
        <p>Thank you,<br/>EduVision Team</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.json({
      message: "Faculty approved and email sent",
      password: randomPassword,
    });
  } catch (error) {
    console.error("Error in approve-faculty:", error);
    res.status(500).json({ message: "Server error while approving faculty" });
  }
});

router.put(
  "/reject-faculty/:id",
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
      const faculty = await TempAccount.findById(id);
      if (!faculty) {
        res.status(404).json({ message: "Faculty not found" });
        return;
      }

      faculty.signUpStatus = "approval_declined";
      await faculty.save();

      const mailOptions = {
        from: `"EduVision Admin" <${process.env.EMAIL_USER}>`,
        to: faculty.email,
        subject: "Account Rejected - EduVision",
        html: `
        <h2>Account Rejected</h2>
        <p>We're sorry to inform you that your EduVision account request has been rejected.</p>
        <p>If you believe this was a mistake, please contact the administration.</p>
        <br/>
        <p>Thank you,<br/>EduVision Team</p>
      `,
      };

      await transporter.sendMail(mailOptions);

      res.json({ message: "Faculty rejected and email sent." });
    } catch (error) {
      console.error("Error rejecting faculty:", error);
      res.status(500).json({ message: "Server error while rejecting faculty" });
    }
  }
);

// DELETE FACULTY ACCOUNT - WORKS OFFLINE
router.delete(
  "/faculty/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      console.log(`[DELETE FACULTY ROUTE] Received delete request for ID: ${id}`);

      // Use data service (works both online and offline)
      const faculty = await UserService.findById(id);
      if (!faculty) {
        console.log(`[DELETE FACULTY ROUTE] Faculty not found: ${id}`);
        res.status(404).json({ message: "Faculty not found" });
        return;
      }

      console.log(`[DELETE FACULTY ROUTE] Found faculty: ${faculty.first_name} ${faculty.last_name}`);

      const deleted = await UserService.delete(id);
      if (!deleted) {
        console.log(`[DELETE FACULTY ROUTE] Delete operation failed for: ${id}`);
        res.status(500).json({ message: "Failed to delete faculty" });
        return;
      }

      console.log(`[DELETE FACULTY ROUTE] Successfully deleted faculty: ${id}`);
      res.json({ message: "Faculty account deleted successfully" });
    } catch (error) {
      console.error('[DELETE FACULTY ROUTE] Error:', error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// CREATE NEW FACULTY ACCOUNT - WORKS OFFLINE
router.post("/faculty", async (req: Request, res: Response): Promise<void> => {
  console.log(req.body);
  try {
    const {
      last_name,
      first_name,
      middle_name,
      ext_name,
      email,
      username,
      password,
      role,
      college: collegeCode,
      course: courseCode,
      highestEducationalAttainment,
      academicRank,
      statusOfAppointment,
      numberOfPrep,
      totalTeachingLoad,
    } = req.body;

    if (
      !last_name ||
      !first_name ||
      !username ||
      !email ||
      !password ||
      !role ||
      !collegeCode ||
      !courseCode
    ) {
      res.status(400).json({
        message:
          "Please provide all required fields, including college and course",
      });
      return;
    }

    const validRoles = [
      "superadmin",
      "instructor",
      "programchairperson",
      "dean",
    ];
    if (!validRoles.includes(role)) {
      res.status(400).json({ message: "Invalid role." });
      return;
    }

    // Use data service (works both online and offline)
    const existingUser = await UserService.findByEmail(email);
    if (existingUser) {
      res.status(400).json({ message: "Email already exists" });
      return;
    }

    // ⚡ AUTO-GENERATE UNIQUE USERNAME: If username exists, append number (1, 2, 3...) until unique
    let finalUsername = username;
    let counter = 1;
    
    while (await UserService.findByUsername(finalUsername)) {
      finalUsername = `${username}${counter}`;
      counter++;
      
      // Safety limit
      if (counter > 999) {
        res.status(500).json({ message: "Unable to generate unique username" });
        return;
      }
    }
    
    // Use finalUsername instead of reassigning username (which is const)
    const uniqueUsername = finalUsername;

    // Find the college document
    const collegeDoc = await CollegeService.findByCode(collegeCode);
    if (!collegeDoc) {
      res.status(400).json({ message: "Invalid college code" });
      return;
    }

    // Find the course document
    const courseDoc = await CourseService.findByCode(courseCode);
    if (!courseDoc) {
      res.status(400).json({ message: "Invalid course code" });
      return;
    }

    // Create new user
    const newUser = await UserService.create({
      last_name,
      first_name,
      middle_name: middle_name || "",
      ext_name: ext_name || "",
      username: uniqueUsername,
      email,
      password, // Will be hashed by UserService.create
      role,
      status: "forverification",
      college: collegeDoc._id || collegeDoc.id || '',
      course: courseDoc._id || courseDoc.id || '',
      highestEducationalAttainment,
      academicRank,
      statusOfAppointment,
      numberOfPrep,
      totalTeachingLoad,
    });

    // Send welcome email (only in online mode)
    if (!isOfflineMode()) {
      const mailOptions = {
        from: "Eduvision Team",
        to: newUser.email,
        subject: "Welcome to EduVision!",
        text: `Hello ${newUser.first_name},

Your faculty account has been created successfully.

Here are your login details:
Username: ${newUser.username}
Password: ${password}
Please login and change your password immediately.

Thank you,
EduVision Team`,
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Error sending email:", error);
        } else {
          console.log("Email sent:", info.response);
        }
      });
    } else {
      console.log('[OFFLINE MODE] Email sending skipped - user created successfully');
    }

    res.status(201).json({
      _id: newUser._id,
      last_name: newUser.last_name,
      first_name: newUser.first_name,
      middle_name: newUser.middle_name,
      ext_name: newUser.ext_name,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      status: newUser.status,
      college: newUser.college,
      course: newUser.course, // this will be ObjectId
      highestEducationalAttainment: newUser.highestEducationalAttainment,
      academicRank: newUser.academicRank,
      statusOfAppointment: newUser.statusOfAppointment,
      numberOfPrep: newUser.numberOfPrep,
      totalTeachingLoad: newUser.totalTeachingLoad,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// GET INSTRUCTORS - WORKS OFFLINE
router.get(
  "/instructors",
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Use data service (works both online and offline)
      const instructors = await UserService.findByRole('instructor');
      res.json(instructors.map(i => ({
        _id: i._id || i.id,
        first_name: i.first_name,
        middle_name: i.middle_name,
        last_name: i.last_name
      })));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Error fetching instructors" });
    }
  }
);

// GET SCHEDULES ROUTE - WORKS OFFLINE
router.get("/schedules", async (req: Request, res: Response): Promise<void> => {
  const { shortCourseName } = req.query;

  if (!shortCourseName) {
    res.status(400).json({ message: "shortCourseName is missing" });
    return;
  }

  try {
    // Use data service (works both online and offline)
    const allSchedules = await ScheduleService.findAll();
    const coursePrefix = (shortCourseName as string).toLowerCase();
    const schedules = allSchedules.filter(s => 
      s.courseCode.toLowerCase().startsWith(coursePrefix)
    );

    res.json(schedules);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching schedules", error });
  }
});

// GET FACULTY SCHEDULES - WORKS OFFLINE
router.get(
  "/schedules-faculty",
  async (req: Request, res: Response): Promise<void> => {
    const { facultyId, semester } = req.query;

    if (!facultyId) {
      res.status(400).json({ message: "facultyId is required" });
      return;
    }

    try {
      // Use data service (works both online and offline)
      let schedules = await ScheduleService.findByInstructor(facultyId as string);

      // Filter by semester if provided
      if (semester && typeof semester === "string" && semester.trim() !== "") {
        const semStr = semester.trim();
        const semMatch = semStr.match(
          /^([\d]{1,2}(?:st|nd|rd|th)\s+Semester|1st\s+Semester|2nd\s+Semester)?\s*,?\s*(?:AY\s*)?(\d{4}-\d{4})$/i
        );

        if (semMatch) {
          const semesterNameRaw = (semMatch[1] || "").trim();
          const academicYear = (semMatch[2] || "").trim();

          let semesterName = semesterNameRaw;
          if (!semesterName) {
            if (/^1/i.test(semStr)) semesterName = "1st Semester";
            else if (/^2/i.test(semStr)) semesterName = "2nd Semester";
          }

          const ayParts = academicYear.split("-");
          let computedStartDate: string | null = null;
          let computedEndDate: string | null = null;

          if (ayParts.length === 2) {
            const startYear = parseInt(ayParts[0], 10);
            const endYear = parseInt(ayParts[1], 10);

            if (/^1/i.test(semesterName)) {
              computedStartDate = `${startYear}-08-01`;
              computedEndDate = `${startYear}-12-31`;
            } else if (/^2/i.test(semesterName)) {
              computedStartDate = `${endYear}-01-01`;
              computedEndDate = `${endYear}-05-31`;
            }
          }

          // Filter schedules based on semester dates
          if (computedStartDate && computedEndDate) {
            schedules = schedules.filter(s => {
              const startDate = s.semesterStartDate;
              const endDate = s.semesterEndDate;
              // Check if schedule overlaps with semester period
              return (startDate <= computedEndDate && endDate >= computedStartDate);
            });
          }
        }
      }

      res.json(schedules);
    } catch (error) {
      console.error("Error fetching schedules:", error);
      res.status(500).json({ message: "Error fetching schedules", error });
    }
  }
);

// DELETE SCHEDULE - MONGODB-ONLY
router.delete("/schedules/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    console.log(`[DELETE SCHEDULE] Received delete request for schedule ID: ${id}`);
    
    // Check if schedule exists
    const schedule = await ScheduleService.findById(id);
    if (!schedule) {
      console.log(`[DELETE SCHEDULE] Schedule not found: ${id}`);
      res.status(404).json({ message: "Schedule not found" });
      return;
    }
    
    console.log(`[DELETE SCHEDULE] Found schedule: ${schedule.courseCode} - ${schedule.courseTitle}`);
    
    // ⚡ MONGODB-ONLY: Delete from MongoDB directly
    // Note: Attendance logs that reference this schedule will keep the reference for historical purposes
    const deleted = await ScheduleService.delete(id);
    
    if (!deleted) {
      console.log(`[DELETE SCHEDULE] Delete operation failed for: ${id}`);
      res.status(500).json({ message: "Failed to delete schedule" });
      return;
    }
    
    console.log(`[DELETE SCHEDULE] ✅ Successfully deleted schedule from MongoDB: ${id} (${schedule.courseCode})`);
    console.log(`[DELETE SCHEDULE] Note: Python recognizer cache will refresh automatically within 5 minutes`);
    
    res.json({ 
      success: true,
      message: "Schedule deleted successfully" 
    });
  } catch (error) {
    console.error('[DELETE SCHEDULE] ❌ Error:', error);
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
});

// ADD NEW SCHEDULE ROUTE - WORKS OFFLINE
router.post(
  "/add-schedules",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        courseTitle,
        courseCode,
        instructor,
        room,
        startTime,
        endTime,
        days,
        semesterStartDate,
        semesterEndDate,
        section,
      } = req.body;

      // ⚡ IMPROVED VALIDATION: Check each field individually and provide specific error messages
      const missingFields: string[] = [];
      const errors: string[] = [];

      if (!courseTitle || courseTitle.trim() === "") {
        missingFields.push("Course Title");
      }

      if (!courseCode || courseCode.trim() === "") {
        missingFields.push("Course Code");
      }

      if (!instructor || instructor.trim() === "") {
        missingFields.push("Instructor");
      }

      if (!room || room.trim() === "") {
        missingFields.push("Room");
      }

      if (!startTime || startTime.trim() === "") {
        missingFields.push("Start Time");
      }

      if (!endTime || endTime.trim() === "") {
        missingFields.push("End Time");
      }

      if (!days || typeof days !== "object") {
        missingFields.push("Days");
      }

      if (!semesterStartDate || semesterStartDate.trim() === "") {
        missingFields.push("Semester Start Date");
      }

      if (!semesterEndDate || semesterEndDate.trim() === "") {
        missingFields.push("Semester End Date");
      }

      if (!section || section.trim() === "") {
        missingFields.push("Section");
      }

      // Return specific missing fields
      if (missingFields.length > 0) {
        res.status(400).json({
          message: `Please provide the following required fields: ${missingFields.join(", ")}`,
          errors: missingFields.map(field => `${field} is required`),
          missingFields,
        });
        return;
      }

      // Validate days format
      const validDays = ["mon", "tue", "wed", "thu", "fri", "sat"];
      const isValidDays = validDays.every(
        (day) => typeof days[day] === "boolean"
      );

      if (!isValidDays) {
        res.status(400).json({ 
          message: "Invalid days format. Days must be an object with boolean values for mon, tue, wed, thu, fri, sat.",
          errors: ["Invalid days format"]
        });
        return;
      }

      // Check if at least one day is selected
      const hasSelectedDay = validDays.some((day) => days[day] === true);
      if (!hasSelectedDay) {
        res.status(400).json({
          message: "Please select at least one day for the schedule.",
          errors: ["At least one day must be selected"]
        });
        return;
      }

      // Validate time format and range
      const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(startTime)) {
        res.status(400).json({
          message: "Invalid Start Time format. Please use HH:MM format (e.g., 08:00).",
          errors: ["Invalid Start Time format"]
        });
        return;
      }

      if (!timeRegex.test(endTime)) {
        res.status(400).json({
          message: "Invalid End Time format. Please use HH:MM format (e.g., 10:00).",
          errors: ["Invalid End Time format"]
        });
        return;
      }

      // Validate that end time is after start time
      const [startHour, startMin] = startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (endMinutes <= startMinutes) {
        res.status(400).json({
          message: "End Time must be after Start Time.",
          errors: ["End Time must be after Start Time"]
        });
        return;
      }

      // ✅ Convert semester dates to YYYY-MM-DD format (accepts any valid date format)
      const formatDate = (date: string | Date) => {
        const d = new Date(date);
        if (isNaN(d.getTime())) {
          return null; // Invalid date
        }
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      // Validate dates by trying to convert them
      const formattedStartDate = formatDate(semesterStartDate);
      const formattedEndDate = formatDate(semesterEndDate);

      if (!formattedStartDate) {
        res.status(400).json({
          message: "Invalid Semester Start Date. Please provide a valid date.",
          errors: ["Invalid Semester Start Date"]
        });
        return;
      }

      if (!formattedEndDate) {
        res.status(400).json({
          message: "Invalid Semester End Date. Please provide a valid date.",
          errors: ["Invalid Semester End Date"]
        });
        return;
      }

      // Validate date range
      const startDate = new Date(formattedStartDate);
      const endDate = new Date(formattedEndDate);

      if (endDate <= startDate) {
        res.status(400).json({
          message: "Semester End Date must be after Start Date.",
          errors: ["Semester End Date must be after Start Date"]
        });
        return;
      }

      // Use data service (works both online and offline)
      const newSchedule = await ScheduleService.create({
        courseTitle,
        courseCode,
        instructor,
        room,
        startTime,
        endTime,
        days,
        semesterStartDate: formattedStartDate,
        semesterEndDate: formattedEndDate,
        section,
      });

      // ⚡ MONGODB-ONLY: Schedules are stored in MongoDB only
      // The Python recognizer will fetch schedules directly from MongoDB via API
      console.log(`[MONGODB] ✅ Schedule ${newSchedule.courseCode} saved to MongoDB`);

      res.status(201).json({
        message: "Schedule created successfully.",
        schedule: newSchedule,
      });
    } catch (error: any) {
      console.error("[ERROR] Failed to create schedule:", error);
      
      // Provide more specific error messages
      let errorMessage = "Failed to create schedule. Please try again.";
      let statusCode = 500;

      if (error.name === "ValidationError") {
        // Mongoose validation error
        const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message);
        errorMessage = `Validation error: ${validationErrors.join(", ")}`;
        statusCode = 400;
      } else if (error.code === 11000) {
        // Duplicate key error
        errorMessage = "A schedule with the same details already exists.";
        statusCode = 409;
      } else if (error.message) {
        errorMessage = error.message;
      }

      res.status(statusCode).json({ 
        message: errorMessage,
        error: error.name || "ServerError"
      });
    }
  }
);


// GET SUBJECTS LIST - WORKS OFFLINE
router.get("/subjects", async (req: Request, res: Response): Promise<void> => {
  try {
    // Use data service (works both online and offline)
    const schedules = await ScheduleService.findAll();
    // Extract unique subjects from schedules
    const subjectsMap = new Map();
    schedules.forEach(s => {
      if (!subjectsMap.has(s.courseCode)) {
        subjectsMap.set(s.courseCode, { courseCode: s.courseCode, courseTitle: s.courseTitle });
      }
    });
    res.json(Array.from(subjectsMap.values()));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching subjects" });
  }
});

// GET ROOMS LIST - WORKS OFFLINE
router.get("/rooms", async (req: Request, res: Response): Promise<void> => {
  try {
    // Use data service (works both online and offline)
    const rooms = await RoomService.findAll();
    res.json(rooms.map(r => ({ _id: r._id || r.id, name: r.name })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching rooms" });
  }
});

// GET SECTIONS LIST - WORKS OFFLINE
router.get("/sections", async (req: Request, res: Response): Promise<void> => {
  try {
    // Use data service (works both online and offline)
    const sections = await SectionService.findAll();
    res.json(sections.map(s => ({ _id: s._id || s.id, course: s.course, section: s.section, block: s.block })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching sections" });
  }
});

// Get users by college code - WORKS OFFLINE
router.get(
  "/college-users",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { collegeCode } = req.query;

      if (!collegeCode) {
        res.status(400).json({ message: "collegeCode is required" });
        return;
      }

      // Use data service (works both online and offline)
      const college = await CollegeService.findByCode(collegeCode as string);
      if (!college) {
        res.status(404).json({ message: "College not found" });
        return;
      }

      const collegeId = college._id || college.id || '';
      const users = await UserService.findByCollege(collegeId);

      res.json(users);
    } catch (error) {
      console.error("Error fetching college users:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Get user by ID - WORKS OFFLINE
router.get(
  "/user/:userId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({ message: "User ID is required" });
        return;
      }

      // Use data service (works both online and offline)
      const user = await UserService.findById(userId);

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// GET ALL SEMESTERS - WORKS OFFLINE
router.get("/all-semesters", async (req: Request, res: Response) => {
  try {
    // Use data service (works both online and offline)
    const semesters = await SemesterService.findAll();
    res.status(200).json({
      success: true,
      count: semesters.length,
      data: semesters,
    });
  } catch (error) {
    console.error("Error fetching semesters:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// CREATE NEW SEMESTER - WORKS OFFLINE
router.post("/add-semester", async (req: Request, res: Response) => {
  try {
    const { semesterName, academicYear, startDate, endDate, isActive } = req.body;
    
    if (!semesterName || !academicYear) {
      res.status(400).json({
        success: false,
        message: "Semester name and academic year are required",
      });
      return;
    }
    
    // Use data service (works both online and offline)
    const newSemester = await SemesterService.create({
      semesterName,
      academicYear,
      startDate,
      endDate,
      isActive: isActive || false,
    });
    
    console.log(`[SEMESTER] Created semester: ${semesterName} ${academicYear} - Mode: ${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}`);
    
    res.status(201).json({
      success: true,
      message: "Semester created successfully",
      data: newSemester,
    });
  } catch (error: any) {
    console.error("Error creating semester:", error);
    // Handle duplicate academic year error
    if (error.message?.includes('UNIQUE constraint failed') || error.code === 11000) {
      res.status(409).json({
        success: false,
        message: "A semester with this academic year already exists",
      });
      return;
    }
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

interface ScheduleInput {
  courseCode: string;
  courseTitle: string;
  section: mongoose.Types.ObjectId;
  instructor: mongoose.Types.ObjectId;
  room: string;
  startTime: string;
  endTime: string;
  semesterStartDate: string;
  semesterEndDate: string;
  days: {
    mon: boolean;
    tue: boolean;
    wed: boolean;
    thu: boolean;
    fri: boolean;
    sat: boolean;
  };
  displaySection?: string;
}

// PARSE AND UPLOAD TEACHING LOAD DOCUMENT
router.post(
  "/uploadScheduleDocument",
  upload.single("scheduleDocument"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        console.log("❌ No file uploaded.");
        res.status(400).json({ message: "No file uploaded" });
        return;
      }

      const filePath = req.file.path;
      console.log("📄 Uploaded file path:", filePath);

      const result = await mammoth.extractRawText({ path: filePath });
      const text = result.value;
      console.log("📄 Extracted text (first 500 chars):", text.slice(0, 500));

      // remove temp file
      fs.unlink(filePath, () => {
        console.log("🧹 Temp file cleaned up.");
      });

      // parse semester + AY (same regex you had)
      const semAyMatch = text.match(
        /(\d(?:ST|ND|RD|TH))\s+Semester,\s*AY\s*(\d{4})-(\d{4})/i
      );
      let semesterLabel = "TBD";
      let semesterStartDate = "TBD";
      let semesterEndDate = "TBD";
      let academicYear = "TBD";

      if (semAyMatch) {
        const semRaw = semAyMatch[1].toUpperCase();
        const startYear = parseInt(semAyMatch[2], 10);
        const endYear = parseInt(semAyMatch[3], 10);
        academicYear = `${semAyMatch[2]}-${semAyMatch[3]}`;

        // normalize semesterLabel to "1st Semester" or "2nd Semester"
        if (/1/i.test(semRaw)) semesterLabel = "1st Semester";
        else if (/2/i.test(semRaw)) semesterLabel = "2nd Semester";
        else semesterLabel = semRaw;

        if (semesterLabel.toLowerCase().startsWith("1")) {
          semesterStartDate = `${startYear}-08-01`;
          semesterEndDate = `${startYear}-12-15`;
        } else if (semesterLabel.toLowerCase().startsWith("2")) {
          semesterStartDate = `${endYear}-01-10`;
          semesterEndDate = `${endYear}-05-30`;
        }

        console.log(
          `🗓 Parsed semester: ${semesterLabel}, AY: ${academicYear}`
        );
        console.log(
          `🗓 Semester dates: ${semesterStartDate} to ${semesterEndDate}`
        );
      } else {
        console.warn("⚠️ Semester and AY not found, using default dates.");
      }

      // parse instructor name
      const instructorNameMatch = text.match(/Name of Instructor:\s*(.*)/i);
      const instructorFullName = instructorNameMatch
        ? instructorNameMatch[1].trim().toUpperCase()
        : "";
      console.log("👨‍🏫 Parsed instructor name:", instructorFullName);

      const instructor = await UserModel.findOne({
        $expr: {
          $regexMatch: {
            input: {
              $concat: ["$first_name", " ", "$middle_name", " ", "$last_name"],
            },
            regex: instructorFullName.replace(/\s+/g, ".*"),
            options: "i",
          },
        },
      });

      if (!instructor) {
        console.log("❌ Instructor not found in DB.");
        res.status(404).json({ message: "Instructor not found in database" });
        return;
      }

      console.log(
        "✅ Instructor found:",
        `${instructor.first_name} ${instructor.middle_name} ${instructor.last_name}`
      );

      // extract lines after instructor label
      const instructorIndex = text.toLowerCase().indexOf("name of instructor:");
      if (instructorIndex === -1) {
        res
          .status(400)
          .json({ message: "Instructor name not found in document." });
        return;
      }

      const linesAfterInstructor = text
        .slice(instructorIndex)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      console.log(
        "🔍 Total relevant lines after instructor name:",
        linesAfterInstructor.length
      );

      // parsing into schedules (same logic you had)
      let currentCourseCode = "";
      let currentCourseTitle = "";
      let currentSection = "";
      const schedules: ScheduleInput[] = [];

      const getDaysObj = (dayStr: string) => ({
        mon: /M/.test(dayStr),
        tue: /T(?!h)/.test(dayStr),
        wed: /W/.test(dayStr),
        thu: /Th|H/.test(dayStr),
        fri: /F/.test(dayStr),
        sat: /S/.test(dayStr),
      });

      for (let i = 0; i < linesAfterInstructor.length; i++) {
        const line = linesAfterInstructor[i];

        const courseCodeMatch = line.match(/^(IS|IT)\s*\d{3}/);
        if (courseCodeMatch) {
          currentCourseCode = courseCodeMatch[0];
          const courseLine = linesAfterInstructor[i + 1] || "";
          currentCourseTitle =
            linesAfterInstructor[i + 1]?.split("(")[0]?.trim() || "";

          const sectionMatch = courseLine.match(/\(([^)]+)\)/);
          currentSection = sectionMatch ? sectionMatch[1].trim() : "Unknown";
          continue;
        }

        const timeMatch = line.match(
          /(\d{2}:\d{2})\s*–\s*(\d{2}:\d{2})\s*\((lec|lab)\)/i
        );
        if (timeMatch) {
          const [, startTime, endTime, type] = timeMatch;
          const dayStr = linesAfterInstructor[i + 1] || "";
          const days = getDaysObj(dayStr);

          const [courseCodePart, sectionBlock] = currentSection.split(" ");
          const sectionLevel = sectionBlock?.[0];
          const blockLetter = sectionBlock?.[1];

          const sectionDoc = await Section.findOne({
            course: new RegExp(courseCodePart, "i"),
            section: sectionLevel,
            block: blockLetter,
          });

          if (!sectionDoc) {
            console.warn(`⚠️ Section not found: ${currentSection}`);
            continue;
          }

          schedules.push({
            courseCode: currentCourseCode,
            courseTitle: currentCourseTitle,
            section: sectionDoc._id as mongoose.Types.ObjectId,
            instructor: instructor._id,
            room: "TBD",
            startTime,
            endTime,
            semesterStartDate,
            semesterEndDate,
            days,
            displaySection: `${sectionDoc.course} ${sectionDoc.section}${sectionDoc.block}`,
          });
        }
      }

      // ---------- NEW: check DB for existing schedules for this instructor + semester ----------
      let existing = false;
      let existingCount = 0;
      let existingSchedulesPreview: any[] = [];

      // prefer checking by explicit semesterStartDate/semesterEndDate if parsed
      if (
        semesterStartDate !== "TBD" &&
        semesterEndDate !== "TBD" &&
        semesterStartDate &&
        semesterEndDate
      ) {
        existingCount = await Schedule.countDocuments({
          instructor: instructor._id,
          semesterStartDate,
          semesterEndDate,
        });

        if (existingCount > 0) {
          existing = true;
          existingSchedulesPreview = await Schedule.find({
            instructor: instructor._id,
            semesterStartDate,
            semesterEndDate,
          })
            .limit(20)
            .populate({ path: "section", select: "course section block" })
            .lean();
        }
      } else if (semesterLabel !== "TBD" && academicYear !== "TBD") {
        // fallback: check by semester label + academicYear
        existingCount = await Schedule.countDocuments({
          instructor: instructor._id,
          semester: { $regex: new RegExp(semesterLabel, "i") },
          academicYear: academicYear,
        });

        if (existingCount > 0) {
          existing = true;
          existingSchedulesPreview = await Schedule.find({
            instructor: instructor._id,
            semester: { $regex: new RegExp(semesterLabel, "i") },
            academicYear: academicYear,
          })
            .limit(20)
            .populate({ path: "section", select: "course section block" })
            .lean();
        }
      } else {
        // last resort: try to find any schedules for instructor in same year window
        existingCount = await Schedule.countDocuments({ instructor: instructor._id });
        if (existingCount > 0) {
          existing = true;
          existingSchedulesPreview = await Schedule.find({ instructor: instructor._id })
            .limit(10)
            .populate({ path: "section", select: "course section block" })
            .lean();
        }
      }

      console.log("Existing schedules found:", existingCount);

      // return preview + existing info to frontend so it may ask user to replace or cancel
      res.status(200).json({
        message: "Preview parsed data",
        data: schedules,
        instructorName: `${instructor.last_name}, ${instructor.first_name} ${instructor.middle_name || ""}`.trim(),
        academicYear: academicYear,
        semester: semesterLabel,
        semesterStartDate,
        semesterEndDate,
        existing,
        existingCount,
        existingSchedulesPreview, // optional small preview for UI
      });
    } catch (error) {
      console.error("🔥 Error while processing document:", error);
      res.status(500).json({ message: "Failed to process document", error });
    }
  }
);

// ----------------------- confirmSchedules (support replace) -----------------------
router.post(
  "/confirmSchedules",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { schedules, replace, semesterStartDate, semesterEndDate, instructorId, semester, academicYear } =
        req.body;

      if (!Array.isArray(schedules) || schedules.length === 0) {
        res.status(400).json({ message: "No schedules provided" });
        return;
      }

      // Determine which instructor / semester to target for replace
      const instructorToUse =
        instructorId || (schedules[0] && schedules[0].instructor) || null;

      // Prefer explicit dates if provided, else use semester+academicYear from body or schedules data
      const startDateToUse = semesterStartDate || (schedules[0] && schedules[0].semesterStartDate);
      const endDateToUse = semesterEndDate || (schedules[0] && schedules[0].semesterEndDate);
      const semesterLabel = semester || (schedules[0] && schedules[0].semester);
      const ayLabel = academicYear || (schedules[0] && schedules[0].academicYear);

      if (replace) {
        if (!instructorToUse) {
          res.status(400).json({ message: "Missing instructor for replace operation" });
          return;
        }

        // Find old schedules that will be deleted (before deleting them)
        let oldSchedules: any[] = [];
        if (startDateToUse && endDateToUse && startDateToUse !== "TBD" && endDateToUse !== "TBD") {
          oldSchedules = await Schedule.find({
            instructor: instructorToUse,
            semesterStartDate: startDateToUse,
            semesterEndDate: endDateToUse,
          });
        } else if (semesterLabel && ayLabel) {
          oldSchedules = await Schedule.find({
            instructor: instructorToUse,
            semester: { $regex: new RegExp(semesterLabel, "i") },
            academicYear: ayLabel,
          });
        } else {
          console.warn("Replace requested but semester/date info is missing - aborting delete to avoid broad removal.");
          res.status(400).json({ message: "Missing semester/date info for replace operation" });
          return;
        }

        // Create a mapping from old schedule IDs to new schedule data
        // Match by courseCode, room, startTime, endTime, and days
        const scheduleMapping = new Map<string, any>();
        
        for (const oldSchedule of oldSchedules) {
          // Find matching new schedule based on course, room, and time
          const matchingNewSchedule = schedules.find((newSched: any) => {
            return (
              newSched.courseCode === oldSchedule.courseCode &&
              newSched.room === oldSchedule.room &&
              newSched.startTime === oldSchedule.startTime &&
              newSched.endTime === oldSchedule.endTime &&
              JSON.stringify(newSched.days) === JSON.stringify(oldSchedule.days)
            );
          });
          
          if (matchingNewSchedule) {
            // We'll map this after new schedules are created
            scheduleMapping.set(oldSchedule._id.toString(), matchingNewSchedule);
          }
        }

        // Find all logs that reference the old schedules
        const oldScheduleIds = oldSchedules.map(s => s._id);
        const logsToUpdate = await Log.find({
          schedule: { $in: oldScheduleIds }
        });

        // Delete old schedules
        if (startDateToUse && endDateToUse && startDateToUse !== "TBD" && endDateToUse !== "TBD") {
          await Schedule.deleteMany({
            instructor: instructorToUse,
            semesterStartDate: startDateToUse,
            semesterEndDate: endDateToUse,
          });
        } else if (semesterLabel && ayLabel) {
          await Schedule.deleteMany({
            instructor: instructorToUse,
            semester: { $regex: new RegExp(semesterLabel, "i") },
            academicYear: ayLabel,
          });
        }

        // Insert new schedules
        const saved = await Schedule.insertMany(schedules);

        // Create mapping from old schedule IDs to new schedule IDs
        const oldToNewIdMap = new Map<string, string>();
        
        for (const oldSchedule of oldSchedules) {
          const matchingNewSchedule = saved.find((newSched: any) => {
            return (
              newSched.courseCode === oldSchedule.courseCode &&
              newSched.room === oldSchedule.room &&
              newSched.startTime === oldSchedule.startTime &&
              newSched.endTime === oldSchedule.endTime &&
              JSON.stringify(newSched.days) === JSON.stringify(oldSchedule.days)
            );
          });
          
          if (matchingNewSchedule) {
            oldToNewIdMap.set(oldSchedule._id.toString(), matchingNewSchedule._id.toString());
          }
        }

        // Update logs to point to new schedules
        for (const log of logsToUpdate) {
          const oldScheduleId = log.schedule.toString();
          const newScheduleId = oldToNewIdMap.get(oldScheduleId);
          
          if (newScheduleId) {
            log.schedule = newScheduleId as any;
            await log.save();
            console.log(`[REPLACE-SCHEDULE] Updated log ${log._id} from schedule ${oldScheduleId} to ${newScheduleId}`);
          } else {
            console.warn(`[REPLACE-SCHEDULE] No matching new schedule found for old schedule ${oldScheduleId} in log ${log._id}`);
          }
        }

        // ⚡ MONGODB-ONLY: Schedules are stored in MongoDB only
        // The Python recognizer will fetch schedules directly from MongoDB via API
        console.log(`[MONGODB] ✅ ${saved.length} schedules saved to MongoDB`);

        res.status(replace ? 200 : 201).json({
          message: replace ? "Schedules replaced successfully" : "Schedules saved successfully",
          data: saved,
          logsUpdated: logsToUpdate.length,
        });
        return;
      }

      // Insert new schedules (non-replace case)
      const saved = await Schedule.insertMany(schedules);

      // Auto-sync all schedules to local database
      try {
        const { saveSchedulesBatchToLocalDB } = require("../utils/syncToLocalDB");
        await saveSchedulesBatchToLocalDB(saved);
      } catch (syncError) {
        console.warn("[LOCAL DB] Failed to auto-sync schedules to local DB:", syncError);
      }

      res.status(201).json({
        message: "Schedules saved successfully",
        data: saved,
      });
    } catch (error) {
      console.error("Failed to save schedules:", error);
      res.status(500).json({ message: "Failed to save schedules", error });
    }
  }
);

export default router;
