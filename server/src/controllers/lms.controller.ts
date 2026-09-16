import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler, ok, created, paginated } from '../utils/http';
import { requireAuth, requireOrg } from '../middleware/auth';
import { recordAudit } from '../services/audit.service';
import {
  Video, StudyMaterial, Quiz, QuizQuestion, QuizAttempt, Course, CourseModule, Lesson,
  CourseEnrollment, Batch, Student, LessonProgress,
} from '../models';
import { listScoped, findScoped, assertBelongsToOrg, updateScoped, deleteScoped } from '../services/crud.factory';
import { ApiError } from '../utils/ApiError';
import { toObjectId } from '../utils/ids';
import { assertWithinLimit } from '../services/subscription.service';
import { getStorage } from '../services/storage';

/* ---------------------------------- Videos ---------------------------------- */

export const listVideos = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; courseId?: string; provider?: string; sort?: string; order?: 'asc' | 'desc' };
  const filter: Record<string, unknown> = {};
  if (q.courseId) filter.courseId = toObjectId(q.courseId);
  if (q.provider) filter.provider = q.provider;
  const { items, total } = await listScoped(Video, {
    organizationId: requireOrg(req), page: q.page, limit: q.limit, search: q.search, sort: q.sort, order: q.order,
    searchFields: ['title', 'description'], filter,
    populate: [{ path: 'courseId', select: 'title code' }, { path: 'lessonId', select: 'title' }],
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const createVideo = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  await assertWithinLimit(orgId, 'videos', 1);
  if (req.body.courseId) await assertBelongsToOrg(Course, req.body.courseId, orgId, 'Course');
  if (req.body.lessonId) await assertBelongsToOrg(Lesson, req.body.lessonId, orgId, 'Lesson');

  const video = await Video.create({
    ...req.body,
    courseId: req.body.courseId || undefined,
    lessonId: req.body.lessonId || undefined,
    publicUrl: req.body.provider === 'youtube' || req.body.provider === 'vimeo' ? req.body.publicUrl || undefined : undefined,
    organizationId: orgId,
    uploadedBy: auth.userId,
  });
  if (req.body.lessonId) {
    await Lesson.updateOne({ _id: req.body.lessonId, organizationId: orgId }, { videoId: video._id, type: 'VIDEO', durationSeconds: req.body.durationSeconds || 0 });
  }
  await recordAudit(req, { action: 'VIDEO_CREATED', entity: 'Video', entityId: video._id, metadata: { title: video.title } });
  return created(res, video.toObject());
});

export const getVideo = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const video = await findScoped(Video, req.params.id, orgId, { notFoundMessage: 'Video not found' }) as {
    _id: Types.ObjectId; provider: string; storageKey: string; visibility: string;
  };
  const playback = await buildPlayback(video);
  return ok(res, { video, playback });
});

/**
 * Returns an authorized playback descriptor. Private/enrolled files are only ever
 * exposed as a short-lived signed URL, never as a raw storage path.
 */
async function buildPlayback(video: { provider: string; storageKey: string; publicUrl?: string }) {
  if (video.provider === 'youtube') return { kind: 'youtube', url: video.storageKey, provider: 'youtube' };
  if (video.provider === 'vimeo') return { kind: 'vimeo', url: video.storageKey, provider: 'vimeo' };
  const storage = getStorage();
  return { kind: 'file', url: await storage.getSignedUrl(video.storageKey, 3600), provider: video.provider };
}

export const updateVideo = asyncHandler(async (req: Request, res: Response) => {
  const v = await updateScoped(Video, req.params.id, requireOrg(req), req.body, 'Video not found');
  await recordAudit(req, { action: 'VIDEO_UPDATED', entity: 'Video', entityId: req.params.id });
  return ok(res, v);
});

export const deleteVideo = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const video = await Video.findOne({ _id: req.params.id, organizationId: orgId }).lean();
  if (!video) throw ApiError.notFound('Video not found');
  if (['local', 's3', 'cloudinary'].includes(video.provider)) {
    await getStorage().delete(video.storageKey).catch(() => undefined);
  }
  await Video.deleteOne({ _id: video._id, organizationId: orgId });
  await Lesson.updateMany({ organizationId: orgId, videoId: video._id }, { $unset: { videoId: 1 } });
  await recordAudit(req, { action: 'VIDEO_DELETED', entity: 'Video', entityId: req.params.id });
  return ok(res, { id: req.params.id });
});

