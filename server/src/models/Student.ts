import mongoose, { Schema, Document, Types } from 'mongoose';

export const STUDENT_STATUSES = ['ACTIVE', 'INACTIVE', 'COMPLETED', 'DROPPED', 'SUSPENDED'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export interface IStudent extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  studentCode: string;
  userId?: Types.ObjectId;
  name: string;
  email?: string;
  phone?: string;
  dateOfBirth?: Date;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  photoUrl?: string;
  bloodGroup?: string;
  address?: {
    line1?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  };
  guardianId?: Types.ObjectId;
  emergencyContact?: { name?: string; phone?: string; relation?: string };
  schoolName?: string;
  previousQualification?: string;
  status: StudentStatus;
  admissionDate: Date;
  leadId?: Types.ObjectId;
  admissionId?: Types.ObjectId;
  primaryCourseId?: Types.ObjectId;
  primaryBatchId?: Types.ObjectId;
  tags: string[];
  notes?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    studentCode: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    dateOfBirth: Date,
    gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER'] },
    photoUrl: String,
    bloodGroup: String,
    address: {
      line1: String,
      city: String,
      state: String,
      country: { type: String, default: 'India' },
      postalCode: String,
    },
    guardianId: { type: Schema.Types.ObjectId, ref: 'Parent', index: true },
    emergencyContact: { name: String, phone: String, relation: String },
    schoolName: String,
    previousQualification: String,
    status: { type: String, enum: STUDENT_STATUSES, default: 'ACTIVE', index: true },
    admissionDate: { type: Date, default: () => new Date(), index: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
    admissionId: { type: Schema.Types.ObjectId, ref: 'Admission' },
    primaryCourseId: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    primaryBatchId: { type: Schema.Types.ObjectId, ref: 'Batch', index: true },
    tags: { type: [String], default: [] },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

StudentSchema.index({ organizationId: 1, studentCode: 1 }, { unique: true });
StudentSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
StudentSchema.index({ organizationId: 1, name: 'text', email: 'text', phone: 'text', studentCode: 'text' });

export const Student = mongoose.model<IStudent>('Student', StudentSchema);
