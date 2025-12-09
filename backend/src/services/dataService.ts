/**
 * Unified Data Service
 * Automatically switches between MongoDB and SQLite based on system mode
 */
import { isOfflineMode } from '../utils/systemMode';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// MongoDB Models
import UserModel, { IUser } from '../models/User';
import College from '../models/College';
import Course from '../models/Course';
import Schedule from '../models/Schedule';
import Log from '../models/AttendanceLogs';
import Section from '../models/Section';
import Room from '../models/Room';
import Semester from '../models/Semester';

// Offline Database
import * as offlineDb from './offlineDatabase';

// ============================================
// USER SERVICE
// ============================================

export interface UserData {
  _id?: string;
  id?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  username: string;
  email: string;
  gender?: string;
  birthdate?: Date | string;
  highestEducationalAttainment?: string;
  academicRank?: string;
  statusOfAppointment?: string;
  numberOfPrep?: number;
  totalTeachingLoad?: number;
  password: string;
  role: string;
  college?: string;
  course?: string;
  status?: string;
  profilePhotoUrl?: string;
  faceImagePath?: string;
  faceImages?: any[];
}

export const UserService = {
  async findById(id: string): Promise<UserData | null> {
    if (isOfflineMode()) {
      const user = offlineDb.getUserById(id);
      return user ? mapOfflineUserToUserData(user) : null;
    }
    const user = await UserModel.findById(id).populate('college').populate('course');
    return user ? mongoUserToUserData(user) : null;
  },

  async findByUsername(username: string): Promise<UserData | null> {
    if (isOfflineMode()) {
      const user = offlineDb.getUserByUsername(username);
      return user ? mapOfflineUserToUserData(user) : null;
    }
    const user = await UserModel.findOne({ username }).populate('college').populate('course');
    return user ? mongoUserToUserData(user) : null;
  },

  async findByEmail(email: string): Promise<UserData | null> {
    if (isOfflineMode()) {
      const user = offlineDb.getUserByEmail(email);
      return user ? mapOfflineUserToUserData(user) : null;
    }
    const user = await UserModel.findOne({ email }).populate('college').populate('course');
    return user ? mongoUserToUserData(user) : null;
  },

  async findByRole(role: string): Promise<UserData[]> {
    if (isOfflineMode()) {
      const users = offlineDb.getUsersByRole(role);
      return users.map(mapOfflineUserToUserData);
    }
    const users = await UserModel.find({ role }).populate('college').populate('course');
    return users.map(mongoUserToUserData);
  },

  async findByCollege(collegeId: string): Promise<UserData[]> {
    if (isOfflineMode()) {
      const users = offlineDb.getUsersByCollege(collegeId);
      return users.map(mapOfflineUserToUserData);
    }
    const users = await UserModel.find({ college: collegeId }).populate('college').populate('course');
    return users.map(mongoUserToUserData);
  },

  async findByCourse(courseId: string): Promise<UserData[]> {
    console.log(`[USER SERVICE] Finding users by course ${courseId} - Mode: ${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}`);
    if (isOfflineMode()) {
      const users = offlineDb.getUsersByCourse(courseId);
      const result = users.map(mapOfflineUserToUserData);
      console.log(`[USER SERVICE] Offline result: ${result.length} users found`);
      return result;
    }
    const users = await UserModel.find({ course: courseId }).populate('college').populate('course');
    const result = users.map(mongoUserToUserData);
    console.log(`[USER SERVICE] Online result: ${result.length} users found`);
    return result;
  },

  async findByStatus(status: string): Promise<UserData[]> {
    if (isOfflineMode()) {
      const users = offlineDb.getUsersByStatus(status);
      return users.map(mapOfflineUserToUserData);
    }
    const users = await UserModel.find({ status }).populate('college').populate('course');
    return users.map(mongoUserToUserData);
  },

  async findAll(): Promise<UserData[]> {
    if (isOfflineMode()) {
      const users = offlineDb.getAllUsers();
      return users.map(mapOfflineUserToUserData);
    }
    const users = await UserModel.find().populate('college').populate('course');
    return users.map(mongoUserToUserData);
  },

  async create(userData: Omit<UserData, '_id' | 'id'>): Promise<UserData> {
    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    if (isOfflineMode()) {
      const user = offlineDb.createUser({
        first_name: userData.first_name,
        middle_name: userData.middle_name,
        last_name: userData.last_name,
        ext_name: userData.ext_name,
        username: userData.username,
        email: userData.email,
        gender: userData.gender,
        birthdate: userData.birthdate?.toString(),
        highest_educational_attainment: userData.highestEducationalAttainment,
        academic_rank: userData.academicRank,
        status_of_appointment: userData.statusOfAppointment,
        number_of_prep: userData.numberOfPrep,
        total_teaching_load: userData.totalTeachingLoad,
        password: hashedPassword,
        role: userData.role,
        college_id: userData.college,
        course_id: userData.course,
        status: userData.status || 'forverification',
        profile_photo_url: userData.profilePhotoUrl,
        face_image_path: userData.faceImagePath,
        face_images: JSON.stringify(userData.faceImages || [])
      });
      return mapOfflineUserToUserData(user);
    }
    
    const user = new UserModel({
      ...userData,
      password: hashedPassword
    });
    await user.save();
    return mongoUserToUserData(user);
  },

  async update(id: string, updates: Partial<UserData>): Promise<boolean> {
    if (isOfflineMode()) {
      const offlineUpdates: any = {};
      if (updates.first_name) offlineUpdates.first_name = updates.first_name;
      if (updates.middle_name !== undefined) offlineUpdates.middle_name = updates.middle_name;
      if (updates.last_name) offlineUpdates.last_name = updates.last_name;
      if (updates.username) offlineUpdates.username = updates.username;
      if (updates.email) offlineUpdates.email = updates.email;
      if (updates.status) offlineUpdates.status = updates.status;
      if (updates.faceImagePath !== undefined) offlineUpdates.face_image_path = updates.faceImagePath;
      if (updates.profilePhotoUrl) offlineUpdates.profile_photo_url = updates.profilePhotoUrl;
      if (updates.password) offlineUpdates.password = await bcrypt.hash(updates.password, 10);
      // Handle face images array for offline mode
      if (updates.faceImages !== undefined) {
        offlineUpdates.face_images = JSON.stringify(updates.faceImages || []);
      }
      // Add more fields as needed
      return offlineDb.updateUser(id, offlineUpdates);
    }
    
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }
    const result = await UserModel.findByIdAndUpdate(id, updates);
    return !!result;
  },

  async delete(id: string): Promise<boolean> {
    console.log(`[USER SERVICE] Deleting user ${id} - Mode: ${isOfflineMode() ? 'OFFLINE' : 'ONLINE'}`);
    if (isOfflineMode()) {
      const result = offlineDb.deleteUser(id);
      console.log(`[USER SERVICE] Offline delete result: ${result}`);
      return result;
    }
    const result = await UserModel.findByIdAndDelete(id);
    console.log(`[USER SERVICE] Online delete result: ${!!result}`);
    return !!result;
  },

  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  },

  async countByRoleAndCollege(role: string, collegeId: string): Promise<number> {
    if (isOfflineMode()) {
      const users = offlineDb.getUsersByRole(role);
      return users.filter(u => u.college_id === collegeId).length;
    }
    return UserModel.countDocuments({ role, college: collegeId });
  },

  async countByRoleAndCourse(role: string, courseId: string): Promise<number> {
    if (isOfflineMode()) {
      const users = offlineDb.getUsersByRole(role);
      return users.filter(u => u.course_id === courseId).length;
    }
    return UserModel.countDocuments({ role, course: courseId });
  }
};

