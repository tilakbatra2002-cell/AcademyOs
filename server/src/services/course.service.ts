import { Types, FilterQuery, Model } from 'mongoose';
import {
  Course, ICourse, CourseModule, Lesson, Subject, Teacher, Video, Quiz,
  StudyMaterial, CourseEnrollment, LessonProgress, Batch,
} from '../models';
import { listScoped, assertBelongsToOrg } from './crud.factory';
import { ApiError } from '../utils/ApiError';
import { slugify, randomCode } from '../utils/ids';
import { assertWithinLimit } from './subscription.service';
import { AuthContext } from '../types/express';

export async function listCourses(
  orgId: Types.ObjectId,
  params: { page: number; limit: number; sort?: string; order?: 'asc' | 'desc'; search?: string; status?: string; type?: string; category?: string; instructorId?: string },
) {
  const filter: FilterQuery<ICourse> = {};
  if (params.status) filter.status = params.status as never;
  if (params.type) filter.type = params.type as never;
  if (params.category) filter.category = params.category;
  if (params.instructorId) filter.instructorId = new Types.ObjectId(params.instructorId);

  const { items, total } = await listScoped(Course, {
    organizationId: orgId,
    page: params.page, limit: params.limit, sort: params.sort, order: params.order, search: params.search,
    searchFields: ['title', 'code', 'category', 'shortDescription'],
    filter,
    populate: [{ path: 'instructorId', select: 'name email photoUrl' }],
  });

  const ids = items.map((c) => (c as { _id: Types.ObjectId })._id);
  const [lessonCounts, enrollCounts, batchCounts] = await Promise.all([
    Lesson.aggregate<{ _id: Types.ObjectId; c: number }>([{ $match: { organizationId: orgId, courseId: { $in: ids } } }, { $group: { _id: '$courseId', c: { $sum: 1 } } }]),
    CourseEnrollment.aggregate<{ _id: Types.ObjectId; c: number }>([{ $match: { organizationId: orgId, courseId: { $in: ids } } }, { $group: { _id: '$courseId', c: { $sum: 1 } } }]),
    Batch.aggregate<{ _id: Types.ObjectId; c: number }>([{ $match: { organizationId: orgId, courseId: { $in: ids } } }, { $group: { _id: '$courseId', c: { $sum: 1 } } }]),
  ]);
  const m = (rows: { _id: Types.ObjectId; c: number }[]) => new Map(rows.map((r) => [String(r._id), r.c]));
  const lm = m(lessonCounts); const em = m(enrollCounts); const bm = m(batchCounts);

  return {
    items: items.map((c) => ({
      ...c,
      stats: {
        lessons: lm.get(String((c as { _id: Types.ObjectId })._id)) ?? 0,
        enrollments: em.get(String((c as { _id: Types.ObjectId })._id)) ?? 0,
        batches: bm.get(String((c as { _id: Types.ObjectId })._id)) ?? 0,
      },
    })),
    total,
  };
}

export async function createCourse(orgId: Types.ObjectId, auth: AuthContext, input: Record<string, unknown>) {
  await assertWithinLimit(orgId, 'courses', 1);
  if (input.instructorId) await assertBelongsToOrg(Teacher, input.instructorId as string, orgId, 'Instructor');
  for (const s of (input.subjectIds as string[]) ?? []) await assertBelongsToOrg(Subject, s, orgId, 'Subject');

  let slug = slugify(input.title as string);
  if (await Course.exists({ organizationId: orgId, slug })) slug = `${slug}-${randomCode(3).toLowerCase()}`;

  const count = await Course.countDocuments({ organizationId: orgId });
  let code = (input.code as string) || `CRS${String(count + 1).padStart(3, '0')}`;
  if (await Course.exists({ organizationId: orgId, code: code.toUpperCase() })) code = `${code}${randomCode(2)}`;

  const course = await Course.create({
    ...input,
    instructorId: input.instructorId || undefined,
    thumbnailUrl: input.thumbnailUrl || undefined,
    organizationId: orgId,
    slug,
    code,
    publishedAt: input.status === 'PUBLISHED' ? new Date() : undefined,
    createdBy: auth.userId,
  });
  return course.toObject();
}

export async function updateCourse(orgId: Types.ObjectId, id: string, input: Record<string, unknown>) {
  const course = await Course.findOne({ _id: id, organizationId: orgId });
  if (!course) throw ApiError.notFound('Course not found');
  if (input.instructorId) await assertBelongsToOrg(Teacher, input.instructorId as string, orgId, 'Instructor');
  for (const s of (input.subjectIds as string[]) ?? []) await assertBelongsToOrg(Subject, s, orgId, 'Subject');

  const wasPublished = course.status === 'PUBLISHED';
  Object.entries(input).forEach(([k, v]) => {
    if (v === undefined) return;
    if (k === 'instructorId' && v === '') course.instructorId = undefined;
    else if (k === 'title' && v !== course.title) {
      course.title = v as string;
    } else (course as never as Record<string, unknown>)[k] = v;
  });
  if (!wasPublished && course.status === 'PUBLISHED') course.publishedAt = new Date();
  await course.save();
  return course.toObject();
}

