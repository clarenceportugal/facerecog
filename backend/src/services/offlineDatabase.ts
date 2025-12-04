/**
 * Offline SQLite Database Service
 * Provides local storage for all data when running in offline mode
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database file path
const DB_PATH = path.join(__dirname, '../../offline_data.db');

let db: Database.Database | null = null;

/**
 * Initialize the SQLite database with all required tables
 */
export function initOfflineDatabase(): Database.Database {
  if (db) return db;
  
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL'); // Better performance
  
  // Create Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      middle_name TEXT DEFAULT '',
      last_name TEXT NOT NULL,
      ext_name TEXT DEFAULT '',
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      gender TEXT DEFAULT '',
      birthdate TEXT,
      highest_educational_attainment TEXT DEFAULT '',
      academic_rank TEXT DEFAULT '',
      status_of_appointment TEXT DEFAULT '',
      number_of_prep INTEGER DEFAULT 0,
      total_teaching_load INTEGER DEFAULT 0,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      college_id TEXT,
      course_id TEXT,
      status TEXT DEFAULT 'forverification',
      profile_photo_url TEXT DEFAULT '',
      face_image_path TEXT DEFAULT '',
      face_images TEXT DEFAULT '[]',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create Colleges table
  db.exec(`
    CREATE TABLE IF NOT EXISTS colleges (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create Courses table
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      college_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (college_id) REFERENCES colleges(id)
    )
  `);
  
  // Create Sections table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      college_id TEXT NOT NULL,
      course TEXT NOT NULL,
      section TEXT NOT NULL,
      block TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (college_id) REFERENCES colleges(id)
    )
  `);
  
  // Create Rooms/Labs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      location TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create Schedules table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      course_title TEXT NOT NULL,
      course_code TEXT NOT NULL,
      instructor_id TEXT NOT NULL,
      room TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      semester_start_date TEXT NOT NULL,
      semester_end_date TEXT NOT NULL,
      section_id TEXT NOT NULL,
      days TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (instructor_id) REFERENCES users(id),
      FOREIGN KEY (section_id) REFERENCES sections(id)
    )
  `);
  
  // Create Attendance Logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance_logs (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      time_in TEXT,
      time_out TEXT,
      remarks TEXT,
      college_id TEXT,
      course TEXT NOT NULL,
      synced INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    )
  `);
  
  // Create Semesters table (or migrate old schema)
  // Check if semesters table exists with old unique constraint and needs migration
  const tableInfo = db.prepare("PRAGMA table_info(semesters)").all();
  if (tableInfo.length > 0) {
    // Table exists - check if we need to migrate (recreate with correct unique constraint)
    try {
      // Try to insert a test to see if the new unique constraint works
      // If the old unique constraint is on academic_year only, this migration is needed
      db.exec(`
        CREATE TABLE IF NOT EXISTS semesters_new (
          id TEXT PRIMARY KEY,
          semester_name TEXT NOT NULL,
          academic_year TEXT NOT NULL,
          start_date TEXT,
          end_date TEXT,
          is_active INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(semester_name, academic_year)
        )
      `);
      // Copy data from old table to new table
      db.exec(`INSERT OR IGNORE INTO semesters_new SELECT * FROM semesters`);
      // Drop old table and rename new one
      db.exec(`DROP TABLE semesters`);
      db.exec(`ALTER TABLE semesters_new RENAME TO semesters`);
      console.log('[OFFLINE DB] Migrated semesters table to new schema');
    } catch (migrationError) {
      // Migration might fail if already done, ignore
    }
  } else {
    // Create new table
    db.exec(`
      CREATE TABLE IF NOT EXISTS semesters (
        id TEXT PRIMARY KEY,
        semester_name TEXT NOT NULL,
        academic_year TEXT NOT NULL,
        start_date TEXT,
        end_date TEXT,
        is_active INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(semester_name, academic_year)
      )
    `);
  }
  
  // Create indexes for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_college ON users(college_id);
    CREATE INDEX IF NOT EXISTS idx_users_course ON users(course_id);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_schedules_instructor ON schedules(instructor_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_room ON schedules(room);
    CREATE INDEX IF NOT EXISTS idx_logs_schedule ON attendance_logs(schedule_id);
    CREATE INDEX IF NOT EXISTS idx_logs_date ON attendance_logs(date);
    CREATE INDEX IF NOT EXISTS idx_logs_synced ON attendance_logs(synced);
  `);
  
  // Seed default semesters if none exist
  seedDefaultSemesters(db);
  
  console.log('[OFFLINE DB] SQLite database initialized at:', DB_PATH);
  return db;
}

