import { Request, Response } from 'express';
import { Types } from 'mongoose';
import dayjs from 'dayjs';
import { asyncHandler, ok, created, paginated } from '../utils/http';
import { requireAuth, requireOrg } from '../middleware/auth';
import * as courseService from '../services/course.service';
import * as scheduleService from '../services/schedule.service';
import { recordAudit } from '../services/audit.service';
import {
  Course, Subject, CourseModule, Lesson, Batch, BatchEnrollment, ClassSession, Attendance,
  Exam, TestResult, calculateGrade, Assignment, AssignmentSubmission, Student, Teacher,
  CourseEnrollment,
} from '../models';
import { listScoped, findScoped, assertBelongsToOrg, updateScoped, deleteScoped } from '../services/crud.factory';
import { ApiError } from '../utils/ApiError';
import { toObjectId } from '../utils/ids';
import { dateRangeFilter } from '../utils/query';
import { notifyMany } from '../services/notification.service';
import { User } from '../models/User';

/* ---------------------------------- Courses --------------------------------- */

export const listCourses = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number };
  const { items, total } = await courseService.listCourses(requireOrg(req), q as never);
  return paginated(res, items, total, q.page, q.limit);
});

export const createCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await courseService.createCourse(requireOrg(req), requireAuth(req), req.body);
  await recordAudit(req, { action: 'COURSE_CREATED', entity: 'Course', entityId: course._id, metadata: { title: course.title } });
  return created(res, course);
});

export const getCourse = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await courseService.courseTree(requireOrg(req), req.params.id));
});

export const updateCourse = asyncHandler(async (req: Request, res: Response) => {
  const c = await courseService.updateCourse(requireOrg(req), req.params.id, req.body);
  await recordAudit(req, { action: 'COURSE_UPDATED', entity: 'Course', entityId: req.params.id });
  return ok(res, c);
});

export const deleteCourse = asyncHandler(async (req: Request, res: Response) => {
  const r = await courseService.deleteCourse(requireOrg(req), req.params.id);
  await recordAudit(req, { action: r.archived ? 'COURSE_ARCHIVED' : 'COURSE_DELETED', entity: 'Course', entityId: req.params.id });
  return ok(res, r);
});

export const courseOptions = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const [courses, batches, teachers, subjects] = await Promise.all([
    Course.find({ organizationId: orgId, status: { $ne: 'ARCHIVED' } }).select('title code price discount type status').sort({ title: 1 }).lean(),
    Batch.find({ organizationId: orgId, status: { $ne: 'CANCELLED' } }).select('name code courseId capacity enrolledCount startDate status').sort({ name: 1 }).lean(),
    Teacher.find({ organizationId: orgId, isActive: true }).select('name email employeeCode').sort({ name: 1 }).lean(),
    Subject.find({ organizationId: orgId, isActive: true }).select('name code').sort({ name: 1 }).lean(),
  ]);
  const counselors = await User.find({ organizationId: orgId, role: { $in: ['COUNSELOR', 'ORGANIZATION_ADMIN', 'STAFF'] }, isActive: true })
    .select('name email role').sort({ name: 1 }).lean();
  return ok(res, { courses, batches, teachers, subjects, counselors });
});

/* ---------------------------------- Subjects -------------------------------- */

export const listSubjects = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; sort?: string; order?: 'asc' | 'desc' };
  const { items, total } = await listScoped(Subject, {
    organizationId: requireOrg(req), page: q.page, limit: q.limit, search: q.search, sort: q.sort, order: q.order,
    searchFields: ['name', 'code'],
    populate: [{ path: 'courseIds', select: 'title' }, { path: 'teacherIds', select: 'name' }],
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const createSubject = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  for (const c of req.body.courseIds ?? []) await assertBelongsToOrg(Course, c, orgId, 'Course');
  for (const t of req.body.teacherIds ?? []) await assertBelongsToOrg(Teacher, t, orgId, 'Teacher');
  const exists = await Subject.findOne({ organizationId: orgId, code: req.body.code.toUpperCase() }).lean();
  if (exists) throw ApiError.conflict('A subject with this code already exists', { code: 'Already in use' });
  const subject = await Subject.create({ ...req.body, organizationId: orgId });
  await recordAudit(req, { action: 'SUBJECT_CREATED', entity: 'Subject', entityId: subject._id });
  return created(res, subject.toObject());
});