export async function deleteCourse(orgId: Types.ObjectId, id: string) {
  const course = await Course.findOne({ _id: id, organizationId: orgId });
  if (!course) throw ApiError.notFound('Course not found');
  const enrollments = await CourseEnrollment.countDocuments({ organizationId: orgId, courseId: course._id, status: 'ACTIVE' });
  if (enrollments > 0) {
    // Never destroy data with active students — archive instead.
    course.status = 'ARCHIVED';
    await course.save();
    return { archived: true, id, message: `Course archived (it has ${enrollments} active enrollment(s))` };
  }
  const modules = await CourseModule.find({ organizationId: orgId, courseId: course._id }).select('_id').lean();
  await Promise.all([
    Lesson.deleteMany({ organizationId: orgId, courseId: course._id }),
    CourseModule.deleteMany({ organizationId: orgId, courseId: course._id }),
    Quiz.deleteMany({ organizationId: orgId, courseId: course._id }),
    StudyMaterial.deleteMany({ organizationId: orgId, courseId: course._id }),
    Video.updateMany({ organizationId: orgId, courseId: course._id }, { $unset: { courseId: 1, lessonId: 1 } }),
    LessonProgress.deleteMany({ organizationId: orgId, courseId: course._id }),
    CourseEnrollment.deleteMany({ organizationId: orgId, courseId: course._id }),
    Course.deleteOne({ _id: course._id, organizationId: orgId }),
  ]);
  return { archived: false, id, modulesRemoved: modules.length };
}

/** Full course tree used by the builder and the student learning player. */
export async function courseTree(orgId: Types.ObjectId, courseId: string, options?: { publishedOnly?: boolean }) {
  const course = await Course.findOne({ _id: courseId, organizationId: orgId })
    .populate('instructorId', 'name email photoUrl specialization')
    .populate('subjectIds', 'name code')
    .lean();
  if (!course) throw ApiError.notFound('Course not found');

  const moduleFilter: Record<string, unknown> = { organizationId: orgId, courseId: course._id };
  const lessonFilter: Record<string, unknown> = { organizationId: orgId, courseId: course._id };
  if (options?.publishedOnly) {
    moduleFilter.isPublished = true;
    lessonFilter.isPublished = true;
  }

  const [modules, lessons, videos, quizzes, materials] = await Promise.all([
    CourseModule.find(moduleFilter).sort({ order: 1, createdAt: 1 }).lean(),
    Lesson.find(lessonFilter).sort({ order: 1, createdAt: 1 }).lean(),
    Video.find({ organizationId: orgId, courseId: course._id }).select('title provider durationSeconds thumbnailUrl visibility storageKey publicUrl').lean(),
    Quiz.find({ organizationId: orgId, courseId: course._id }).select('title passingPercentage timeLimitMinutes totalMarks isPublished lessonId').lean(),
    StudyMaterial.find({ organizationId: orgId, courseId: course._id }).select('title type lessonId moduleId externalUrl storageKey fileName sizeBytes').lean(),
  ]);

  const videoMap = new Map(videos.map((v) => [String(v._id), v]));
  const quizMap = new Map(quizzes.map((q) => [String(q._id), q]));

  const tree = modules.map((m) => ({
    ...m,
    lessons: lessons
      .filter((l) => String(l.moduleId) === String(m._id))
      .map((l) => ({
        ...l,
        video: l.videoId ? videoMap.get(String(l.videoId)) ?? null : null,
        quiz: l.quizId ? quizMap.get(String(l.quizId)) ?? null : null,
        materials: materials.filter((mat) => String(mat.lessonId) === String(l._id)),
      })),
  }));

  const totalDuration = lessons.reduce((a, l) => a + (l.durationSeconds || 0), 0);
  return {
    course,
    modules: tree,
    stats: {
      modules: modules.length,
      lessons: lessons.length,
      videos: videos.length,
      quizzes: quizzes.length,
      materials: materials.length,
      totalDurationSeconds: totalDuration,
    },
  };
}

export async function createModule(orgId: Types.ObjectId, courseId: string, input: Record<string, unknown>) {
  await assertBelongsToOrg(Course, courseId, orgId, 'Course');
  const order = input.order ?? (await CourseModule.countDocuments({ organizationId: orgId, courseId }));
  const mod = await CourseModule.create({ ...input, order, organizationId: orgId, courseId });
  return mod.toObject();
}

