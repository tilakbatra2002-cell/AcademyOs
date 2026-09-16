import { z } from 'zod';
import { paginationSchema, objectIdString } from '../utils/query';
import { LEAD_STATUSES, LEAD_SOURCES, LEAD_PRIORITIES } from '../models/Lead';
import { FOLLOWUP_MODES, FOLLOWUP_STATUSES } from '../models/FollowUp';

const phone = z.string().trim().min(6, 'Enter a valid phone number').max(20);

export const createLeadSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  phone,
  email: z.string().trim().toLowerCase().email('Enter a valid email').optional().or(z.literal('')),
  parentName: z.string().trim().max(120).optional(),
  parentPhone: z.string().trim().max(20).optional(),
  courseId: objectIdString.optional().or(z.literal('')),
  courseInterest: z.string().trim().max(160).optional(),
  source: z.enum(LEAD_SOURCES).default('OTHER'),
  assignedCounselorId: objectIdString.optional().or(z.literal('')),
  status: z.enum(LEAD_STATUSES).default('NEW'),
  priority: z.enum(LEAD_PRIORITIES).default('MEDIUM'),
  expectedJoiningDate: z.string().trim().optional().or(z.literal('')),
  expectedValue: z.coerce.number().min(0).optional(),
  city: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(3000).optional(),
});

export const updateLeadSchema = createLeadSchema.partial().extend({
  lostReason: z.string().trim().max(300).optional(),
});

export const leadQuerySchema = paginationSchema.extend({
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  assignedCounselorId: objectIdString.optional(),
  courseId: objectIdString.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const leadStatusSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  note: z.string().trim().max(500).optional(),
  lostReason: z.string().trim().max(300).optional(),
});

export const leadActivitySchema = z.object({
  type: z.enum(['NOTE', 'CALL', 'EMAIL', 'SMS', 'WHATSAPP', 'MEETING', 'FOLLOW_UP']).default('NOTE'),
  title: z.string().trim().min(2, 'Title is required').max(160),
  description: z.string().trim().max(3000).optional(),
  outcome: z.string().trim().max(300).optional(),
  durationMinutes: z.coerce.number().min(0).max(600).optional(),
  occurredAt: z.string().optional(),
});

export const assignLeadSchema = z.object({
  assignedCounselorId: objectIdString,
});

export const createFollowUpSchema = z.object({
  leadId: objectIdString.optional(),
  studentId: objectIdString.optional(),
  assignedTo: objectIdString.optional(),
  mode: z.enum(FOLLOWUP_MODES).default('CALL'),
  scheduledAt: z.string().min(4, 'Pick a date'),
  scheduledTime: z.string().trim().max(10).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  notes: z.string().trim().max(2000).optional(),
});

export const updateFollowUpSchema = createFollowUpSchema.partial().extend({
  status: z.enum(FOLLOWUP_STATUSES).optional(),
  outcome: z.string().trim().max(500).optional(),
});

export const completeFollowUpSchema = z.object({
  outcome: z.string().trim().min(2, 'Describe the outcome').max(500),
  notes: z.string().trim().max(2000).optional(),
  nextFollowUpAt: z.string().optional(),
  newStatus: z.enum(LEAD_STATUSES).optional(),
});

export const rescheduleFollowUpSchema = z.object({
  scheduledAt: z.string().min(4, 'Pick a new date'),
  scheduledTime: z.string().trim().max(10).optional(),
  reason: z.string().trim().max(300).optional(),
});

export const followUpQuerySchema = paginationSchema.extend({
  status: z.enum(FOLLOWUP_STATUSES).optional(),
  bucket: z.enum(['today', 'upcoming', 'overdue', 'completed', 'all']).default('all'),
  assignedTo: objectIdString.optional(),
  leadId: objectIdString.optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});

/* -------------------------- Lead conversion / admission -------------------------- */

export const convertLeadSchema = z.object({
  student: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
    phone: z.string().trim().max(20).optional(),
    dateOfBirth: z.string().optional().or(z.literal('')),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    address: z
      .object({
        line1: z.string().trim().max(200).optional(),
        city: z.string().trim().max(80).optional(),
        state: z.string().trim().max(80).optional(),
        postalCode: z.string().trim().max(20).optional(),
      })
      .optional(),
    schoolName: z.string().trim().max(160).optional(),
    createLogin: z.boolean().default(true),
  }),
  parent: z
    .object({
      create: z.boolean().default(true),
      existingParentId: objectIdString.optional().or(z.literal('')),
      name: z.string().trim().max(120).optional(),
      phone: z.string().trim().max(20).optional(),
      email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
      relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']).default('FATHER'),
      createLogin: z.boolean().default(false),
    })
    .optional(),
  courseId: objectIdString,
  batchId: objectIdString.optional().or(z.literal('')),
  feePlan: z.object({
    title: z.string().trim().max(160).optional(),
    totalAmount: z.coerce.number().min(0),
    discountAmount: z.coerce.number().min(0).default(0),
    installments: z
      .array(
        z.object({
          title: z.string().trim().max(80).optional(),
          amount: z.coerce.number().min(1),
          dueDate: z.string().min(4),
        }),
      )
      .min(1, 'Add at least one installment'),
  }),
  initialPayment: z
    .object({
      amount: z.coerce.number().min(0).default(0),
      method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'ONLINE', 'CHEQUE']).default('CASH'),
      transactionId: z.string().trim().max(80).optional(),
    })
    .optional(),
  remarks: z.string().trim().max(1000).optional(),
});