// ============================================
// COLLEGE SERVICE
// ============================================

export interface CollegeData {
  _id?: string;
  id?: string;
  code: string;
  name: string;
}

export const CollegeService = {
  async findById(id: string): Promise<CollegeData | null> {
    if (isOfflineMode()) {
      const college = offlineDb.getCollegeById(id);
      return college ? { _id: college.id, id: college.id, code: college.code, name: college.name } : null;
    }
    const college = await College.findById(id) as any;
    return college ? { _id: college._id.toString(), id: college._id.toString(), code: college.code, name: college.name } : null;
  },

  async findByCode(code: string): Promise<CollegeData | null> {
    if (isOfflineMode()) {
      const college = offlineDb.getCollegeByCode(code);
      return college ? { _id: college.id, id: college.id, code: college.code, name: college.name } : null;
    }
    const college = await College.findOne({ code }) as any;
    return college ? { _id: college._id.toString(), id: college._id.toString(), code: college.code, name: college.name } : null;
  },

  async findAll(): Promise<CollegeData[]> {
    if (isOfflineMode()) {
      return offlineDb.getAllColleges().map(c => ({ _id: c.id, id: c.id, code: c.code, name: c.name }));
    }
    const colleges = await College.find() as any[];
    return colleges.map(c => ({ _id: c._id.toString(), id: c._id.toString(), code: c.code, name: c.name }));
  },

  async create(data: Omit<CollegeData, '_id' | 'id'>): Promise<CollegeData> {
    if (isOfflineMode()) {
      const college = offlineDb.createCollege(data);
      return { _id: college.id, id: college.id, code: college.code, name: college.name };
    }
    const college = new College(data) as any;
    await college.save();
    return { _id: college._id.toString(), id: college._id.toString(), code: college.code, name: college.name };
  },

  async update(id: string, updates: Partial<CollegeData>): Promise<boolean> {
    if (isOfflineMode()) {
      return offlineDb.updateCollege(id, updates);
    }
    const result = await College.findByIdAndUpdate(id, updates);
    return !!result;
  },

  async delete(id: string): Promise<boolean> {
    if (isOfflineMode()) {
      return offlineDb.deleteCollege(id);
    }
    const result = await College.findByIdAndDelete(id);
    return !!result;
  }
};

