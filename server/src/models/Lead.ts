import mongoose, { Schema, Document, Types } from 'mongoose';

export const LEAD_STATUSES = [
  'NEW', 'CONTACTED', 'COUNSELLING', 'DEMO', 'INTERESTED', 'ADMISSION_PENDING', 'ADMITTED', 'LOST',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  'WALK_IN', 'REFERRAL', 'WEBSITE', 'GOOGLE_ADS', 'FACEBOOK', 'INSTAGRAM', 'PHONE_ENQUIRY',
  'SEMINAR', 'NEWSPAPER', 'JUSTDIAL', 'OTHER',
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export interface ILead extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  phone: string;
  email?: string;
  parentName?: string;
  parentPhone?: string;
  courseId?: Types.ObjectId;
  courseInterest?: string;
  source: LeadSource;
  assignedCounselorId?: Types.ObjectId;
  status: LeadStatus;
  priority: LeadPriority;
  expectedJoiningDate?: Date;
  expectedValue?: number;
  notes?: string;
  lostReason?: string;
  city?: string;
  lastContactedAt?: Date;
  nextFollowUpAt?: Date;
  convertedStudentId?: Types.ObjectId;
  convertedAt?: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    parentName: { type: String, trim: true },
    parentPhone: { type: String, trim: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    courseInterest: String,
    source: { type: String, enum: LEAD_SOURCES, default: 'OTHER', index: true },
    assignedCounselorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    status: { type: String, enum: LEAD_STATUSES, default: 'NEW', index: true },
    priority: { type: String, enum: LEAD_PRIORITIES, default: 'MEDIUM', index: true },
    expectedJoiningDate: Date,
    expectedValue: { type: Number, min: 0 },
    notes: String,
    lostReason: String,
    city: String,
    lastContactedAt: Date,
    nextFollowUpAt: Date,
    convertedStudentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    convertedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

LeadSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
LeadSchema.index({ organizationId: 1, assignedCounselorId: 1, status: 1 });
LeadSchema.index({ organizationId: 1, phone: 1 });
LeadSchema.index({ organizationId: 1, name: 'text', phone: 'text', email: 'text' });

export const Lead = mongoose.model<ILead>('Lead', LeadSchema);

export interface ILeadActivity extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  leadId: Types.ObjectId;
  type: 'NOTE' | 'CALL' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'MEETING' | 'STATUS_CHANGE' | 'ASSIGNMENT' | 'FOLLOW_UP' | 'SYSTEM';
  title: string;
  description?: string;
  outcome?: string;
  fromStatus?: string;
  toStatus?: string;
  durationMinutes?: number;
  performedBy?: Types.ObjectId;
  performedByName?: string;
  occurredAt: Date;
  createdAt: Date;
}

const LeadActivitySchema = new Schema<ILeadActivity>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    type: {
      type: String,
      enum: ['NOTE', 'CALL', 'EMAIL', 'SMS', 'WHATSAPP', 'MEETING', 'STATUS_CHANGE', 'ASSIGNMENT', 'FOLLOW_UP', 'SYSTEM'],
      default: 'NOTE',
    },
    title: { type: String, required: true },
    description: String,
    outcome: String,
    fromStatus: String,
    toStatus: String,
    durationMinutes: Number,
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    performedByName: String,
    occurredAt: { type: Date, default: () => new Date() },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

LeadActivitySchema.index({ organizationId: 1, leadId: 1, occurredAt: -1 });

export const LeadActivity = mongoose.model<ILeadActivity>('LeadActivity', LeadActivitySchema);
