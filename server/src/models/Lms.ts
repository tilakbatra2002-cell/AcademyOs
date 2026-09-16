import mongoose, { Schema, Document, Types } from 'mongoose';

/* ---------------------------------- Study material --------------------------------- */

export const MATERIAL_TYPES = ['PDF', 'PPT', 'DOC', 'IMAGE', 'LINK', 'NOTE', 'VIDEO', 'OTHER'] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export interface IStudyMaterial extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  title: string;
  description?: string;
  type: MaterialType;
  courseId?: Types.ObjectId;
  moduleId?: Types.ObjectId;
  lessonId?: Types.ObjectId;
  batchId?: Types.ObjectId;
  storageKey?: string;
  externalUrl?: string;
  content?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes: number;
  visibility: 'PRIVATE' | 'ENROLLED' | 'PUBLIC';
  downloadCount: number;
  uploadedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StudyMaterialSchema = new Schema<IStudyMaterial>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: String,
    type: { type: String, enum: MATERIAL_TYPES, default: 'PDF' },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    moduleId: { type: Schema.Types.ObjectId, ref: 'CourseModule' },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson' },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', index: true },
    storageKey: String,
    externalUrl: String,
    content: String,
    fileName: String,
    mimeType: String,
    sizeBytes: { type: Number, default: 0 },
    visibility: { type: String, enum: ['PRIVATE', 'ENROLLED', 'PUBLIC'], default: 'ENROLLED' },
    downloadCount: { type: Number, default: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

StudyMaterialSchema.index({ organizationId: 1, courseId: 1, createdAt: -1 });
StudyMaterialSchema.index({ organizationId: 1, title: 'text' });

export const StudyMaterial = mongoose.model<IStudyMaterial>('StudyMaterial', StudyMaterialSchema);

/* -------------------------------------- Quiz -------------------------------------- */

export interface IQuiz extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  courseId: Types.ObjectId;
  moduleId?: Types.ObjectId;
  lessonId?: Types.ObjectId;
  title: string;
  description?: string;
  passingPercentage: number;
  timeLimitMinutes: number;
  maxAttempts: number;
  totalMarks: number;
  shuffleQuestions: boolean;
  isPublished: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const QuizSchema = new Schema<IQuiz>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    moduleId: { type: Schema.Types.ObjectId, ref: 'CourseModule' },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson' },
    title: { type: String, required: true, trim: true },
    description: String,
    passingPercentage: { type: Number, default: 40, min: 0, max: 100 },
    timeLimitMinutes: { type: Number, default: 15, min: 1 },
    maxAttempts: { type: Number, default: 3, min: 1 },
    totalMarks: { type: Number, default: 0 },
    shuffleQuestions: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

QuizSchema.index({ organizationId: 1, courseId: 1 });

export const Quiz = mongoose.model<IQuiz>('Quiz', QuizSchema);

export interface IQuizQuestion extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  quizId: Types.ObjectId;
  question: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
  options: { key: string; text: string }[];
  correctOptions: string[];
  marks: number;
  explanation?: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const QuizQuestionSchema = new Schema<IQuizQuestion>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    question: { type: String, required: true },
    type: { type: String, enum: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'], default: 'SINGLE_CHOICE' },
    options: [{ key: String, text: String }],
    correctOptions: { type: [String], default: [] },
    marks: { type: Number, default: 1, min: 0 },
    explanation: String,
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

QuizQuestionSchema.index({ organizationId: 1, quizId: 1, order: 1 });

export const QuizQuestion = mongoose.model<IQuizQuestion>('QuizQuestion', QuizQuestionSchema);

export interface IQuizAttempt extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  quizId: Types.ObjectId;
  studentId: Types.ObjectId;
  courseId: Types.ObjectId;
  answers: { questionId: Types.ObjectId; selected: string[]; correct: boolean; marksAwarded: number }[];
  score: number;
  totalMarks: number;
  percentage: number;
  passed: boolean;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED';
  startedAt: Date;
  submittedAt?: Date;
  timeTakenSeconds?: number;
  attemptNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

const QuizAttemptSchema = new Schema<IQuizAttempt>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    answers: [
      {
        questionId: { type: Schema.Types.ObjectId, ref: 'QuizQuestion' },
        selected: [String],
        correct: Boolean,
        marksAwarded: Number,
      },
    ],
    score: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    status: { type: String, enum: ['IN_PROGRESS', 'SUBMITTED', 'EXPIRED'], default: 'IN_PROGRESS' },
    startedAt: { type: Date, default: () => new Date() },
    submittedAt: Date,
    timeTakenSeconds: Number,
    attemptNumber: { type: Number, default: 1 },
  },
  { timestamps: true },
);

QuizAttemptSchema.index({ organizationId: 1, quizId: 1, studentId: 1, attemptNumber: -1 });

export const QuizAttempt = mongoose.model<IQuizAttempt>('QuizAttempt', QuizAttemptSchema);

/* ------------------------------- Enrollment / progress ----------------------------- */

export interface ICourseEnrollment extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  studentId: Types.ObjectId;
  courseId: Types.ObjectId;
  batchId?: Types.ObjectId;
  status: 'ACTIVE' | 'COMPLETED' | 'DROPPED' | 'SUSPENDED';
  enrolledAt: Date;
  completedAt?: Date;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  lastAccessedAt?: Date;
  lastLessonId?: Types.ObjectId;
  certificateIssued: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CourseEnrollmentSchema = new Schema<ICourseEnrollment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch' },
    status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'DROPPED', 'SUSPENDED'], default: 'ACTIVE', index: true },
    enrolledAt: { type: Date, default: () => new Date() },
    completedAt: Date,
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    completedLessons: { type: Number, default: 0 },
    totalLessons: { type: Number, default: 0 },
    lastAccessedAt: Date,
    lastLessonId: { type: Schema.Types.ObjectId, ref: 'Lesson' },
    certificateIssued: { type: Boolean, default: false },
  },
  { timestamps: true },
);

CourseEnrollmentSchema.index({ organizationId: 1, studentId: 1, courseId: 1 }, { unique: true });

export const CourseEnrollment = mongoose.model<ICourseEnrollment>('CourseEnrollment', CourseEnrollmentSchema);

export interface ILessonProgress extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  studentId: Types.ObjectId;
  courseId: Types.ObjectId;
  moduleId: Types.ObjectId;
  lessonId: Types.ObjectId;
  progressPercent: number;
  lastPositionSeconds: number;
  watchedSeconds: number;
  completed: boolean;
  completedAt?: Date;
  lastWatchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LessonProgressSchema = new Schema<ILessonProgress>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    moduleId: { type: Schema.Types.ObjectId, ref: 'CourseModule', required: true },
    lessonId: { type: Schema.Types.ObjectId, ref: 'Lesson', required: true, index: true },
    progressPercent: { type: Number, default: 0, min: 0, max: 100 },
    lastPositionSeconds: { type: Number, default: 0, min: 0 },
    watchedSeconds: { type: Number, default: 0, min: 0 },
    completed: { type: Boolean, default: false },
    completedAt: Date,
    lastWatchedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

LessonProgressSchema.index({ organizationId: 1, studentId: 1, lessonId: 1 }, { unique: true });
LessonProgressSchema.index({ organizationId: 1, studentId: 1, courseId: 1 });

export const LessonProgress = mongoose.model<ILessonProgress>('LessonProgress', LessonProgressSchema);