// ============================================
// COURSE SERVICE
// ============================================

export interface CourseData {
  _id?: string;
  id?: string;
  code: string;
  name: string;
  college: string;
}

export const CourseService = {
  async findById(id: string): Promise<CourseData | null> {
    if (isOfflineMode()) {
      const course = offlineDb.getCourseById(id);
      return course ? { _id: course.id, id: course.id, code: course.code, name: course.name, college: course.college_id } : null;
    }
    const course = await Course.findById(id) as any;
    return course ? { _id: course._id.toString(), id: course._id.toString(), code: course.code, name: course.name, college: course.college.toString() } : null;
  },

  async findByCode(code: string): Promise<CourseData | null> {
    if (isOfflineMode()) {
      const course = offlineDb.getCourseByCode(code);
      return course ? { _id: course.id, id: course.id, code: course.code, name: course.name, college: course.college_id } : null;
    }
    const course = await Course.findOne({ code }) as any;
    return course ? { _id: course._id.toString(), id: course._id.toString(), code: course.code, name: course.name, college: course.college.toString() } : null;
  },

  async findByCollege(collegeId: string): Promise<CourseData[]> {
    if (isOfflineMode()) {
      return offlineDb.getCoursesByCollege(collegeId).map(c => ({ 
        _id: c.id, id: c.id, code: c.code, name: c.name, college: c.college_id 
      }));
    }
    const courses = await Course.find({ college: collegeId }) as any[];
    return courses.map(c => ({ _id: c._id.toString(), id: c._id.toString(), code: c.code, name: c.name, college: c.college.toString() }));
  },

  async findAll(): Promise<CourseData[]> {
    if (isOfflineMode()) {
      return offlineDb.getAllCourses().map(c => ({ 
        _id: c.id, id: c.id, code: c.code, name: c.name, college: c.college_id 
      }));
    }
    const courses = await Course.find() as any[];
    return courses.map(c => ({ _id: c._id.toString(), id: c._id.toString(), code: c.code, name: c.name, college: c.college.toString() }));
  },

  async create(data: Omit<CourseData, '_id' | 'id'>): Promise<CourseData> {
    if (isOfflineMode()) {
      const course = offlineDb.createCourse({ code: data.code, name: data.name, college_id: data.college });
      return { _id: course.id, id: course.id, code: course.code, name: course.name, college: course.college_id };
    }
    const course = new Course(data) as any;
    await course.save();
    return { _id: course._id.toString(), id: course._id.toString(), code: course.code, name: course.name, college: course.college.toString() };
  }
};

// ============================================
// SCHEDULE SERVICE
// ============================================

export interface ScheduleData {
  _id?: string;
  id?: string;
  courseTitle: string;
  courseCode: string;
  instructor: string | UserData;
  room: string;
  startTime: string;
  endTime: string;
  semesterStartDate: string;
  semesterEndDate: string;
  section: string | { course: string; section: string; block: string };
  days: {
    mon: boolean;
    tue: boolean;
    wed: boolean;
    thu: boolean;
    fri: boolean;
    sat: boolean;
    sun: boolean;
  };
}