export const updateSubject = asyncHandler(async (req: Request, res: Response) => {
  const s = await updateScoped(Subject, req.params.id, requireOrg(req), req.body, 'Subject not found');
  await recordAudit(req, { action: 'SUBJECT_UPDATED', entity: 'Subject', entityId: req.params.id });
  return ok(res, s);
});

export const deleteSubject = asyncHandler(async (req: Request, res: Response) => {
  await deleteScoped(Subject, req.params.id, requireOrg(req), 'Subject not found');
  await recordAudit(req, { action: 'SUBJECT_DELETED', entity: 'Subject', entityId: req.params.id });
  return ok(res, { id: req.params.id });
});

/* ------------------------------- Course builder ------------------------------ */

export const createModule = asyncHandler(async (req: Request, res: Response) => {
  const m = await courseService.createModule(requireOrg(req), req.params.id, req.body);
  await recordAudit(req, { action: 'MODULE_CREATED', entity: 'CourseModule', entityId: m._id });
  return created(res, m);
});

export const updateModule = asyncHandler(async (req: Request, res: Response) => {
  const m = await updateScoped(CourseModule, req.params.moduleId, requireOrg(req), req.body, 'Module not found');
  await recordAudit(req, { action: 'MODULE_UPDATED', entity: 'CourseModule', entityId: req.params.moduleId });
  return ok(res, m);
});

export const deleteModule = asyncHandler(async (req: Request, res: Response) => {
  const r = await courseService.deleteModule(requireOrg(req), req.params.moduleId);
  await recordAudit(req, { action: 'MODULE_DELETED', entity: 'CourseModule', entityId: req.params.moduleId });
  return ok(res, r);
});

export const reorderModules = asyncHandler(async (req: Request, res: Response) => {
  const r = await courseService.reorder(requireOrg(req), 'module', req.body.items);
  return ok(res, r);
});

export const createLesson = asyncHandler(async (req: Request, res: Response) => {
  const l = await courseService.createLesson(requireOrg(req), requireAuth(req), req.params.id, req.body);
  await recordAudit(req, { action: 'LESSON_CREATED', entity: 'Lesson', entityId: l._id });
  return created(res, l);
});

export const updateLesson = asyncHandler(async (req: Request, res: Response) => {
  const l = await courseService.updateLesson(requireOrg(req), req.params.lessonId, req.body);
  await recordAudit(req, { action: 'LESSON_UPDATED', entity: 'Lesson', entityId: req.params.lessonId });
  return ok(res, l);
});

export const deleteLesson = asyncHandler(async (req: Request, res: Response) => {
  const r = await courseService.deleteLesson(requireOrg(req), req.params.lessonId);
  await recordAudit(req, { action: 'LESSON_DELETED', entity: 'Lesson', entityId: req.params.lessonId });
  return ok(res, r);
});

export const reorderLessons = asyncHandler(async (req: Request, res: Response) => {
  const r = await courseService.reorder(requireOrg(req), 'lesson', req.body.items);
  return ok(res, r);
});

export const listLessons = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; courseId?: string; sort?: string; order?: 'asc' | 'desc' };
  const filter: Record<string, unknown> = {};
  if (q.courseId) filter.courseId = toObjectId(q.courseId);
  const { items, total } = await listScoped(Lesson, {
    organizationId: requireOrg(req), page: q.page, limit: q.limit, search: q.search, sort: q.sort, order: q.order,
    searchFields: ['title', 'description'], filter,
    populate: [{ path: 'courseId', select: 'title code' }, { path: 'moduleId', select: 'title' }],
  });
  return paginated(res, items, total, q.page, q.limit);
});

/* ---------------------------------- Batches --------------------------------- */

export const listBatches = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number };
  const { items, total } = await scheduleService.listBatches(requireOrg(req), q as never);
  return paginated(res, items, total, q.page, q.limit);
});

