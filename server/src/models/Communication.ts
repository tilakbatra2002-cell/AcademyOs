import mongoose, { Schema, Document, Types } from 'mongoose';

export const ANNOUNCEMENT_AUDIENCES = ['ALL', 'STUDENTS', 'PARENTS', 'TEACHERS', 'STAFF', 'COURSE', 'BATCH'] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export interface IAnnouncement extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  courseId?: Types.ObjectId;
  batchId?: Types.ObjectId;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  isPinned: boolean;
  publishedAt: Date;
  expiresAt?: Date;
  attachmentKey?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  createdBy?: Types.ObjectId;
  createdByName?: string;
  readBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    audience: { type: String, enum: ANNOUNCEMENT_AUDIENCES, default: 'ALL', index: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', index: true },
    priority: { type: String, enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'], default: 'NORMAL' },
    isPinned: { type: Boolean, default: false },
    publishedAt: { type: Date, default: () => new Date(), index: true },
    expiresAt: Date,
    attachmentKey: String,
    status: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'PUBLISHED', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: String,
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);

AnnouncementSchema.index({ organizationId: 1, publishedAt: -1 });

export const Announcement = mongoose.model<IAnnouncement>('Announcement', AnnouncementSchema);

export const NOTIFICATION_TYPES = [
  'FEE_DUE', 'FEE_OVERDUE', 'FOLLOW_UP', 'CLASS', 'EXAM', 'ASSIGNMENT', 'RESULT',
  'ANNOUNCEMENT', 'ATTENDANCE', 'SYSTEM', 'ENROLLMENT', 'PAYMENT',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface INotification extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId | null;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  entity?: string;
  entityId?: string;
  isRead: boolean;
  readAt?: Date;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, default: 'SYSTEM', index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: String,
    entity: String,
    entityId: String,
    isRead: { type: Boolean, default: false, index: true },
    readAt: Date,
    priority: { type: String, enum: ['LOW', 'NORMAL', 'HIGH'], default: 'NORMAL' },
  },
  { timestamps: true },
);

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);

export const COMM_CHANNELS = ['EMAIL', 'SMS', 'WHATSAPP', 'PHONE', 'INTERNAL_NOTE'] as const;
export type CommChannel = (typeof COMM_CHANNELS)[number];

export interface ICommunication extends Document {
  _id: Types.ObjectId;
  organizationId: Types.ObjectId;
  channel: CommChannel;
  direction: 'OUTBOUND' | 'INBOUND';
  subject?: string;
  body: string;
  /** Recipient linkage */
  recipientType: 'STUDENT' | 'PARENT' | 'LEAD' | 'TEACHER' | 'USER' | 'OTHER';
  recipientId?: Types.ObjectId;
  recipientName?: string;
  recipientAddress?: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | 'NOT_CONFIGURED' | 'LOGGED';
  providerName?: string;
  providerMessageId?: string;
  failureReason?: string;
  sentBy?: Types.ObjectId;
  sentByName?: string;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CommunicationSchema = new Schema<ICommunication>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    channel: { type: String, enum: COMM_CHANNELS, required: true, index: true },
    direction: { type: String, enum: ['OUTBOUND', 'INBOUND'], default: 'OUTBOUND' },
    subject: String,
    body: { type: String, required: true },
    recipientType: {
      type: String,
      enum: ['STUDENT', 'PARENT', 'LEAD', 'TEACHER', 'USER', 'OTHER'],
      default: 'OTHER',
      index: true,
    },
    recipientId: { type: Schema.Types.ObjectId, index: true },
    recipientName: String,
    recipientAddress: String,
    status: {
      type: String,
      enum: ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'NOT_CONFIGURED', 'LOGGED'],
      default: 'QUEUED',
      index: true,
    },
    providerName: String,
    providerMessageId: String,
    failureReason: String,
    sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
    sentByName: String,
    sentAt: Date,
  },
  { timestamps: true },
);

CommunicationSchema.index({ organizationId: 1, createdAt: -1 });

export const Communication = mongoose.model<ICommunication>('Communication', CommunicationSchema);
