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

dotenv.config();
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

      const faculty = await UserModel.findById(facultyId);
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
      faculty.profilePhotoUrl = imageUrl;
      await faculty.save();

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

router.get("/user/name", async (req: Request, res: Response): Promise<void> => {
  const userId = req.query.name as string;

  try {
    if (!userId) {
      res.status(400).json({ error: "User ID is required." });
      return;
    }

    const user = await UserModel.findById(userId).select(
      "last_name first_name middle_name"
    );

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

      // Update existing user by _id
      const updatedUser = await UserModel.findByIdAndUpdate(
        facultyId,
        { profilePhotoUrl: file.path },
        { new: true } // Return the updated document
      );

      if (!updatedUser) {
        res.status(404).json({ message: "Faculty not found" });
        return;
      }

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

router.get("/logs/today", async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are zero-based
    const day = String(now.getDate()).padStart(2, "0");
    const today = `${year}-${month}-${day}`; // Format: YYYY-MM-DD

    const logs = await Log.find({ date: today })
      .populate("schedule")
      .populate("college");

    res.status(200).json(logs);
  } catch (error) {
    console.error("Error fetching today's logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post(
  "/generate-monthly-department-logs",
  async (req: Request, res: Response) => {
    try {
      const { CourseName, selectedMonth, selectedYear, searchQuery } = req.body;

      // Don't filter by course field - it contains courseCode not program name
      // Match the behavior of show-monthly-department-logs which fetches all logs
      const query: any = {};
      // Note: CourseName is the program (e.g., "bsit"), but log.course contains courseCode
      // For now, fetch all logs to match the display behavior

      console.log(`[REPORT] Generating report for CourseName: "${CourseName}", Month: ${selectedMonth}, Year: ${selectedYear}, SearchQuery: "${searchQuery}"`);

      // 🔹 Fetch all logs first
      const logs = await Log.find(query)
        .populate({
          path: "schedule",
          populate: {
            path: "instructor",
            select: "first_name middle_name last_name",
          },
        })
        .populate("college")
        .lean();

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

router.post("/show-daily-report", async (req: Request, res: Response) => {
  try {
    const { CourseName } = req.body;

    // format today's date as YYYY-MM-DD since logs.date is stored as a string
    const today = new Date().toISOString().slice(0, 10);

    const query: any = { date: today }; // only logs from today
    if (CourseName) query.course = CourseName;
    query.college = { $ne: null }; // only logs with a college linked

    const logs = await Log.find(query)
      .populate({
        path: "schedule",
        populate: { path: "instructor" },
      })
      .populate("college")
      .lean();

    const tableData = logs.map((log) => {
      const schedule: any = log.schedule || {};
      const instructor = schedule?.instructor
        ? `${schedule.instructor.first_name} ${schedule.instructor.last_name}`
        : "N/A";

      return {
        name: instructor,
        courseCode: schedule.courseCode || "N/A",
        courseTitle: schedule.courseTitle || "N/A",
        status: log.status || "N/A",
        timeInOut: `${log.timeIn || "-"} / ${log.timeout || "-"}`,
        room: schedule.room || "N/A",
      };
    });

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

router.post(
  "/show-monthly-department-logs",
  async (req: Request, res: Response) => {
    try {
      const { CourseName } = req.body;
      console.log(`[API] 📋 Fetching logs for program/course: "${CourseName}"`);

      // Don't filter by course field - it contains courseCode not program name
      // Instead, fetch all logs and let population handle the data
      const query: any = {};
      // Note: CourseName is the program (e.g., "bsit"), but log.course contains courseCode
      // For now, fetch all logs. Can add filtering later if needed.

      const logs = await Log.find(query)
        .populate({
          path: "schedule",
          populate: {
            path: "instructor",
            select: "first_name middle_name last_name", // ✅ only return names
          },
        })
        .populate("college")
        .sort({ date: -1, timeIn: -1 }) // Sort by most recent first
        .lean();

      console.log(`[API] ✅ Found ${logs.length} logs`);
      
      // Debug: Show detailed log structures
      if (logs.length > 0) {
        console.log(`[API] Sample log structure (first log):`, JSON.stringify({
          _id: logs[0]._id,
          course: logs[0].course,
          date: logs[0].date,
          timeIn: logs[0].timeIn,
          timeout: logs[0].timeout,
          status: logs[0].status,
          remarks: logs[0].remarks,
          hasSchedule: !!logs[0].schedule,
          scheduleType: typeof logs[0].schedule,
          scheduleId: (logs[0].schedule as any)?._id,
          hasInstructor: !!(logs[0].schedule as any)?.instructor,
          instructorId: (logs[0].schedule as any)?.instructor?._id,
          instructorName: (logs[0].schedule as any)?.instructor ? 
            `${(logs[0].schedule as any).instructor.first_name} ${(logs[0].schedule as any).instructor.last_name}` : 
            'N/A',
        }, null, 2));
        
        console.log(`[API] All log IDs:`, logs.map(l => l._id));
      } else {
        console.log(`[API] ⚠️ No logs found in database with query:`, query);
      }

      res.status(200).json({
        success: true,
        count: logs.length,
        data: logs,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("❌ Error fetching logs:", error.message);
        res.status(500).json({ success: false, message: error.message });
      } else {
        console.error("❌ Unknown error fetching logs:", error);
        res
          .status(500)
          .json({ success: false, message: "Unknown error occurred" });
      }
    }
  }
);

// FETCH ALL FULL SCHEDULES TODAY BASED ON COURSE
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

      const schedules = await Schedule.find({
        courseCode: { $regex: `^${shortCourseName}`, $options: "i" },
        [`days.${today}`]: true,
      })
        .populate("instructor", "first_name last_name")
        .populate("section", "course section block")
        .lean();

      res.status(200).json(schedules);
    } catch (error) {
      console.error("Error fetching schedules:", error);
      res.status(500).json({ message: "Error fetching schedules" });
    }
  }
);

// COUNT OF INSTRUCTORS (filtered by course)
router.get(
  "/count/instructors",
  async (req: Request, res: Response): Promise<void> => {
    const courseCode = req.query.course as string;

    if (!courseCode) {
      res.status(400).json({ message: "Course code is missing" });
      return;
    }

    try {
      // Step 1: Find the course by its code (case-insensitive)
      const courseDoc = await Course.findOne({ 
        code: { $regex: new RegExp(`^${courseCode}$`, "i") }
      });

      if (!courseDoc) {
        res.status(404).json({ message: "Course not found" });
        return;
      }

      // Step 2: Count instructors where course = courseDoc._id
      const count = await UserModel.countDocuments({
        role: "instructor",
        course: courseDoc._id,
      });

      res.json({ count });
    } catch (error) {
      console.error("Error fetching instructor count:", error);
      res.status(500).json({ message: "Error fetching instructor count" });
    }
  }
);

// COUNT OF SCHEDULES TODAY
router.get("/schedules-count/today", async (req: Request, res: Response) => {
  try {
    const today = new Date();

    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const dayOfWeek = days[today.getDay()];

    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const count = await Schedule.countDocuments({
      [`days.${dayOfWeek}`]: true,
      semesterStartDate: { $lte: todayStr },
      semesterEndDate: { $gte: todayStr },
    });

    res.json({ count });
  } catch (error) {
    console.error("Error counting today's schedules:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get(
  "/logs/faculty-today",
  async (req: Request, res: Response): Promise<void> => {
    const { facultyId } = req.query;

    if (!facultyId) {
      res.status(400).json({ message: "facultyId is missing" });
      return;
    }

    try {
      // Step 1: Find all schedules where the instructor._id matches facultyId
      const schedules = await Schedule.find({
        instructor: facultyId,
      });

      if (!schedules || schedules.length === 0) {
        res
          .status(404)
          .json({ message: "No schedules found for this faculty" });
        return;
      }

      // Step 2: Find logs where the schedule._id matches any of the schedules found in step 1
      const scheduleIds = schedules.map((schedule) => schedule._id);
      const logs = await Log.find({
        schedule: { $in: scheduleIds }, // Match any log where the schedule is in the list of scheduleIds
      });

      // If no logs are found
      if (!logs || logs.length === 0) {
        res
          .status(404)
          .json({ message: "No logs found for today for this faculty" });
        return;
      }

      // Step 3: Return the logs with all the details
      res.status(200).json(logs);
    } catch (error) {
      console.error("Error fetching logs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

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
      const todayStr = now.toLocaleDateString("en-CA");

      const logsToday = await Log.find({
        date: todayStr,
        course: courseName,
      })
        .select("timeIn timeout schedule")
        .populate({
          path: "schedule",
          select: "instructor",
          populate: {
            path: "instructor",
            select: "first_name last_name",
          },
        });

      if (!logsToday || logsToday.length === 0) {
        res.status(404).json({ message: "No logs found for today" });
        return;
      }

      const logsWithInstructor = logsToday.map((log: any) => {
        const { first_name, last_name } = log.schedule?.instructor || {};
        const fullName = `${first_name} ${last_name}`.trim();

        return {
          timeIn: log.timeIn,
          timeout: log.timeout,
          instructorName: fullName || "Instructor name not found",
        };
      });

      res.status(200).json(logsWithInstructor);
    } catch (error) {
      console.error("Error fetching today's logs:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// GET FACULTY LIST
router.get("/faculty", async (req: Request, res: Response): Promise<void> => {
  const { courseName } = req.query;

  if (!courseName) {
    res.status(400).json({ message: "courseName is missing" });
    return;
  }

  try {
    // Case-insensitive search for course code
    const courseDoc = await Course.findOne({ 
      code: { $regex: new RegExp(`^${courseName}$`, "i") }
    });

    if (!courseDoc) {
      res.status(404).json({ message: "Course not found" });
      return;
    }

    const facultyList = await UserModel.find({
      role: "instructor",
      course: courseDoc._id,
    });

    res.json(facultyList);
  } catch (error) {
    console.error("Error fetching faculty by course:", error);
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

// DELETE FACULTY ACCOUNT
router.delete(
  "/faculty/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const faculty = await UserModel.findById(id);
      if (!faculty) {
        res.status(404).json({ message: "UserModel not found" });
        return;
      }

      await UserModel.findByIdAndDelete(id);
      res.json({ message: "UserModel account deleted successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// CREATE NEW FACULTY ACCOUNT
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
      course: courseCode, // 👈 coming from req.body
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

    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      res.status(400).json({ message: "Email already exists" });
      return;
    }

    const existingUserUsername = await UserModel.findOne({ username });
    if (existingUserUsername) {
      res.status(400).json({ message: "Username already exists" });
      return;
    }

    // 🔎 Find the college document
    const collegeDoc = await CollegeModel.findOne({ code: collegeCode });
    if (!collegeDoc) {
      res.status(400).json({ message: "Invalid college code" });
      return;
    }

    // 🔎 Find the course document (case-insensitive)
    const courseDoc = await Course.findOne({ 
      code: { $regex: new RegExp(`^${courseCode}$`, "i") }
    });
    if (!courseDoc) {
      res.status(400).json({ message: "Invalid course code" });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new UserModel({
      last_name,
      first_name,
      middle_name: middle_name || "",
      ext_name: ext_name || "",
      username,
      email,
      password: hashedPassword,
      role,
      status: "forverification",
      college: collegeDoc._id,
      course: courseDoc._id, // 👈 Save as ObjectId
      highestEducationalAttainment,
      academicRank,
      statusOfAppointment,
      numberOfPrep,
      totalTeachingLoad,
    });

    await newUser.save();

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

router.get(
  "/instructors",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const instructors = await UserModel.find({ role: "instructor" }).select(
        "first_name middle_name last_name"
      );
      res.json(instructors);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Error fetching instructors" });
    }
  }
);

// GET SCHEDULES ROUTE
router.get("/schedules", async (req: Request, res: Response): Promise<void> => {
  const { shortCourseName } = req.query;

  if (!shortCourseName) {
    res.status(400).json({ message: "shortCourseName is missing" });
    return;
  }

  try {
    const regex = new RegExp(`^${shortCourseName}`, "i");
    const schedules = await Schedule.find({
      courseCode: { $regex: regex },
    }).populate("instructor");

    res.json(schedules);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching schedules", error });
  }
});

router.get(
  "/schedules-faculty",
  async (req: Request, res: Response): Promise<void> => {
    const { facultyId, semester } = req.query;

    if (!facultyId) {
      res.status(400).json({ message: "facultyId is required" });
      return;
    }

    try {
      if (!mongoose.Types.ObjectId.isValid(facultyId as string)) {
        res.status(400).json({ message: "Invalid facultyId format" });
        return;
      }

      const filter: any = { instructor: facultyId };

      if (semester && typeof semester === "string" && semester.trim() !== "") {
        const semStr = semester.trim();

        // Works without named groups
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
          let computedStartISO: string | null = null;
          let computedEndISO: string | null = null;

          if (ayParts.length === 2) {
            const startYear = parseInt(ayParts[0], 10);
            const endYear = parseInt(ayParts[1], 10);

            if (/^1/i.test(semesterName)) {
              computedStartISO = `${startYear}-08-01T00:00:00.000Z`;
              computedEndISO = `${startYear}-12-31T23:59:59.999Z`;
            } else if (/^2/i.test(semesterName)) {
              computedStartISO = `${endYear}-01-01T00:00:00.000Z`;
              computedEndISO = `${endYear}-05-31T23:59:59.999Z`;
            }
          }

          const semesterClauses: any[] = [];

          if (semesterName && academicYear) {
            semesterClauses.push({
              semester: { $regex: new RegExp(`^${semesterName}`, "i") },
              academicYear: academicYear,
            });
          }

          if (computedStartISO && computedEndISO) {
            semesterClauses.push({
              $or: [
                {
                  semesterStartDate: {
                    $lte: computedEndISO,
                    $gte: computedStartISO,
                  },
                },
                {
                  semesterEndDate: {
                    $lte: computedEndISO,
                    $gte: computedStartISO,
                  },
                },
                {
                  $and: [
                    { semesterStartDate: { $lte: computedStartISO } },
                    { semesterEndDate: { $gte: computedEndISO } },
                  ],
                },
              ],
            });
          }

          if (semesterClauses.length > 0) {
            filter.$and = filter.$and || [];
            filter.$and.push({ $or: semesterClauses });
          } else {
            console.warn("Could not parse semester query:", semStr);
          }
        } else {
          filter.$and = filter.$and || [];
          filter.$and.push({
            semester: { $regex: new RegExp(semester.trim(), "i") },
          });
        }
      }

      const schedules = await Schedule.find(filter).populate({
        path: "section",
        select: "course section block",
      });

      res.json(schedules);
    } catch (error) {
      console.error("Error fetching schedules:", error);
      res.status(500).json({ message: "Error fetching schedules", error });
    }
  }
);


// ADD NEW SCHEDULE ROUTE
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

      if (
        !courseTitle ||
        !courseCode ||
        !instructor ||
        !room ||
        !startTime ||
        !endTime ||
        !days ||
        !semesterStartDate ||
        !semesterEndDate ||
        !section
      ) {
        res.status(400).json({
          message:
            "Please provide all required fields including semester dates and days.",
        });
        return;
      }

      const validDays = ["mon", "tue", "wed", "thu", "fri", "sat"];
      const isValidDays = validDays.every(
        (day) => typeof days[day] === "boolean"
      );

      if (!isValidDays) {
        res.status(400).json({ message: "Invalid days format." });
        return;
      }

      // ✅ Convert semester dates to YYYY-MM-DD format
      const formatDate = (date: string | Date) => {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      const newSchedule = new Schedule({
        courseTitle,
        courseCode,
        instructor,
        room,
        startTime,
        endTime,
        days,
        semesterStartDate: formatDate(semesterStartDate),
        semesterEndDate: formatDate(semesterEndDate),
        section,
      });

      await newSchedule.save();

      res.status(201).json({
        message: "Schedule created successfully.",
        schedule: newSchedule,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);


// GET SUBJECTS LIST
router.get("/subjects", async (req: Request, res: Response): Promise<void> => {
  try {
    const subjects = await Subject.find().select("courseCode courseTitle");
    res.json(subjects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching subjects" });
  }
});

// GET ROOMS LIST
router.get("/rooms", async (req: Request, res: Response): Promise<void> => {
  try {
    const rooms = await Room.find().select("name");
    res.json(rooms);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching rooms" });
  }
});

// GET SECTIONS LIST
router.get("/sections", async (req: Request, res: Response): Promise<void> => {
  try {
    const sections = await Section.find().select("course section block");
    res.json(sections);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching sections" });
  }
});

// Get users by college code
router.get(
  "/college-users",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { collegeCode } = req.query;

      if (!collegeCode) {
        res.status(400).json({ message: "collegeCode is required" });
        return;
      }

      // Find the college by code
      const college = await CollegeModel.findOne({ code: collegeCode });
      if (!college) {
        res.status(404).json({ message: "College not found" });
        return;
      }

      // Find all users in this college
      const users = await UserModel.find({ college: college._id })
        .populate("college", "code name")
        .populate("course", "code name")
        .select(
          "first_name middle_name last_name username email role status college course faceImagePath"
        )
        .exec();

      res.json(users);
    } catch (error) {
      console.error("Error fetching college users:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Get user by ID
router.get(
  "/user/:userId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({ message: "User ID is required" });
        return;
      }

      const user = await UserModel.findById(userId)
        .populate("college", "code name")
        .populate("course", "code name")
        .select(
          "first_name middle_name last_name username email role status college course faceImagePath"
        )
        .exec();

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

router.get("/all-semesters", async (req: Request, res: Response) => {
  try {
    const semesters = await Semester.find().sort({ startDate: 1 }); // sort by startDate ascending
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

        res.status(replace ? 200 : 201).json({
          message: replace ? "Schedules replaced successfully" : "Schedules saved successfully",
          data: saved,
          logsUpdated: logsToUpdate.length,
        });
        return;
      }

      // Insert new schedules (non-replace case)
      const saved = await Schedule.insertMany(schedules);

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
