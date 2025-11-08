import express, { Request, Response } from "express";
import UserModel from "../models/User";
import "../models/User";
import College from "../models/College";
import Room from "../models/Room";
import Course from "../models/Course";
import Schedule from "../models/Schedule";
import TempAccount from "../models/TempAccount";
import Log from "../models/AttendanceLogs";
import path from "path";
import fs from "fs";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

const router = express.Router();

router.post(
  "/college-courses",
  async (req: Request, res: Response): Promise<void> => {
    const { collegeCode } = req.body;

    if (!collegeCode) {
      res.status(400).json({ message: "collegeCode is required." });
      return; // exit early
    }

    try {
      const college = await College.findOne({ code: collegeCode });

      if (!college) {
        res.status(404).json({ message: "College not found." });
        return; // exit early
      }

      const courses = await Course.find({ college: college._id });

      res.status(200).json({
        collegeId: college._id,
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
    const courses = await Course.find(filter).populate("college", "collegeName code");

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

router.post(
  "/dean-show-monthly-department-logs",
  async (req: Request, res: Response) => {
    try {
      const { courseCode } = req.body;

      const query: any = {};
      if (courseCode) {
        query.course = courseCode;
      }

      const logs = await Log.find(query)
        .populate({
          path: "schedule",
          populate: {
            path: "instructor",
            select: "first_name middle_name last_name", // ✅ only return names
          },
        })
        .populate("college")
        .lean();

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

router.post(
  "/dean-generate-monthly-department-logs",
  async (req: Request, res: Response) => {
    try {
      const { courseCode, selectedMonth, selectedYear } = req.body;

      const query: any = {};
      if (courseCode) query.course = courseCode;

      console.log(`[REPORT] Generating dean report for courseCode: "${courseCode}", Month: ${selectedMonth}, Year: ${selectedYear}`);

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

// FETCH ALL FULL SCHEDULES TODAY BASED ON COURSE
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

      const schedules = await Schedule.find({
        courseCode: { $regex: `^${shortCourseValue}`, $options: "i" },
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

// GET Program Chairpersons based on College Code from query
router.get(
  "/programchairs",
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


export default router;
