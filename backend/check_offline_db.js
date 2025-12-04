// Quick script to check offline database contents
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'offline_data.db');

try {
  const db = new Database(dbPath, { readonly: true });
  
  console.log('\n' + '='.repeat(70));
  console.log('OFFLINE DATABASE CHECK');
  console.log('='.repeat(70));
  console.log('Database path:', dbPath);
  console.log('Database exists: YES');
  console.log('='.repeat(70));
  
  // Check users table
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  console.log(`\n📊 USERS: ${userCount.count} records`);
  
  if (userCount.count > 0) {
    const users = db.prepare('SELECT id, first_name, last_name, email, role FROM users LIMIT 5').all();
    console.log('Sample users:');
    users.forEach(u => {
      console.log(`  - ${u.first_name} ${u.last_name} (${u.role}) [${u.id.substring(0, 8)}...]`);
    });
  }
  
  // Check colleges
  const collegeCount = db.prepare('SELECT COUNT(*) as count FROM colleges').get();
  console.log(`\n📊 COLLEGES: ${collegeCount.count} records`);
  
  // Check courses
  const courseCount = db.prepare('SELECT COUNT(*) as count FROM courses').get();
  console.log(`📊 COURSES: ${courseCount.count} records`);
  
  // Check schedules
  const scheduleCount = db.prepare('SELECT COUNT(*) as count FROM schedules').get();
  console.log(`📊 SCHEDULES: ${scheduleCount.count} records`);
  
  // Check logs
  const logCount = db.prepare('SELECT COUNT(*) as count FROM attendance_logs').get();
  console.log(`📊 LOGS: ${logCount.count} records`);
  
  console.log('\n' + '='.repeat(70));
  
  if (userCount.count === 0) {
    console.log('⚠️  WARNING: Offline database is EMPTY!');
    console.log('You need to sync data from MongoDB first.');
    console.log('Run: POST http://localhost:5000/api/system/sync-to-offline');
  } else {
    console.log('✅ Offline database contains data');
  }
  console.log('='.repeat(70) + '\n');
  
  db.close();
} catch (error) {
  console.error('Error checking database:', error);
}

