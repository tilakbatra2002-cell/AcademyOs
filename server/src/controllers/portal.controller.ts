import { Request, Response } from 'express';
import { Types } from 'mongoose';
import dayjs from 'dayjs';
import { asyncHandler, ok, created, paginated } from '../utils/http';
import { requireAuth, requireOrg } from '../middleware/auth';
import * as dashboard from '../services/dashboard.service';
import * as learning from '../services/learning.service';
import * as schedule from '../services/schedule.service';
import { ApiError } from '../utils/ApiError';
import {
  Student, Parent, CourseEnrollment, Course, ClassSession, TestResult, Assignment,
  AssignmentSubmission, FeePlan, FeeInstallment, Payment, Receipt, Batch, Attendance, Teacher,
  BatchEnrollment, StudyMaterial, Lesson, LessonProgress,
} from '../models';
import { getSubscriptionSummary } from '../services/subscription.service';
import { recordAudit } from '../services/audit.service';
import { getStorage } from '../services/storage';
import { toObjectId } from '../utils/ids';

/* ------------------------------ Shared helpers ------------------------------ */

function studentIdOf(req: Request): Types.ObjectId {
  const auth = requireAuth(req);
  if (!auth.studentId) throw ApiError.forbidden('No student profile is linked to your account');
  return auth.studentId;
}

function teacherIdOf(req: Request): Types.ObjectId {
  const auth = requireAuth(req);
  if (!auth.teacherId) throw ApiError.forbidden('No teacher profile is linked to your account');
  return auth.teacherId;
}

async function childIdsOf(req: Request): Promise<Types.ObjectId[]> {
  const auth = requireAuth(req);
  const orgId = requireOrg(req);
  if (!auth.parentId) throw ApiError.forbidden('No parent profile is linked to your account');
  const parent = await Parent.findOne({ _id: auth.parentId, organizationId: orgId }).select('childrenIds').lean();
  return parent?.childrenIds ?? [];
}

/** Ensures a parent may only ever read data for their own children. */
async function assertChild(req: Request, studentId: string): Promise<Types.ObjectId> {
  const ids = await childIdsOf(req);
  const match = ids.find((i) => String(i) === String(studentId));
  if (!match) throw ApiError.forbidden('This student is not linked to your account');
  return match;
}

/* -------------------------------- Dashboards -------------------------------- */

export const adminDashboard = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await dashboard.adminDashboard(requireOrg(req)));
});

export const teacherDashboard = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await dashboard.teacherDashboard(requireOrg(req), teacherIdOf(req)));
});

export const studentDashboard = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await dashboard.studentDashboard(requireOrg(req), studentIdOf(req)));
});

export const parentDashboard = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await dashboard.parentDashboard(requireOrg(req), await childIdsOf(req)));
});

export const subscriptionSummary = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await getSubscriptionSummary(requireOrg(req)));
});

/* ------------------------------ Student portal ------------------------------ */

export const myCourses = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const studentId = studentIdOf(req);
  const enrollments = await CourseEnrollment.find({ organizationId: orgId, studentId })
    .populate('courseId', 'title code thumbnailUrl description level type durationWeeks')
    .populate('batchId', 'name code')
    .sort({ createdAt: -1 })
    .lean();
  return ok(res, { items: enrollments });
});

export const learnCourse = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await learning.learnCourse(requireOrg(req), studentIdOf(req), req.params.courseId));
});

export const saveProgress = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await learning.saveLessonProgress(requireOrg(req), studentIdOf(req), req.params.lessonId, req.body));
});

export const startQuiz = asyncHandler(async (req: Request, res: Response) => {
  return created(res, await learning.startQuiz(requireOrg(req), studentIdOf(req), req.params.quizId));
});

export const submitQuiz = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await learning.submitQuiz(requireOrg(req), studentIdOf(req), req.params.attemptId, req.body));
});

