import express, { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import UserModel from "../models/User";
import College from "../models/College";
import Course from '../models/Course';
import TempAccount from "../models/TempAccount";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import facultyProfileUpload from "../middleware/facultyProfileUpload";


dotenv.config();
const router = express.Router();


const emailCodeStore = new Map<string, { code: string; expiresAt: number }>();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

router.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

router.post("/send-verification-code", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ message: "Email is required" });
    return;
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000;

  emailCodeStore.set(email, { code, expiresAt });

  try {
    await transporter.sendMail({
      from: "EduVision Admin",
      to: email,
      subject: "Your EduVision Verification Code",
      html: `
        <p>Hello,</p>
        <p>Your verification code is:</p>
        <h2>${code}</h2>
        <p>This code will expire in 5 minutes.</p>
        <br>
        <p>— EduVision Team</p>
      `,
    });

    res.status(200).json({ message: "Verification code sent" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ message: "Failed to send verification code" });
  }
});

// ✅ VERIFY CODE 
router.post("/verify-code", async (req: Request, res: Response): Promise<void> => {
  const { email, code } = req.body;

  if (!email || !code) {
    res.status(400).json({ success: false, message: "Email and code are required" });
    return;
  }

  const entry = emailCodeStore.get(email);

  if (!entry) {
    res.status(400).json({ success: false, message: "No verification code sent for this email." });
    return;
  }

  if (Date.now() > entry.expiresAt) {
    emailCodeStore.delete(email);
    res.status(400).json({ success: false, message: "Verification code expired." });
    return;
  }

  const sanitizedInputCode = String(code).trim();

  if (entry.code !== sanitizedInputCode) {
    res.status(401).json({ success: false, message: "Invalid verification code." });
    return;
  }

  // Success
  emailCodeStore.delete(email);
  res.status(200).json({ success: true, message: "Email verified successfully." });
});

router.post(
  "/signup",
  facultyProfileUpload.single("photo"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, role, department, program } = req.body;
      const photo = req.file;

      if (!photo) {
        res
          .status(400)
          .json({ success: false, message: "Photo is required." });
        return;
      }

      // ✅ Check if email already exists
      const existingAccount = await TempAccount.findOne({ email });
      if (existingAccount) {
        res.status(400).json({
          success: false,
          message: `The email '${email}' is already registered.`,
        });
        return;
      }

      const photoUrl = photo.path;

      const collegeDoc = await College.findOne({ code: department });
      if (!collegeDoc) {
        res.status(400).json({
          success: false,
          message: `No college found with code '${department}'`,
        });
        return;
      }

      let courseDoc = null;
      if (role !== "dean") {
        // Case-insensitive search for course code
        courseDoc = await Course.findOne({ 
          code: { $regex: new RegExp(`^${program}$`, "i") }
        });
        if (!courseDoc) {
          res.status(400).json({
            success: false,
            message: `No course found with code '${program}'`,
          });
          return;
        }
      }

      const tempAccount = new TempAccount({
        email,
        role,
        department: collegeDoc._id,
        program: courseDoc ? courseDoc._id : undefined,
        profilePhoto: photoUrl,
      });

      await tempAccount.save();

      res.status(201).json({
        success: true,
        message: "Signup request submitted!",
        saved: {
          id: tempAccount._id,
          email: tempAccount.email,
          role,
          department: collegeDoc._id,
          program: courseDoc ? courseDoc._id : null,
          profilePhoto: photoUrl,
        },
      });
    } catch (error) {
      console.error("Signup error:", error);
      const message =
        error instanceof Error ? error.message : "Internal Server Error";
      res.status(500).json({ success: false, message });
    }
  }
);

// ✅ CHECK IF EMAIL EXISTS IN TempAccount
router.post("/check-temp-account", async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ success: false, message: "Email is required" });
    return;
  }

  try {
    const tempAccount = await TempAccount.findOne({ email });

    if (!tempAccount) {
      res.status(404).json({ success: false, message: "Email not found in pending accounts." });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Email exists in TempAccount.",
      accountStatus: {
        email: tempAccount.email,
        role: tempAccount.role,
        department: tempAccount.department,
        program: tempAccount.program,
        photo: tempAccount.profilePhoto,
      },
    });
  } catch (error) {
    console.error("Error checking email:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// LOGIN ROUTE
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { usernameOrEmail, password } = req.body;

    const user = await UserModel.findOne({
      $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
    })
    .populate({
      path: "college",
      select: "code",
    })
    .populate({
      path: "course",
      select: "code",
    });


    if (user) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        res.status(401).json({ message: "Invalid credentials" });
        return;
      }

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET as string,
        { expiresIn: "1h" }
      );

      res.json({
        token,
        user: {
          id: user._id,
          role: user.role,
          first_name: user.first_name,
          middle_name: user.middle_name,
          last_name: user.last_name,
          status: user.status,
          college: user.college && 'code' in user.college ? user.college.code : null,
          course: user.course && 'code' in user.course ? user.course.code : null,
        },
        requiresUpdate: user.status === "forverification",
      });
      return;
    }

    const tempAcc = await TempAccount.findOne({ email: usernameOrEmail });

    if (
      !tempAcc ||
      !tempAcc.tempPassword ||
      tempAcc.signUpStatus !== "accepted_needs_completion"
    ) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const isTempPasswordMatch = await bcrypt.compare(password, tempAcc.tempPassword);
    if (!isTempPasswordMatch) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const tempToken = jwt.sign(
      { id: tempAcc._id, role: tempAcc.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "1h" }
    );

    res.json({
      token: tempToken,
      user: {
        id: tempAcc._id,
        role: tempAcc.role,
        email: tempAcc.email,
        signUpStatus: tempAcc.signUpStatus,
        department: tempAcc.department,
        program: tempAcc.program || null,
        profilePhoto: tempAcc.profilePhoto,
        dateSignedUp: tempAcc.dateSignedUp,
      },
      requiresCompletion: tempAcc.signUpStatus === "accepted_needs_completion",
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ GET ALL COLLEGES
router.get("/colleges", async (req: Request, res: Response) => {
  try {
    const colleges = await College.find();
    res.status(200).json(colleges);
  } catch (error) {
    console.error("Failed to fetch colleges:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/selected-college", async (req: Request, res: Response): Promise<void> => {
  const { collegeCode } = req.body;

  try {
    // Step 1: Find the college by code
    const college = await College.findOne({ code: collegeCode });

    if (!college) {
      res.status(404).json({ message: "College not found" });
      return;
    }

    // Step 2: Use the college _id to find matching courses
    const courses = await Course.find({ college: college._id }).populate("college");

    // Step 3: Return the courses
    res.status(200).json(courses);
  } catch (error) {
    console.error("Error fetching programs by college code:", error);
    res.status(500).json({ message: "Server error" });
  }
});


export default router;