import mongoose, { Document, Schema } from "mongoose";

interface ISchedule extends Document {
  courseTitle: string;
  courseCode: string;
  instructor: mongoose.Types.ObjectId;
  room: string;
  startTime: string;
  endTime: string;
  semesterStartDate: string;
  semesterEndDate: string;
  section: mongoose.Types.ObjectId;
  days: {
    mon: boolean;
    tue: boolean;
    wed: boolean;
    thu: boolean;
    fri: boolean;
    sat: boolean;
    sun: boolean;
  };
}

const ScheduleSchema: Schema = new Schema({
  courseTitle: { type: String, required: true },
  courseCode: { type: String, required: true },
  instructor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  room: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  semesterStartDate: { type: String, required: true },
  semesterEndDate: { type: String, required: true },
  section: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
  days: {
    mon: { type: Boolean, default: false },
    tue: { type: Boolean, default: false },
    wed: { type: Boolean, default: false },
    thu: { type: Boolean, default: false },
    fri: { type: Boolean, default: false },
    sat: { type: Boolean, default: false },
    sun: { type: Boolean, default: false },
  },
});

const Schedule = mongoose.model<ISchedule>("Schedule", ScheduleSchema);

export default Schedule;