export const myAttendance = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const studentId = req.params.studentId ? await assertChild(req, req.params.studentId) : studentIdOf(req);
  const [summary, recent] = await Promise.all([
    schedule.studentAttendanceSummary(orgId, studentId),
    Attendance.find({ organizationId: orgId, studentId })
      .populate('classSessionId', 'title startAt').populate('batchId', 'name')
      .sort({ date: -1 }).limit(60).lean(),
  ]);
  return ok(res, { ...summary, recent });
});

export const mySchedule = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const studentId = req.params.studentId ? await assertChild(req, req.params.studentId) : studentIdOf(req);
  const enrollments = await CourseEnrollment.find({ organizationId: orgId, studentId, status: 'ACTIVE' }).select('batchId').lean();
  const batchIds = enrollments.map((e) => e.batchId).filter(Boolean);
  const from = req.query.from ? dayjs(String(req.query.from)).startOf('day') : dayjs().startOf('day');
  const to = req.query.to ? dayjs(String(req.query.to)).endOf('day') : from.add(14, 'day').endOf('day');

  const classes = await ClassSession.find({
    organizationId: orgId, batchId: { $in: batchIds },
    startAt: { $gte: from.toDate(), $lte: to.toDate() }, status: { $ne: 'CANCELLED' },
  })
    .populate('batchId', 'name code').populate('teacherId', 'name').populate('subjectId', 'name')
    .sort({ startAt: 1 }).limit(300).lean();

  return ok(res, { items: classes, range: { from: from.toDate(), to: to.toDate() } });
});

export const myResults = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const studentId = req.params.studentId ? await assertChild(req, req.params.studentId) : studentIdOf(req);
  const results = await TestResult.find({ organizationId: orgId, studentId })
    .populate({ path: 'examId', select: 'title date type totalMarks passingMarks resultPublished' })
    .populate('courseId', 'title')
    .sort({ createdAt: -1 }).lean();
  const published = results.filter((r) => (r.examId as unknown as { resultPublished?: boolean })?.resultPublished !== false);
  const avg = published.length ? Math.round((published.reduce((a, r) => a + r.percentage, 0) / published.length) * 10) / 10 : 0;
  return ok(res, {
    items: published,
    summary: {
      exams: published.length,
      average: avg,
      passed: published.filter((r) => r.passed).length,
      failed: published.filter((r) => !r.passed).length,
      best: published.length ? Math.max(...published.map((r) => r.percentage)) : 0,
    },
    trend: published
      .slice()
      .sort((a, b) => new Date((a.examId as unknown as { date: string })?.date).getTime() - new Date((b.examId as unknown as { date: string })?.date).getTime())
      .map((r) => ({ label: (r.examId as unknown as { title?: string })?.title ?? '', percentage: r.percentage, date: (r.examId as unknown as { date?: Date })?.date })),
  });
});

export const myAssignments = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const studentId = req.params.studentId ? await assertChild(req, req.params.studentId) : studentIdOf(req);
  const enrollments = await CourseEnrollment.find({ organizationId: orgId, studentId }).select('courseId').lean();
  const courseIds = enrollments.map((e) => e.courseId);

  const assignments = await Assignment.find({ organizationId: orgId, courseId: { $in: courseIds }, status: 'PUBLISHED' })
    .populate('courseId', 'title').sort({ dueDate: -1 }).limit(200).lean();
  const submissions = await AssignmentSubmission.find({ organizationId: orgId, studentId }).lean();
  const subMap = new Map(submissions.map((s) => [String(s.assignmentId), s]));

  return ok(res, {
    items: assignments.map((a) => {
      const sub = subMap.get(String(a._id));
      return {
        ...a,
        submission: sub ?? null,
        state: sub ? sub.status : dayjs(a.dueDate).isBefore(dayjs()) ? 'MISSED' : 'PENDING',
      };
    }),
  });
});

