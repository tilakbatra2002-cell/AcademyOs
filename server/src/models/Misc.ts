import mongoose, { Schema, Document, Types } from 'mongoose';

export const DOCUMENT_CATEGORIES = ['ID_PROOF', 'PHOTO', 'CERTIFICATE', 'MARKSHEET', 'AGREEMENT', 'NOTES', 'OTHER'] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export interface IDocumentFile extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  ownerType: 'STUDENT' | 'TEACHER' | 'PARENT' | 'COURSE' | 'LESSON' | 'ORGANIZATION' | 'ASSIGNMENT';
  ownerId: Types.ObjectId;
  category: DocumentCategory;
  title: string;
  fileName: string;
  storageKey: string;
  mimeType?: string;
  sizeBytes: number;
  visibility: 'PRIVATE' | 'ENROLLED' | 'PUBLIC';
  uploadedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentFileSchema = new Schema<IDocumentFile>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    ownerType: {
      type: String,
      enum: ['STUDENT', 'TEACHER', 'PARENT', 'COURSE', 'LESSON', 'ORGANIZATION', 'ASSIGNMENT'],
      required: true,
      index: true,
    },
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    category: { type: String, enum: DOCUMENT_CATEGORIES, default: 'OTHER' },
    title: { type: String, required: true },
    fileName: { type: String, required: true },
    storageKey: { type: String, required: true },
    mimeType: String,
    sizeBytes: { type: Number, default: 0 },
    visibility: { type: String, enum: ['PRIVATE', 'ENROLLED', 'PUBLIC'], default: 'PRIVATE' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

DocumentFileSchema.index({ organizationId: 1, ownerType: 1, ownerId: 1 });

export const DocumentFile = mongoose.model<IDocumentFile>('DocumentFile', DocumentFileSchema);

export const EVENT_TYPES = ['CLASS', 'EXAM', 'ASSIGNMENT', 'FOLLOW_UP', 'FEE_DUE', 'HOLIDAY', 'EVENT', 'MEETING'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface ICalendarEvent extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  title: string;
  description?: string;
  type: EventType;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location?: string;
  courseId?: Types.ObjectId;
  batchId?: Types.ObjectId;
  audience: 'ALL' | 'STUDENTS' | 'PARENTS' | 'TEACHERS' | 'STAFF';
  color?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CalendarEventSchema = new Schema<ICalendarEvent>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    title: { type: String, required: true },
    description: String,
    type: { type: String, enum: EVENT_TYPES, default: 'EVENT', index: true },
    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    allDay: { type: Boolean, default: false },
    location: String,
    courseId: { type: Schema.Types.ObjectId, ref: 'Course' },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch' },
    audience: { type: String, enum: ['ALL', 'STUDENTS', 'PARENTS', 'TEACHERS', 'STAFF'], default: 'ALL' },
    color: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

CalendarEventSchema.index({ organizationId: 1, startAt: 1 });

export const CalendarEvent = mongoose.model<ICalendarEvent>('CalendarEvent', CalendarEventSchema);
