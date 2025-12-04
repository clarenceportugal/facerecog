import mongoose, { Document, Schema } from "mongoose";

export interface ILab extends Document {
  name: string;
  location?: string;
}

const LabSchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
  location: { type: String },
});

export default mongoose.model<ILab>("Lab", LabSchema);