export const createBatch = asyncHandler(async (req: Request, res: Response) => {
  const b = await scheduleService.createBatch(requireOrg(req), requireAuth(req), req.body);
  await recordAudit(req, { action: 'BATCH_CREATED', entity: 'Batch', entityId: b._id, metadata: { name: b.name } });
  return created(res, b);
});

export const getBatch = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await scheduleService.batchDetail(requireOrg(req), req.params.id));
});

export const updateBatch = asyncHandler(async (req: Request, res: Response) => {
  const b = await scheduleService.updateBatch(requireOrg(req), req.params.id, req.body);
  await recordAudit(req, { action: 'BATCH_UPDATED', entity: 'Batch', entityId: req.params.id });
  return ok(res, b);
});

export const deleteBatch = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const batch = await Batch.findOne({ _id: req.params.id, organizationId: orgId });
  if (!batch) throw ApiError.notFound('Batch not found');
  if (batch.enrolledCount > 0) {
    batch.status = 'CANCELLED';
    await batch.save();
    await recordAudit(req, { action: 'BATCH_CANCELLED', entity: 'Batch', entityId: batch._id });
    return ok(res, { cancelled: true, id: req.params.id, message: 'Batch cancelled (it has enrolled students)' });
  }
  await Batch.deleteOne({ _id: batch._id, organizationId: orgId });
  await recordAudit(req, { action: 'BATCH_DELETED', entity: 'Batch', entityId: req.params.id });
  return ok(res, { cancelled: false, id: req.params.id });
});

export const enrollInBatch = asyncHandler(async (req: Request, res: Response) => {
  const r = await scheduleService.enrollStudentsInBatch(requireOrg(req), req.params.id, req.body.studentIds);
  await recordAudit(req, { action: 'BATCH_ENROLLED', entity: 'Batch', entityId: req.params.id, metadata: r });
  return ok(res, r);
});

export const removeFromBatch = asyncHandler(async (req: Request, res: Response) => {
  const r = await scheduleService.removeStudentFromBatch(requireOrg(req), req.params.id, req.params.studentId);
  await recordAudit(req, { action: 'BATCH_STUDENT_REMOVED', entity: 'Batch', entityId: req.params.id, metadata: r });
  return ok(res, r);
});

/* ---------------------------------- Classes --------------------------------- */

export const listClasses = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number };
  const auth = requireAuth(req);
  const params = { ...(q as never as Record<string, unknown>) };
  // Teachers only see their own classes
  if (auth.role === 'TEACHER' && auth.teacherId) params.teacherId = String(auth.teacherId);
  const { items, total } = await scheduleService.listClasses(requireOrg(req), params as never);
  return paginated(res, items, total, q.page, q.limit);
});

export const createClass = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const body = { ...req.body };
  if (auth.role === 'TEACHER' && auth.teacherId) body.teacherId = String(auth.teacherId);
  const c = await scheduleService.createClass(requireOrg(req), auth, body);
  await recordAudit(req, { action: 'CLASS_CREATED', entity: 'ClassSession', entityId: c._id });
  return created(res, c);
});

export const getClass = asyncHandler(async (req: Request, res: Response) => {
  const c = await findScoped(ClassSession, req.params.id, requireOrg(req), {
    populate: [
      { path: 'batchId', select: 'name code capacity enrolledCount' },
      { path: 'courseId', select: 'title code' },
      { path: 'teacherId', select: 'name email' },
      { path: 'subjectId', select: 'name code' },
    ],
    notFoundMessage: 'Class not found',
  });
  return ok(res, c);
});

export const updateClass = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const orgId = requireOrg(req);
  if (auth.role === 'TEACHER' && auth.teacherId) {
    const existing = await ClassSession.findOne({ _id: req.params.id, organizationId: orgId }).lean();
    if (!existing) throw ApiError.notFound('Class not found');
    if (String(existing.teacherId) !== String(auth.teacherId)) throw ApiError.forbidden('You can only edit your own classes');
  }
  const c = await scheduleService.updateClass(orgId, req.params.id, req.body);
  await recordAudit(req, { action: 'CLASS_UPDATED', entity: 'ClassSession', entityId: req.params.id });
  return ok(res, c);
});

