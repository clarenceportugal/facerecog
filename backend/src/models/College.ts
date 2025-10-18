import mongoose, { Schema, Document } from 'mongoose';

export interface ICollege extends Document {
  code: string;
  name: string;
}

const CollegeSchema: Schema = new Schema({
  code: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
});

export default mongoose.model<ICollege>('College', CollegeSchema);