export const submitAssignment = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const studentId = studentIdOf(req);
  const assignment = await Assignment.findOne({ _id: req.params.id, organizationId: orgId, status: 'PUBLISHED' }).lean();
  if (!assignment) throw ApiError.notFound('Assignment not found');

  const enrolled = await CourseEnrollment.exists({ organizationId: orgId, studentId, courseId: assignment.courseId });
  if (!enrolled) throw ApiError.forbidden('You are not enrolled in this course');

  const isLate = dayjs().isAfter(assignment.dueDate);
  if (isLate && !assignment.allowLateSubmission) throw ApiError.conflict('The due date has passed and late submissions are not allowed');

  const existing = await AssignmentSubmission.findOne({ organizationId: orgId, assignmentId: assignment._id, studentId });
  if (existing?.status === 'GRADED') throw ApiError.conflict('This submission has already been graded and cannot be changed');

  if (assignment.submissionType === 'TEXT' && !req.body.contentText) {
    throw ApiError.validation('This assignment requires a written answer', { contentText: 'Required' });
  }
  if (assignment.submissionType === 'LINK' && !req.body.link) {
    throw ApiError.validation('This assignment requires a link', { link: 'Required' });
  }
  if (assignment.submissionType === 'FILE' && !req.body.fileKey) {
    throw ApiError.validation('This assignment requires a file upload', { fileKey: 'Required' });
  }
  if (!req.body.contentText && !req.body.link && !req.body.fileKey) {
    throw ApiError.validation('Add an answer, a link or a file before submitting', { contentText: 'Required' });
  }

  const doc = await AssignmentSubmission.findOneAndUpdate(
    { organizationId: orgId, assignmentId: assignment._id, studentId },
    {
      $set: {
        contentText: req.body.contentText,
        link: req.body.link || undefined,
        fileKey: req.body.fileKey || undefined,
        fileName: req.body.fileName || undefined,
        isLate,
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await recordAudit(req, { action: 'ASSIGNMENT_SUBMITTED', entity: 'AssignmentSubmission', entityId: doc!._id });
  return created(res, doc!.toObject());
});

export const myFees = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const studentId = req.params.studentId ? await assertChild(req, req.params.studentId) : studentIdOf(req);

  const [plans, installments, payments, receipts] = await Promise.all([
    FeePlan.find({ organizationId: orgId, studentId }).populate('courseId', 'title').sort({ createdAt: -1 }).lean(),
    FeeInstallment.find({ organizationId: orgId, studentId }).sort({ dueDate: 1 }).lean(),
    Payment.find({ organizationId: orgId, studentId, status: 'SUCCESS' }).sort({ paidAt: -1 }).limit(50).lean(),
    Receipt.find({ organizationId: orgId, studentId }).sort({ issuedAt: -1 }).limit(50).lean(),
  ]);

  const totals = plans.reduce(
    (acc, p) => ({
      total: acc.total + p.netAmount,
      paid: acc.paid + p.paidAmount,
      pending: acc.pending + Math.max(0, p.netAmount - p.paidAmount),
    }),
    { total: 0, paid: 0, pending: 0 },
  );
  const overdue = installments.filter((i) => i.status === 'OVERDUE').reduce((a, i) => a + (i.amount - i.paidAmount), 0);

  return ok(res, { plans, installments, payments, receipts, totals: { ...totals, overdue } });
});

export const myMaterials = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const studentId = studentIdOf(req);
  const enrollments = await CourseEnrollment.find({ organizationId: orgId, studentId }).select('courseId').lean();
  const materials = await StudyMaterial.find({
    organizationId: orgId,
    courseId: { $in: enrollments.map((e) => e.courseId) },
    visibility: { $ne: 'PRIVATE' },
  }).populate('courseId', 'title').sort({ createdAt: -1 }).limit(300).lean();
  return ok(res, { items: materials });
});

