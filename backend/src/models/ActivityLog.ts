import mongoose, { Schema, Document } from "mongoose";

export interface IActivityLog extends Document {
  type: 'accept_faculty' | 'create_account' | 'delete_account' | 'add_schedule' | 'delete_schedule' | 'add_section_block' | 'delete_section_block' | 'add_subject' | 'delete_subject' | 'register_face' | 'generate_report';
  action: string;
  performedBy: string;
  targetUser?: string;
  targetName?: string;
  details?: string;
  metadata?: any; // Store additional info like courseCode, section name, etc.
}

const ActivityLogSchema: Schema<IActivityLog> = new Schema({
  type: {
    type: String,
    required: true,
    enum: ['accept_faculty', 'create_account', 'delete_account', 'add_schedule', 'delete_schedule', 'add_section_block', 'delete_section_block', 'add_subject', 'delete_subject', 'register_face', 'generate_report']
  },
  action: { type: String, required: true },
  performedBy: { type: String, required: true },
  targetUser: { type: String },
  targetName: { type: String },
  details: { type: String },
  metadata: { type: Schema.Types.Mixed }
}, {
  timestamps: true, // createdAt and updatedAt
});

export default mongoose.model<IActivityLog>("ActivityLog", ActivityLogSchema);
