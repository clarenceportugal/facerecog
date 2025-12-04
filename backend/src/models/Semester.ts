import mongoose, { Schema, Document } from 'mongoose';

export interface ISemester extends Document {
  semesterName: '1ST' | '2ND' | 'MIDYEAR';
  academicYear: string;
  startDate?: Date;
  endDate?: Date;
  isActive?: boolean;
}

const SemesterSchema: Schema = new Schema(
  {
    semesterName: {
      type: String,
      required: true,
      enum: ['1ST', '2ND', 'MIDYEAR'],
      trim: true,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      match: [/^\d{4}-\d{4}$/, 'Academic year must be in the format YYYY-YYYY'],
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
  },
);

export default mongoose.model<ISemester>('Semester', SemesterSchema);