/** Student/parent-safe video access: enforces enrollment before signing a URL. */
export const streamVideoForStudent = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const video = await Video.findOne({ _id: req.params.id, organizationId: orgId }).lean();
  if (!video) throw ApiError.notFound('Video not found');

  if (video.visibility !== 'PUBLIC') {
    if (auth.role === 'STUDENT') {
      if (!auth.studentId) throw ApiError.forbidden('No student profile linked to your account');
      if (!video.courseId) throw ApiError.forbidden('This video is not available to students');
      const enrolled = await CourseEnrollment.exists({
        organizationId: orgId, studentId: auth.studentId, courseId: video.courseId, status: { $in: ['ACTIVE', 'COMPLETED'] },
      });
      if (!enrolled) throw ApiError.forbidden('You are not enrolled in the course this video belongs to');
    } else if (!auth.permissions.includes('video:read')) {
      throw ApiError.forbidden('You cannot access this video');
    }
  }

  return ok(res, { video: { _id: video._id, title: video.title, durationSeconds: video.durationSeconds }, playback: await buildPlayback(video) });
});

/* ------------------------------ Study material ------------------------------ */

export const listMaterials = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; courseId?: string; batchId?: string; type?: string; sort?: string; order?: 'asc' | 'desc' };
  const filter: Record<string, unknown> = {};
  if (q.courseId) filter.courseId = toObjectId(q.courseId);
  if (q.batchId) filter.batchId = toObjectId(q.batchId);
  if (q.type) filter.type = q.type;

  const auth = requireAuth(req);
  const orgId = requireOrg(req);
  // Students only see material for courses they are enrolled in.
  if (auth.role === 'STUDENT') {
    if (!auth.studentId) throw ApiError.forbidden('No student profile linked to your account');
    const enrollments = await CourseEnrollment.find({ organizationId: orgId, studentId: auth.studentId }).select('courseId').lean();
    filter.courseId = { $in: enrollments.map((e) => e.courseId) };
    filter.visibility = { $ne: 'PRIVATE' };
  }

  const { items, total } = await listScoped(StudyMaterial, {
    organizationId: orgId, page: q.page, limit: q.limit, search: q.search, sort: q.sort, order: q.order,
    searchFields: ['title', 'description'], filter,
    populate: [{ path: 'courseId', select: 'title code' }, { path: 'lessonId', select: 'title' }, { path: 'batchId', select: 'name' }],
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const createMaterial = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  if (req.body.courseId) await assertBelongsToOrg(Course, req.body.courseId, orgId, 'Course');
  if (req.body.lessonId) await assertBelongsToOrg(Lesson, req.body.lessonId, orgId, 'Lesson');
  if (req.body.batchId) await assertBelongsToOrg(Batch, req.body.batchId, orgId, 'Batch');
  if (req.body.moduleId) await assertBelongsToOrg(CourseModule, req.body.moduleId, orgId, 'Module');
  if (!req.body.externalUrl && !req.body.storageKey && !req.body.content) {
    throw ApiError.validation('Provide a file, a link or note content', { externalUrl: 'Required if no file uploaded' });
  }

  const material = await StudyMaterial.create({
    ...req.body,
    courseId: req.body.courseId || undefined,
    lessonId: req.body.lessonId || undefined,
    batchId: req.body.batchId || undefined,
    moduleId: req.body.moduleId || undefined,
    organizationId: orgId,
    uploadedBy: auth.userId,
  });
  await recordAudit(req, { action: 'MATERIAL_CREATED', entity: 'StudyMaterial', entityId: material._id });
  return created(res, material.toObject());
});

export const updateMaterial = asyncHandler(async (req: Request, res: Response) => {
  const m = await updateScoped(StudyMaterial, req.params.id, requireOrg(req), req.body, 'Study material not found');
  await recordAudit(req, { action: 'MATERIAL_UPDATED', entity: 'StudyMaterial', entityId: req.params.id });
  return ok(res, m);
});