/**
 * Seed default semesters for current and upcoming academic years
 */
function seedDefaultSemesters(database: Database.Database): void {
  const countStmt = database.prepare('SELECT COUNT(*) as count FROM semesters');
  const count = (countStmt.get() as any).count;
  
  if (count > 0) {
    return; // Semesters already exist, don't seed
  }
  
  const currentYear = new Date().getFullYear();
  const defaultSemesters = [
    // Current academic year
    {
      id: generateId(),
      semester_name: '1st Semester',
      academic_year: `${currentYear}-${currentYear + 1}`,
      start_date: `${currentYear}-08-01`,
      end_date: `${currentYear}-12-31`,
      is_active: 1
    },
    {
      id: generateId(),
      semester_name: '2nd Semester',
      academic_year: `${currentYear}-${currentYear + 1}`,
      start_date: `${currentYear + 1}-01-01`,
      end_date: `${currentYear + 1}-05-31`,
      is_active: 0
    },
    // Previous academic year
    {
      id: generateId(),
      semester_name: '1st Semester',
      academic_year: `${currentYear - 1}-${currentYear}`,
      start_date: `${currentYear - 1}-08-01`,
      end_date: `${currentYear - 1}-12-31`,
      is_active: 0
    },
    {
      id: generateId(),
      semester_name: '2nd Semester',
      academic_year: `${currentYear - 1}-${currentYear}`,
      start_date: `${currentYear}-01-01`,
      end_date: `${currentYear}-05-31`,
      is_active: 0
    },
    // Next academic year
    {
      id: generateId(),
      semester_name: '1st Semester',
      academic_year: `${currentYear + 1}-${currentYear + 2}`,
      start_date: `${currentYear + 1}-08-01`,
      end_date: `${currentYear + 1}-12-31`,
      is_active: 0
    },
    {
      id: generateId(),
      semester_name: '2nd Semester',
      academic_year: `${currentYear + 1}-${currentYear + 2}`,
      start_date: `${currentYear + 2}-01-01`,
      end_date: `${currentYear + 2}-05-31`,
      is_active: 0
    }
  ];
  
  const insertStmt = database.prepare(`
    INSERT OR IGNORE INTO semesters (id, semester_name, academic_year, start_date, end_date, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  for (const semester of defaultSemesters) {
    try {
      insertStmt.run(
        semester.id,
        semester.semester_name,
        semester.academic_year,
        semester.start_date,
        semester.end_date,
        semester.is_active
      );
    } catch (error) {
      // Ignore duplicate errors (academic_year is unique)
    }
  }
  
  console.log('[OFFLINE DB] Seeded default semesters for academic years:', 
    `${currentYear - 1}-${currentYear}`, 
    `${currentYear}-${currentYear + 1}`,
    `${currentYear + 1}-${currentYear + 2}`
  );
}

/**
 * Get database instance
 */
export function getDb(): Database.Database {
  if (!db) {
    return initOfflineDatabase();
  }
  return db;
}

/**
 * Generate a unique ID (similar to MongoDB ObjectId)
 */
export function generateId(): string {
  const timestamp = Math.floor(Date.now() / 1000).toString(16);
  const random = Math.random().toString(16).substring(2, 18);
  return (timestamp + random).substring(0, 24);
}

// ============================================
// USER OPERATIONS
// ============================================

export interface OfflineUser {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  username: string;
  email: string;
  gender?: string;
  birthdate?: string;
  highest_educational_attainment?: string;
  academic_rank?: string;
  status_of_appointment?: string;
  number_of_prep?: number;
  total_teaching_load?: number;
  password: string;
  role: string;
  college_id?: string;
  course_id?: string;
  status: string;
  profile_photo_url?: string;
  face_image_path?: string;
  face_images?: string;
}

export function createUser(user: Omit<OfflineUser, 'id'>): OfflineUser {
  const db = getDb();
  const id = generateId();
  
  const stmt = db.prepare(`
    INSERT INTO users (id, first_name, middle_name, last_name, ext_name, username, email, 
      gender, birthdate, highest_educational_attainment, academic_rank, status_of_appointment,
      number_of_prep, total_teaching_load, password, role, college_id, course_id, status,
      profile_photo_url, face_image_path, face_images)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    id, user.first_name, user.middle_name || '', user.last_name, user.ext_name || '',
    user.username, user.email, user.gender || '', user.birthdate || null,
    user.highest_educational_attainment || '', user.academic_rank || '',
    user.status_of_appointment || '', user.number_of_prep || 0, user.total_teaching_load || 0,
    user.password, user.role, user.college_id || null, user.course_id || null,
    user.status || 'forverification', user.profile_photo_url || '', user.face_image_path || '',
    user.face_images || '[]'
  );
  
  return { id, ...user };
}

