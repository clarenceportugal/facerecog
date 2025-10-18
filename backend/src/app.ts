import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import authRoutes from './routes/authRoutes';
import facultyRoutes from './routes/facultyRoutes';
import deanRoutes from './routes/deanRoutes';
import superadminRoutes from './routes/superadminRoutes';
import loginSignupRoutes from './routes/loginSignupRoutes';
import accountCompletion from './routes/accountCompletion';
import faceRoutes from './routes/faceRoutes';



dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eduvision';
mongoose.connect(MONGO_URI).then(() => {
  console.log('Connected to MongoDB');
});

app.use('/api/auth', authRoutes);
app.use('/api/auth', facultyRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/auth', deanRoutes);
app.use('/api/loginsignup', loginSignupRoutes);
app.use('/api/accountcompletion', accountCompletion);
app.use('/api/face', faceRoutes);

app.use((err: any, req: any, res: any, next: any) => {
  console.error("Global error handler:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});


export default app;