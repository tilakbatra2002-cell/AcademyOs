import mongoose, { Schema, Document, Types } from 'mongoose';

export const COURSE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];
export const COURSE_TYPES = ['ONLINE', 'OFFLINE', 'HYBRID'] as const;
export type CourseType = (typeof COURSE_TYPES)[number];
export const COURSE_LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ALL_LEVELS'] as const;

export interface ICourse extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  title: string;
  slug: string;
  code: string;
  description?: string;
  shortDescription?: string;
  thumbnailUrl?: string;
  category?: string;
  level: (typeof COURSE_LEVELS)[number];
  type: CourseType;
  durationWeeks?: number;
  durationHours?: number;
  price: number;
  discount: number;
  instructorId?: Types.ObjectId;
  subjectIds: Types.ObjectId[];
  status: CourseStatus;
  tags: string[];
  outcomes: string[];
  prerequisites: string[];
  publishedAt?: Date;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CourseSchema = new Schema<ICourse>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    description: String,
    shortDescription: String,
    thumbnailUrl: String,
    category: { type: String, index: true },
    level: { type: String, enum: COURSE_LEVELS, default: 'ALL_LEVELS' },
    type: { type: String, enum: COURSE_TYPES, default: 'OFFLINE', index: true },
    durationWeeks: { type: Number, min: 0 },
    durationHours: { type: Number, min: 0 },
    price: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    instructorId: { type: Schema.Types.ObjectId, ref: 'Teacher', index: true },
    subjectIds: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
    status: { type: String, enum: COURSE_STATUSES, default: 'DRAFT', index: true },
    tags: { type: [String], default: [] },
    outcomes: { type: [String], default: [] },
    prerequisites: { type: [String], default: [] },
    publishedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

CourseSchema.index({ organizationId: 1, slug: 1 }, { unique: true });
CourseSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
CourseSchema.index({ organizationId: 1, title: 'text', code: 'text', category: 'text' });

export const Course = mongoose.model<ICourse>('Course', CourseSchema);

export interface ISubject extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  name: string;
  code: string;
  description?: string;
  courseIds: Types.ObjectId[];
  teacherIds: Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SubjectSchema = new Schema<ISubject>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    description: String,
    courseIds: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    teacherIds: [{ type: Schema.Types.ObjectId, ref: 'Teacher' }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

SubjectSchema.index({ organizationId: 1, code: 1 }, { unique: true });

export const Subject = mongoose.model<ISubject>('Subject', SubjectSchema);

export interface ICourseModule extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  courseId: Types.ObjectId;
  title: string;
  description?: string;
  order: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CourseModuleSchema = new Schema<ICourseModule>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: String,
    order: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
);

CourseModuleSchema.index({ organizationId: 1, courseId: 1, order: 1 });

export const CourseModule = mongoose.model<ICourseModule>('CourseModule', CourseModuleSchema);

export const LESSON_TYPES = ['VIDEO', 'TEXT', 'PDF', 'DOCUMENT', 'IMAGE', 'LINK', 'QUIZ', 'LIVE'] as const;
export type LessonType = (typeof LESSON_TYPES)[number];

export interface ILesson extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  courseId: Types.ObjectId;
  moduleId: Types.ObjectId;
  title: string;
  description?: string;
  type: LessonType;
  order: number;
  durationSeconds: number;
  videoId?: Types.ObjectId;
  quizId?: Types.ObjectId;
  content?: string;
  externalUrl?: string;
  attachmentIds: Types.ObjectId[];
  isPreview: boolean;
  isPublished: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LessonSchema = new Schema<ILesson>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    moduleId: { type: Schema.Types.ObjectId, ref: 'CourseModule', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: String,
    type: { type: String, enum: LESSON_TYPES, default: 'VIDEO' },
    order: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0, min: 0 },
    videoId: { type: Schema.Types.ObjectId, ref: 'Video' },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz' },
    content: String,
    externalUrl: String,
    attachmentIds: [{ type: Schema.Types.ObjectId, ref: 'StudyMaterial' }],
    isPreview: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

LessonSchema.index({ organizationId: 1, courseId: 1, moduleId: 1, order: 1 });

export const Lesson = mongoose.model<ILesson>('Lesson', LessonSchema);