export const ScheduleService = {
  async findById(id: string): Promise<ScheduleData | null> {
    if (isOfflineMode()) {
      const schedule = offlineDb.getScheduleById(id);
      if (!schedule) return null;
      const instructor = offlineDb.getUserById(schedule.instructor_id);
      return mapOfflineScheduleToScheduleData(schedule, instructor);
    }
    const schedule = await Schedule.findById(id).populate('instructor').populate('section');
    return schedule ? mongoScheduleToScheduleData(schedule) : null;
  },

  async findByInstructor(instructorId: string): Promise<ScheduleData[]> {
    if (isOfflineMode()) {
      const schedules = offlineDb.getSchedulesByInstructor(instructorId);
      return schedules.map(s => {
        const instructor = offlineDb.getUserById(s.instructor_id);
        return mapOfflineScheduleToScheduleData(s, instructor);
      });
    }
    // ⚡ CRITICAL: Always populate instructor to ensure we have name data
    const schedules = await Schedule.find({ instructor: instructorId })
      .populate({
        path: 'instructor',
        select: 'first_name last_name' // Only get needed fields
      })
      .populate('section');
    
    console.log(`[SCHEDULE SERVICE] [DEBUG] Found ${schedules.length} schedules for instructor ${instructorId}`);
    
    // Filter out schedules where instructor population failed
    const validSchedules = schedules.filter(s => {
      if (!s._id) {
        console.log(`[SCHEDULE SERVICE] ⚠️ Schedule missing _id: ${s.courseCode || 'N/A'}`);
        return false;
      }
      // ⚡ TYPE SAFETY: Check if instructor is populated (not just ObjectId)
      if (!s.instructor) {
        console.log(`[SCHEDULE SERVICE] ⚠️ Schedule ${s._id} has no instructor`);
        return false;
      }
      // Check if instructor is an object (populated) and has required fields
      if (typeof s.instructor === 'object' && 'first_name' in s.instructor && 'last_name' in s.instructor) {
        const instructor = s.instructor as any;
        if (!instructor.first_name || !instructor.last_name) {
          console.log(`[SCHEDULE SERVICE] ⚠️ Schedule ${s._id} has instructor but missing first_name or last_name`);
          return false;
        }
      } else {
        // Instructor is ObjectId (not populated) - this shouldn't happen but handle it
        console.log(`[SCHEDULE SERVICE] ⚠️ Schedule ${s._id} has instructor as ObjectId (not populated)`);
        return false;
      }
      return true;
    });
    
    console.log(`[SCHEDULE SERVICE] [DEBUG] ${validSchedules.length} valid schedules after filtering`);
    
    return validSchedules.map(mongoScheduleToScheduleData);
  },

  async findByRoom(room: string): Promise<ScheduleData[]> {
    if (isOfflineMode()) {
      const schedules = offlineDb.getSchedulesByRoom(room);
      return schedules.map(s => {
        const instructor = offlineDb.getUserById(s.instructor_id);
        return mapOfflineScheduleToScheduleData(s, instructor);
      });
    }
    const schedules = await Schedule.find({ room }).populate('instructor').populate('section');
    return schedules.map(mongoScheduleToScheduleData);
  },

  async findAll(): Promise<ScheduleData[]> {
    if (isOfflineMode()) {
      const schedules = offlineDb.getAllSchedules();
      return schedules.map(s => {
        const instructor = offlineDb.getUserById(s.instructor_id);
        return mapOfflineScheduleToScheduleData(s, instructor);
      });
    }
    // ⚡ CRITICAL: Always populate instructor and section to ensure data is available
    const schedules = await Schedule.find()
      .populate({
        path: 'instructor',
        select: 'first_name last_name' // Only get needed fields
      })
      .populate('section');
    
    // Filter out schedules where instructor population failed
    const validSchedules = schedules.filter(s => {
      if (!s._id) {
        console.log(`[SCHEDULE SERVICE] ⚠️ Schedule missing _id: ${s.courseCode || 'N/A'}`);
        return false;
      }
      // ⚡ TYPE SAFETY: Check if instructor is populated (not just ObjectId)
      if (!s.instructor) {
        console.log(`[SCHEDULE SERVICE] ⚠️ Schedule ${s._id} has no instructor`);
        return false;
      }
      // Check if instructor is an object (populated) and has required fields
      if (typeof s.instructor === 'object' && 'first_name' in s.instructor && 'last_name' in s.instructor) {
        const instructor = s.instructor as any;
        if (!instructor.first_name || !instructor.last_name) {
          console.log(`[SCHEDULE SERVICE] ⚠️ Schedule ${s._id} has instructor but missing first_name or last_name`);
          return false;
        }
      } else {
        // Instructor is ObjectId (not populated) - this shouldn't happen but handle it
        console.log(`[SCHEDULE SERVICE] ⚠️ Schedule ${s._id} has instructor as ObjectId (not populated)`);
        return false;
      }
      return true;
    });
    
    return validSchedules.map(mongoScheduleToScheduleData);
  },

  async create(data: Omit<ScheduleData, '_id' | 'id'>): Promise<ScheduleData> {
    if (isOfflineMode()) {
      const instructorId = typeof data.instructor === 'string' ? data.instructor : (data.instructor as any)._id;
      // Extract section ID - section should be a string ID when creating
      let sectionId: string;
      if (typeof data.section === 'string') {
        sectionId = data.section;
      } else if (data.section && typeof data.section === 'object' && 'course' in data.section && 'section' in data.section && 'block' in data.section) {
        // If section is an object, try to find the section by its properties
        const sectionObj = data.section as { course: string; section: string; block: string };
        const allSections = offlineDb.getAllSections();
        const foundSection = allSections.find(s => 
          s.course === sectionObj.course && 
          s.section === sectionObj.section && 
          s.block === sectionObj.block
        );
        if (!foundSection) {
          throw new Error(`Section not found: ${sectionObj.course} - ${sectionObj.section}${sectionObj.block}`);
        }
        sectionId = foundSection.id;
      } else {
        throw new Error('Section must be provided as a string ID or object with course, section, and block properties');
      }
      const schedule = offlineDb.createSchedule({
        course_title: data.courseTitle,
        course_code: data.courseCode,
        instructor_id: instructorId,
        room: data.room,
        start_time: data.startTime,
        end_time: data.endTime,
        semester_start_date: data.semesterStartDate,
        semester_end_date: data.semesterEndDate,
        section_id: sectionId,
        days: JSON.stringify(data.days)
      });
      const instructor = offlineDb.getUserById(schedule.instructor_id);
      return mapOfflineScheduleToScheduleData(schedule, instructor);
    }
    // For MongoDB, section should be a string ID (ObjectId), not an object
    const scheduleData: any = { ...data };
    if (typeof data.section === 'object' && data.section !== null && 'course' in data.section && 'section' in data.section && 'block' in data.section) {
      // If section is an object, we need to find the section ID
      // This shouldn't happen in normal flow, but handle it gracefully
      const sectionObj = data.section as { course: string; section: string; block: string };
      const Section = (await import('../models/Section')).default;
      const foundSection = await Section.findOne({
        course: sectionObj.course,
        section: sectionObj.section,
        block: sectionObj.block
      });
      if (!foundSection) {
        throw new Error(`Section not found: ${sectionObj.course} - ${sectionObj.section}${sectionObj.block}`);
      }
      scheduleData.section = foundSection._id.toString();
    }
    const schedule = new Schedule(scheduleData);
    await schedule.save();
    const populated = await Schedule.findById(schedule._id).populate('instructor').populate('section');
    return mongoScheduleToScheduleData(populated!);
  },

  async update(id: string, updates: Partial<ScheduleData>): Promise<boolean> {
    if (isOfflineMode()) {
      const offlineUpdates: Partial<offlineDb.OfflineSchedule> = {};
      if (updates.courseTitle) offlineUpdates.course_title = updates.courseTitle;
      if (updates.courseCode) offlineUpdates.course_code = updates.courseCode;
      if (updates.room) offlineUpdates.room = updates.room;
      if (updates.startTime) offlineUpdates.start_time = updates.startTime;
      if (updates.endTime) offlineUpdates.end_time = updates.endTime;
      if (updates.days) offlineUpdates.days = JSON.stringify(updates.days);
      return offlineDb.updateSchedule(id, offlineUpdates);
    }
    const result = await Schedule.findByIdAndUpdate(id, updates);
    return !!result;
  },

  async delete(id: string): Promise<boolean> {
    if (isOfflineMode()) {
      return offlineDb.deleteSchedule(id);
    }
    const result = await Schedule.findByIdAndDelete(id);
    return !!result;
  },

  async countToday(): Promise<number> {
    const today = new Date();
    const dayMap: { [key: number]: keyof ScheduleData['days'] } = {
      0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat'
    };
    const todayDay = dayMap[today.getDay()];
    
    if (isOfflineMode()) {
      const schedules = offlineDb.getAllSchedules();
      return schedules.filter(s => {
        const days = JSON.parse(s.days);
        return days[todayDay];
      }).length;
    }
    
    return Schedule.countDocuments({ [`days.${todayDay}`]: true });
  }
};