export const deleteClass = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const session = await ClassSession.findOne({ _id: req.params.id, organizationId: orgId });
  if (!session) throw ApiError.notFound('Class not found');
  const attendanceCount = await Attendance.countDocuments({ organizationId: orgId, classSessionId: session._id });
  if (attendanceCount > 0) {
    session.status = 'CANCELLED';
    await session.save();
    return ok(res, { cancelled: true, id: req.params.id, message: 'Class cancelled (attendance already recorded)' });
  }
  await ClassSession.deleteOne({ _id: session._id, organizationId: orgId });
  await recordAudit(req, { action: 'CLASS_DELETED', entity: 'ClassSession', entityId: req.params.id });
  return ok(res, { cancelled: false, id: req.params.id });
});

export const generateClasses = asyncHandler(async (req: Request, res: Response) => {
  const r = await scheduleService.generateClassesFromSchedule(requireOrg(req), requireAuth(req), req.body);
  await recordAudit(req, { action: 'CLASSES_GENERATED', entity: 'ClassSession', metadata: r });
  return created(res, r);
});

/* -------------------------------- Attendance -------------------------------- */

export const attendanceSheet = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const orgId = requireOrg(req);
  const sheet = await scheduleService.attendanceSheet(orgId, req.params.classSessionId);
  if (auth.role === 'TEACHER' && auth.teacherId && String((sheet.classSession as { teacherId: Types.ObjectId }).teacherId) !== String(auth.teacherId)) {
    throw ApiError.forbidden('You can only view attendance for classes you teach');
  }
  return ok(res, sheet);
});

export const markAttendance = asyncHandler(async (req: Request, res: Response) => {
  const r = await scheduleService.markAttendance(requireOrg(req), requireAuth(req), req.body);
  await recordAudit(req, { action: 'ATTENDANCE_MARKED', entity: 'Attendance', entityId: req.body.classSessionId, metadata: r });
  return ok(res, r);
});

export const listAttendance = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; batchId?: string; studentId?: string; classSessionId?: string; status?: string; from?: string; to?: string; sort?: string; order?: 'asc' | 'desc' };
  const filter: Record<string, unknown> = {};
  if (q.batchId) filter.batchId = toObjectId(q.batchId);
  if (q.studentId) filter.studentId = toObjectId(q.studentId);
  if (q.classSessionId) filter.classSessionId = toObjectId(q.classSessionId);
  if (q.status) filter.status = q.status;
  const range = dateRangeFilter(q.from, q.to);
  if (range) filter.date = range;

  const { items, total } = await listScoped(Attendance, {
    organizationId: requireOrg(req), page: q.page, limit: q.limit, sort: q.sort ?? 'date', order: q.order ?? 'desc',
    filter,
    populate: [
      { path: 'studentId', select: 'name studentCode' },
      { path: 'batchId', select: 'name code' },
      { path: 'classSessionId', select: 'title startTime endTime' },
    ],
    defaultSort: 'date',
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const attendanceReport = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const q = req.query as never as { batchId?: string; from?: string; to?: string };
  const match: Record<string, unknown> = { organizationId: orgId };
  if (q.batchId) match.batchId = toObjectId(q.batchId);
  const range = dateRangeFilter(q.from, q.to);
  if (range) match.date = range;

  const rows = await Attendance.aggregate<{ _id: Types.ObjectId; total: number; present: number; late: number; absent: number; leave: number }>([
    { $match: match },
    {
      $group: {
        _id: '$studentId',
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'PRESENT'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'LATE'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } },
        leave: { $sum: { $cond: [{ $eq: ['$status', 'LEAVE'] }, 1, 0] } },
      },
    },
    { $sort: { total: -1 } },
    { $limit: 500 },
  ]);
  const students = await Student.find({ _id: { $in: rows.map((r) => r._id) }, organizationId: orgId }).select('name studentCode').lean();
  const map = new Map(students.map((s) => [String(s._id), s]));
  return ok(res, {
    rows: rows.map((r) => ({
      studentId: String(r._id),
      student: map.get(String(r._id)) ?? null,
      ...r,
      percentage: r.total ? Math.round(((r.present + r.late) / r.total) * 1000) / 10 : 0,
    })),
  });
});