export const deleteMaterial = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const m = await StudyMaterial.findOne({ _id: req.params.id, organizationId: orgId }).lean();
  if (!m) throw ApiError.notFound('Study material not found');
  if (m.storageKey) await getStorage().delete(m.storageKey).catch(() => undefined);
  await StudyMaterial.deleteOne({ _id: m._id, organizationId: orgId });
  await recordAudit(req, { action: 'MATERIAL_DELETED', entity: 'StudyMaterial', entityId: req.params.id });
  return ok(res, { id: req.params.id });
});

export const materialDownload = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const m = await StudyMaterial.findOne({ _id: req.params.id, organizationId: orgId });
  if (!m) throw ApiError.notFound('Study material not found');

  if (auth.role === 'STUDENT') {
    if (m.visibility === 'PRIVATE') throw ApiError.forbidden('This material is not shared with students');
    if (m.courseId) {
      const enrolled = await CourseEnrollment.exists({
        organizationId: orgId, studentId: auth.studentId, courseId: m.courseId, status: { $in: ['ACTIVE', 'COMPLETED'] },
      });
      if (!enrolled) throw ApiError.forbidden('You are not enrolled in this course');
    }
  }

  m.downloadCount += 1;
  await m.save();

  if (m.externalUrl) return ok(res, { kind: 'link', url: m.externalUrl });
  if (m.content) return ok(res, { kind: 'note', content: m.content });
  if (m.storageKey) return ok(res, { kind: 'file', url: await getStorage().getSignedUrl(m.storageKey, 900), fileName: m.fileName });
  throw ApiError.notFound('No downloadable content attached to this material');
});

/* ---------------------------------- Quizzes --------------------------------- */

export const listQuizzes = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; courseId?: string; sort?: string; order?: 'asc' | 'desc' };
  const filter: Record<string, unknown> = {};
  if (q.courseId) filter.courseId = toObjectId(q.courseId);
  const orgId = requireOrg(req);
  const { items, total } = await listScoped(Quiz, {
    organizationId: orgId, page: q.page, limit: q.limit, search: q.search, sort: q.sort, order: q.order,
    searchFields: ['title', 'description'], filter,
    populate: [{ path: 'courseId', select: 'title code' }, { path: 'lessonId', select: 'title' }],
  });
  const ids = items.map((i) => (i as { _id: Types.ObjectId })._id);
  const counts = await QuizQuestion.aggregate<{ _id: Types.ObjectId; c: number }>([
    { $match: { organizationId: orgId, quizId: { $in: ids } } },
    { $group: { _id: '$quizId', c: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.c]));
  return paginated(res, items.map((i) => ({ ...i, questionCount: map.get(String((i as { _id: Types.ObjectId })._id)) ?? 0 })), total, q.page, q.limit);
});

export const createQuiz = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  await assertBelongsToOrg(Course, req.body.courseId, orgId, 'Course');
  if (req.body.lessonId) await assertBelongsToOrg(Lesson, req.body.lessonId, orgId, 'Lesson');
  const quiz = await Quiz.create({
    ...req.body,
    lessonId: req.body.lessonId || undefined,
    moduleId: req.body.moduleId || undefined,
    organizationId: orgId,
    createdBy: auth.userId,
  });
  if (req.body.lessonId) {
    await Lesson.updateOne({ _id: req.body.lessonId, organizationId: orgId }, { quizId: quiz._id });
  }
  await recordAudit(req, { action: 'QUIZ_CREATED', entity: 'Quiz', entityId: quiz._id });
  return created(res, quiz.toObject());
});

