import mongoose, { Schema, Document, Types } from 'mongoose';

export const BATCH_STATUSES = ['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export interface IBatch extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  code: string;
  courseId: Types.ObjectId;
  teacherId?: Types.ObjectId;
  capacity: number;
  enrolledCount: number;
  room?: string;
  mode: 'ONLINE' | 'OFFLINE' | 'HYBRID';
  schedule: { day: string; startTime: string; endTime: string }[];
  startDate: Date;
  endDate?: Date;
  status: BatchStatus;
  description?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BatchSchema = new Schema<IBatch>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', index: true },
    capacity: { type: Number, default: 30, min: 1 },
    enrolledCount: { type: Number, default: 0, min: 0 },
    room: String,
    mode: { type: String, enum: ['ONLINE', 'OFFLINE', 'HYBRID'], default: 'OFFLINE' },
    schedule: [
      {
        day: { type: String, enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] },
        startTime: String,
        endTime: String,
      },
    ],
    startDate: { type: Date, required: true },
    endDate: Date,
    status: { type: String, enum: BATCH_STATUSES, default: 'UPCOMING', index: true },
    description: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

BatchSchema.index({ organizationId: 1, code: 1 }, { unique: true });
BatchSchema.index({ organizationId: 1, status: 1, startDate: -1 });
BatchSchema.index({ organizationId: 1, name: 'text', code: 'text' });

export const Batch = mongoose.model<IBatch>('Batch', BatchSchema);

export interface IBatchEnrollment extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  batchId: Types.ObjectId;
  studentId: Types.ObjectId;
  courseId: Types.ObjectId;
  status: 'ACTIVE' | 'TRANSFERRED' | 'DROPPED' | 'COMPLETED';
  enrolledAt: Date;
  exitedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BatchEnrollmentSchema = new Schema<IBatchEnrollment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    status: { type: String, enum: ['ACTIVE', 'TRANSFERRED', 'DROPPED', 'COMPLETED'], default: 'ACTIVE', index: true },
    enrolledAt: { type: Date, default: () => new Date() },
    exitedAt: Date,
  },
  { timestamps: true },
);

BatchEnrollmentSchema.index({ organizationId: 1, batchId: 1, studentId: 1 }, { unique: true });

export const BatchEnrollment = mongoose.model<IBatchEnrollment>('BatchEnrollment', BatchEnrollmentSchema);

export const CLASS_STATUSES = ['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED'] as const;

export interface IClassSession extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  title: string;
  courseId: Types.ObjectId;
  batchId: Types.ObjectId;
  teacherId: Types.ObjectId;
  subjectId?: Types.ObjectId;
  room?: string;
  mode: 'ONLINE' | 'OFFLINE';
  meetingUrl?: string;
  date: Date;
  startTime: string; // HH:mm
  endTime: string;
  startAt: Date;
  endAt: Date;
  status: (typeof CLASS_STATUSES)[number];
  topic?: string;
  notes?: string;
  attendanceMarked: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ClassSessionSchema = new Schema<IClassSession>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    title: { type: String, required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
    room: String,
    mode: { type: String, enum: ['ONLINE', 'OFFLINE'], default: 'OFFLINE' },
    meetingUrl: String,
    date: { type: Date, required: true, index: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    status: { type: String, enum: CLASS_STATUSES, default: 'SCHEDULED', index: true },
    topic: String,
    notes: String,
    attendanceMarked: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

ClassSessionSchema.index({ organizationId: 1, date: 1, batchId: 1 });
ClassSessionSchema.index({ organizationId: 1, teacherId: 1, startAt: 1 });

export const ClassSession = mongoose.model<IClassSession>('ClassSession', ClassSessionSchema);

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface IAttendance extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  classSessionId: Types.ObjectId;
  batchId: Types.ObjectId;
  courseId: Types.ObjectId;
  studentId: Types.ObjectId;
  date: Date;
  status: AttendanceStatus;
  remarks?: string;
  markedBy?: Types.ObjectId;
  markedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    classSessionId: { type: Schema.Types.ObjectId, ref: 'ClassSession', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    date: { type: Date, required: true, index: true },
    status: { type: String, enum: ATTENDANCE_STATUSES, required: true, index: true },
    remarks: String,
    markedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    markedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

AttendanceSchema.index({ organizationId: 1, classSessionId: 1, studentId: 1 }, { unique: true });
AttendanceSchema.index({ organizationId: 1, studentId: 1, date: -1 });
AttendanceSchema.index({ organizationId: 1, batchId: 1, date: -1 });

export const Attendance = mongoose.model<IAttendance>('Attendance', AttendanceSchema);