/* ----------------------------------- Exams ---------------------------------- */

export const listExams = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; status?: string; courseId?: string; batchId?: string; from?: string; to?: string; sort?: string; order?: 'asc' | 'desc' };
  const auth = requireAuth(req);
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.courseId) filter.courseId = toObjectId(q.courseId);
  if (q.batchId) filter.batchId = toObjectId(q.batchId);
  const range = dateRangeFilter(q.from, q.to);
  if (range) filter.date = range;
  if (auth.role === 'TEACHER' && auth.teacherId) filter.teacherId = auth.teacherId;

  const { items, total } = await listScoped(Exam, {
    organizationId: requireOrg(req), page: q.page, limit: q.limit, search: q.search, sort: q.sort ?? 'date', order: q.order ?? 'desc',
    searchFields: ['title', 'instructions'], filter,
    populate: [
      { path: 'courseId', select: 'title code' },
      { path: 'batchId', select: 'name code' },
      { path: 'subjectId', select: 'name' },
      { path: 'teacherId', select: 'name' },
    ],
    defaultSort: 'date',
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const createExam = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  await assertBelongsToOrg(Course, req.body.courseId, orgId, 'Course');
  if (req.body.batchId) await assertBelongsToOrg(Batch, req.body.batchId, orgId, 'Batch');
  if (req.body.subjectId) await assertBelongsToOrg(Subject, req.body.subjectId, orgId, 'Subject');
  if (req.body.passingMarks > req.body.totalMarks) {
    throw ApiError.validation('Passing marks cannot exceed total marks', { passingMarks: 'Too high' });
  }
  const teacherId = auth.role === 'TEACHER' && auth.teacherId ? auth.teacherId : req.body.teacherId || undefined;
  const exam = await Exam.create({
    ...req.body,
    teacherId,
    batchId: req.body.batchId || undefined,
    subjectId: req.body.subjectId || undefined,
    date: new Date(req.body.date),
    organizationId: orgId,
    createdBy: auth.userId,
  });
  await recordAudit(req, { action: 'EXAM_CREATED', entity: 'Exam', entityId: exam._id, metadata: { title: exam.title } });
  return created(res, exam.toObject());
});

export const getExam = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const exam = await findScoped(Exam, req.params.id, orgId, {
    populate: [
      { path: 'courseId', select: 'title code' },
      { path: 'batchId', select: 'name code' },
      { path: 'subjectId', select: 'name' },
      { path: 'teacherId', select: 'name' },
    ],
    notFoundMessage: 'Exam not found',
  }) as { _id: Types.ObjectId; batchId?: { _id: Types.ObjectId }; totalMarks: number };

  const results = await TestResult.find({ organizationId: orgId, examId: exam._id })
    .populate('studentId', 'name studentCode').sort({ marksObtained: -1 }).lean();

  let eligibleStudents: unknown[] = [];
  if (exam.batchId) {
    const enrollments = await BatchEnrollment.find({ organizationId: orgId, batchId: (exam.batchId as { _id: Types.ObjectId })._id, status: 'ACTIVE' })
      .populate('studentId', 'name studentCode').lean();
    eligibleStudents = enrollments.map((e) => e.studentId).filter(Boolean);
  }

  const stats = results.length
    ? {
        appeared: results.length,
        passed: results.filter((r) => r.passed).length,
        failed: results.filter((r) => !r.passed).length,
        average: Math.round((results.reduce((a, r) => a + r.percentage, 0) / results.length) * 10) / 10,
        highest: Math.max(...results.map((r) => r.marksObtained)),
        lowest: Math.min(...results.map((r) => r.marksObtained)),
      }
    : null;

  return ok(res, { exam, results, eligibleStudents, stats });
});

