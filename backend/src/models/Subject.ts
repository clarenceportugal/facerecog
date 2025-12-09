import mongoose, { Schema, Document } from 'mongoose';

export interface ISubject extends Document {
  courseTitle: string;
  courseCode: string;
}

const SubjectSchema: Schema = new Schema({
  courseTitle: {
    type: String,
    required: true,
    trim: true
  },
  courseCode: {
    type: String,
    required: true,
    trim: true,
    unique: true
  }
}, {
  timestamps: true, // Enable createdAt and updatedAt
});

export default mongoose.model<ISubject>('Subject', SubjectSchema);
