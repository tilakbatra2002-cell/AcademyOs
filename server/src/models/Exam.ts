import mongoose, { Schema, Document, Types } from 'mongoose';

export const EXAM_STATUSES = ['DRAFT', 'PUBLISHED', 'COMPLETED', 'CANCELLED'] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];
export const EXAM_TYPES = ['EXAM', 'TEST', 'QUIZ', 'ASSESSMENT'] as const;

export interface IExam extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  title: string;
  type: (typeof EXAM_TYPES)[number];
  subjectId?: Types.ObjectId;
  courseId: Types.ObjectId;
  batchId?: Types.ObjectId;
  teacherId?: Types.ObjectId;
  date: Date;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  status: ExamStatus;
  instructions?: string;
  room?: string;
  resultPublished: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExamSchema = new Schema<IExam>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: EXAM_TYPES, default: 'EXAM' },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject' },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', index: true },
    date: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, default: 60, min: 1 },
    totalMarks: { type: Number, default: 100, min: 1 },
    passingMarks: { type: Number, default: 35, min: 0 },
    status: { type: String, enum: EXAM_STATUSES, default: 'DRAFT', index: true },
    instructions: String,
    room: String,
    resultPublished: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

ExamSchema.index({ organizationId: 1, date: -1 });
ExamSchema.index({ organizationId: 1, title: 'text' });

export const Exam = mongoose.model<IExam>('Exam', ExamSchema);

export interface IExamQuestion extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  examId: Types.ObjectId;
  question: string;
  marks: number;
  order: number;
  type: 'SUBJECTIVE' | 'OBJECTIVE';
  options?: { key: string; text: string }[];
  correctOptions?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ExamQuestionSchema = new Schema<IExamQuestion>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    question: { type: String, required: true },
    marks: { type: Number, default: 1, min: 0 },
    order: { type: Number, default: 0 },
    type: { type: String, enum: ['SUBJECTIVE', 'OBJECTIVE'], default: 'SUBJECTIVE' },
    options: [{ key: String, text: String }],
    correctOptions: [String],
  },
  { timestamps: true },
);

export const ExamQuestion = mongoose.model<IExamQuestion>('ExamQuestion', ExamQuestionSchema);

export interface IExamAttempt extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  examId: Types.ObjectId;
  studentId: Types.ObjectId;
  startedAt: Date;
  submittedAt?: Date;
  answers: { questionId: Types.ObjectId; answer: string; marksAwarded?: number }[];
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EVALUATED';
  createdAt: Date;
  updatedAt: Date;
}

const ExamAttemptSchema = new Schema<IExamAttempt>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    startedAt: { type: Date, default: () => new Date() },
    submittedAt: Date,
    answers: [{ questionId: Schema.Types.ObjectId, answer: String, marksAwarded: Number }],
    status: { type: String, enum: ['IN_PROGRESS', 'SUBMITTED', 'EVALUATED'], default: 'IN_PROGRESS' },
  },
  { timestamps: true },
);

export const ExamAttempt = mongoose.model<IExamAttempt>('ExamAttempt', ExamAttemptSchema);

export interface ITestResult extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  examId: Types.ObjectId;
  studentId: Types.ObjectId;
  courseId: Types.ObjectId;
  batchId?: Types.ObjectId;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  passed: boolean;
  rank?: number;
  remarks?: string;
  evaluatedBy?: Types.ObjectId;
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TestResultSchema = new Schema<ITestResult>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    examId: { type: Schema.Types.ObjectId, ref: 'Exam', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', index: true },
    marksObtained: { type: Number, required: true, min: 0 },
    totalMarks: { type: Number, required: true, min: 1 },
    percentage: { type: Number, required: true },
    grade: { type: String, required: true },
    passed: { type: Boolean, required: true, index: true },
    rank: Number,
    remarks: String,
    evaluatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    evaluatedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

TestResultSchema.index({ organizationId: 1, examId: 1, studentId: 1 }, { unique: true });
TestResultSchema.index({ organizationId: 1, studentId: 1, createdAt: -1 });

export const TestResult = mongoose.model<ITestResult>('TestResult', TestResultSchema);

export function calculateGrade(percentage: number): string {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C';
  if (percentage >= 40) return 'D';
  return 'F';
}