// ============================================
// ATTENDANCE LOG SERVICE
// ============================================

export interface LogData {
  _id?: string;
  id?: string;
  schedule: string | ScheduleData | null;
  date: string;
  status: string;
  timeIn?: string;
  timeout?: string;
  remarks?: string;
  college?: string;
  course: string;
  instructorName?: string; // For no-schedule logs
  room?: string; // For no-schedule logs
  isNoSchedule?: boolean; // Flag to identify no-schedule logs
}

export const LogService = {
  async findById(id: string): Promise<LogData | null> {
    if (isOfflineMode()) {
      const log = offlineDb.getLogById(id);
      return log ? mapOfflineLogToLogData(log) : null;
    }
    const log = await Log.findById(id).populate({
      path: 'schedule',
      populate: { path: 'instructor' }
    });
    return log ? mongoLogToLogData(log) : null;
  },

  async findBySchedule(scheduleId: string): Promise<LogData[]> {
    if (isOfflineMode()) {
      const logs = offlineDb.getLogsBySchedule(scheduleId);
      return logs.map(mapOfflineLogToLogData);
    }
    const logs = await Log.find({ schedule: scheduleId }).populate({
      path: 'schedule',
      populate: { path: 'instructor' }
    });
    return logs.map(mongoLogToLogData);
  },

  async findByDate(date: string): Promise<LogData[]> {
    if (isOfflineMode()) {
      const logs = offlineDb.getLogsByDate(date);
      return logs.map(mapOfflineLogToLogData);
    }
    const logs = await Log.find({ date }).populate({
      path: 'schedule',
      populate: { path: 'instructor' }
    });
    return logs.map(mongoLogToLogData);
  },

  async findByScheduleAndDate(scheduleId: string, date: string): Promise<LogData | null> {
    if (isOfflineMode()) {
      const log = offlineDb.getLogsByScheduleAndDate(scheduleId, date);
      return log ? mapOfflineLogToLogData(log) : null;
    }
    const log = await Log.findOne({ schedule: scheduleId, date }).populate({
      path: 'schedule',
      populate: { path: 'instructor' }
    });
    return log ? mongoLogToLogData(log) : null;
  },

  async findAll(): Promise<LogData[]> {
    if (isOfflineMode()) {
      const logs = offlineDb.getAllLogs();
      return logs.map(mapOfflineLogToLogData);
    }
    const logs = await Log.find().populate({
      path: 'schedule',
      populate: { path: 'instructor' }
    }).sort({ date: -1 });
    return logs.map(mongoLogToLogData);
  },

  async findToday(): Promise<LogData[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.findByDate(today);
  },

  async create(data: Omit<LogData, '_id' | 'id'>): Promise<LogData> {
    if (isOfflineMode()) {
      const scheduleId = data.schedule 
        ? (typeof data.schedule === 'string' ? data.schedule : (data.schedule as any)._id)
        : null;
      const log = offlineDb.createLog({
        schedule_id: scheduleId || 'no-schedule',
        date: data.date,
        status: data.status,
        time_in: data.timeIn,
        time_out: data.timeout,
        remarks: data.remarks,
        college_id: data.college,
        course: data.course,
        instructor_name: data.instructorName, // For no-schedule logs
        room: data.room // For no-schedule logs
      } as any);
      return mapOfflineLogToLogData(log);
    }
    // For MongoDB, create log with optional schedule
    const logData: any = {
      ...data,
      schedule: data.schedule || null
    };
    const log = new Log(logData);
    await log.save();
    // Only populate if schedule exists
    if (data.schedule) {
    const populated = await Log.findById(log._id).populate({
      path: 'schedule',
      populate: { path: 'instructor' }
    });
    return mongoLogToLogData(populated!);
    }
    return mongoLogToLogData(log);
  },

  async update(id: string, updates: Partial<LogData>): Promise<boolean> {
    if (isOfflineMode()) {
      const offlineUpdates: Partial<offlineDb.OfflineLog> = {};
      if (updates.status) offlineUpdates.status = updates.status;
      if (updates.timeIn) offlineUpdates.time_in = updates.timeIn;
      if (updates.timeout) offlineUpdates.time_out = updates.timeout;
      if (updates.remarks !== undefined) offlineUpdates.remarks = updates.remarks;
      return offlineDb.updateLog(id, offlineUpdates);
    }
    const result = await Log.findByIdAndUpdate(id, updates);
    return !!result;
  },

  async getUnsyncedLogs(): Promise<LogData[]> {
    if (isOfflineMode()) {
      const logs = offlineDb.getUnsyncedLogs();
      return logs.map(mapOfflineLogToLogData);
    }
    return [];
  },

  async markSynced(id: string): Promise<boolean> {
    if (isOfflineMode()) {
      return offlineDb.markLogSynced(id);
    }
    return true;
  }
};