export function getUserById(id: string): OfflineUser | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const row = stmt.get(id) as any;
  return row ? mapRowToUser(row) : null;
}

export function getUserByUsername(username: string): OfflineUser | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  const row = stmt.get(username) as any;
  return row ? mapRowToUser(row) : null;
}

export function getUserByEmail(email: string): OfflineUser | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  const row = stmt.get(email) as any;
  return row ? mapRowToUser(row) : null;
}

export function getUsersByRole(role: string): OfflineUser[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users WHERE role = ?');
  const rows = stmt.all(role) as any[];
  return rows.map(mapRowToUser);
}

export function getUsersByCollege(collegeId: string): OfflineUser[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users WHERE college_id = ?');
  const rows = stmt.all(collegeId) as any[];
  return rows.map(mapRowToUser);
}

export function getUsersByCourse(courseId: string): OfflineUser[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users WHERE course_id = ?');
  const rows = stmt.all(courseId) as any[];
  console.log(`[OFFLINE DB] getUsersByCourse(${courseId}) - Found ${rows.length} users`);
  if (rows.length > 0) {
    console.log(`[OFFLINE DB] User IDs:`, rows.map(r => `${r.first_name} ${r.last_name} (${r.id})`));
  }
  return rows.map(mapRowToUser);
}

export function getUsersByStatus(status: string): OfflineUser[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users WHERE status = ?');
  const rows = stmt.all(status) as any[];
  return rows.map(mapRowToUser);
}

export function getAllUsers(): OfflineUser[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users');
  const rows = stmt.all() as any[];
  return rows.map(mapRowToUser);
}

export function updateUser(id: string, updates: Partial<OfflineUser>): boolean {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  
  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'id' && value !== undefined) {
      fields.push(`${camelToSnake(key)} = ?`);
      values.push(value);
    }
  });
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

export function deleteUser(id: string): boolean {
  const db = getDb();
  
  // Check if user exists before deletion
  const checkStmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const userBefore = checkStmt.get(id);
  console.log(`[OFFLINE DB] User before deletion:`, userBefore ? 'EXISTS' : 'NOT FOUND');
  
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  const result = stmt.run(id);
  
  console.log(`[OFFLINE DB] Delete result - changes: ${result.changes}, id: ${id}`);
  
  // Verify deletion
  const userAfter = checkStmt.get(id);
  console.log(`[OFFLINE DB] User after deletion:`, userAfter ? 'STILL EXISTS (ERROR!)' : 'DELETED SUCCESSFULLY');
  
  // Force checkpoint to ensure WAL is flushed
  db.pragma('wal_checkpoint(FULL)');
  
  return result.changes > 0;
}

function mapRowToUser(row: any): OfflineUser {
  return {
    id: row.id,
    first_name: row.first_name,
    middle_name: row.middle_name,
    last_name: row.last_name,
    ext_name: row.ext_name,
    username: row.username,
    email: row.email,
    gender: row.gender,
    birthdate: row.birthdate,
    highest_educational_attainment: row.highest_educational_attainment,
    academic_rank: row.academic_rank,
    status_of_appointment: row.status_of_appointment,
    number_of_prep: row.number_of_prep,
    total_teaching_load: row.total_teaching_load,
    password: row.password,
    role: row.role,
    college_id: row.college_id,
    course_id: row.course_id,
    status: row.status,
    profile_photo_url: row.profile_photo_url,
    face_image_path: row.face_image_path,
    face_images: row.face_images
  };
}

// ============================================
// COLLEGE OPERATIONS
// ============================================

export interface OfflineCollege {
  id: string;
  code: string;
  name: string;
}

