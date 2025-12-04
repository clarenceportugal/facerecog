import User, { IUser } from '../models/User';
import bcrypt from 'bcryptjs';

const initializeAdmin = async () => {
  try {
    console.log('Checking for super admin in faculty collection...');

    const superadminExists = await User.findOne({ role: 'superadmin' });

    if (!superadminExists) {
      console.log('No super admin found. Creating default super admin account...');

      const hashedPassword = await bcrypt.hash(process.env.DEFAULT_ADMIN_PASSWORD!, 10);
      const admin: IUser = new User({
        first_name: process.env.DEFAULT_ADMIN_FIRST_NAME,
        middle_name: process.env.DEFAULT_ADMIN_MIDDLE_NAME,
        last_name: process.env.DEFAULT_ADMIN_LAST_NAME,
        username: process.env.DEFAULT_ADMIN_USERNAME!,
        email: process.env.DEFAULT_ADMIN_EMAIL!,
        password: hashedPassword,
        role: 'superadmin',
        status: process.env.DEFAULT_ADMIN_STATUS,
        // college is optional for superadmin - don't set it or set to undefined
      });

      await admin.save();
      console.log('Default super admin account created successfully in the faculty collection.');
    } else {
      console.log('Super Admin account already exists in the faculty collection:', superadminExists);
    }
  } catch (error) {
    console.error('Error initializing super admin account:', error);
  }
};

export default initializeAdmin;