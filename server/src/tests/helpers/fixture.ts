import mongoose, { Types } from 'mongoose';
import { Application } from 'express';
import request from 'supertest';
import dayjs from 'dayjs';
import { createApp } from '../../app';
import { env } from '../../config/env';
import { PLANS } from '../../config/plans';
import { hashPassword } from '../../services/password.service';
import {
  Organization, Subscription, User, Student, Parent, Teacher, Course, CourseModule, Lesson,
  Subject, Video, Batch, BatchEnrollment, ClassSession, Attendance, Exam, TestResult,
  CourseEnrollment, Lead, FollowUp, FeePlan, FeeInstallment, Payment, Invoice, Receipt,
  Announcement, Notification, DocumentFile, Assignment, AssignmentSubmission, Admission,
  Quiz, QuizQuestion, QuizAttempt, LessonProgress, StudyMaterial, CalendarEvent, Communication, AuditLog,
} from '../../models';

export const TEST_PASSWORD = 'Password@123';

/**
 * A fully-populated, self-contained tenant. Two of these are created for every
 * isolation test file so that "org A must not see org B" can be asserted against
 * real documents rather than mocks.
 */
export interface TenantFixture {
  orgId: Types.ObjectId;
  slug: string;
  adminEmail: string;
  counselorEmail: string;
  accountantEmail: string;
  teacherEmail: string;
  studentEmail: string;
  parentEmail: string;
  adminId: Types.ObjectId;
  teacherUserId: Types.ObjectId;
  teacherId: Types.ObjectId;
  studentId: Types.ObjectId;
  studentUserId: Types.ObjectId;
  parentId: Types.ObjectId;
  courseId: Types.ObjectId;
  moduleId: Types.ObjectId;
  lessonId: Types.ObjectId;
  videoId: Types.ObjectId;
  batchId: Types.ObjectId;
  classSessionId: Types.ObjectId;
  attendanceId: Types.ObjectId;
  examId: Types.ObjectId;
  resultId: Types.ObjectId;
  leadId: Types.ObjectId;
  followUpId: Types.ObjectId;
  feePlanId: Types.ObjectId;
  installmentId: Types.ObjectId;
  paymentId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  receiptId: Types.ObjectId;
  announcementId: Types.ObjectId;
  documentId: Types.ObjectId;
  assignmentId: Types.ObjectId;
  subjectId: Types.ObjectId;
}

const ALL_MODELS = [
  Organization, Subscription, User, Student, Parent, Teacher, Course, CourseModule, Lesson,
  Subject, Video, Batch, BatchEnrollment, ClassSession, Attendance, Exam, TestResult,
  CourseEnrollment, Lead, FollowUp, FeePlan, FeeInstallment, Payment, Invoice, Receipt,
  Announcement, Notification, DocumentFile, Assignment, AssignmentSubmission, Admission,
  Quiz, QuizQuestion, QuizAttempt, LessonProgress, StudyMaterial, CalendarEvent, Communication, AuditLog,
];

export async function connectTestDB(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  const uri = env.MONGO_URI.replace(/\/([^/?]+)(\?|$)/, '/academyos_test$2');
  await mongoose.connect(uri);
}

export async function clearTestDB(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await Promise.all(ALL_MODELS.map((m) => (m as any).deleteMany({})));
}

export async function closeTestDB(): Promise<void> {
  await mongoose.connection.close();
}

export function testApp(): Application {
  return createApp();
}

export async function createOwner(email = 'owner@test.local'): Promise<Types.ObjectId> {
  const owner = await User.create({
    organizationId: null,
    name: 'Test Owner',
    email,
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: 'SAAS_OWNER',
    isActive: true,
  });
  return owner._id;
}

/**
 * Builds one complete tenant with at least one document in every tenant-scoped
 * collection that the isolation tests probe.
 */