// ============================================
// SECTION SERVICE
// ============================================

export interface SectionData {
  _id?: string;
  id?: string;
  college: string;
  course: string;
  section: string;
  block: string;
}

export const SectionService = {
  async findById(id: string): Promise<SectionData | null> {
    if (isOfflineMode()) {
      const section = offlineDb.getSectionById(id);
      return section ? { _id: section.id, id: section.id, college: section.college_id, course: section.course, section: section.section, block: section.block } : null;
    }
    const section = await Section.findById(id) as any;
    return section ? { _id: section._id.toString(), id: section._id.toString(), college: section.college.toString(), course: section.course, section: section.section, block: section.block } : null;
  },

  async findByCollege(collegeId: string): Promise<SectionData[]> {
    if (isOfflineMode()) {
      return offlineDb.getSectionsByCollege(collegeId).map(s => ({
        _id: s.id, id: s.id, college: s.college_id, course: s.course, section: s.section, block: s.block
      }));
    }
    const sections = await Section.find({ college: collegeId }) as any[];
    return sections.map(s => ({ _id: s._id.toString(), id: s._id.toString(), college: s.college.toString(), course: s.course, section: s.section, block: s.block }));
  },

  async findAll(): Promise<SectionData[]> {
    if (isOfflineMode()) {
      return offlineDb.getAllSections().map(s => ({
        _id: s.id, id: s.id, college: s.college_id, course: s.course, section: s.section, block: s.block
      }));
    }
    const sections = await Section.find() as any[];
    return sections.map(s => ({ _id: s._id.toString(), id: s._id.toString(), college: s.college.toString(), course: s.course, section: s.section, block: s.block }));
  },

  async create(data: Omit<SectionData, '_id' | 'id'>): Promise<SectionData> {
    if (isOfflineMode()) {
      const section = offlineDb.createSection({ college_id: data.college, course: data.course, section: data.section, block: data.block });
      return { _id: section.id, id: section.id, college: section.college_id, course: section.course, section: section.section, block: section.block };
    }
    const section = new Section(data) as any;
    await section.save();
    return { _id: section._id.toString(), id: section._id.toString(), college: section.college.toString(), course: section.course, section: section.section, block: section.block };
  }
};

// ============================================
// ROOM SERVICE
// ============================================

export interface RoomData {
  _id?: string;
  id?: string;
  name: string;
  location?: string;
}

