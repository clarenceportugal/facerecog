import mongoose from 'mongoose';
import Schedule from '../models/Schedule';
import Log from '../models/AttendanceLogs';

/**
 * Automatically mark absent for faculty who didn't attend scheduled classes
 * This runs periodically to check for missing attendance
 */
export async function markAbsentForDay(date?: string): Promise<void> {
  try {
    // Get the target date (today if not provided) - use same format as other logs
    const now = new Date();
    const targetDate = date || now.toLocaleDateString("en-CA"); // YYYY-MM-DD format
    const targetDateObj = new Date(targetDate);
    const dayOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][targetDateObj.getDay()];
    
    console.log(`[SCHEDULER] Checking for absent faculty on ${targetDate} (${dayOfWeek})`);

    // Find all schedules that should have occurred on this date
    const schedules = await Schedule.find({
      semesterStartDate: { $lte: targetDate },
      semesterEndDate: { $gte: targetDate },
      [`days.${dayOfWeek}`]: true
    }).populate('instructor');

    if (schedules.length === 0) {
      console.log(`[SCHEDULER] No schedules found for ${targetDate}`);
      return;
    }

    console.log(`[SCHEDULER] Found ${schedules.length} schedules for ${targetDate}`);

    // Get all existing logs for this date
    const existingLogs = await Log.find({
      date: targetDate
    });
    const loggedScheduleIds = new Set(
      existingLogs.map(log => log.schedule.toString())
    );

    let absentCount = 0;

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

      // Only mark absent if class has ended
      if (now < classEndTime) {
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

      console.log(`[SCHEDULER] ✅ Marked absent: ${schedule.courseCode} (${schedule.startTime}-${schedule.endTime})`);
    }

    if (absentCount > 0) {
      console.log(`[SCHEDULER] Completed: ${absentCount} absent logs created for ${targetDate}`);
    }
  } catch (error: any) {
    console.error('[SCHEDULER] Error running absent detection:', error.message);
  }
}

/**
 * Start the absent detection scheduler
 * Runs every hour to check for classes that have ended without attendance
 */
export function startAbsentDetectionScheduler(): void {
  console.log('[SCHEDULER] Starting automatic absent detection scheduler...');
  
  // Run immediately on startup (for any missed classes from previous day)
  setTimeout(() => {
    markAbsentForDay();
  }, 60000); // Wait 1 minute after server starts
  
  // Then run every hour
  setInterval(() => {
    markAbsentForDay();
  }, 60 * 60 * 1000); // Every hour (3600000 ms)
  
  // Also run at end of day (11:59 PM) to catch all classes
  scheduleDailyCheck();
}

/**
 * Schedule a daily check at 11:59 PM to mark all absences for the day
 */
function scheduleDailyCheck(): void {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 0, 0);
  
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    // Run at 11:59 PM
    markAbsentForDay();
    
    // Then schedule for every day at 11:59 PM
    setInterval(() => {
      markAbsentForDay();
    }, 24 * 60 * 60 * 1000); // Every 24 hours
  }, msUntilMidnight);
  
  console.log(`[SCHEDULER] Daily absent check scheduled for 11:59 PM (in ${Math.round(msUntilMidnight / 1000 / 60)} minutes)`);
}