export async function reorder(
  orgId: Types.ObjectId,
  model: 'module' | 'lesson',
  items: { id: string; order: number }[],
) {
  const Model = (model === 'module' ? CourseModule : Lesson) as unknown as Model<{ order: number }>;
  const ops = items.map((i) => ({
    updateOne: {
      filter: { _id: new Types.ObjectId(i.id), organizationId: orgId },
      update: { $set: { order: i.order } },
    },
  }));
  const result = await Model.bulkWrite(ops as never);
  return { updated: result.modifiedCount };
}

export async function createLesson(orgId: Types.ObjectId, auth: AuthContext, courseId: string, input: Record<string, unknown>) {
  await assertBelongsToOrg(Course, courseId, orgId, 'Course');
  const mod = await CourseModule.findOne({ _id: input.moduleId as string, organizationId: orgId, courseId });
  if (!mod) throw ApiError.notFound('Module not found in this course');
  if (input.videoId) await assertBelongsToOrg(Video, input.videoId as string, orgId, 'Video');
  if (input.quizId) await assertBelongsToOrg(Quiz, input.quizId as string, orgId, 'Quiz');

  const order = input.order ?? (await Lesson.countDocuments({ organizationId: orgId, moduleId: mod._id }));
  const lesson = await Lesson.create({
    ...input,
    videoId: input.videoId || undefined,
    quizId: input.quizId || undefined,
    externalUrl: input.externalUrl || undefined,
    order,
    organizationId: orgId,
    courseId,
    createdBy: auth.userId,
  });

  if (input.videoId) {
    await Video.updateOne({ _id: input.videoId as string, organizationId: orgId }, { lessonId: lesson._id, courseId });
  }
  // keep enrollment lesson totals accurate
  const totalLessons = await Lesson.countDocuments({ organizationId: orgId, courseId });
  await CourseEnrollment.updateMany({ organizationId: orgId, courseId }, { totalLessons });
  return lesson.toObject();
}

export async function updateLesson(orgId: Types.ObjectId, id: string, input: Record<string, unknown>) {
  const lesson = await Lesson.findOne({ _id: id, organizationId: orgId });
  if (!lesson) throw ApiError.notFound('Lesson not found');
  if (input.moduleId) {
    const mod = await CourseModule.findOne({ _id: input.moduleId as string, organizationId: orgId, courseId: lesson.courseId });
    if (!mod) throw ApiError.notFound('Target module not found in this course');
  }
  if (input.videoId) await assertBelongsToOrg(Video, input.videoId as string, orgId, 'Video');
  if (input.quizId) await assertBelongsToOrg(Quiz, input.quizId as string, orgId, 'Quiz');

  Object.entries(input).forEach(([k, v]) => {
    if (v === undefined) return;
    if ((k === 'videoId' || k === 'quizId') && v === '') (lesson as never as Record<string, unknown>)[k] = undefined;
    else (lesson as never as Record<string, unknown>)[k] = v;
  });
  await lesson.save();
  if (input.videoId) {
    await Video.updateOne({ _id: input.videoId as string, organizationId: orgId }, { lessonId: lesson._id, courseId: lesson.courseId });
  }
  return lesson.toObject();
}

export async function deleteModule(orgId: Types.ObjectId, id: string) {
  const mod = await CourseModule.findOne({ _id: id, organizationId: orgId });
  if (!mod) throw ApiError.notFound('Module not found');
  const lessons = await Lesson.find({ organizationId: orgId, moduleId: mod._id }).select('_id').lean();
  const lessonIds = lessons.map((l) => l._id);
  await Promise.all([
    Lesson.deleteMany({ organizationId: orgId, moduleId: mod._id }),
    LessonProgress.deleteMany({ organizationId: orgId, lessonId: { $in: lessonIds } }),
    Video.updateMany({ organizationId: orgId, lessonId: { $in: lessonIds } }, { $unset: { lessonId: 1 } }),
    CourseModule.deleteOne({ _id: mod._id, organizationId: orgId }),
  ]);
  const totalLessons = await Lesson.countDocuments({ organizationId: orgId, courseId: mod.courseId });
  await CourseEnrollment.updateMany({ organizationId: orgId, courseId: mod.courseId }, { totalLessons });
  return { id, lessonsRemoved: lessonIds.length };
}

export async function deleteLesson(orgId: Types.ObjectId, id: string) {
  const lesson = await Lesson.findOneAndDelete({ _id: id, organizationId: orgId }).lean();
  if (!lesson) throw ApiError.notFound('Lesson not found');
  await Promise.all([
    LessonProgress.deleteMany({ organizationId: orgId, lessonId: lesson._id }),
    Video.updateMany({ organizationId: orgId, lessonId: lesson._id }, { $unset: { lessonId: 1 } }),
  ]);
  const totalLessons = await Lesson.countDocuments({ organizationId: orgId, courseId: lesson.courseId });
  await CourseEnrollment.updateMany({ organizationId: orgId, courseId: lesson.courseId }, { totalLessons });
  return { id };
}