export const updateExam = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const exam = await Exam.findOne({ _id: req.params.id, organizationId: orgId });
  if (!exam) throw ApiError.notFound('Exam not found');
  if (auth.role === 'TEACHER' && auth.teacherId && exam.teacherId && String(exam.teacherId) !== String(auth.teacherId)) {
    throw ApiError.forbidden('You can only edit your own exams');
  }
  Object.entries(req.body).forEach(([k, v]) => {
    if (v === undefined) return;
    if (k === 'date') exam.date = new Date(v as string);
    else if ((k === 'batchId' || k === 'subjectId' || k === 'teacherId') && v === '') (exam as never as Record<string, unknown>)[k] = undefined;
    else (exam as never as Record<string, unknown>)[k] = v;
  });
  await exam.save();
  await recordAudit(req, { action: 'EXAM_UPDATED', entity: 'Exam', entityId: exam._id });
  return ok(res, exam.toObject());
});

export const deleteExam = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const count = await TestResult.countDocuments({ organizationId: orgId, examId: req.params.id });
  if (count > 0) throw ApiError.conflict(`This exam has ${count} result(s) recorded and cannot be deleted.`);
  await deleteScoped(Exam, req.params.id, orgId, 'Exam not found');
  await recordAudit(req, { action: 'EXAM_DELETED', entity: 'Exam', entityId: req.params.id });
  return ok(res, { id: req.params.id });
});

/* ---------------------------------- Results --------------------------------- */

export const enterResults = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const exam = await Exam.findOne({ _id: req.params.id, organizationId: orgId });
  if (!exam) throw ApiError.notFound('Exam not found');
  if (auth.role === 'TEACHER' && auth.teacherId && exam.teacherId && String(exam.teacherId) !== String(auth.teacherId)) {
    throw ApiError.forbidden('You can only enter results for your own exams');
  }

  const studentIds = req.body.results.map((r: { studentId: string }) => r.studentId);
  const students = await Student.find({ _id: { $in: studentIds }, organizationId: orgId }).select('_id userId name').lean();
  if (students.length !== studentIds.length) throw ApiError.notFound('One or more students were not found in your academy');
  const studentMap = new Map(students.map((s) => [String(s._id), s]));

  const ops = req.body.results.map((r: { studentId: string; marksObtained: number; remarks?: string }) => {
    if (r.marksObtained > exam.totalMarks) {
      throw ApiError.validation(`Marks for ${studentMap.get(r.studentId)?.name ?? 'a student'} exceed the exam total of ${exam.totalMarks}`, { marksObtained: 'Exceeds total marks' });
    }
    const percentage = Math.round((r.marksObtained / exam.totalMarks) * 1000) / 10;
    return {
      updateOne: {
        filter: { organizationId: orgId, examId: exam._id, studentId: new Types.ObjectId(r.studentId) },
        update: {
          $set: {
            courseId: exam.courseId,
            batchId: exam.batchId,
            marksObtained: r.marksObtained,
            totalMarks: exam.totalMarks,
            percentage,
            grade: calculateGrade(percentage),
            passed: r.marksObtained >= exam.passingMarks,
            remarks: r.remarks,
            evaluatedBy: auth.userId,
            evaluatedAt: new Date(),
          },
        },
        upsert: true,
      },
    };
  });

  const result = await TestResult.bulkWrite(ops);

  // Rank within the exam
  const all = await TestResult.find({ organizationId: orgId, examId: exam._id }).sort({ marksObtained: -1 });
  await Promise.all(all.map((r, idx) => TestResult.updateOne({ _id: r._id }, { rank: idx + 1 })));

  if (req.body.publish) {
    exam.status = 'COMPLETED';
    exam.resultPublished = true;
    await exam.save();

    const notifications = students
      .filter((s) => s.userId)
      .map((s) => ({
        organizationId: orgId,
        userId: s.userId!,
        type: 'RESULT' as const,
        title: `Result published: ${exam.title}`,
        message: `Your result for ${exam.title} is now available.`,
        link: '/student/results',
        entity: 'Exam',
        entityId: String(exam._id),
      }));
    await notifyMany(notifications);
  }

  await recordAudit(req, {
    action: 'RESULTS_ENTERED', entity: 'TestResult', entityId: exam._id,
    metadata: { count: req.body.results.length, published: req.body.publish },
  });
  return ok(res, { saved: (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0), published: req.body.publish });
});