export const myProfile = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);

  if (auth.role === 'STUDENT') {
    const student = await Student.findOne({ _id: studentIdOf(req), organizationId: orgId })
      .populate('primaryCourseId', 'title code').populate('primaryBatchId', 'name code').lean();
    if (!student) throw ApiError.notFound('Student profile not found');
    const guardian = student.guardianId ? await Parent.findOne({ _id: student.guardianId, organizationId: orgId }).select('name phone email relation').lean() : null;
    return ok(res, { profile: student, guardian });
  }
  if (auth.role === 'TEACHER') {
    const teacher = await Teacher.findOne({ _id: teacherIdOf(req), organizationId: orgId })
      .populate('subjectIds', 'name').populate('courseIds', 'title').lean();
    if (!teacher) throw ApiError.notFound('Teacher profile not found');
    return ok(res, { profile: teacher });
  }
  if (auth.role === 'PARENT') {
    const parent = await Parent.findOne({ _id: auth.parentId, organizationId: orgId }).lean();
    const children = await Student.find({ _id: { $in: parent?.childrenIds ?? [] }, organizationId: orgId })
      .select('name studentCode photoUrl status primaryCourseId primaryBatchId')
      .populate('primaryCourseId', 'title').populate('primaryBatchId', 'name').lean();
    return ok(res, { profile: parent, children });
  }
  throw ApiError.badRequest('No portal profile for this role');
});

/* ------------------------------ Teacher portal ------------------------------ */

export const myBatches = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const teacherId = teacherIdOf(req);
  const batches = await Batch.find({ organizationId: orgId, teacherId })
    .populate('courseId', 'title code').sort({ status: 1, startDate: -1 }).lean();
  return ok(res, { items: batches.map((b) => ({ ...b, available: Math.max(0, b.capacity - b.enrolledCount) })) });
});

export const myClasses = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const teacherId = teacherIdOf(req);
  const from = req.query.from ? dayjs(String(req.query.from)).startOf('day') : dayjs().startOf('day');
  const to = req.query.to ? dayjs(String(req.query.to)).endOf('day') : from.add(14, 'day').endOf('day');
  const classes = await ClassSession.find({
    organizationId: orgId, teacherId, startAt: { $gte: from.toDate(), $lte: to.toDate() },
  }).populate('batchId', 'name code enrolledCount').populate('subjectId', 'name').sort({ startAt: 1 }).limit(300).lean();
  return ok(res, { items: classes, range: { from: from.toDate(), to: to.toDate() } });
});

export const myStudents = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const teacherId = teacherIdOf(req);
  const q = req.query as never as { page: number; limit: number; search?: string; batchId?: string };

  const batches = await Batch.find({ organizationId: orgId, teacherId }).select('_id name').lean();
  const batchIds = q.batchId
    ? batches.filter((b) => String(b._id) === q.batchId).map((b) => b._id)
    : batches.map((b) => b._id);
  if (q.batchId && !batchIds.length) throw ApiError.forbidden('This batch is not assigned to you');

  const enrollments = await BatchEnrollment.find({ organizationId: orgId, batchId: { $in: batchIds }, status: 'ACTIVE' })
    .select('studentId batchId').lean();
  const studentIds = [...new Set(enrollments.map((e) => String(e.studentId)))].map((s) => new Types.ObjectId(s));

  const filter: Record<string, unknown> = { organizationId: orgId, _id: { $in: studentIds } };
  if (q.search) {
    const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { studentCode: rx }, { email: rx }];
  }

  const [items, total] = await Promise.all([
    Student.find(filter).select('name studentCode email phone photoUrl status')
      .sort({ name: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Student.countDocuments(filter),
  ]);

  return paginated(res, items, total, q.page, q.limit, { batches });
});

/* ------------------------------- Parent portal ------------------------------- */