export const getQuiz = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const quiz = await findScoped(Quiz, req.params.id, orgId, {
    populate: [{ path: 'courseId', select: 'title code' }],
    notFoundMessage: 'Quiz not found',
  }) as { _id: Types.ObjectId };
  const [questions, attempts] = await Promise.all([
    QuizQuestion.find({ organizationId: orgId, quizId: quiz._id }).sort({ order: 1 }).lean(),
    QuizAttempt.find({ organizationId: orgId, quizId: quiz._id, status: 'SUBMITTED' })
      .populate('studentId', 'name studentCode').sort({ submittedAt: -1 }).limit(100).lean(),
  ]);
  return ok(res, {
    quiz, questions, attempts,
    stats: attempts.length ? {
      attempts: attempts.length,
      averageScore: Math.round((attempts.reduce((a, x) => a + x.percentage, 0) / attempts.length) * 10) / 10,
      passRate: Math.round((attempts.filter((a) => a.passed).length / attempts.length) * 1000) / 10,
    } : null,
  });
});

export const updateQuiz = asyncHandler(async (req: Request, res: Response) => {
  const q = await updateScoped(Quiz, req.params.id, requireOrg(req), req.body, 'Quiz not found');
  await recordAudit(req, { action: 'QUIZ_UPDATED', entity: 'Quiz', entityId: req.params.id });
  return ok(res, q);
});

export const deleteQuiz = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  await deleteScoped(Quiz, req.params.id, orgId, 'Quiz not found');
  await Promise.all([
    QuizQuestion.deleteMany({ organizationId: orgId, quizId: req.params.id }),
    QuizAttempt.deleteMany({ organizationId: orgId, quizId: req.params.id }),
    Lesson.updateMany({ organizationId: orgId, quizId: req.params.id }, { $unset: { quizId: 1 } }),
  ]);
  await recordAudit(req, { action: 'QUIZ_DELETED', entity: 'Quiz', entityId: req.params.id });
  return ok(res, { id: req.params.id });
});

export const addQuestion = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const quiz = await Quiz.findOne({ _id: req.params.id, organizationId: orgId });
  if (!quiz) throw ApiError.notFound('Quiz not found');

  const optionKeys = new Set((req.body.options as { key: string }[]).map((o) => o.key));
  for (const c of req.body.correctOptions as string[]) {
    if (!optionKeys.has(c)) throw ApiError.validation(`Correct option "${c}" is not one of the provided options`, { correctOptions: 'Invalid option key' });
  }
  if (req.body.type === 'SINGLE_CHOICE' && req.body.correctOptions.length !== 1) {
    throw ApiError.validation('Single choice questions must have exactly one correct option', { correctOptions: 'Select one' });
  }

  const order = req.body.order ?? (await QuizQuestion.countDocuments({ organizationId: orgId, quizId: quiz._id }));
  const question = await QuizQuestion.create({ ...req.body, order, organizationId: orgId, quizId: quiz._id });
  quiz.totalMarks = (await QuizQuestion.aggregate<{ t: number }>([
    { $match: { organizationId: orgId, quizId: quiz._id } }, { $group: { _id: null, t: { $sum: '$marks' } } },
  ]))[0]?.t ?? 0;
  await quiz.save();
  return created(res, question.toObject());
});

export const updateQuestion = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const q = await updateScoped(QuizQuestion, req.params.questionId, orgId, req.body, 'Question not found') as { quizId: Types.ObjectId };
  const total = (await QuizQuestion.aggregate<{ t: number }>([
    { $match: { organizationId: orgId, quizId: q.quizId } }, { $group: { _id: null, t: { $sum: '$marks' } } },
  ]))[0]?.t ?? 0;
  await Quiz.updateOne({ _id: q.quizId, organizationId: orgId }, { totalMarks: total });
  return ok(res, q);
});

export const deleteQuestion = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const q = await deleteScoped(QuizQuestion, req.params.questionId, orgId, 'Question not found') as { quizId: Types.ObjectId };
  const total = (await QuizQuestion.aggregate<{ t: number }>([
    { $match: { organizationId: orgId, quizId: q.quizId } }, { $group: { _id: null, t: { $sum: '$marks' } } },
  ]))[0]?.t ?? 0;
  await Quiz.updateOne({ _id: q.quizId, organizationId: orgId }, { totalMarks: total });
  return ok(res, { id: req.params.questionId });
});

/* -------------------------------- Enrollments ------------------------------- */

