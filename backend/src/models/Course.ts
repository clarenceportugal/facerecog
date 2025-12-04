import mongoose, { Schema, Document } from 'mongoose';

export interface ICourse extends Document {
  code: string;
  name: string;
  college: mongoose.Types.ObjectId;
}

const CourseSchema: Schema = new Schema({
  code: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  college: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "College",
    required: true,
  },
});

export default mongoose.model<ICourse>('Course', CourseSchema);