export const RoomService = {
  async findById(id: string): Promise<RoomData | null> {
    if (isOfflineMode()) {
      const room = offlineDb.getRoomById(id);
      return room ? { _id: room.id, id: room.id, name: room.name, location: room.location } : null;
    }
    const room = await Room.findById(id) as any;
    return room ? { _id: room._id.toString(), id: room._id.toString(), name: room.name, location: room.location } : null;
  },

  async findByName(name: string): Promise<RoomData | null> {
    if (isOfflineMode()) {
      const room = offlineDb.getRoomByName(name);
      return room ? { _id: room.id, id: room.id, name: room.name, location: room.location } : null;
    }
    const room = await Room.findOne({ name }) as any;
    return room ? { _id: room._id.toString(), id: room._id.toString(), name: room.name, location: room.location } : null;
  },

  async findAll(): Promise<RoomData[]> {
    if (isOfflineMode()) {
      return offlineDb.getAllRooms().map(r => ({ _id: r.id, id: r.id, name: r.name, location: r.location }));
    }
    const rooms = await Room.find() as any[];
    return rooms.map(r => ({ _id: r._id.toString(), id: r._id.toString(), name: r.name, location: r.location }));
  },

  async create(data: Omit<RoomData, '_id' | 'id'>): Promise<RoomData> {
    if (isOfflineMode()) {
      const room = offlineDb.createRoom(data);
      return { _id: room.id, id: room.id, name: room.name, location: room.location };
    }
    const room = new Room(data) as any;
    await room.save();
    return { _id: room._id.toString(), id: room._id.toString(), name: room.name, location: room.location };
  }
};

// ============================================
// SEMESTER SERVICE
// ============================================

export interface SemesterData {
  _id?: string;
  id?: string;
  semesterName: string;
  academicYear: string;
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
}