export const listResults = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; examId?: string; studentId?: string; batchId?: string; courseId?: string; passed?: string; sort?: string; order?: 'asc' | 'desc' };
  const filter: Record<string, unknown> = {};
  if (q.examId) filter.examId = toObjectId(q.examId);
  if (q.studentId) filter.studentId = toObjectId(q.studentId);
  if (q.batchId) filter.batchId = toObjectId(q.batchId);
  if (q.courseId) filter.courseId = toObjectId(q.courseId);
  if (q.passed) filter.passed = q.passed === 'true';

  const { items, total } = await listScoped(TestResult, {
    organizationId: requireOrg(req), page: q.page, limit: q.limit, sort: q.sort, order: q.order,
    filter,
    populate: [
      { path: 'studentId', select: 'name studentCode' },
      { path: 'examId', select: 'title date type totalMarks passingMarks' },
      { path: 'courseId', select: 'title' },
      { path: 'batchId', select: 'name' },
    ],
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const deleteResult = asyncHandler(async (req: Request, res: Response) => {
  await deleteScoped(TestResult, req.params.id, requireOrg(req), 'Result not found');
  await recordAudit(req, { action: 'RESULT_DELETED', entity: 'TestResult', entityId: req.params.id });
  return ok(res, { id: req.params.id });
});

/* -------------------------------- Assignments -------------------------------- */

export const listAssignments = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; courseId?: string; batchId?: string; status?: string; sort?: string; order?: 'asc' | 'desc' };
  const auth = requireAuth(req);
  const orgId = requireOrg(req);
  const filter: Record<string, unknown> = {};
  if (q.courseId) filter.courseId = toObjectId(q.courseId);
  if (q.batchId) filter.batchId = toObjectId(q.batchId);
  if (q.status) filter.status = q.status;
  if (auth.role === 'TEACHER' && auth.teacherId) filter.teacherId = auth.teacherId;

  const { items, total } = await listScoped(Assignment, {
    organizationId: orgId, page: q.page, limit: q.limit, search: q.search, sort: q.sort ?? 'dueDate', order: q.order ?? 'desc',
    searchFields: ['title', 'description'], filter,
    populate: [{ path: 'courseId', select: 'title code' }, { path: 'batchId', select: 'name code' }, { path: 'teacherId', select: 'name' }],
    defaultSort: 'dueDate',
  });

  const ids = items.map((a) => (a as { _id: Types.ObjectId })._id);
  const counts = await AssignmentSubmission.aggregate<{ _id: Types.ObjectId; c: number; graded: number }>([
    { $match: { organizationId: orgId, assignmentId: { $in: ids } } },
    { $group: { _id: '$assignmentId', c: { $sum: 1 }, graded: { $sum: { $cond: [{ $eq: ['$status', 'GRADED'] }, 1, 0] } } } },
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c]));

  return paginated(
    res,
    items.map((a) => {
      const row = map.get(String((a as { _id: Types.ObjectId })._id));
      return { ...a, submissions: row?.c ?? 0, graded: row?.graded ?? 0 };
    }),
    total, q.page, q.limit,
  );
});

export const createAssignment = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  await assertBelongsToOrg(Course, req.body.courseId, orgId, 'Course');
  if (req.body.batchId) await assertBelongsToOrg(Batch, req.body.batchId, orgId, 'Batch');
  if (req.body.lessonId) await assertBelongsToOrg(Lesson, req.body.lessonId, orgId, 'Lesson');

  const teacherId = auth.role === 'TEACHER' && auth.teacherId ? auth.teacherId : req.body.teacherId || undefined;
  const assignment = await Assignment.create({
    ...req.body,
    teacherId,
    batchId: req.body.batchId || undefined,
    lessonId: req.body.lessonId || undefined,
    dueDate: new Date(req.body.dueDate),
    organizationId: orgId,
    createdBy: auth.userId,
  });

  if (assignment.status === 'PUBLISHED') {
    const studentFilter: Record<string, unknown> = { organizationId: orgId, courseId: assignment.courseId, status: 'ACTIVE' };
    const enrollments = await CourseEnrollment.find(studentFilter).select('studentId').lean();
    const students = await Student.find({ _id: { $in: enrollments.map((e) => e.studentId) }, organizationId: orgId })
      .select('userId').lean();
    await notifyMany(
      students.filter((s) => s.userId).map((s) => ({
        organizationId: orgId,
        userId: s.userId!,
        type: 'ASSIGNMENT' as const,
        title: 'New assignment published',
        message: `${assignment.title} — due ${dayjs(assignment.dueDate).format('DD MMM YYYY')}`,
        link: '/student/assignments',
        entity: 'Assignment',
        entityId: String(assignment._id),
      })),
    );
  }

  await recordAudit(req, { action: 'ASSIGNMENT_CREATED', entity: 'Assignment', entityId: assignment._id });
  return created(res, assignment.toObject());
});

