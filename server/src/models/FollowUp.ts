import mongoose, { Schema, Document, Types } from 'mongoose';

export const FOLLOWUP_STATUSES = ['PENDING', 'COMPLETED', 'RESCHEDULED', 'CANCELLED'] as const;
export type FollowUpStatus = (typeof FOLLOWUP_STATUSES)[number];

export const FOLLOWUP_MODES = ['CALL', 'VISIT', 'EMAIL', 'WHATSAPP', 'SMS', 'DEMO'] as const;

export interface IFollowUp extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  leadId?: Types.ObjectId;
  studentId?: Types.ObjectId;
  assignedTo: Types.ObjectId;
  mode: (typeof FOLLOWUP_MODES)[number];
  scheduledAt: Date;
  scheduledTime?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: FollowUpStatus;
  outcome?: string;
  notes?: string;
  completedAt?: Date;
  completedBy?: Types.ObjectId;
  rescheduledFrom?: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FollowUpSchema = new Schema<IFollowUp>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mode: { type: String, enum: FOLLOWUP_MODES, default: 'CALL' },
    scheduledAt: { type: Date, required: true, index: true },
    scheduledTime: String,
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'], default: 'MEDIUM' },
    status: { type: String, enum: FOLLOWUP_STATUSES, default: 'PENDING', index: true },
    outcome: String,
    notes: String,
    completedAt: Date,
    completedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rescheduledFrom: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

FollowUpSchema.index({ organizationId: 1, status: 1, scheduledAt: 1 });
FollowUpSchema.index({ organizationId: 1, assignedTo: 1, status: 1, scheduledAt: 1 });

export const FollowUp = mongoose.model<IFollowUp>('FollowUp', FollowUpSchema);
