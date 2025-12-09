import mongoose, { Document, Schema } from "mongoose";

export interface ILog extends Document {
  schedule: mongoose.Types.ObjectId | null;
  date: string;
  status: "present" | "late" | "absent" | "excuse" | "Returned" | "Left early" | "no schedule";
  timeIn?: string;
  timeout?: string;
  remarks: string;
  college: mongoose.Types.ObjectId;
  course: string;
  instructorName?: string; // For no-schedule logs
  room?: string; // For no-schedule logs (e.g., "lab1", "lab2")
  isNoSchedule?: boolean; // Flag to identify no-schedule logs
}

const LogSchema: Schema = new Schema({
  schedule: { type: mongoose.Schema.Types.ObjectId, ref: "Schedule", required: false, default: null },
  date: { type: String, required: true },
  status: {
    type: String,
    enum: ["present", "late", "absent", "excuse", "Returned", "Left early", "no schedule"],
    required: true,
  },
  timeIn: { type: String },
  timeout: { type: String },
  remarks: { type: String },
  college: { type: mongoose.Schema.Types.ObjectId, ref: "College" }, // optional if nullable
  course: { type: String, required: true },
  instructorName: { type: String }, // For no-schedule logs
  room: { type: String }, // For no-schedule logs
  isNoSchedule: { type: Boolean, default: false }, // Flag to identify no-schedule logs
});


const Log = mongoose.model<ILog>("Log", LogSchema);

export default Log;