export const getAssignment = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const assignment = await findScoped(Assignment, req.params.id, orgId, {
    populate: [{ path: 'courseId', select: 'title code' }, { path: 'batchId', select: 'name code' }, { path: 'teacherId', select: 'name' }],
    notFoundMessage: 'Assignment not found',
  }) as { _id: Types.ObjectId };
  const submissions = await AssignmentSubmission.find({ organizationId: orgId, assignmentId: assignment._id })
    .populate('studentId', 'name studentCode photoUrl').sort({ submittedAt: -1 }).lean();
  return ok(res, { assignment, submissions });
});

export const updateAssignment = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const a = await Assignment.findOne({ _id: req.params.id, organizationId: orgId });
  if (!a) throw ApiError.notFound('Assignment not found');
  if (auth.role === 'TEACHER' && auth.teacherId && a.teacherId && String(a.teacherId) !== String(auth.teacherId)) {
    throw ApiError.forbidden('You can only edit your own assignments');
  }
  Object.entries(req.body).forEach(([k, v]) => {
    if (v === undefined) return;
    if (k === 'dueDate') a.dueDate = new Date(v as string);
    else (a as never as Record<string, unknown>)[k] = v;
  });
  await a.save();
  await recordAudit(req, { action: 'ASSIGNMENT_UPDATED', entity: 'Assignment', entityId: a._id });
  return ok(res, a.toObject());
});

export const deleteAssignment = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  await deleteScoped(Assignment, req.params.id, orgId, 'Assignment not found');
  await AssignmentSubmission.deleteMany({ organizationId: orgId, assignmentId: req.params.id });
  await recordAudit(req, { action: 'ASSIGNMENT_DELETED', entity: 'Assignment', entityId: req.params.id });
  return ok(res, { id: req.params.id });
});

export const gradeSubmission = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const submission = await AssignmentSubmission.findOne({ _id: req.params.submissionId, organizationId: orgId });
  if (!submission) throw ApiError.notFound('Submission not found');
  const assignment = await Assignment.findOne({ _id: submission.assignmentId, organizationId: orgId }).lean();
  if (!assignment) throw ApiError.notFound('Assignment not found');
  if (auth.role === 'TEACHER' && auth.teacherId && assignment.teacherId && String(assignment.teacherId) !== String(auth.teacherId)) {
    throw ApiError.forbidden('You can only grade your own assignments');
  }
  if (req.body.marksAwarded > assignment.totalMarks) {
    throw ApiError.validation(`Marks cannot exceed the assignment total of ${assignment.totalMarks}`, { marksAwarded: 'Too high' });
  }

  submission.marksAwarded = req.body.marksAwarded;
  submission.feedback = req.body.feedback;
  submission.status = 'GRADED';
  submission.gradedBy = auth.userId;
  submission.gradedAt = new Date();
  await submission.save();

  const student = await Student.findById(submission.studentId).select('userId').lean();
  if (student?.userId) {
    await notifyMany([{
      organizationId: orgId,
      userId: student.userId,
      type: 'ASSIGNMENT',
      title: 'Assignment graded',
      message: `${assignment.title}: ${req.body.marksAwarded}/${assignment.totalMarks}`,
      link: '/student/assignments',
      entity: 'Assignment',
      entityId: String(assignment._id),
    }]);
  }

  await recordAudit(req, { action: 'ASSIGNMENT_GRADED', entity: 'AssignmentSubmission', entityId: submission._id });
  return ok(res, submission.toObject());
});
