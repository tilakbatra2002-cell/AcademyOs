import { z } from 'zod';
import { paginationSchema, objectIdString } from '../utils/query';

const optionalId = z.union([objectIdString, z.literal('')]).optional();

/**
 * Accepts either a calendar date (`YYYY-MM-DD`, what `<input type="date">`
 * produces) or a full ISO-8601 timestamp, and normalises both to an ISO string.
 *
 * A bare `YYYY-MM-DD` is anchored at UTC midnight rather than local midnight on
 * purpose: the calendar grid buckets events by the UTC date portion of the
 * stored timestamp, so anchoring locally would make an event created in a
 * positive-offset timezone (e.g. IST) render on the previous day.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const dateTimeString = (label: string) =>
  z
    .string({
      required_error: `${label} is required`,
      invalid_type_error: `${label} must be a date`,
    })
    .trim()
    .min(1, `${label} is required`)
    .transform((v) => (DATE_ONLY.test(v) ? `${v}T00:00:00.000Z` : v))
    .refine((v) => !Number.isNaN(Date.parse(v)), {
      message: `${label} must be a valid date (YYYY-MM-DD or an ISO timestamp)`,
    })
    .transform((v) => new Date(v).toISOString());

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

export const createEventSchema = z
  .object({
    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(2, 'Title must be at least 2 characters')
      .max(160, 'Title must be 160 characters or fewer'),
    description: z
      .string()
      .trim()
      .max(2000, 'Description must be 2000 characters or fewer')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    type: z
      .enum(['CLASS', 'EXAM', 'ASSIGNMENT', 'FOLLOW_UP', 'FEE_DUE', 'HOLIDAY', 'EVENT', 'MEETING'], {
        errorMap: () => ({ message: 'Choose a valid event type' }),
      })
      .default('EVENT'),
    startAt: dateTimeString('Start date'),
    /**
     * Optional: a single-day event only needs a start. When omitted the
     * controller derives the end from the start, which keeps the required
     * `endAt` on the Mongoose model satisfied without forcing the user to
     * enter a redundant value.
     */
    endAt: dateTimeString('End date').optional(),
    allDay: z.boolean().default(false),
    location: z
      .string()
      .trim()
      .max(160, 'Location must be 160 characters or fewer')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    courseId: optionalId,
    batchId: optionalId,
    audience: z
      .enum(['ALL', 'STUDENTS', 'PARENTS', 'TEACHERS', 'STAFF'], {
        errorMap: () => ({ message: 'Choose a valid audience' }),
      })
      .default('ALL'),
    color: z.string().trim().max(20, 'Color must be 20 characters or fewer').optional(),
  })
  // Report the ordering problem on the field the user must actually change.
  .refine((v) => !v.endAt || new Date(v.endAt).getTime() >= new Date(v.startAt).getTime(), {
    message: 'End date must be on or after the start date',
    path: ['endAt'],
  });

export const updateEventSchema = createEventSchema
  .innerType()
  .partial()
  .refine(
    (v) => !v.endAt || !v.startAt || new Date(v.endAt).getTime() >= new Date(v.startAt).getTime(),
    { message: 'End date must be on or after the start date', path: ['endAt'] },
  );

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
