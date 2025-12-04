import express, { Request, Response } from "express";
import dotenv from "dotenv";
import College from "../models/College";
import TempAccount from "../models/TempAccount";
import UserModel from "../models/User";
import Course from "../models/Course";
import bcrypt from "bcryptjs";

// dotenv is loaded by systemMode.ts, app.ts, and server.ts - no need to load again here
const router = express.Router();


router.post("/temp-account-info", async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.body;

  if (!userId) {
    res.status(400).json({ success: false, message: "userId is required" });
    return;
  }

  try {
    const tempAccount = await TempAccount.findById(userId)
      .select("-signUpStatus -dateSignedUp -profilePhoto")
      .populate({
        path: "department",
        select: "code -_id",
        model: "College"
      })
      .populate({
        path: "program",
        select: "code -_id",
        model: "Course"
      });

    if (!tempAccount) {
      res.status(404).json({ success: false, message: "Temp account not found" });
      return;
    }

    res.status(200).json({ success: true, data: tempAccount });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/save-user-info", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      lastName,
      firstName,
      extensionName,
      middleName,
      college,
      course,
      username,
      email,
      password,
      role,
      education,
      rank,
      appointment,
      preparations,
      teachingLoad
    } = req.body;

    if (!lastName || !firstName || !username || !email || !password || !role) {
      res.status(400).json({ message: "Missing required fields" });
      return;
    }

    // Find College by code
    const collegeDoc = await College.findOne({ code: college });
    if (!collegeDoc) {
      res.status(404).json({ message: "College not found" });
      return;
    }

    // Find Course by code
    let courseDoc = null;
    if (role === "instructor" || role === "programchairperson") {
      courseDoc = await Course.findOne({ code: course.toLowerCase() });
      if (!courseDoc) {
        res.status(404).json({ message: "Course not found" });
        return;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new UserModel({
      last_name: lastName,
      first_name: firstName,
      ext_name: extensionName,
      middle_name: middleName,
      college: collegeDoc._id,
      course: courseDoc?._id || null,
      username,
      email,
      password: hashedPassword,
      role,
      highestEducationalAttainment: education,
      academicRank: rank,
      statusOfAppointment: appointment,
      numberOfPrep: parseInt(preparations, 10) || 0,
      totalTeachingLoad: parseInt(teachingLoad, 10) || 0,
      status: "active"
    });

    await newUser.save();

    // Delete the temp account after successful registration
    await TempAccount.findOneAndDelete({ email });

    // Return the userId and original codes
    res.status(201).json({
      message: "User saved successfully",
      userId: newUser._id,
      collegeCode: collegeDoc.code,
      courseCode: courseDoc?.code || null,
    });
  } catch (error) {
    console.error("Error saving user info:", error);
    res.status(500).json({ message: "Server error" });
  }
});


export default router;