import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAssignment extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  title: string;
  description?: string;
  courseId: Types.ObjectId;
  batchId?: Types.ObjectId;
  lessonId?: Types.ObjectId;
  teacherId?: Types.ObjectId;
  dueDate: Date;
  totalMarks: number;
  attachmentKey?: string;
  attachmentName?: string;
  submissionType: 'TEXT' | 'FILE' | 'LINK' | 'ANY';
  allowLateSubmission: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AssignmentSchema = new Schema<IAssignment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: String,
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', index: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson' },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', index: true },
    dueDate: { type: Date, required: true, index: true },
    totalMarks: { type: Number, default: 100, min: 1 },
    attachmentKey: String,
    attachmentName: String,
    submissionType: { type: String, enum: ['TEXT', 'FILE', 'LINK', 'ANY'], default: 'ANY' },
    allowLateSubmission: { type: Boolean, default: true },
    status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'CLOSED'], default: 'PUBLISHED', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

AssignmentSchema.index({ organizationId: 1, dueDate: -1 });
AssignmentSchema.index({ organizationId: 1, title: 'text' });

export const Assignment = mongoose.model<IAssignment>('Assignment', AssignmentSchema);

export interface IAssignmentSubmission extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  assignmentId: Types.ObjectId;
  studentId: Types.ObjectId;
  contentText?: string;
  fileKey?: string;
  fileName?: string;
  link?: string;
  submittedAt: Date;
  isLate: boolean;
  status: 'SUBMITTED' | 'GRADED' | 'RETURNED';
  marksAwarded?: number;
  feedback?: string;
  gradedBy?: Types.ObjectId;
  gradedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AssignmentSubmissionSchema = new Schema<IAssignmentSubmission>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    contentText: String,
    fileKey: String,
    fileName: String,
    link: String,
    submittedAt: { type: Date, default: () => new Date() },
    isLate: { type: Boolean, default: false },
    status: { type: String, enum: ['SUBMITTED', 'GRADED', 'RETURNED'], default: 'SUBMITTED', index: true },
    marksAwarded: { type: Number, min: 0 },
    feedback: String,
    gradedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    gradedAt: Date,
  },
  { timestamps: true },
);

AssignmentSubmissionSchema.index({ organizationId: 1, assignmentId: 1, studentId: 1 }, { unique: true });

export const AssignmentSubmission = mongoose.model<IAssignmentSubmission>('AssignmentSubmission', AssignmentSubmissionSchema);