export async function createTenant(key: string): Promise<TenantFixture> {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const now = dayjs();
  const domain = `${key}.test`;

  const org = await Organization.create({
    name: `Org ${key.toUpperCase()}`,
    slug: `org-${key}`,
    code: key.toUpperCase().slice(0, 6),
    status: 'ACTIVE',
    email: `info@${domain}`,
    phone: '9418000001',
    branding: { primaryColor: '#4f46e5' },
    settings: { studentIdPrefix: 'STU', invoicePrefix: 'INV', receiptPrefix: 'RCP', attendanceThreshold: 75 },
  });
  const organizationId = org._id;

  await Subscription.create({
    organizationId,
    plan: 'PRO',
    status: 'ACTIVE',
    billingCycle: 'MONTHLY',
    amount: PLANS.PRO.monthlyPrice,
    currency: 'INR',
    currentPeriodStart: now.startOf('month').toDate(),
    currentPeriodEnd: now.endOf('month').toDate(),
    limits: PLANS.PRO.limits,
    usage: { storageBytes: 0 },
  });

  const mkUser = async (role: string, prefix: string, extra: Record<string, unknown> = {}) =>
    User.create({
      organizationId,
      name: `${prefix} ${key}`,
      email: `${prefix}@${domain}`,
      phone: '9418000002',
      passwordHash,
      role,
      isActive: true,
      mustChangePassword: false,
      ...extra,
    });

  const admin = await mkUser('ORGANIZATION_ADMIN', 'admin');
  const counselor = await mkUser('COUNSELOR', 'counselor');
  const accountant = await mkUser('ACCOUNTANT', 'accounts');
  const teacherUser = await mkUser('TEACHER', 'teacher');

  const subject = await Subject.create({ organizationId, name: 'Physics', code: 'PHY', isActive: true });

  const teacher = await Teacher.create({
    organizationId,
    userId: teacherUser._id,
    employeeCode: 'EMP0001',
    name: teacherUser.name,
    email: teacherUser.email,
    phone: '9418000003',
    qualification: 'M.Sc.',
    experienceYears: 5,
    joiningDate: now.subtract(1, 'year').toDate(),
    subjectIds: [subject._id],
    isActive: true,
  });
  await User.updateOne({ _id: teacherUser._id }, { teacherId: teacher._id });

  const course = await Course.create({
    organizationId,
    title: `Course ${key}`,
    slug: `course-${key}`,
    code: 'CRS001',
    description: 'A seeded test course used by the automated suite.',
    category: 'Engineering',
    level: 'BEGINNER',
    type: 'OFFLINE',
    durationWeeks: 12,
    durationHours: 60,
    price: 20000,
    discount: 0,
    instructorId: teacher._id,
    subjectIds: [subject._id],
    status: 'PUBLISHED',
    publishedAt: now.toDate(),
  });

  const courseModule = await CourseModule.create({
    organizationId, courseId: course._id, title: 'Module 1', order: 0, isPublished: true,
  });

  const video = await Video.create({
    organizationId,
    courseId: course._id,
    title: 'Lecture 1',
    provider: 'youtube',
    storageKey: 'dQw4w9WgXcQ',
    durationSeconds: 600,
    sizeBytes: 1024,
    visibility: 'ENROLLED',
    status: 'READY',
    uploadedBy: admin._id,
  });

  const lesson = await Lesson.create({
    organizationId,
    courseId: course._id,
    moduleId: courseModule._id,
    title: 'Lesson 1',
    type: 'VIDEO',
    order: 0,
    durationSeconds: 600,
    videoId: video._id,
    isPublished: true,
  });
  await Video.updateOne({ _id: video._id }, { lessonId: lesson._id });

  const batch = await Batch.create({
    organizationId,
    name: `Batch ${key}`,
    code: 'B001',
    courseId: course._id,
    teacherId: teacher._id,
    capacity: 30,
    enrolledCount: 1,
    room: 'Room 1',
    mode: 'OFFLINE',
    schedule: [{ day: 'MON', startTime: '10:00', endTime: '12:00' }],
    startDate: now.subtract(30, 'day').toDate(),
    endDate: now.add(60, 'day').toDate(),
    status: 'ONGOING',
  });

  const parent = await Parent.create({
    organizationId,
    name: `Parent ${key}`,
    phone: '9418000004',
    email: `parent@${domain}`,
    relation: 'FATHER',
    childrenIds: [],
    isActive: true,
  });
  const parentUser = await mkUser('PARENT', 'parent', { parentId: parent._id });
  await Parent.updateOne({ _id: parent._id }, { userId: parentUser._id });

  const student = await Student.create({
    organizationId,
    studentCode: 'STU2600001',
    name: `Student ${key}`,
    email: `student@${domain}`,
    phone: '9418000005',
    gender: 'MALE',
    guardianId: parent._id,
    status: 'ACTIVE',
    admissionDate: now.subtract(30, 'day').toDate(),
    primaryCourseId: course._id,
    primaryBatchId: batch._id,
  });
  const studentUser = await mkUser('STUDENT', 'student', { studentId: student._id });
  await Student.updateOne({ _id: student._id }, { userId: studentUser._id });
  await Parent.updateOne({ _id: parent._id }, { $addToSet: { childrenIds: student._id } });

  await BatchEnrollment.create({
    organizationId, batchId: batch._id, studentId: student._id, courseId: course._id,
    status: 'ACTIVE', enrolledAt: now.subtract(30, 'day').toDate(),
  });
  await CourseEnrollment.create({
    organizationId, studentId: student._id, courseId: course._id, batchId: batch._id,
    status: 'ACTIVE', enrolledAt: now.subtract(30, 'day').toDate(),
    progressPercent: 0, completedLessons: 0, totalLessons: 1,
  });

  const classSession = await ClassSession.create({
    organizationId,
    title: 'Class 1',
    courseId: course._id,
    batchId: batch._id,
    teacherId: teacher._id,
    room: 'Room 1',
    mode: 'OFFLINE',
    date: now.subtract(1, 'day').startOf('day').toDate(),
    startTime: '10:00',
    endTime: '12:00',
    startAt: now.subtract(1, 'day').hour(10).minute(0).second(0).millisecond(0).toDate(),
    endAt: now.subtract(1, 'day').hour(12).minute(0).second(0).millisecond(0).toDate(),
    status: 'COMPLETED',
    attendanceMarked: true,
  });

  const attendance = await Attendance.create({
    organizationId,
    classSessionId: classSession._id,
    batchId: batch._id,
    courseId: course._id,
    studentId: student._id,
    date: now.subtract(1, 'day').startOf('day').toDate(),
    status: 'PRESENT',
    markedBy: teacherUser._id,
    markedAt: now.subtract(1, 'day').toDate(),
  });

  const exam = await Exam.create({
    organizationId,
    title: 'Unit Test 1',
    type: 'TEST',
    subjectId: subject._id,
    courseId: course._id,
    batchId: batch._id,
    teacherId: teacher._id,
    date: now.subtract(7, 'day').toDate(),
    durationMinutes: 60,
    totalMarks: 100,
    passingMarks: 35,
    status: 'COMPLETED',
    resultPublished: true,
  });

  const result = await TestResult.create({
    organizationId,
    examId: exam._id,
    studentId: student._id,
    courseId: course._id,
    batchId: batch._id,
    marksObtained: 72,
    totalMarks: 100,
    percentage: 72,
    grade: 'B+',
    passed: true,
    rank: 1,
    evaluatedBy: teacherUser._id,
    evaluatedAt: now.subtract(5, 'day').toDate(),
  });

  const lead = await Lead.create({
    organizationId,
    name: `Lead ${key}`,
    phone: '9418000006',
    email: `lead@${domain}`,
    courseId: course._id,
    courseInterest: course.title,
    source: 'WALK_IN',
    assignedCounselorId: counselor._id,
    status: 'NEW',
    priority: 'MEDIUM',
    expectedValue: 20000,
    city: 'Shimla',
    createdBy: counselor._id,
  });

  const followUp = await FollowUp.create({
    organizationId,
    leadId: lead._id,
    assignedTo: counselor._id,
    mode: 'CALL',
    scheduledAt: now.add(1, 'day').toDate(),
    priority: 'MEDIUM',
    status: 'PENDING',
    notes: 'Initial call',
    createdBy: counselor._id,
  });

  const feePlan = await FeePlan.create({
    organizationId,
    studentId: student._id,
    courseId: course._id,
    batchId: batch._id,
    title: 'Fee plan',
    totalAmount: 20000,
    discountAmount: 0,
    netAmount: 20000,
    paidAmount: 10000,
    pendingAmount: 10000,
    status: 'ACTIVE',
    startDate: now.subtract(30, 'day').toDate(),
  });

  const installment = await FeeInstallment.create({
    organizationId,
    feePlanId: feePlan._id,
    studentId: student._id,
    courseId: course._id,
    sequence: 1,
    title: 'Instalment 1 of 2',
    amount: 10000,
    paidAmount: 10000,
    dueDate: now.subtract(20, 'day').toDate(),
    status: 'PAID',
    paidAt: now.subtract(20, 'day').toDate(),
    lateFee: 0,
  });
  await FeeInstallment.create({
    organizationId,
    feePlanId: feePlan._id,
    studentId: student._id,
    courseId: course._id,
    sequence: 2,
    title: 'Instalment 2 of 2',
    amount: 10000,
    paidAmount: 0,
    dueDate: now.add(10, 'day').toDate(),
    status: 'PENDING',
    lateFee: 0,
  });

  const invoice = await Invoice.create({
    organizationId,
    invoiceNumber: 'INV-2026-00001',
    studentId: student._id,
    feePlanId: feePlan._id,
    installmentId: installment._id,
    courseId: course._id,
    items: [{ description: 'Instalment 1', amount: 10000, quantity: 1 }],
    subtotal: 10000,
    discount: 0,
    tax: 0,
    total: 10000,
    amountPaid: 10000,
    status: 'PAID',
    issuedAt: now.subtract(20, 'day').toDate(),
    dueDate: now.subtract(20, 'day').toDate(),
  });

  const payment = await Payment.create({
    organizationId,
    paymentNumber: 'PAY-20260101-000001',
    studentId: student._id,
    feePlanId: feePlan._id,
    installmentId: installment._id,
    courseId: course._id,
    amount: 10000,
    method: 'CASH',
    gateway: 'manual',
    status: 'SUCCESS',
    paidAt: now.subtract(20, 'day').toDate(),
    receivedBy: accountant._id,
    invoiceId: invoice._id,
  });

  const receipt = await Receipt.create({
    organizationId,
    receiptNumber: 'RCP-2026-00001',
    paymentId: payment._id,
    invoiceId: invoice._id,
    studentId: student._id,
    courseId: course._id,
    amount: 10000,
    method: 'CASH',
    issuedAt: now.subtract(20, 'day').toDate(),
    issuedBy: accountant._id,
  });
  await Payment.updateOne({ _id: payment._id }, { receiptId: receipt._id });

  const announcement = await Announcement.create({
    organizationId,
    title: `Announcement ${key}`,
    body: 'Tenant scoped announcement body.',
    audience: 'ALL',
    priority: 'NORMAL',
    status: 'PUBLISHED',
    publishedAt: now.toDate(),
    createdBy: admin._id,
  });

  const documentFile = await DocumentFile.create({
    organizationId,
    ownerType: 'STUDENT',
    ownerId: student._id,
    category: 'ID_PROOF',
    title: `ID proof ${key}`,
    fileName: 'id.pdf',
    storageKey: `organizations/${organizationId}/documents/id.pdf`,
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    visibility: 'PRIVATE',
    uploadedBy: admin._id,
  });

  const assignment = await Assignment.create({
    organizationId,
    title: `Assignment ${key}`,
    description: 'Tenant scoped assignment.',
    courseId: course._id,
    batchId: batch._id,
    teacherId: teacher._id,
    dueDate: now.add(5, 'day').toDate(),
    totalMarks: 25,
    submissionType: 'ANY',
    allowLateSubmission: true,
    status: 'PUBLISHED',
  });

  return {
    orgId: organizationId,
    slug: org.slug,
    adminEmail: admin.email,
    counselorEmail: counselor.email,
    accountantEmail: accountant.email,
    teacherEmail: teacherUser.email,
    studentEmail: studentUser.email,
    parentEmail: parentUser.email,
    adminId: admin._id,
    teacherUserId: teacherUser._id,
    teacherId: teacher._id,
    studentId: student._id,
    studentUserId: studentUser._id,
    parentId: parent._id,
    courseId: course._id,
    moduleId: courseModule._id,
    lessonId: lesson._id,
    videoId: video._id,
    batchId: batch._id,
    classSessionId: classSession._id,
    attendanceId: attendance._id,
    examId: exam._id,
    resultId: result._id,
    leadId: lead._id,
    followUpId: followUp._id,
    feePlanId: feePlan._id,
    installmentId: installment._id,
    paymentId: payment._id,
    invoiceId: invoice._id,
    receiptId: receipt._id,
    announcementId: announcement._id,
    documentId: documentFile._id,
    assignmentId: assignment._id,
    subjectId: subject._id,
  };
}

/** Logs in and returns the raw Set-Cookie array for use as an authenticated agent. */
export async function login(
  app: Application,
  email: string,
  portal: string,
  password = TEST_PASSWORD,
): Promise<string[]> {
  const res = await request(app).post('/api/auth/login').send({ email, password, portal });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email} (${portal}): ${res.status} ${JSON.stringify(res.body)}`);
  }
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw : [raw as unknown as string];
}