export const SemesterService = {
  async findAll(): Promise<SemesterData[]> {
    if (isOfflineMode()) {
      const semesters = offlineDb.getAllSemesters();
      return semesters.map(s => ({
        _id: s.id,
        id: s.id,
        semesterName: s.semester_name,
        academicYear: s.academic_year,
        startDate: s.start_date,
        endDate: s.end_date,
        isActive: s.is_active === 1
      }));
    }
    const semesters = await Semester.find().sort({ startDate: 1 }) as any[];
    return semesters.map(s => ({
      _id: s._id.toString(),
      id: s._id.toString(),
      semesterName: s.semesterName,
      academicYear: s.academicYear,
      startDate: s.startDate,
      endDate: s.endDate,
      isActive: s.isActive
    }));
  },

  async findById(id: string): Promise<SemesterData | null> {
    if (isOfflineMode()) {
      const semester = offlineDb.getSemesterById(id);
      if (!semester) return null;
      return {
        _id: semester.id,
        id: semester.id,
        semesterName: semester.semester_name,
        academicYear: semester.academic_year,
        startDate: semester.start_date,
        endDate: semester.end_date,
        isActive: semester.is_active === 1
      };
    }
    const semester = await Semester.findById(id) as any;
    if (!semester) return null;
    return {
      _id: semester._id.toString(),
      id: semester._id.toString(),
      semesterName: semester.semesterName,
      academicYear: semester.academicYear,
      startDate: semester.startDate,
      endDate: semester.endDate,
      isActive: semester.isActive
    };
  },

  async create(data: Omit<SemesterData, '_id' | 'id'>): Promise<SemesterData> {
    if (isOfflineMode()) {
      const semester = offlineDb.createSemester({
        semester_name: data.semesterName,
        academic_year: data.academicYear,
        start_date: data.startDate,
        end_date: data.endDate,
        is_active: data.isActive ? 1 : 0
      });
      return {
        _id: semester.id,
        id: semester.id,
        semesterName: semester.semester_name,
        academicYear: semester.academic_year,
        startDate: semester.start_date,
        endDate: semester.end_date,
        isActive: semester.is_active === 1
      };
    }
    const semester = new Semester(data) as any;
    await semester.save();
    return {
      _id: semester._id.toString(),
      id: semester._id.toString(),
      semesterName: semester.semesterName,
      academicYear: semester.academicYear,
      startDate: semester.startDate,
      endDate: semester.endDate,
      isActive: semester.isActive
    };
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function mapOfflineUserToUserData(user: offlineDb.OfflineUser): UserData {
  return {
    _id: user.id,
    id: user.id,
    first_name: user.first_name,
    middle_name: user.middle_name,
    last_name: user.last_name,
    ext_name: user.ext_name,
    username: user.username,
    email: user.email,
    gender: user.gender,
    birthdate: user.birthdate,
    highestEducationalAttainment: user.highest_educational_attainment,
    academicRank: user.academic_rank,
    statusOfAppointment: user.status_of_appointment,
    numberOfPrep: user.number_of_prep,
    totalTeachingLoad: user.total_teaching_load,
    password: user.password,
    role: user.role,
    college: user.college_id,
    course: user.course_id,
    status: user.status,
    profilePhotoUrl: user.profile_photo_url,
    faceImagePath: user.face_image_path,
    faceImages: user.face_images ? JSON.parse(user.face_images) : []
  };
}

function mongoUserToUserData(user: any): UserData {
  return {
    _id: user._id.toString(),
    id: user._id.toString(),
    first_name: user.first_name,
    middle_name: user.middle_name,
    last_name: user.last_name,
    ext_name: user.ext_name,
    username: user.username,
    email: user.email,
    gender: user.gender,
    birthdate: user.birthdate,
    highestEducationalAttainment: user.highestEducationalAttainment,
    academicRank: user.academicRank,
    statusOfAppointment: user.statusOfAppointment,
    numberOfPrep: user.numberOfPrep,
    totalTeachingLoad: user.totalTeachingLoad,
    password: user.password,
    role: user.role,
    college: user.college?._id?.toString() || user.college?.toString(),
    course: user.course?._id?.toString() || user.course?.toString(),
    status: user.status,
    profilePhotoUrl: user.profilePhotoUrl,
    faceImagePath: user.faceImagePath,
    faceImages: user.faceImages
  };
}

function mapOfflineScheduleToScheduleData(schedule: offlineDb.OfflineSchedule, instructor: offlineDb.OfflineUser | null): ScheduleData {
  // Fetch section data if available
  let sectionData: string | { course: string; section: string; block: string } = schedule.section_id;
  if (schedule.section_id) {
    const section = offlineDb.getSectionById(schedule.section_id);
    if (section) {
      sectionData = {
        course: section.course || '',
        section: section.section || '',
        block: section.block || ''
      };
    }
  }
  
  return {
    _id: schedule.id,
    id: schedule.id,
    courseTitle: schedule.course_title,
    courseCode: schedule.course_code,
    instructor: instructor ? mapOfflineUserToUserData(instructor) : schedule.instructor_id,
    room: schedule.room,
    startTime: schedule.start_time,
    endTime: schedule.end_time,
    semesterStartDate: schedule.semester_start_date,
    semesterEndDate: schedule.semester_end_date,
    section: sectionData,
    days: JSON.parse(schedule.days)
  };
}

function mongoScheduleToScheduleData(schedule: any): ScheduleData {
  // Handle section - if populated, preserve the object structure; otherwise use ID
  let sectionData: string | ScheduleData['section'] = schedule.section?.toString() || null;
  if (schedule.section && typeof schedule.section === 'object' && schedule.section._id) {
    // Section is populated - preserve the object structure
    sectionData = {
      course: schedule.section.course || '',
      section: schedule.section.section || '',
      block: schedule.section.block || ''
    };
  }
  
  return {
    _id: schedule._id.toString(),
    id: schedule._id.toString(),
    courseTitle: schedule.courseTitle,
    courseCode: schedule.courseCode,
    instructor: schedule.instructor ? mongoUserToUserData(schedule.instructor) : schedule.instructor?.toString(),
    room: schedule.room,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    semesterStartDate: schedule.semesterStartDate,
    semesterEndDate: schedule.semesterEndDate,
    section: sectionData,
    days: schedule.days
  };
}

function mapOfflineLogToLogData(log: offlineDb.OfflineLog): LogData {
  // Check if this is a no-schedule log (schedule_id is 'no-schedule' or null)
  const isNoSchedule = log.schedule_id === 'no-schedule' || log.schedule_id === null || !log.schedule_id;
  
  return {
    _id: log.id,
    id: log.id,
    schedule: isNoSchedule ? null : log.schedule_id,
    date: log.date,
    status: log.status,
    timeIn: log.time_in,
    timeout: log.time_out,
    remarks: log.remarks,
    college: log.college_id,
    course: log.course,
    // For offline, we need to check if we can get instructorName and room from the log
    // These might not be stored in offline DB, so we'll need to add them
    instructorName: (log as any).instructor_name,
    room: (log as any).room,
    isNoSchedule: isNoSchedule
  };
}

function mongoLogToLogData(log: any): LogData {
  return {
    _id: log._id.toString(),
    id: log._id.toString(),
    schedule: log.schedule ? mongoScheduleToScheduleData(log.schedule) : (log.schedule?.toString() || null),
    date: log.date,
    status: log.status,
    timeIn: log.timeIn,
    timeout: log.timeout,
    remarks: log.remarks,
    college: log.college?.toString(),
    instructorName: log.instructorName, // For no-schedule logs
    room: log.room, // For no-schedule logs
    isNoSchedule: log.isNoSchedule || false, // Flag to identify no-schedule logs
    course: log.course
  };
}

// ============================================
// DATABASE STATS
// ============================================

export async function getStats(): Promise<{ [key: string]: number }> {
  if (isOfflineMode()) {
    return offlineDb.getDbStats();
  }
  
  return {
    users: await UserModel.countDocuments(),
    colleges: await College.countDocuments(),
    courses: await Course.countDocuments(),
    schedules: await Schedule.countDocuments(),
    logs: await Log.countDocuments(),
    sections: await Section.countDocuments(),
    rooms: await Room.countDocuments()
  };
}

