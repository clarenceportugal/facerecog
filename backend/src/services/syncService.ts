/**
 * Sync Service
 * Syncs data from MongoDB to SQLite for offline use
 * Run this when online to populate the offline database
 */
import mongoose from 'mongoose';
import * as offlineDb from './offlineDatabase';

// MongoDB Models
import UserModel from '../models/User';
import College from '../models/College';
import Course from '../models/Course';
import Schedule from '../models/Schedule';
import Log from '../models/AttendanceLogs';
import Section from '../models/Section';
import Room from '../models/Room';
import Semester from '../models/Semester';

export interface SyncResult {
  success: boolean;
  synced: {
    users: number;
    colleges: number;
    courses: number;
    schedules: number;
    logs: number;
    sections: number;
    rooms: number;
    semesters: number;
  };
  errors: string[];
  timestamp: string;
}

/**
 * Sync all data from MongoDB to SQLite
 */
export async function syncAllDataToOffline(): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    synced: {
      users: 0,
      colleges: 0,
      courses: 0,
      schedules: 0,
      logs: 0,
      sections: 0,
      rooms: 0,
      semesters: 0
    },
    errors: [],
    timestamp: new Date().toISOString()
  };

  // Check MongoDB connection
  if (mongoose.connection.readyState !== 1) {
    result.success = false;
    result.errors.push('MongoDB is not connected. Cannot sync data.');
    return result;
  }

  const db = offlineDb.getDb();

  try {
    // 1. Sync Colleges
    console.log('[SYNC] Syncing colleges...');
    const colleges = await College.find() as any[];
    for (const college of colleges) {
      try {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO colleges (id, code, name, created_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(college._id.toString(), college.code, college.name);
        result.synced.colleges++;
      } catch (error: any) {
        result.errors.push(`College ${college.code}: ${error.message}`);
      }
    }
    console.log(`[SYNC] Synced ${result.synced.colleges} colleges`);

    // 2. Sync Courses
    console.log('[SYNC] Syncing courses...');
    const courses = await Course.find() as any[];
    for (const course of courses) {
      try {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO courses (id, code, name, college_id, created_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(course._id.toString(), course.code, course.name, course.college.toString());
        result.synced.courses++;
      } catch (error: any) {
        result.errors.push(`Course ${course.code}: ${error.message}`);
      }
    }
    console.log(`[SYNC] Synced ${result.synced.courses} courses`);

    // 3. Sync Sections
    console.log('[SYNC] Syncing sections...');
    const sections = await Section.find() as any[];
    for (const section of sections) {
      try {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO sections (id, college_id, course, section, block, created_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(section._id.toString(), section.college.toString(), section.course, section.section, section.block);
        result.synced.sections++;
      } catch (error: any) {
        result.errors.push(`Section ${section.course}-${section.section}: ${error.message}`);
      }
    }
    console.log(`[SYNC] Synced ${result.synced.sections} sections`);

    // 4. Sync Rooms
    console.log('[SYNC] Syncing rooms...');
    const rooms = await Room.find() as any[];
    for (const room of rooms) {
      try {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO rooms (id, name, location, created_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(room._id.toString(), room.name, room.location || null);
        result.synced.rooms++;
      } catch (error: any) {
        result.errors.push(`Room ${room.name}: ${error.message}`);
      }
    }
    console.log(`[SYNC] Synced ${result.synced.rooms} rooms`);

    // 5. Sync Semesters
    console.log('[SYNC] Syncing semesters...');
    const semesters = await Semester.find() as any[];
    for (const semester of semesters) {
      try {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO semesters (id, semester_name, academic_year, start_date, end_date, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(
          semester._id.toString(),
          semester.semesterName,
          semester.academicYear,
          semester.startDate || null,
          semester.endDate || null,
          semester.isActive ? 1 : 0
        );
        result.synced.semesters++;
      } catch (error: any) {
        result.errors.push(`Semester ${semester.academicYear}: ${error.message}`);
      }
    }
    console.log(`[SYNC] Synced ${result.synced.semesters} semesters`);

    // 6. Sync Users
    console.log('[SYNC] Syncing users...');
    const users = await UserModel.find() as any[];
    for (const user of users) {
      try {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO users (
            id, first_name, middle_name, last_name, ext_name, username, email,
            gender, birthdate, highest_educational_attainment, academic_rank,
            status_of_appointment, number_of_prep, total_teaching_load, password,
            role, college_id, course_id, status, profile_photo_url, face_image_path,
            face_images, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        stmt.run(
          user._id.toString(),
          user.first_name,
          user.middle_name || '',
          user.last_name,
          user.ext_name || '',
          user.username,
          user.email,
          user.gender || '',
          user.birthdate?.toISOString() || null,
          user.highestEducationalAttainment || '',
          user.academicRank || '',
          user.statusOfAppointment || '',
          user.numberOfPrep || 0,
          user.totalTeachingLoad || 0,
          user.password,
          user.role,
          user.college?.toString() || null,
          user.course?.toString() || null,
          user.status || 'forverification',
          user.profilePhotoUrl || '',
          user.faceImagePath || '',
          JSON.stringify(user.faceImages || [])
        );
        result.synced.users++;
      } catch (error: any) {
        result.errors.push(`User ${user.username}: ${error.message}`);
      }
    }
    console.log(`[SYNC] Synced ${result.synced.users} users`);

    // 7. Sync Schedules
    console.log('[SYNC] Syncing schedules...');
    const schedules = await Schedule.find().populate('instructor') as any[];
    for (const schedule of schedules) {
      try {
        // ⚡ FIX: Get instructor name in "Last, First" format for consistent searching
        let instructor_name = '';
        if (schedule.instructor) {
          if (typeof schedule.instructor === 'object' && schedule.instructor.first_name && schedule.instructor.last_name) {
            instructor_name = `${schedule.instructor.last_name}, ${schedule.instructor.first_name}`;
          } else {
            // Fallback: try to get from User collection
            const User = mongoose.model('User');
            const instructor = await User.findById(schedule.instructor);
            if (instructor && instructor.first_name && instructor.last_name) {
              instructor_name = `${instructor.last_name}, ${instructor.first_name}`;
            }
          }
        }
        
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO schedules (
            id, course_title, course_code, instructor_id, instructor_name, room, start_time,
            end_time, semester_start_date, semester_end_date, section_id, days,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);
        stmt.run(
          schedule._id.toString(),
          schedule.courseTitle,
          schedule.courseCode,
          schedule.instructor.toString(),
          instructor_name,  // ⚡ CRITICAL: Include instructor_name for searching
          schedule.room,
          schedule.startTime,
          schedule.endTime,
          schedule.semesterStartDate,
          schedule.semesterEndDate,
          schedule.section.toString(),
          JSON.stringify(schedule.days)
        );
        result.synced.schedules++;
      } catch (error: any) {
        result.errors.push(`Schedule ${schedule.courseCode}: ${error.message}`);
      }
    }
    console.log(`[SYNC] Synced ${result.synced.schedules} schedules`);

    // 8. Sync Attendance Logs
    console.log('[SYNC] Syncing attendance logs...');
    const logs = await Log.find() as any[];
    for (const log of logs) {
      try {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO attendance_logs (
            id, schedule_id, date, status, time_in, time_out, remarks,
            college_id, course, synced, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        `);
        stmt.run(
          log._id.toString(),
          log.schedule.toString(),
          log.date,
          log.status,
          log.timeIn || null,
          log.timeout || null,
          log.remarks || '',
          log.college?.toString() || null,
          log.course
        );
        result.synced.logs++;
      } catch (error: any) {
        result.errors.push(`Log ${log.date}: ${error.message}`);
      }
    }
    console.log(`[SYNC] Synced ${result.synced.logs} attendance logs`);

    console.log('[SYNC] Sync completed successfully!');
    console.log('[SYNC] Summary:', result.synced);

  } catch (error: any) {
    result.success = false;
    result.errors.push(`Sync failed: ${error.message}`);
    console.error('[SYNC] Error:', error);
  }

  return result;
}

/**
 * Sync local attendance logs to MongoDB (when going back online)
 */
export async function syncLogsToMongoDB(): Promise<{ synced: number; errors: string[] }> {
  const result = { synced: 0, errors: [] as string[] };

  if (mongoose.connection.readyState !== 1) {
    result.errors.push('MongoDB is not connected');
    return result;
  }

  const unsyncedLogs = offlineDb.getUnsyncedLogs();
  console.log(`[SYNC] Found ${unsyncedLogs.length} unsynced logs`);

  for (const log of unsyncedLogs) {
    try {
      // Check if log already exists in MongoDB
      const existingLog = await Log.findOne({
        schedule: log.schedule_id,
        date: log.date
      });

      if (existingLog) {
        // Update existing log
        existingLog.status = log.status as any;
        existingLog.timeIn = log.time_in;
        existingLog.timeout = log.time_out;
        existingLog.remarks = log.remarks || '';
        await existingLog.save();
      } else {
        // Create new log
        const newLog = new Log({
          schedule: log.schedule_id,
          date: log.date,
          status: log.status,
          timeIn: log.time_in,
          timeout: log.time_out,
          remarks: log.remarks || '',
          college: log.college_id,
          course: log.course
        });
        await newLog.save();
      }

      // Mark as synced in SQLite
      offlineDb.markLogSynced(log.id);
      result.synced++;
    } catch (error: any) {
      result.errors.push(`Log ${log.id}: ${error.message}`);
    }
  }

  console.log(`[SYNC] Synced ${result.synced} logs to MongoDB`);
  return result;
}

/**
 * Clear all offline data
 */
export function clearOfflineData(): void {
  const db = offlineDb.getDb();
  
  db.exec('DELETE FROM attendance_logs');
  db.exec('DELETE FROM schedules');
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM sections');
  db.exec('DELETE FROM rooms');
  db.exec('DELETE FROM courses');
  db.exec('DELETE FROM colleges');
  db.exec('DELETE FROM semesters');
  
  console.log('[SYNC] All offline data cleared');
}

/**
 * Sync users and schedules FROM SQLite TO MongoDB
 * Use this when switching from offline to online mode to preserve changes
 */
export async function syncOfflineChangesToMongoDB(): Promise<{
  success: boolean;
  synced: { users: number; schedules: number };
  errors: string[];
}> {
  const result = {
    success: true,
    synced: { users: 0, schedules: 0 },
    errors: [] as string[]
  };

  if (mongoose.connection.readyState !== 1) {
    result.success = false;
    result.errors.push('MongoDB is not connected');
    return result;
  }

  console.log('[SYNC] Syncing offline changes to MongoDB...');

  try {
    // 1. Sync Users
    const offlineUsers = offlineDb.getAllUsers();
    console.log(`[SYNC] Found ${offlineUsers.length} users in SQLite`);

    for (const user of offlineUsers) {
      try {
        const existingUser = await UserModel.findById(user.id);
        
        if (existingUser) {
          // Update existing user
          existingUser.first_name = user.first_name;
          existingUser.middle_name = user.middle_name || '';
          existingUser.last_name = user.last_name;
          existingUser.ext_name = user.ext_name || '';
          existingUser.username = user.username;
          existingUser.email = user.email;
          existingUser.gender = user.gender || '';
          existingUser.highestEducationalAttainment = user.highest_educational_attainment || '';
          existingUser.academicRank = user.academic_rank || '';
          existingUser.statusOfAppointment = user.status_of_appointment || '';
          existingUser.numberOfPrep = user.number_of_prep || 0;
          existingUser.totalTeachingLoad = user.total_teaching_load || 0;
          existingUser.role = user.role as any;
          existingUser.status = user.status as any;
          existingUser.profilePhotoUrl = user.profile_photo_url || '';
          if (user.college_id) {
            existingUser.college = new mongoose.Types.ObjectId(user.college_id);
          }
          if (user.course_id) {
            existingUser.course = new mongoose.Types.ObjectId(user.course_id);
          }
          if (user.birthdate) {
            existingUser.birthdate = new Date(user.birthdate);
          }
          // Don't update password hash
          await existingUser.save();
          result.synced.users++;
        } else {
          // Create new user
          const newUser = new UserModel({
            _id: user.id,
            first_name: user.first_name,
            middle_name: user.middle_name || '',
            last_name: user.last_name,
            ext_name: user.ext_name || '',
            username: user.username,
            email: user.email,
            password: user.password,
            gender: user.gender || '',
            birthdate: user.birthdate ? new Date(user.birthdate) : new Date(),
            highestEducationalAttainment: user.highest_educational_attainment || '',
            academicRank: user.academic_rank || '',
            statusOfAppointment: user.status_of_appointment || '',
            numberOfPrep: user.number_of_prep || 0,
            totalTeachingLoad: user.total_teaching_load || 0,
            role: user.role,
            college: user.college_id ? new mongoose.Types.ObjectId(user.college_id) : undefined,
            course: user.course_id ? new mongoose.Types.ObjectId(user.course_id) : undefined,
            status: user.status || 'forverification',
            profilePhotoUrl: user.profile_photo_url || ''
          });
          await newUser.save();
          result.synced.users++;
        }
      } catch (error: any) {
        result.errors.push(`User ${user.email}: ${error.message}`);
      }
    }
    console.log(`[SYNC] Synced ${result.synced.users} users to MongoDB`);

    // 2. Sync Schedules
    const offlineSchedules = offlineDb.getAllSchedules();
    console.log(`[SYNC] Found ${offlineSchedules.length} schedules in SQLite`);

    for (const schedule of offlineSchedules) {
      try {
        // Parse days from JSON string to object
        let daysObj = {
          mon: false,
          tue: false,
          wed: false,
          thu: false,
          fri: false,
          sat: false,
          sun: false
        };
        
        try {
          if (schedule.days) {
            const parsedDays = JSON.parse(schedule.days);
            if (typeof parsedDays === 'object') {
              daysObj = { ...daysObj, ...parsedDays };
            }
          }
        } catch (e) {
          // If days is a comma-separated string, convert it
          if (schedule.days && typeof schedule.days === 'string') {
            const daysList = schedule.days.toLowerCase().split(',');
            daysList.forEach(day => {
              const trimmed = day.trim();
              if (trimmed in daysObj) {
                (daysObj as any)[trimmed] = true;
              }
            });
          }
        }

        const existingSchedule = await Schedule.findById(schedule.id);
        
        if (existingSchedule) {
          // Update existing schedule
          existingSchedule.courseTitle = schedule.course_title;
          existingSchedule.courseCode = schedule.course_code;
          existingSchedule.instructor = new mongoose.Types.ObjectId(schedule.instructor_id);
          existingSchedule.room = schedule.room;
          existingSchedule.startTime = schedule.start_time;
          existingSchedule.endTime = schedule.end_time;
          existingSchedule.days = daysObj;
          existingSchedule.semesterStartDate = schedule.semester_start_date;
          existingSchedule.semesterEndDate = schedule.semester_end_date;
          existingSchedule.section = new mongoose.Types.ObjectId(schedule.section_id);
          await existingSchedule.save();
          result.synced.schedules++;
        } else {
          // Create new schedule
          const newSchedule = new Schedule({
            _id: schedule.id,
            courseTitle: schedule.course_title,
            courseCode: schedule.course_code,
            instructor: new mongoose.Types.ObjectId(schedule.instructor_id),
            room: schedule.room,
            startTime: schedule.start_time,
            endTime: schedule.end_time,
            days: daysObj,
            semesterStartDate: schedule.semester_start_date,
            semesterEndDate: schedule.semester_end_date,
            section: new mongoose.Types.ObjectId(schedule.section_id)
          });
          await newSchedule.save();
          result.synced.schedules++;
        }
      } catch (error: any) {
        result.errors.push(`Schedule ${schedule.course_code}: ${error.message}`);
      }
    }
    console.log(`[SYNC] Synced ${result.synced.schedules} schedules to MongoDB`);

  } catch (error: any) {
    result.success = false;
    result.errors.push(`Sync failed: ${error.message}`);
  }

  return result;
}

/**
 * Get sync status
 */
export function getSyncStatus(): { offlineStats: { [key: string]: number }; unsyncedLogs: number } {
  const stats = offlineDb.getDbStats();
  const unsyncedLogs = offlineDb.getUnsyncedLogs().length;
  
  return {
    offlineStats: stats,
    unsyncedLogs
  };
}

