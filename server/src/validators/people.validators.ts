import { z } from 'zod';
import { paginationSchema, objectIdString } from '../utils/query';
import { STUDENT_STATUSES } from '../models/Student';
import { ADMIN_CREATABLE_ROLES } from '../config/rbac';

const addressSchema = z.object({
  line1: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  country: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(20).optional(),
});

export const createStudentSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().trim().max(20).optional(),
  dateOfBirth: z.string().optional().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  bloodGroup: z.string().trim().max(5).optional(),
  address: addressSchema.optional(),
  guardianId: objectIdString.optional().or(z.literal('')),
  emergencyContact: z.object({
    name: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(20).optional(),
    relation: z.string().trim().max(40).optional(),
  }).optional(),
  schoolName: z.string().trim().max(160).optional(),
  previousQualification: z.string().trim().max(160).optional(),
  status: z.enum(STUDENT_STATUSES).default('ACTIVE'),
  primaryCourseId: objectIdString.optional().or(z.literal('')),
  primaryBatchId: objectIdString.optional().or(z.literal('')),
  tags: z.array(z.string().trim().max(30)).max(20).default([]),
  notes: z.string().trim().max(3000).optional(),
  createLogin: z.boolean().default(false),
});

export const updateStudentSchema = createStudentSchema.partial().omit({ createLogin: true });

export const studentQuerySchema = paginationSchema.extend({
  status: z.enum(STUDENT_STATUSES).optional(),
  courseId: objectIdString.optional(),
  batchId: objectIdString.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const createParentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6, 'Enter a valid phone number').max(20),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  alternatePhone: z.string().trim().max(20).optional(),
  occupation: z.string().trim().max(120).optional(),
  relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']).default('FATHER'),
  address: addressSchema.optional(),
  childrenIds: z.array(objectIdString).max(20).default([]),
  notes: z.string().trim().max(2000).optional(),
  createLogin: z.boolean().default(false),
});

export const updateParentSchema = createParentSchema.partial().omit({ createLogin: true }).extend({
  isActive: z.boolean().optional(),
});

export const createTeacherSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z.string().trim().max(20).optional(),
  employeeCode: z.string().trim().max(20).optional(),
  qualification: z.string().trim().max(160).optional(),
  specialization: z.string().trim().max(160).optional(),
  experienceYears: z.coerce.number().min(0).max(70).optional(),
  joiningDate: z.string().optional().or(z.literal('')),
  salary: z.coerce.number().min(0).optional(),
  subjectIds: z.array(objectIdString).max(40).default([]),
  courseIds: z.array(objectIdString).max(60).default([]),
  bio: z.string().trim().max(2000).optional(),
  password: z.string().min(8).max(200).optional(),
});

export const updateTeacherSchema = createTeacherSchema.partial().omit({ password: true }).extend({
  isActive: z.boolean().optional(),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(20).optional(),
  role: z.enum(ADMIN_CREATABLE_ROLES as unknown as [string, ...string[]]),
  password: z.string().min(8).max(200).optional(),
  extraPermissions: z.array(z.string()).max(60).default([]),
  deniedPermissions: z.array(z.string()).max(60).default([]),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  role: z.enum(ADMIN_CREATABLE_ROLES as unknown as [string, ...string[]]).optional(),
  isActive: z.boolean().optional(),
  extraPermissions: z.array(z.string()).max(60).optional(),
  deniedPermissions: z.array(z.string()).max(60).optional(),
});

export const userQuerySchema = paginationSchema.extend({
  role: z.string().trim().max(40).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export const importStudentsSchema = z.object({
  rows: z.array(z.record(z.string(), z.any())).min(1, 'No rows found').max(2000),
  dryRun: z.boolean().default(false),
});

export const importLeadsSchema = importStudentsSchema;
