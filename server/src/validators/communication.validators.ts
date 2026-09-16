import { z } from 'zod';
import { paginationSchema, objectIdString } from '../utils/query';

const optionalId = z.union([objectIdString, z.literal('')]).optional();

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(8000),
  audience: z.enum(['ALL', 'STUDENTS', 'PARENTS', 'TEACHERS', 'STAFF', 'COURSE', 'BATCH']).default('ALL'),
  courseId: optionalId,
  batchId: optionalId,
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  isPinned: z.boolean().default(false),
  expiresAt: z.string().datetime().optional().or(z.literal('')),
  attachmentKey: z.string().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('PUBLISHED'),
  notify: z.boolean().default(true),
});

export const updateAnnouncementSchema = createAnnouncementSchema.partial();

export const announcementQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  audience: z.enum(['ALL', 'STUDENTS', 'PARENTS', 'TEACHERS', 'STAFF', 'COURSE', 'BATCH']).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
});

export const sendMessageSchema = z.object({
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'PHONE', 'INTERNAL_NOTE']),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(4000),
  recipientType: z.enum(['STUDENT', 'PARENT', 'LEAD', 'TEACHER', 'USER', 'OTHER']),
  recipientIds: z.array(objectIdString).min(1).max(500),
});

export const communicationQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'PHONE', 'INTERNAL_NOTE']).optional(),
  status: z.enum(['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'NOT_CONFIGURED', 'LOGGED']).optional(),
  recipientType: z.enum(['STUDENT', 'PARENT', 'LEAD', 'TEACHER', 'USER', 'OTHER']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const notificationQuerySchema = paginationSchema.extend({
  isRead: z.enum(['true', 'false']).optional(),
  type: z.string().optional(),
});

export const createEventSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional(),
  type: z.enum(['CLASS', 'EXAM', 'ASSIGNMENT', 'FOLLOW_UP', 'FEE_DUE', 'HOLIDAY', 'EVENT', 'MEETING']).default('EVENT'),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  allDay: z.boolean().default(false),
  location: z.string().trim().max(160).optional(),
  courseId: optionalId,
  batchId: optionalId,
  audience: z.enum(['ALL', 'STUDENTS', 'PARENTS', 'TEACHERS', 'STAFF']).default('ALL'),
  color: z.string().trim().max(20).optional(),
});

export const updateEventSchema = createEventSchema.partial();

export const calendarQuerySchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.string().optional(),
});

export const createDocumentSchema = z.object({
  ownerType: z.enum(['STUDENT', 'TEACHER', 'PARENT', 'COURSE', 'LESSON', 'ORGANIZATION', 'ASSIGNMENT']),
  ownerId: objectIdString,
  category: z.enum(['ID_PROOF', 'PHOTO', 'CERTIFICATE', 'MARKSHEET', 'AGREEMENT', 'NOTES', 'OTHER']).default('OTHER'),
  title: z.string().trim().min(1).max(160),
  visibility: z.enum(['PRIVATE', 'ENROLLED', 'PUBLIC']).default('PRIVATE'),
});

export const documentQuerySchema = paginationSchema.extend({
  search: z.string().trim().max(120).optional(),
  ownerType: z.enum(['STUDENT', 'TEACHER', 'PARENT', 'COURSE', 'LESSON', 'ORGANIZATION', 'ASSIGNMENT']).optional(),
  ownerId: objectIdString.optional(),
  category: z.enum(['ID_PROOF', 'PHOTO', 'CERTIFICATE', 'MARKSHEET', 'AGREEMENT', 'NOTES', 'OTHER']).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export const reportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  courseId: objectIdString.optional(),
  batchId: objectIdString.optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('month'),
});

export const orgSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(20).optional(),
  website: z.string().url().optional().or(z.literal('')),
  address: z.object({
    line1: z.string().trim().max(200).optional(),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().max(80).optional(),
    state: z.string().trim().max(80).optional(),
    country: z.string().trim().max(80).optional(),
    postalCode: z.string().trim().max(20).optional(),
  }).optional(),
  branding: z.object({
    logoUrl: z.string().url().optional().or(z.literal('')),
    primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #4f46e5').optional(),
    accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #0ea5e9').optional(),
    tagline: z.string().trim().max(160).optional(),
  }).optional(),
  settings: z.object({
    currency: z.string().trim().max(8).optional(),
    currencySymbol: z.string().trim().max(4).optional(),
    timezone: z.string().trim().max(60).optional(),
    locale: z.string().trim().max(20).optional(),
    attendanceThreshold: z.coerce.number().min(0).max(100).optional(),
    academicYearStartMonth: z.coerce.number().int().min(1).max(12).optional(),
    studentIdPrefix: z.string().trim().max(12).optional(),
    invoicePrefix: z.string().trim().max(12).optional(),
    receiptPrefix: z.string().trim().max(12).optional(),
  }).optional(),
});
