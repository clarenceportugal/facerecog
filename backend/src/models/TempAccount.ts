import mongoose, { Schema, Document } from "mongoose";

export interface ITempAcc extends Document {
  email: string;
  role: "instructor" | "programchairperson" | "dean";
  department: mongoose.Types.ObjectId;
  program?: mongoose.Types.ObjectId;
  profilePhoto: string;
  dateSignedUp: Date;
  signUpStatus: "for_approval" | "approval_declined" | "accepted_needs_completion";
  tempPassword?: string;
}

const TempAccSchema: Schema<ITempAcc> = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  role: {
    type: String,
    required: true,
    enum: ["instructor", "programchairperson", "dean"],
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "College",
    required: true,
  },
  program: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: function (this: ITempAcc) {
      return this.role !== "dean";
    },
  },
  profilePhoto: {
    type: String,
    required: true,
  },
  dateSignedUp: {
    type: Date,
    default: Date.now,
  },
  signUpStatus: {
    type: String,
    enum: ["for_approval", "approval_declined", "accepted_needs_completion"],
    default: "for_approval",
  },
  tempPassword: {
    type: String,
  },
}, { timestamps: true }); // Enable createdAt and updatedAt

export default mongoose.model<ITempAcc>("TempAcc", TempAccSchema);