export function createCollege(college: Omit<OfflineCollege, 'id'>): OfflineCollege {
  const db = getDb();
  const id = generateId();
  const stmt = db.prepare('INSERT INTO colleges (id, code, name) VALUES (?, ?, ?)');
  stmt.run(id, college.code, college.name);
  return { id, ...college };
}

export function getCollegeById(id: string): OfflineCollege | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM colleges WHERE id = ?');
  const row = stmt.get(id) as any;
  return row ? { id: row.id, code: row.code, name: row.name } : null;
}

export function getCollegeByCode(code: string): OfflineCollege | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM colleges WHERE code = ?');
  const row = stmt.get(code) as any;
  return row ? { id: row.id, code: row.code, name: row.name } : null;
}

export function getAllColleges(): OfflineCollege[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM colleges');
  const rows = stmt.all() as any[];
  return rows.map(row => ({ id: row.id, code: row.code, name: row.name }));
}

export function updateCollege(id: string, updates: Partial<OfflineCollege>): boolean {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.code) { fields.push('code = ?'); values.push(updates.code); }
  if (updates.name) { fields.push('name = ?'); values.push(updates.name); }
  
  if (fields.length === 0) return false;
  values.push(id);
  
  const stmt = db.prepare(`UPDATE colleges SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

export function deleteCollege(id: string): boolean {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM colleges WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ============================================
// COURSE OPERATIONS
// ============================================

export interface OfflineCourse {
  id: string;
  code: string;
  name: string;
  college_id: string;
}

export function createCourse(course: Omit<OfflineCourse, 'id'>): OfflineCourse {
  const db = getDb();
  const id = generateId();
  const stmt = db.prepare('INSERT INTO courses (id, code, name, college_id) VALUES (?, ?, ?, ?)');
  stmt.run(id, course.code, course.name, course.college_id);
  return { id, ...course };
}

export function getCourseById(id: string): OfflineCourse | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM courses WHERE id = ?');
  const row = stmt.get(id) as any;
  return row ? { id: row.id, code: row.code, name: row.name, college_id: row.college_id } : null;
}

export function getCourseByCode(code: string): OfflineCourse | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM courses WHERE code = ?');
  const row = stmt.get(code) as any;
  return row ? { id: row.id, code: row.code, name: row.name, college_id: row.college_id } : null;
}

export function getCoursesByCollege(collegeId: string): OfflineCourse[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM courses WHERE college_id = ?');
  const rows = stmt.all(collegeId) as any[];
  return rows.map(row => ({ id: row.id, code: row.code, name: row.name, college_id: row.college_id }));
}

export function getAllCourses(): OfflineCourse[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM courses');
  const rows = stmt.all() as any[];
  return rows.map(row => ({ id: row.id, code: row.code, name: row.name, college_id: row.college_id }));
}

// ============================================
// SCHEDULE OPERATIONS
// ============================================

export interface OfflineSchedule {
  id: string;
  course_title: string;
  course_code: string;
  instructor_id: string;
  room: string;
  start_time: string;
  end_time: string;
  semester_start_date: string;
  semester_end_date: string;
  section_id: string;
  days: string; // JSON string
}

export function createSchedule(schedule: Omit<OfflineSchedule, 'id'>): OfflineSchedule {
  const db = getDb();
  const id = generateId();
  const stmt = db.prepare(`
    INSERT INTO schedules (id, course_title, course_code, instructor_id, room, start_time, 
      end_time, semester_start_date, semester_end_date, section_id, days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, schedule.course_title, schedule.course_code, schedule.instructor_id,
    schedule.room, schedule.start_time, schedule.end_time, schedule.semester_start_date,
    schedule.semester_end_date, schedule.section_id, schedule.days);
  return { id, ...schedule };
}

export function getScheduleById(id: string): OfflineSchedule | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM schedules WHERE id = ?');
  const row = stmt.get(id) as any;
  return row ? mapRowToSchedule(row) : null;
}

export function getSchedulesByInstructor(instructorId: string): OfflineSchedule[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM schedules WHERE instructor_id = ?');
  const rows = stmt.all(instructorId) as any[];
  return rows.map(mapRowToSchedule);
}

export function getSchedulesByRoom(room: string): OfflineSchedule[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM schedules WHERE room = ?');
  const rows = stmt.all(room) as any[];
  return rows.map(mapRowToSchedule);
}

