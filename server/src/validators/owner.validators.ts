import { z } from 'zod';
import { paginationSchema, objectIdString } from '../utils/query';

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Academy name is required').max(120),
  code: z.string().trim().min(2).max(12).regex(/^[A-Za-z0-9]+$/, 'Only letters and numbers').optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z.string().trim().max(20).optional(),
  website: z.string().trim().max(200).optional().or(z.literal('')),
  address: z
    .object({
      line1: z.string().trim().max(200).optional(),
      city: z.string().trim().max(80).optional(),
      state: z.string().trim().max(80).optional(),
      country: z.string().trim().max(80).optional(),
      postalCode: z.string().trim().max(20).optional(),
    })
    .optional(),
  plan: z.enum(['STARTER', 'GROWTH', 'PRO']).default('STARTER'),
  trialDays: z.coerce.number().int().min(0).max(120).default(14),
  branding: z
    .object({
      primaryColor: z.string().trim().max(20).optional(),
      accentColor: z.string().trim().max(20).optional(),
      tagline: z.string().trim().max(160).optional(),
      logoUrl: z.string().trim().max(500).optional(),
    })
    .optional(),
  settings: z
    .object({
      currency: z.string().trim().max(5).optional(),
      currencySymbol: z.string().trim().max(3).optional(),
      timezone: z.string().trim().max(60).optional(),
      attendanceThreshold: z.coerce.number().min(0).max(100).optional(),
    })
    .optional(),
  admin: z
    .object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email(),
      phone: z.string().trim().max(20).optional(),
      password: z.string().min(8).max(200).optional(),
    })
    .optional(),
});

export const updateOrganizationSchema = createOrganizationSchema
  .omit({ admin: true, plan: true, trialDays: true, code: true })
  .partial()
  .extend({
    ownerNotes: z.string().trim().max(2000).optional(),
  });

export const organizationQuerySchema = paginationSchema.extend({
  status: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED']).optional(),
  plan: z.enum(['STARTER', 'GROWTH', 'PRO']).optional(),
});

export const suspendSchema = z.object({
  reason: z.string().trim().min(3, 'Please provide a reason').max(500),
});

export const updateSubscriptionSchema = z.object({
  plan: z.enum(['STARTER', 'GROWTH', 'PRO']).optional(),
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED']).optional(),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional(),
  extendDays: z.coerce.number().int().min(0).max(730).optional(),
  amount: z.coerce.number().min(0).optional(),
});

export const recordSubscriptionPaymentSchema = z.object({
  amount: z.coerce.number().min(1, 'Amount must be greater than zero'),
  method: z.string().trim().max(40).default('BANK_TRANSFER'),
  note: z.string().trim().max(300).optional(),
});

export const createOrgAdminSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(8).max(200).optional(),
});

export const ownerUsersQuerySchema = paginationSchema.extend({
  organizationId: objectIdString.optional(),
  role: z.string().trim().max(40).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export const auditQuerySchema = paginationSchema.extend({
  organizationId: objectIdString.optional(),
  action: z.string().trim().max(60).optional(),
  entity: z.string().trim().max(60).optional(),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional(),
});
