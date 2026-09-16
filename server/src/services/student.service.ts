import { Types, FilterQuery } from 'mongoose';
import dayjs from 'dayjs';
import {
  Student,
  IStudent,
  User,
  Parent,
  Course,
  Batch,
  CourseEnrollment,
  BatchEnrollment,
  Attendance,
  FeePlan,
  FeeInstallment,
  Payment,
  TestResult,
  AssignmentSubmission,
  DocumentFile,
  Communication,
  LessonProgress,
  Lesson,
  Admission,
  Invoice,
  Receipt,
} from '../models';
import { listScoped, assertBelongsToOrg } from './crud.factory';
import { ApiError } from '../utils/ApiError';
import { dateRangeFilter } from '../utils/query';
import { hashPassword } from './password.service';
import { generatePassword } from '../utils/ids';
import { generateStudentCode } from './counter.service';
import { assertWithinLimit } from './subscription.service';
import { AuthContext } from '../types/express';

export async function listStudents(
  orgId: Types.ObjectId,
  params: { page: number; limit: number; sort?: string; order?: 'asc' | 'desc'; search?: string; status?: string; courseId?: string; batchId?: string; from?: string; to?: string },
  restrictToStudentIds?: Types.ObjectId[],
) {
  const filter: FilterQuery<IStudent> = {};
  if (params.status) filter.status = params.status as never;
  if (params.courseId) filter.primaryCourseId = new Types.ObjectId(params.courseId);
  if (params.batchId) filter.primaryBatchId = new Types.ObjectId(params.batchId);
  const range = dateRangeFilter(params.from, params.to);
  if (range) filter.admissionDate = range as never;
  if (restrictToStudentIds) filter._id = { $in: restrictToStudentIds };

  return listScoped(Student, {
    organizationId: orgId,
    page: params.page, limit: params.limit, sort: params.sort, order: params.order,
    search: params.search,
    searchFields: ['name', 'studentCode', 'email', 'phone'],
    filter,
    populate: [
      { path: 'primaryCourseId', select: 'title code' },
      { path: 'primaryBatchId', select: 'name code' },
      { path: 'guardianId', select: 'name phone' },
    ],
  });
}

export async function createStudent(orgId: Types.ObjectId, auth: AuthContext, input: Record<string, unknown>) {
  await assertWithinLimit(orgId, 'students', 1);
  if (input.primaryCourseId) await assertBelongsToOrg(Course, input.primaryCourseId as string, orgId, 'Course');
  if (input.primaryBatchId) await assertBelongsToOrg(Batch, input.primaryBatchId as string, orgId, 'Batch');
  if (input.guardianId) await assertBelongsToOrg(Parent, input.guardianId as string, orgId, 'Parent');

  const createLogin = Boolean(input.createLogin);
  if (createLogin && input.email) {
    const exists = await User.findOne({ organizationId: orgId, email: input.email }).lean();
    if (exists) throw ApiError.conflict('A user with this email already exists in your academy', { email: 'Email already in use' });
  }

  const studentCode = await generateStudentCode(orgId);
  const student = await Student.create({
    organizationId: orgId,
    studentCode,
    name: input.name,
    email: input.email || undefined,
    phone: input.phone,
    dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth as string) : undefined,
    gender: input.gender,
    bloodGroup: input.bloodGroup,
    address: input.address,
    guardianId: input.guardianId || undefined,
    emergencyContact: input.emergencyContact,
    schoolName: input.schoolName,
    previousQualification: input.previousQualification,
    status: input.status ?? 'ACTIVE',
    primaryCourseId: input.primaryCourseId || undefined,
    primaryBatchId: input.primaryBatchId || undefined,
    tags: input.tags ?? [],
    notes: input.notes,
    admissionDate: new Date(),
    createdBy: auth.userId,
  });

  if (input.guardianId) {
    await Parent.updateOne({ _id: input.guardianId as string, organizationId: orgId }, { $addToSet: { childrenIds: student._id } });
  }

  let credentials: { email: string; password: string } | null = null;
  if (createLogin) {
    const { Organization } = await import('../models/Organization');
    const org = await Organization.findById(orgId).select('slug').lean();
    const email = (input.email as string) || `${studentCode.toLowerCase()}@${org?.slug ?? 'academy'}.academyos.local`;
    const password = generatePassword();
    const user = await User.create({
      organizationId: orgId,
      name: input.name,
      email,
      phone: input.phone,
      passwordHash: await hashPassword(password),
      role: 'STUDENT',
      studentId: student._id,
      mustChangePassword: true,
      createdBy: auth.userId,
    });
    student.userId = user._id;
    await student.save();
    credentials = { email, password };
  }

  // Auto-enroll in the primary course/batch when provided
  if (input.primaryCourseId) {
    const totalLessons = await Lesson.countDocuments({ organizationId: orgId, courseId: input.primaryCourseId as string });
    await CourseEnrollment.updateOne(
      { organizationId: orgId, studentId: student._id, courseId: input.primaryCourseId as string },
      { $setOnInsert: { batchId: input.primaryBatchId || undefined, status: 'ACTIVE', enrolledAt: new Date(), totalLessons } },
      { upsert: true },
    );
  }
  if (input.primaryBatchId) {
    const batch = await Batch.findOne({ _id: input.primaryBatchId as string, organizationId: orgId });
    if (batch) {
      if (batch.enrolledCount >= batch.capacity) throw ApiError.conflict(`Batch ${batch.name} is already full`);
      const existing = await BatchEnrollment.findOne({ organizationId: orgId, batchId: batch._id, studentId: student._id });
      if (!existing) {
        await BatchEnrollment.create({
          organizationId: orgId, batchId: batch._id, studentId: student._id, courseId: batch.courseId, status: 'ACTIVE',
        });
        await Batch.updateOne({ _id: batch._id }, { $inc: { enrolledCount: 1 } });
      }
    }
  }

  return { student: student.toObject(), credentials };
}