export const myChildren = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const ids = await childIdsOf(req);
  const children = await Student.find({ _id: { $in: ids }, organizationId: orgId })
    .populate('primaryCourseId', 'title code').populate('primaryBatchId', 'name code').lean();

  const enriched = await Promise.all(children.map(async (child) => {
    const [attendance, results, fees, upcoming] = await Promise.all([
      Attendance.aggregate<{ total: number; present: number }>([
        { $match: { organizationId: orgId, studentId: child._id } },
        { $group: { _id: null, total: { $sum: 1 }, present: { $sum: { $cond: [{ $in: ['$status', ['PRESENT', 'LATE']] }, 1, 0] } } } },
      ]),
      TestResult.aggregate<{ avg: number; count: number }>([
        { $match: { organizationId: orgId, studentId: child._id } },
        { $group: { _id: null, avg: { $avg: '$percentage' }, count: { $sum: 1 } } },
      ]),
      FeePlan.aggregate<{ pending: number }>([
        { $match: { organizationId: orgId, studentId: child._id } },
        { $group: { _id: null, pending: { $sum: '$pendingAmount' } } },
      ]),
      ClassSession.countDocuments({
        organizationId: orgId,
        batchId: child.primaryBatchId,
        startAt: { $gte: new Date() },
        status: 'SCHEDULED',
      }),
    ]);
    const a = attendance[0];
    return {
      ...child,
      stats: {
        attendancePercent: a?.total ? Math.round((a.present / a.total) * 1000) / 10 : 0,
        attendanceMarks: a?.total ?? 0,
        averageScore: Math.round((results[0]?.avg ?? 0) * 10) / 10,
        exams: results[0]?.count ?? 0,
        pendingFees: Math.round(fees[0]?.pending ?? 0),
        upcomingClasses: upcoming,
      },
    };
  }));

  return ok(res, { items: enriched });
});

export const childProgress = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const studentId = await assertChild(req, req.params.studentId);
  const enrollments = await CourseEnrollment.find({ organizationId: orgId, studentId })
    .populate('courseId', 'title code').lean();
  const lessonProgress = await LessonProgress.find({ organizationId: orgId, studentId })
    .sort({ lastWatchedAt: -1 }).limit(20)
    .populate('lessonId', 'title').lean();
  return ok(res, { enrollments, recentActivity: lessonProgress });
});

/* --------------------------- Shared portal utilities -------------------------- */

export const lessonMaterialUrl = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const studentId = studentIdOf(req);
  const lesson = await Lesson.findOne({ _id: req.params.lessonId, organizationId: orgId }).lean();
  if (!lesson) throw ApiError.notFound('Lesson not found');
  await learning.assertEnrolled(orgId, studentId, lesson.courseId);

  const attachments = await StudyMaterial.find({
    _id: { $in: lesson.attachmentIds ?? [] }, organizationId: orgId, visibility: { $ne: 'PRIVATE' },
  }).lean();
  if (!attachments.length) throw ApiError.notFound('This lesson has no downloadable attachments');

  const storage = getStorage();
  const items = await Promise.all(attachments.map(async (m) => ({
    id: String(m._id),
    title: m.title,
    type: m.type,
    fileName: m.fileName,
    url: m.externalUrl ?? (m.storageKey ? await storage.getSignedUrl(m.storageKey, 900) : null),
    content: m.content ?? null,
  })));
  return ok(res, { items });
});

export const courseCatalog = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const q = req.query as never as { search?: string };
  const filter: Record<string, unknown> = { organizationId: orgId, status: 'PUBLISHED' };
  if (q.search) filter.title = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const courses = await Course.find(filter).select('title code description thumbnailUrl level type price discount durationWeeks').sort({ title: 1 }).limit(100).lean();
  return ok(res, { items: courses });
});

export const batchStudents = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const batch = await Batch.findOne({ _id: toObjectId(req.params.batchId), organizationId: orgId }).lean();
  if (!batch) throw ApiError.notFound('Batch not found');
  if (auth.role === 'TEACHER' && String(batch.teacherId ?? '') !== String(auth.teacherId)) {
    throw ApiError.forbidden('This batch is not assigned to you');
  }
  const enrollments = await BatchEnrollment.find({ organizationId: orgId, batchId: batch._id, status: 'ACTIVE' })
    .populate('studentId', 'name studentCode photoUrl phone email').lean();
  return ok(res, { batch, students: enrollments.map((e) => e.studentId).filter(Boolean) });
});
