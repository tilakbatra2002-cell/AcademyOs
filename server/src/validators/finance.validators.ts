import { z } from 'zod';
import { paginationSchema, objectIdString } from '../utils/query';
import { PAYMENT_METHODS } from '../models/Finance';

export const createFeePlanSchema = z.object({
  studentId: objectIdString,
  courseId: objectIdString,
  batchId: objectIdString.optional().or(z.literal('')),
  title: z.string().trim().max(160).optional(),
  totalAmount: z.coerce.number().min(0, 'Amount cannot be negative'),
  discountAmount: z.coerce.number().min(0).default(0),
  startDate: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
  installments: z.array(z.object({
    title: z.string().trim().max(80).optional(),
    amount: z.coerce.number().min(1, 'Installment amount must be positive'),
    dueDate: z.string().min(4, 'Due date is required'),
  })).min(1, 'Add at least one installment').max(36),
});

export const updateFeePlanSchema = z.object({
  title: z.string().trim().max(160).optional(),
  discountAmount: z.coerce.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'DEFAULTED']).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const feePlanQuerySchema = paginationSchema.extend({
  studentId: objectIdString.optional(),
  courseId: objectIdString.optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'DEFAULTED']).optional(),
});

export const installmentQuerySchema = paginationSchema.extend({
  studentId: objectIdString.optional(),
  feePlanId: objectIdString.optional(),
  status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED']).optional(),
  bucket: z.enum(['all', 'due', 'overdue', 'paid', 'upcoming']).default('all'),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const updateInstallmentSchema = z.object({
  dueDate: z.string().optional(),
  amount: z.coerce.number().min(0).optional(),
  status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED']).optional(),
  lateFee: z.coerce.number().min(0).optional(),
});

export const recordPaymentSchema = z.object({
  studentId: objectIdString,
  feePlanId: objectIdString,
  installmentId: objectIdString.optional().or(z.literal('')),
  amount: z.coerce.number().min(1, 'Amount must be greater than zero'),
  method: z.enum(PAYMENT_METHODS),
  transactionId: z.string().trim().max(120).optional(),
  paidAt: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
});

export const paymentQuerySchema = paginationSchema.extend({
  studentId: objectIdString.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const invoiceQuerySchema = paginationSchema.extend({
  studentId: objectIdString.optional(),
  status: z.string().max(20).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const createOnlineOrderSchema = z.object({
  feePlanId: objectIdString,
  installmentId: objectIdString.optional().or(z.literal('')),
  amount: z.coerce.number().min(1),
});