export async function updateStudent(orgId: Types.ObjectId, id: string, input: Record<string, unknown>) {
  const student = await Student.findOne({ _id: id, organizationId: orgId });
  if (!student) throw ApiError.notFound('Student not found');

  if (input.primaryCourseId) await assertBelongsToOrg(Course, input.primaryCourseId as string, orgId, 'Course');
  if (input.primaryBatchId) await assertBelongsToOrg(Batch, input.primaryBatchId as string, orgId, 'Batch');
  if (input.guardianId) await assertBelongsToOrg(Parent, input.guardianId as string, orgId, 'Parent');

  const oldGuardian = student.guardianId ? String(student.guardianId) : null;

  Object.entries(input).forEach(([k, v]) => {
    if (v === undefined) return;
    if (k === 'dateOfBirth') student.dateOfBirth = v ? new Date(v as string) : undefined;
    else if (['guardianId', 'primaryCourseId', 'primaryBatchId'].includes(k) && v === '') {
      (student as never as Record<string, unknown>)[k] = undefined;
    } else (student as never as Record<string, unknown>)[k] = v;
  });
  await student.save();

  if (input.guardianId && String(input.guardianId) !== oldGuardian) {
    if (oldGuardian) await Parent.updateOne({ _id: oldGuardian, organizationId: orgId }, { $pull: { childrenIds: student._id } });
    await Parent.updateOne({ _id: input.guardianId as string, organizationId: orgId }, { $addToSet: { childrenIds: student._id } });
  }

  // Keep the linked login account in sync
  if (student.userId && (input.name || input.phone)) {
    await User.updateOne(
      { _id: student.userId, organizationId: orgId },
      { ...(input.name ? { name: input.name } : {}), ...(input.phone ? { phone: input.phone } : {}) },
    );
  }

  return student.toObject();
}

/** Deactivates a student (and their login) rather than destroying academic history. */
export async function deactivateStudent(orgId: Types.ObjectId, id: string) {
  const student = await Student.findOne({ _id: id, organizationId: orgId });
  if (!student) throw ApiError.notFound('Student not found');
  student.status = 'INACTIVE';
  await student.save();
  if (student.userId) {
    await User.updateOne({ _id: student.userId, organizationId: orgId }, { isActive: false, $inc: { tokenVersion: 1 } });
  }
  await CourseEnrollment.updateMany({ organizationId: orgId, studentId: student._id, status: 'ACTIVE' }, { status: 'SUSPENDED' });
  return student.toObject();
}

export async function activateStudent(orgId: Types.ObjectId, id: string) {
  const student = await Student.findOne({ _id: id, organizationId: orgId });
  if (!student) throw ApiError.notFound('Student not found');
  student.status = 'ACTIVE';
  await student.save();
  if (student.userId) await User.updateOne({ _id: student.userId, organizationId: orgId }, { isActive: true });
  await CourseEnrollment.updateMany({ organizationId: orgId, studentId: student._id, status: 'SUSPENDED' }, { status: 'ACTIVE' });
  return student.toObject();
}