export function getAllSchedules(): OfflineSchedule[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM schedules');
  const rows = stmt.all() as any[];
  return rows.map(mapRowToSchedule);
}

export function updateSchedule(id: string, updates: Partial<OfflineSchedule>): boolean {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  
  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'id' && value !== undefined) {
      fields.push(`${camelToSnake(key)} = ?`);
      values.push(value);
    }
  });
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  const stmt = db.prepare(`UPDATE schedules SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

export function deleteSchedule(id: string): boolean {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM schedules WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

function mapRowToSchedule(row: any): OfflineSchedule {
  return {
    id: row.id,
    course_title: row.course_title,
    course_code: row.course_code,
    instructor_id: row.instructor_id,
    room: row.room,
    start_time: row.start_time,
    end_time: row.end_time,
    semester_start_date: row.semester_start_date,
    semester_end_date: row.semester_end_date,
    section_id: row.section_id,
    days: row.days
  };
}

// ============================================
// ATTENDANCE LOG OPERATIONS
// ============================================

export interface OfflineLog {
  id: string;
  schedule_id: string;
  date: string;
  status: string;
  time_in?: string;
  time_out?: string;
  remarks?: string;
  college_id?: string;
  course: string;
  synced: number;
}

export function createLog(log: Omit<OfflineLog, 'id' | 'synced'>): OfflineLog {
  const db = getDb();
  const id = generateId();
  const stmt = db.prepare(`
    INSERT INTO attendance_logs (id, schedule_id, date, status, time_in, time_out, remarks, college_id, course, synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
  stmt.run(id, log.schedule_id, log.date, log.status, log.time_in || null, 
    log.time_out || null, log.remarks || '', log.college_id || null, log.course);
  return { id, ...log, synced: 0 };
}

export function getLogById(id: string): OfflineLog | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM attendance_logs WHERE id = ?');
  const row = stmt.get(id) as any;
  return row ? mapRowToLog(row) : null;
}

export function getLogsBySchedule(scheduleId: string): OfflineLog[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM attendance_logs WHERE schedule_id = ?');
  const rows = stmt.all(scheduleId) as any[];
  return rows.map(mapRowToLog);
}

export function getLogsByDate(date: string): OfflineLog[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM attendance_logs WHERE date = ?');
  const rows = stmt.all(date) as any[];
  return rows.map(mapRowToLog);
}

export function getLogsByScheduleAndDate(scheduleId: string, date: string): OfflineLog | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM attendance_logs WHERE schedule_id = ? AND date = ?');
  const row = stmt.get(scheduleId, date) as any;
  return row ? mapRowToLog(row) : null;
}

export function getAllLogs(): OfflineLog[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM attendance_logs ORDER BY date DESC, time_in DESC');
  const rows = stmt.all() as any[];
  return rows.map(mapRowToLog);
}

export function getUnsyncedLogs(): OfflineLog[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM attendance_logs WHERE synced = 0');
  const rows = stmt.all() as any[];
  return rows.map(mapRowToLog);
}