export const listEnrollments = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; courseId?: string; studentId?: string; status?: string; sort?: string; order?: 'asc' | 'desc' };
  const filter: Record<string, unknown> = {};
  if (q.courseId) filter.courseId = toObjectId(q.courseId);
  if (q.studentId) filter.studentId = toObjectId(q.studentId);
  if (q.status) filter.status = q.status;
  const { items, total } = await listScoped(CourseEnrollment, {
    organizationId: requireOrg(req), page: q.page, limit: q.limit, sort: q.sort, order: q.order, filter,
    populate: [
      { path: 'studentId', select: 'name studentCode photoUrl' },
      { path: 'courseId', select: 'title code thumbnailUrl' },
      { path: 'batchId', select: 'name code' },
    ],
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const createEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  await assertBelongsToOrg(Student, req.body.studentId, orgId, 'Student');
  await assertBelongsToOrg(Course, req.body.courseId, orgId, 'Course');
  if (req.body.batchId) await assertBelongsToOrg(Batch, req.body.batchId, orgId, 'Batch');

  const existing = await CourseEnrollment.findOne({ organizationId: orgId, studentId: req.body.studentId, courseId: req.body.courseId });
  if (existing) throw ApiError.conflict('This student is already enrolled in the course');

  const totalLessons = await Lesson.countDocuments({ organizationId: orgId, courseId: req.body.courseId });
  const enrollment = await CourseEnrollment.create({
    organizationId: orgId,
    studentId: req.body.studentId,
    courseId: req.body.courseId,
    batchId: req.body.batchId || undefined,
    status: 'ACTIVE',
    totalLessons,
  });
  await recordAudit(req, { action: 'ENROLLMENT_CREATED', entity: 'CourseEnrollment', entityId: enrollment._id });
  return created(res, enrollment.toObject());
});

export const deleteEnrollment = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const e = await CourseEnrollment.findOne({ _id: req.params.id, organizationId: orgId });
  if (!e) throw ApiError.notFound('Enrollment not found');
  e.status = 'DROPPED';
  await e.save();
  await recordAudit(req, { action: 'ENROLLMENT_DROPPED', entity: 'CourseEnrollment', entityId: e._id });
  return ok(res, e.toObject());
});

export const progressOverview = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const q = req.query as never as { courseId?: string };
  const match: Record<string, unknown> = { organizationId: orgId };
  if (q.courseId) match.courseId = toObjectId(q.courseId);

  const [byCourse, completionBands, activeLearners, totalWatch] = await Promise.all([
    CourseEnrollment.aggregate<{ _id: Types.ObjectId; enrollments: number; avgProgress: number; completed: number }>([
      { $match: match },
      { $group: { _id: '$courseId', enrollments: { $sum: 1 }, avgProgress: { $avg: '$progressPercent' }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } } } },
      { $sort: { enrollments: -1 } },
      { $limit: 20 },
    ]),
    CourseEnrollment.aggregate<{ _id: string | number; c: number }>([
      { $match: match },
      { $bucket: { groupBy: '$progressPercent', boundaries: [0, 25, 50, 75, 100, 101], default: 'other', output: { c: { $sum: 1 } } } },
    ]),
    LessonProgress.distinct('studentId', { organizationId: orgId, lastWatchedAt: { $gte: new Date(Date.now() - 7 * 864e5) } }),
    LessonProgress.aggregate<{ t: number }>([{ $match: { organizationId: orgId } }, { $group: { _id: null, t: { $sum: '$watchedSeconds' } } }]),
  ]);

  const courses = await Course.find({ _id: { $in: byCourse.map((b) => b._id) }, organizationId: orgId }).select('title code').lean();
  const map = new Map(courses.map((c) => [String(c._id), c]));

  return ok(res, {
    byCourse: byCourse.map((b) => ({
      courseId: String(b._id),
      course: map.get(String(b._id)) ?? null,
      enrollments: b.enrollments,
      averageProgress: Math.round(b.avgProgress * 10) / 10,
      completed: b.completed,
    })),
    completionBands: completionBands.map((c) => ({ band: String(c._id), count: c.c })),
    activeLearnersLast7Days: activeLearners.length,
    totalWatchHours: Math.round(((totalWatch[0]?.t ?? 0) / 3600) * 10) / 10,
  });
});