/** Aggregated 360° student profile used by the student detail page. */
export async function studentProfile(orgId: Types.ObjectId, id: string) {
  const student = await Student.findOne({ _id: id, organizationId: orgId })
    .populate('primaryCourseId', 'title code type price')
    .populate('primaryBatchId', 'name code startDate room')
    .populate('guardianId', 'name phone email relation occupation')
    .lean();
  if (!student) throw ApiError.notFound('Student not found');

  const sid = student._id;
  const [
    enrollments, batchEnrollments, attendanceAgg, attendanceRecent, feePlans, installments,
    payments, results, submissions, documents, communications, progress, user, admission, invoices, receipts,
  ] = await Promise.all([
    CourseEnrollment.find({ organizationId: orgId, studentId: sid }).populate('courseId', 'title code thumbnailUrl').lean(),
    BatchEnrollment.find({ organizationId: orgId, studentId: sid }).populate('batchId', 'name code startDate status').lean(),
    Attendance.aggregate<{ _id: string; count: number }>([
      { $match: { organizationId: orgId, studentId: sid } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Attendance.find({ organizationId: orgId, studentId: sid }).sort({ date: -1 }).limit(40)
      .populate('batchId', 'name').lean(),
    FeePlan.find({ organizationId: orgId, studentId: sid }).populate('courseId', 'title').lean(),
    FeeInstallment.find({ organizationId: orgId, studentId: sid }).sort({ dueDate: 1 }).lean(),
    Payment.find({ organizationId: orgId, studentId: sid }).sort({ paidAt: -1 }).limit(50).lean(),
    TestResult.find({ organizationId: orgId, studentId: sid }).sort({ createdAt: -1 })
      .populate('examId', 'title type date totalMarks').lean(),
    AssignmentSubmission.find({ organizationId: orgId, studentId: sid }).sort({ submittedAt: -1 })
      .populate('assignmentId', 'title dueDate totalMarks').lean(),
    DocumentFile.find({ organizationId: orgId, ownerType: 'STUDENT', ownerId: sid }).sort({ createdAt: -1 }).lean(),
    Communication.find({ organizationId: orgId, recipientType: 'STUDENT', recipientId: sid }).sort({ createdAt: -1 }).limit(30).lean(),
    LessonProgress.find({ organizationId: orgId, studentId: sid }).sort({ lastWatchedAt: -1 }).limit(30)
      .populate('lessonId', 'title').populate('courseId', 'title').lean(),
    student.userId ? User.findById(student.userId).select('email isActive lastLoginAt mustChangePassword').lean() : null,
    Admission.findOne({ organizationId: orgId, studentId: sid }).lean(),
    Invoice.find({ organizationId: orgId, studentId: sid }).sort({ issuedAt: -1 }).limit(30).lean(),
    Receipt.find({ organizationId: orgId, studentId: sid }).sort({ issuedAt: -1 }).limit(30).lean(),
  ]);

  const present = attendanceAgg.find((a) => a._id === 'PRESENT')?.count ?? 0;
  const late = attendanceAgg.find((a) => a._id === 'LATE')?.count ?? 0;
  const absent = attendanceAgg.find((a) => a._id === 'ABSENT')?.count ?? 0;
  const leave = attendanceAgg.find((a) => a._id === 'LEAVE')?.count ?? 0;
  const totalSessions = present + late + absent + leave;

  const feeTotals = feePlans.reduce(
    (acc, p) => ({ total: acc.total + p.netAmount, paid: acc.paid + p.paidAmount, pending: acc.pending + p.pendingAmount }),
    { total: 0, paid: 0, pending: 0 },
  );
  const overdue = installments
    .filter((i) => i.status !== 'PAID' && i.status !== 'WAIVED' && dayjs(i.dueDate).isBefore(dayjs(), 'day'))
    .reduce((a, i) => a + (i.amount - i.paidAmount), 0);

  const avgPercentage = results.length
    ? Math.round((results.reduce((a, r) => a + r.percentage, 0) / results.length) * 10) / 10
    : 0;

  return {
    student,
    account: user,
    admission,
    enrollments,
    batchEnrollments,
    attendance: {
      present, absent, late, leave, totalSessions,
      percentage: totalSessions ? Math.round(((present + late) / totalSessions) * 1000) / 10 : 0,
      recent: attendanceRecent,
    },
    finance: { ...feeTotals, overdue, feePlans, installments, payments, invoices, receipts },
    academics: { results, avgPercentage, submissions },
    documents,
    communications,
    learningProgress: progress,
  };
}

export async function studentCountsByStatus(orgId: Types.ObjectId) {
  const rows = await Student.aggregate<{ _id: string; count: number }>([
    { $match: { organizationId: orgId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  return rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r._id]: r.count }), {});
}