export function updateLog(id: string, updates: Partial<OfflineLog>): boolean {
  const db = getDb();
  const fields: string[] = [];
  const values: any[] = [];
  
  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'id' && value !== undefined) {
      fields.push(`${camelToSnake(key)} = ?`);
      values.push(value);
    }
  });
  
  if (fields.length === 0) return false;
  values.push(id);
  
  const stmt = db.prepare(`UPDATE attendance_logs SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

export function markLogSynced(id: string): boolean {
  const db = getDb();
  const stmt = db.prepare('UPDATE attendance_logs SET synced = 1 WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

function mapRowToLog(row: any): OfflineLog {
  return {
    id: row.id,
    schedule_id: row.schedule_id,
    date: row.date,
    status: row.status,
    time_in: row.time_in,
    time_out: row.time_out,
    remarks: row.remarks,
    college_id: row.college_id,
    course: row.course,
    synced: row.synced
  };
}

// ============================================
// SECTION OPERATIONS
// ============================================

export interface OfflineSection {
  id: string;
  college_id: string;
  course: string;
  section: string;
  block: string;
}

export function createSection(section: Omit<OfflineSection, 'id'>): OfflineSection {
  const db = getDb();
  const id = generateId();
  const stmt = db.prepare('INSERT INTO sections (id, college_id, course, section, block) VALUES (?, ?, ?, ?, ?)');
  stmt.run(id, section.college_id, section.course, section.section, section.block);
  return { id, ...section };
}

export function getSectionById(id: string): OfflineSection | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM sections WHERE id = ?');
  const row = stmt.get(id) as any;
  return row ? { id: row.id, college_id: row.college_id, course: row.course, section: row.section, block: row.block } : null;
}

export function getSectionsByCollege(collegeId: string): OfflineSection[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM sections WHERE college_id = ?');
  const rows = stmt.all(collegeId) as any[];
  return rows.map(row => ({ id: row.id, college_id: row.college_id, course: row.course, section: row.section, block: row.block }));
}

export function getAllSections(): OfflineSection[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM sections');
  const rows = stmt.all() as any[];
  return rows.map(row => ({ id: row.id, college_id: row.college_id, course: row.course, section: row.section, block: row.block }));
}

// ============================================
// ROOM OPERATIONS
// ============================================

export interface OfflineRoom {
  id: string;
  name: string;
  location?: string;
}

export function createRoom(room: Omit<OfflineRoom, 'id'>): OfflineRoom {
  const db = getDb();
  const id = generateId();
  const stmt = db.prepare('INSERT INTO rooms (id, name, location) VALUES (?, ?, ?)');
  stmt.run(id, room.name, room.location || null);
  return { id, ...room };
}

export function getRoomById(id: string): OfflineRoom | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM rooms WHERE id = ?');
  const row = stmt.get(id) as any;
  return row ? { id: row.id, name: row.name, location: row.location } : null;
}

export function getRoomByName(name: string): OfflineRoom | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM rooms WHERE name = ?');
  const row = stmt.get(name) as any;
  return row ? { id: row.id, name: row.name, location: row.location } : null;
}

export function getAllRooms(): OfflineRoom[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM rooms');
  const rows = stmt.all() as any[];
  return rows.map(row => ({ id: row.id, name: row.name, location: row.location }));
}

// ============================================
// SEMESTER OPERATIONS
// ============================================

export interface OfflineSemester {
  id: string;
  semester_name: string;
  academic_year: string;
  start_date?: string;
  end_date?: string;
  is_active?: number;
}

export function createSemester(semester: Omit<OfflineSemester, 'id'>): OfflineSemester {
  const db = getDb();
  const id = generateId();
  const stmt = db.prepare(`
    INSERT INTO semesters (id, semester_name, academic_year, start_date, end_date, is_active) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id, 
    semester.semester_name, 
    semester.academic_year, 
    semester.start_date || null, 
    semester.end_date || null, 
    semester.is_active || 0
  );
  return { id, ...semester };
}

export function getAllSemesters(): OfflineSemester[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM semesters ORDER BY start_date ASC');
  const rows = stmt.all() as any[];
  return rows.map(row => ({
    id: row.id,
    semester_name: row.semester_name,
    academic_year: row.academic_year,
    start_date: row.start_date,
    end_date: row.end_date,
    is_active: row.is_active
  }));
}

export function getSemesterById(id: string): OfflineSemester | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM semesters WHERE id = ?');
  const row = stmt.get(id) as any;
  return row ? {
    id: row.id,
    semester_name: row.semester_name,
    academic_year: row.academic_year,
    start_date: row.start_date,
    end_date: row.end_date,
    is_active: row.is_active
  } : null;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Get database statistics
 */
export function getDbStats(): { [key: string]: number } {
  const db = getDb();
  return {
    users: (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count,
    colleges: (db.prepare('SELECT COUNT(*) as count FROM colleges').get() as any).count,
    courses: (db.prepare('SELECT COUNT(*) as count FROM courses').get() as any).count,
    schedules: (db.prepare('SELECT COUNT(*) as count FROM schedules').get() as any).count,
    logs: (db.prepare('SELECT COUNT(*) as count FROM attendance_logs').get() as any).count,
    sections: (db.prepare('SELECT COUNT(*) as count FROM sections').get() as any).count,
    rooms: (db.prepare('SELECT COUNT(*) as count FROM rooms').get() as any).count,
    semesters: (db.prepare('SELECT COUNT(*) as count FROM semesters').get() as any).count
  };
}

/**
 * Close database connection
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Initialize on import if in offline mode
import { isOfflineMode } from '../utils/systemMode';
if (isOfflineMode()) {
  initOfflineDatabase();
}

