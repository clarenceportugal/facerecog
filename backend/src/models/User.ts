import mongoose, { Document, Schema, Model, Types } from "mongoose";
import "./College";

export type UserRole =
  | "superadmin"
  | "instructor"
  | "dean"
  | "programchairperson";

export interface IUser extends Document {
  _id: Types.ObjectId;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  username: string;
  email: string;
  gender: string;
  birthdate: Date;
  highestEducationalAttainment: string;
  academicRank: string;
  statusOfAppointment: string;
  numberOfPrep: number;
  totalTeachingLoad: number;
  password: string;
  role: UserRole;
  college?: mongoose.Types.ObjectId;
  course?: mongoose.Types.ObjectId;
  status: "forverification" | "active" | "inactive" | "permanent";
  profilePhotoUrl: string;
  faceImagePath?: string;
  faceImages?: Array<{
    step: string;
    filename: string;
    path: string;
    uploadedAt: Date;
  }>;
}

const UserSchema: Schema<IUser> = new Schema({
  first_name: { type: String, required: true },
  middle_name: { type: String, default: "" },
  last_name: { type: String, required: true },
  ext_name: { type: String, default: "" },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  gender: { type: String, default: "" },
  birthdate: { type: Date, default: null },
  highestEducationalAttainment: { type: String, default: "" },
  academicRank: { type: String, default: "" },
  statusOfAppointment: { type: String, default: "" },
  numberOfPrep: { type: Number, default: 0 },
  totalTeachingLoad: { type: Number, default: 0 },
  password: { type: String, required: true },
  role: {
    type: String,
    required: true,
    enum: ["superadmin", "instructor", "dean", "programchairperson"],
    lowercase: true,
  },
  college: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "College",
    required: function (this: IUser) {
      return this.role !== "superadmin";
    },
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: function (this: IUser) {
      return this.role === "instructor" || this.role === "programchairperson";
    },
    validate: {
      validator: function(v: any) {
        // Allow null/undefined or valid ObjectId
        return v == null || mongoose.Types.ObjectId.isValid(v);
      },
      message: 'Course must be a valid ObjectId or null'
    }
  },
  status: {
    type: String,
    enum: ["forverification", "active", "inactive", "permanent"],
    default: "forverification",
  },
  profilePhotoUrl: { type: String, default: "" },
  faceImagePath: { type: String, default: "" },
  faceImages: [{
    step: { type: String, required: true },
    filename: { type: String, required: true },
    path: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
});

const UserModel: Model<IUser> = mongoose.model<IUser>("User", UserSchema);
export default UserModel;
