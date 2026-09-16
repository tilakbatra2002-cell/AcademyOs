import mongoose, { Schema, Document, Types } from 'mongoose';

export const ADMISSION_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED'] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];

export interface IAdmission extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  admissionNumber: string;
  leadId?: Types.ObjectId;
  studentId: Types.ObjectId;
  parentId?: Types.ObjectId;
  courseId: Types.ObjectId;
  batchId?: Types.ObjectId;
  feePlanId?: Types.ObjectId;
  status: AdmissionStatus;
  admissionDate: Date;
  totalFee: number;
  discount: number;
  netFee: number;
  initialPayment: number;
  counselorId?: Types.ObjectId;
  source?: string;
  remarks?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AdmissionSchema = new Schema<IAdmission>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    admissionNumber: { type: String, required: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Parent' },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch' },
    feePlanId: { type: Schema.Types.ObjectId, ref: 'FeePlan' },
    status: { type: String, enum: ADMISSION_STATUSES, default: 'CONFIRMED', index: true },
    admissionDate: { type: Date, default: () => new Date(), index: true },
    totalFee: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    netFee: { type: Number, default: 0, min: 0 },
    initialPayment: { type: Number, default: 0, min: 0 },
    counselorId: { type: Schema.Types.ObjectId, ref: 'User' },
    source: String,
    remarks: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

AdmissionSchema.index({ organizationId: 1, admissionNumber: 1 }, { unique: true });
AdmissionSchema.index({ organizationId: 1, admissionDate: -1 });

export const Admission = mongoose.model<IAdmission>('Admission', AdmissionSchema);
