// Sync database with correct college and course data
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eduvision';

const CourseSchema = new mongoose.Schema({}, { strict: false });
const CollegeSchema = new mongoose.Schema({}, { strict: false });

const Course = mongoose.model('Course', CourseSchema);
const College = mongoose.model('College', CollegeSchema);

const colleges = [
  {
    _id: '67ff627e2fb6583dc49dccef',
    code: 'CCMS',
    name: 'College of Computing and Multimedia Studies'
  },
  {
    _id: '67ff627e2fb6583dc49dccf0',
    code: 'CBPA',
    name: 'College of Business and Public Administration'
  },
  {
    _id: '67ff627e2fb6583dc49dccf1',
    code: 'CAS',
    name: 'College of Arts and Sciences'
  },
  {
    _id: '67ff627e2fb6583dc49dccf2',
    code: 'COENG',
    name: 'College of Engineering'
  }
];

const courses = [
  {
    _id: '6806257d3332924ca6ecbcd3',
    code: 'bsit',
    name: 'Bachelor of Science in Information Technology',
    college: '67ff627e2fb6583dc49dccef' // CCMS
  },
  {
    _id: '6806257d3332924ca6ecbcd4',
    code: 'bsis',
    name: 'Bachelor of Science in Information System',
    college: '67ff627e2fb6583dc49dccef' // CCMS
  }
];

async function syncDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB Connected!');
    
    // Sync colleges
    console.log('\n📝 Syncing colleges...');
    for (const collegeData of colleges) {
      try {
        const existing = await College.findById(collegeData._id);
        if (existing) {
          existing.code = collegeData.code;
          existing.name = collegeData.name;
          await existing.save();
          console.log(`✅ Updated college: ${collegeData.code} - ${collegeData.name}`);
        } else {
          const college = new College({
            _id: new mongoose.Types.ObjectId(collegeData._id),
            code: collegeData.code,
            name: collegeData.name
          });
          await college.save();
          console.log(`✅ Added college: ${collegeData.code} - ${collegeData.name}`);
        }
      } catch (error) {
        console.error(`❌ Error with college ${collegeData.code}:`, error.message);
      }
    }
    
    // Sync courses
    console.log('\n📝 Syncing courses...');
    for (const courseData of courses) {
      try {
        let course = await Course.findById(courseData._id);
        if (course) {
          course.code = courseData.code;
          course.name = courseData.name;
          course.college = new mongoose.Types.ObjectId(courseData.college);
          await course.save();
          console.log(`✅ Updated course: ${courseData.code} - ${courseData.name}`);
        } else {
          course = new Course({
            _id: new mongoose.Types.ObjectId(courseData._id),
            code: courseData.code,
            name: courseData.name,
            college: new mongoose.Types.ObjectId(courseData.college)
          });
          await course.save();
          console.log(`✅ Added course: ${courseData.code} - ${courseData.name}`);
        }
      } catch (error) {
        console.error(`❌ Error with course ${courseData.code}:`, error.message);
      }
    }
    
    // Verify
    console.log('\n📋 Verification:');
    const allColleges = await College.find().lean();
    console.log(`Colleges: ${allColleges.length}`);
    
    const allCourses = await Course.find().lean();
    console.log(`Courses: ${allCourses.length}`);
    
    await mongoose.connection.close();
    console.log('\n✅ Database sync complete!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

syncDatabase();

