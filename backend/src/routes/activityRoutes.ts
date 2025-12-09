import { Router, Request, Response } from "express";
import TempAccount from "../models/TempAccount";
import User from "../models/User";
import Schedule from "../models/Schedule";
import Section from "../models/Section";
import Subject from "../models/Subject";
import ActivityLog from "../models/ActivityLog";
import mongoose from "mongoose";
import Course from "../models/Course";

const router = Router();

// GET SYSTEM ACTIVITIES - Returns all system activities for activity history
router.get("/system-activities", async (req: Request, res: Response): Promise<void> => {
  try {
    const { courseName, userRole } = req.query;
    const allActivities: any[] = [];

    // Filter by role: if userRole is provided, only show activities performed by that role
    const filterByRole = userRole ? String(userRole) : null;
    
    console.log(`[ACTIVITY] Fetching system activities for course: ${courseName || 'all'}, role filter: ${filterByRole || 'none'}`);

    // 1. Fetch accepted faculty (TempAccount with accepted_needs_completion status)
    try {
      console.log(`[ACTIVITY] Fetching accepted faculty...`);
      let courseId = null;
      if (courseName) {
        const course = await Course.findOne({ 
          code: { $regex: new RegExp(`^${courseName}$`, "i") }
        });
        if (course) {
          courseId = course._id;
        }
      }

      const acceptedFaculty = await TempAccount.find({
        signUpStatus: "accepted_needs_completion",
        ...(courseId && { program: courseId })
      })
      .lean()
      .sort({ updatedAt: -1 });

      console.log(`[ACTIVITY] Found ${acceptedFaculty.length} accepted faculty records`);
      
      acceptedFaculty.forEach((faculty: any) => {
        // Use updatedAt when status changed to accepted, or dateSignedUp as fallback
        const acceptDate = (faculty.updatedAt && faculty.signUpStatus === 'accepted_needs_completion') 
          ? faculty.updatedAt 
          : faculty.dateSignedUp || new Date();
        
        allActivities.push({
          _id: `accept-${faculty._id}`,
          type: 'accept_faculty',
          action: 'Accepted pending faculty',
          performedBy: 'Program Chair', // TODO: Track who actually performed this
          targetUser: faculty.email,
          targetName: `${faculty.first_name || ''} ${faculty.last_name || ''}`.trim() || faculty.email,
          details: `Approved faculty member: ${faculty.email}`,
          timestamp: acceptDate,
          date: new Date(acceptDate).toISOString().split('T')[0],
        });
      });
      console.log(`[ACTIVITY] Added ${acceptedFaculty.length} accepted faculty activities`);
    } catch (err: any) {
      console.error("[ACTIVITY] Error fetching accepted faculty:", err.message || err);
    }

    // 2. Fetch created accounts (Users created by admin, not self-signup)
    try {
      console.log(`[ACTIVITY] Fetching created accounts...`);
      let courseId = null;
      if (courseName) {
        const course = await Course.findOne({ 
          code: { $regex: new RegExp(`^${courseName}$`, "i") }
        });
        if (course) {
          courseId = course._id;
        }
      }

      // Find users - sort by createdAt if available, otherwise by _id
      const users = await User.find({
        ...(courseId && { course: courseId }),
        role: { $in: ['instructor', 'programchairperson'] }
      })
      .sort({ createdAt: -1, _id: -1 })
      .lean();

      console.log(`[ACTIVITY] Found ${users.length} user accounts`);
      
      users.forEach((user: any) => {
        // Use createdAt if available, otherwise use _id timestamp for older records
        let createdDate: Date;
        if (user.createdAt) {
          createdDate = new Date(user.createdAt);
        } else if (user._id) {
          // For lean queries, _id is a string, need to convert to ObjectId to get timestamp
          try {
            const objectId = new mongoose.Types.ObjectId(user._id);
            createdDate = objectId.getTimestamp();
          } catch {
            createdDate = new Date();
          }
        } else {
          createdDate = new Date();
        }
        
        allActivities.push({
          _id: `create-${user._id}`,
          type: 'create_account',
          action: 'Created faculty account',
          performedBy: 'Program Chair', // TODO: Track who created this
          targetUser: user.email,
          targetName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
          details: `Account created for ${user.role || 'instructor'}`,
          timestamp: createdDate,
          date: createdDate.toISOString().split('T')[0],
        });
      });
      console.log(`[ACTIVITY] Added ${users.length} account creation activities`);
    } catch (err: any) {
      console.error("[ACTIVITY] Error fetching created accounts:", err.message || err);
    }

    // 3. Fetch added schedules from ActivityLog (to show all add activities, even if schedule was deleted)
    try {
      console.log(`[ACTIVITY] Fetching schedule creation activities...`);
      const scheduleAddLogs = await ActivityLog.find({
        type: 'add_schedule'
      })
      .sort({ createdAt: -1 })
      .lean();

      console.log(`[ACTIVITY] Found ${scheduleAddLogs.length} schedule creation activities`);
      
      scheduleAddLogs.forEach((log: any) => {
        allActivities.push({
          _id: `schedule-add-${log._id}`,
          type: 'add_schedule',
          action: log.action,
          performedBy: log.performedBy || 'Program Chair',
          targetName: log.targetName,
          details: log.details,
          timestamp: log.createdAt,
          date: new Date(log.createdAt).toISOString().split('T')[0],
        });
      });
      console.log(`[ACTIVITY] Added ${scheduleAddLogs.length} schedule creation activities`);
    } catch (err: any) {
      console.error("[ACTIVITY] Error fetching schedule creation activities:", err.message || err);
    }

    // 4. Fetch face registrations (Users with face images)
    try {
      console.log(`[ACTIVITY] Fetching face registrations...`);
      let courseId = null;
      if (courseName) {
        const course = await Course.findOne({ 
          code: { $regex: new RegExp(`^${courseName}$`, "i") }
        });
        if (course) {
          courseId = course._id;
        }
      }

      const users = await User.find({
        ...(courseId && { course: courseId }),
        $or: [
          { faceImagePath: { $exists: true, $nin: [null, ''] } },
          { faceImages: { $exists: true, $type: 'array', $ne: [] } }
        ]
      }).sort({ updatedAt: -1 });

      console.log(`[ACTIVITY] Found ${users.length} users with face images`);
      
      let faceRegistrationCount = 0;
      users.forEach((user: any) => {
        const hasFace = user.faceImagePath || 
                       (user.faceImages && Array.isArray(user.faceImages) && user.faceImages.length > 0);
        
        if (hasFace) {
          const faceDate = user.updatedAt || user.createdAt;
          const faceCount = user.faceImages?.length || (user.faceImagePath ? 1 : 0) || 1;
          
          allActivities.push({
            _id: `face-${user._id}`,
            type: 'register_face',
            action: 'Registered face',
            performedBy: 'Program Chair', // TODO: Track who registered this
            targetUser: user.email,
            targetName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
            details: `Face registered (${faceCount} photo${faceCount > 1 ? 's' : ''}) for attendance recognition`,
            timestamp: faceDate,
            date: new Date(faceDate).toISOString().split('T')[0],
          });
          faceRegistrationCount++;
        }
      });
      console.log(`[ACTIVITY] Added ${faceRegistrationCount} face registration activities`);
    } catch (err: any) {
      console.error("[ACTIVITY] Error fetching face registrations:", err.message || err);
    }

    // 5. Fetch added sections/blocks from ActivityLog (to show all add activities, even if section was deleted)
    try {
      console.log(`[ACTIVITY] Fetching section/block creation activities...`);
      const sectionAddLogs = await ActivityLog.find({
        type: 'add_section_block'
      })
      .sort({ createdAt: -1 })
      .lean();

      console.log(`[ACTIVITY] Found ${sectionAddLogs.length} section/block creation activities`);
      
      sectionAddLogs.forEach((log: any) => {
        allActivities.push({
          _id: `section-add-${log._id}`,
          type: 'add_section_block',
          action: log.action,
          performedBy: log.performedBy || 'Program Chair',
          targetName: log.targetName,
          details: log.details,
          timestamp: log.createdAt,
          date: new Date(log.createdAt).toISOString().split('T')[0],
        });
      });
      console.log(`[ACTIVITY] Added ${sectionAddLogs.length} section/block creation activities`);
    } catch (err: any) {
      console.error("[ACTIVITY] Error fetching section/block creation activities:", err.message || err);
    }

    // 6. Fetch added subjects from ActivityLog (to show all add activities, even if subject was deleted)
    try {
      console.log(`[ACTIVITY] Fetching subject creation activities...`);
      const subjectAddLogs = await ActivityLog.find({
        type: 'add_subject'
      })
      .sort({ createdAt: -1 })
      .lean();

      console.log(`[ACTIVITY] Found ${subjectAddLogs.length} subject creation activities`);
      
      subjectAddLogs.forEach((log: any) => {
        allActivities.push({
          _id: `subject-add-${log._id}`,
          type: 'add_subject',
          action: log.action,
          performedBy: log.performedBy || 'Program Chair',
          targetName: log.targetName,
          details: log.details,
          timestamp: log.createdAt,
          date: new Date(log.createdAt).toISOString().split('T')[0],
        });
      });
      console.log(`[ACTIVITY] Added ${subjectAddLogs.length} subject creation activities`);
    } catch (err: any) {
      console.error("[ACTIVITY] Error fetching subject creation activities:", err.message || err);
    }

    // 7. Fetch deletion activities from ActivityLog
    try {
      console.log(`[ACTIVITY] Fetching deletion activities...`);
      const deletionLogs = await ActivityLog.find({
        type: { $in: ['delete_account', 'delete_schedule', 'delete_section_block', 'delete_subject'] }
      })
      .sort({ createdAt: -1 })
      .lean();

      console.log(`[ACTIVITY] Found ${deletionLogs.length} deletion activities`);
      
      deletionLogs.forEach((log: any) => {
        allActivities.push({
          _id: `delete-${log._id}`,
          type: log.type,
          action: log.action,
          performedBy: log.performedBy || 'Program Chair',
          targetUser: log.targetUser,
          targetName: log.targetName,
          details: log.details,
          timestamp: log.createdAt,
          date: new Date(log.createdAt).toISOString().split('T')[0],
        });
      });
      console.log(`[ACTIVITY] Added ${deletionLogs.length} deletion activities`);
    } catch (err: any) {
      console.error("[ACTIVITY] Error fetching deletion activities:", err.message || err);
    }

    // 8. Fetch report generation activities from ActivityLog
    try {
      console.log(`[ACTIVITY] Fetching report generation activities...`);
      const reportLogs = await ActivityLog.find({
        type: 'generate_report'
      })
      .sort({ createdAt: -1 })
      .lean();

      console.log(`[ACTIVITY] Found ${reportLogs.length} report generation activities`);
      
      reportLogs.forEach((log: any) => {
        allActivities.push({
          _id: `report-${log._id}`,
          type: 'generate_report',
          action: log.action,
          performedBy: log.performedBy || 'Program Chair',
          targetName: log.targetName,
          details: log.details,
          timestamp: log.createdAt,
          date: new Date(log.createdAt).toISOString().split('T')[0],
        });
      });
      console.log(`[ACTIVITY] Added ${reportLogs.length} report generation activities`);
    } catch (err: any) {
      console.error("[ACTIVITY] Error fetching report generation activities:", err.message || err);
    }

    // Filter by role if specified
    let filteredActivities = allActivities;
    if (filterByRole) {
      // Normalize role names for comparison
      const normalizedRole = filterByRole.toLowerCase();
      filteredActivities = allActivities.filter((activity) => {
        const performedBy = String(activity.performedBy || '').toLowerCase();
        
        // Match "Program Chair" or "programchairperson" for Program Chair role
        if (normalizedRole === 'programchairperson' || normalizedRole === 'program chair') {
          // Program Chair should only see activities performed by Program Chair
          // Exclude activities performed by instructors/faculty (those should only be visible to Dean)
          const isProgramChair = performedBy.includes('program chair') || performedBy.includes('programchair');
          const isInstructor = performedBy.includes('instructor') || performedBy.includes('faculty');
          return isProgramChair && !isInstructor;
        }
        
        // Match "Dean" for Dean role - Dean can see all activities (Program Chair, Dean, and Faculty)
        if (normalizedRole === 'dean') {
          return performedBy.includes('dean') || 
                 performedBy.includes('program chair') || 
                 performedBy.includes('programchair') ||
                 performedBy.includes('instructor') ||
                 performedBy.includes('faculty');
        }
        
        // Default: exact match
        return performedBy.includes(normalizedRole);
      });
      console.log(`[ACTIVITY] Filtered by role "${filterByRole}": ${filteredActivities.length} of ${allActivities.length} activities`);
    }

    // Sort by timestamp (newest first)
    filteredActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    console.log(`[ACTIVITY] ✅ Total activities found: ${filteredActivities.length}`);
    console.log(`[ACTIVITY] Breakdown:`, {
      accept_faculty: filteredActivities.filter(a => a.type === 'accept_faculty').length,
      create_account: filteredActivities.filter(a => a.type === 'create_account').length,
      delete_account: filteredActivities.filter(a => a.type === 'delete_account').length,
      add_schedule: filteredActivities.filter(a => a.type === 'add_schedule').length,
      delete_schedule: filteredActivities.filter(a => a.type === 'delete_schedule').length,
      add_section_block: filteredActivities.filter(a => a.type === 'add_section_block').length,
      delete_section_block: filteredActivities.filter(a => a.type === 'delete_section_block').length,
      add_subject: filteredActivities.filter(a => a.type === 'add_subject').length,
      delete_subject: filteredActivities.filter(a => a.type === 'delete_subject').length,
      register_face: filteredActivities.filter(a => a.type === 'register_face').length,
      generate_report: filteredActivities.filter(a => a.type === 'generate_report').length,
    });

    res.json({
      success: true,
      count: filteredActivities.length,
      activities: filteredActivities
    });
  } catch (error: any) {
    console.error("[ACTIVITY] ❌ Error fetching system activities:", error.message || error);
    res.status(500).json({
      success: false,
      message: "Error fetching system activities",
      error: error.message
    });
  }
});

export default router;
