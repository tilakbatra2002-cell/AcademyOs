import { Types } from 'mongoose';
import {
  Course, CourseModule, Lesson, Video, Quiz, QuizQuestion, QuizAttempt,
  CourseEnrollment, LessonProgress, StudyMaterial,
} from '../models';
import { ApiError } from '../utils/ApiError';
import { getStorage } from './storage';

/** Throws unless the student has an enrollment for this course in this tenant. */
export async function assertEnrolled(orgId: Types.ObjectId, studentId: Types.ObjectId, courseId: Types.ObjectId | string) {
  const enrollment = await CourseEnrollment.findOne({
    organizationId: orgId,
    studentId,
    courseId,
    status: { $in: ['ACTIVE', 'COMPLETED'] },
  }).lean();
  if (!enrollment) throw ApiError.forbidden('You are not enrolled in this course');
  return enrollment;
}

/** Student-facing learning payload: course tree + personal progress. */
export async function learnCourse(orgId: Types.ObjectId, studentId: Types.ObjectId, courseId: string) {
  const course = await Course.findOne({ _id: courseId, organizationId: orgId })
    .populate('instructorId', 'name photoUrl specialization')
    .lean();
  if (!course) throw ApiError.notFound('Course not found');
  const enrollment = await assertEnrolled(orgId, studentId, course._id);

  const [modules, lessons, videos, quizzes, materials, progress, attempts] = await Promise.all([
    CourseModule.find({ organizationId: orgId, courseId: course._id, isPublished: true }).sort({ order: 1 }).lean(),
    Lesson.find({ organizationId: orgId, courseId: course._id, isPublished: true }).sort({ order: 1 }).lean(),
    Video.find({ organizationId: orgId, courseId: course._id }).lean(),
    Quiz.find({ organizationId: orgId, courseId: course._id, isPublished: true }).lean(),
    StudyMaterial.find({ organizationId: orgId, courseId: course._id }).lean(),
    LessonProgress.find({ organizationId: orgId, studentId, courseId: course._id }).lean(),
    QuizAttempt.find({ organizationId: orgId, studentId, courseId: course._id, status: 'SUBMITTED' }).lean(),
  ]);

  const progressMap = new Map(progress.map((p) => [String(p.lessonId), p]));
  const videoMap = new Map(videos.map((v) => [String(v._id), v]));
  const quizMap = new Map(quizzes.map((q) => [String(q._id), q]));

  const storage = getStorage();

  const moduleTree = await Promise.all(
    modules.map(async (m) => {
      const modLessons = lessons.filter((l) => String(l.moduleId) === String(m._id));
      const enriched = await Promise.all(
        modLessons.map(async (l) => {
          const p = progressMap.get(String(l._id));
          const video = l.videoId ? videoMap.get(String(l.videoId)) : null;
          let playback: { kind: string; url: string | null; provider: string } | null = null;
          if (video) {
            if (video.provider === 'youtube') {
              playback = { kind: 'youtube', url: video.storageKey, provider: 'youtube' };
            } else if (video.provider === 'vimeo') {
              playback = { kind: 'vimeo', url: video.storageKey, provider: 'vimeo' };
            } else {
              // Private objects: hand out a short-lived signed URL only.
              playback = { kind: 'file', url: await storage.getSignedUrl(video.storageKey, 3600), provider: video.provider };
            }
          }
          const quiz = l.quizId ? quizMap.get(String(l.quizId)) : null;
          const quizAttempts = quiz ? attempts.filter((a) => String(a.quizId) === String(quiz._id)) : [];
          return {
            _id: l._id,
            title: l.title,
            description: l.description,
            type: l.type,
            order: l.order,
            durationSeconds: l.durationSeconds,
            content: l.content,
            externalUrl: l.externalUrl,
            isPreview: l.isPreview,
            video: video ? { _id: video._id, title: video.title, durationSeconds: video.durationSeconds, thumbnailUrl: video.thumbnailUrl, playback } : null,
            quiz: quiz
              ? {
                  _id: quiz._id, title: quiz.title, timeLimitMinutes: quiz.timeLimitMinutes,
                  passingPercentage: quiz.passingPercentage, maxAttempts: quiz.maxAttempts,
                  attemptsUsed: quizAttempts.length,
                  bestScore: quizAttempts.length ? Math.max(...quizAttempts.map((a) => a.percentage)) : null,
                }
              : null,
            materials: materials.filter((mat) => String(mat.lessonId) === String(l._id)).map((mat) => ({
              _id: mat._id, title: mat.title, type: mat.type, fileName: mat.fileName, externalUrl: mat.externalUrl, sizeBytes: mat.sizeBytes,
            })),
            progress: p
              ? { percent: p.progressPercent, completed: p.completed, lastPositionSeconds: p.lastPositionSeconds, lastWatchedAt: p.lastWatchedAt }
              : { percent: 0, completed: false, lastPositionSeconds: 0, lastWatchedAt: null },
          };
        }),
      );
      const completedCount = enriched.filter((l) => l.progress.completed).length;
      return {
        _id: m._id,
        title: m.title,
        description: m.description,
        order: m.order,
        lessons: enriched,
        progressPercent: enriched.length ? Math.round((completedCount / enriched.length) * 100) : 0,
        completedLessons: completedCount,
      };
    }),
  );

  const totalLessons = lessons.length;
  const completed = progress.filter((p) => p.completed).length;
  const lastProgress = progress.slice().sort((a, b) => +new Date(b.lastWatchedAt) - +new Date(a.lastWatchedAt))[0];

  return {
    course,
    enrollment: {
      ...enrollment,
      progressPercent: totalLessons ? Math.round((completed / totalLessons) * 100) : 0,
      completedLessons: completed,
      totalLessons,
    },
    modules: moduleTree,
    continueFrom: lastProgress
      ? { lessonId: String(lastProgress.lessonId), positionSeconds: lastProgress.lastPositionSeconds, percent: lastProgress.progressPercent }
      : null,
  };
}

export async function saveLessonProgress(
  orgId: Types.ObjectId,
  studentId: Types.ObjectId,
  lessonId: string,
  payload: { positionSeconds?: number; watchedSeconds?: number; percent?: number; completed?: boolean },
) {
  const lesson = await Lesson.findOne({ _id: lessonId, organizationId: orgId }).lean();
  if (!lesson) throw ApiError.notFound('Lesson not found');
  await assertEnrolled(orgId, studentId, lesson.courseId);

  const computedPercent = (() => {
    if (payload.completed) return 100;
    if (typeof payload.percent === 'number') return Math.min(100, Math.max(0, Math.round(payload.percent)));
    if (lesson.durationSeconds > 0 && typeof payload.positionSeconds === 'number') {
      return Math.min(100, Math.round((payload.positionSeconds / lesson.durationSeconds) * 100));
    }
    return 0;
  })();

  const existing = await LessonProgress.findOne({ organizationId: orgId, studentId, lessonId: lesson._id });
  const alreadyCompleted = existing?.completed ?? false;
  const nextCompleted = alreadyCompleted || payload.completed === true || computedPercent >= 95;

  const doc = await LessonProgress.findOneAndUpdate(
    { organizationId: orgId, studentId, lessonId: lesson._id },
    {
      $set: {
        courseId: lesson.courseId,
        moduleId: lesson.moduleId,
        progressPercent: Math.max(existing?.progressPercent ?? 0, computedPercent),
        lastPositionSeconds: payload.positionSeconds ?? existing?.lastPositionSeconds ?? 0,
        completed: nextCompleted,
        lastWatchedAt: new Date(),
        ...(nextCompleted && !alreadyCompleted ? { completedAt: new Date() } : {}),
      },
      $inc: { watchedSeconds: Math.max(0, payload.watchedSeconds ?? 0) },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const [totalLessons, completedLessons] = await Promise.all([
    Lesson.countDocuments({ organizationId: orgId, courseId: lesson.courseId, isPublished: true }),
    LessonProgress.countDocuments({ organizationId: orgId, studentId, courseId: lesson.courseId, completed: true }),
  ]);
  const progressPercent = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const enrollment = await CourseEnrollment.findOneAndUpdate(
    { organizationId: orgId, studentId, courseId: lesson.courseId },
    {
      $set: {
        progressPercent,
        completedLessons,
        totalLessons,
        lastAccessedAt: new Date(),
        lastLessonId: lesson._id,
        ...(progressPercent >= 100 ? { status: 'COMPLETED', completedAt: new Date() } : {}),
      },
    },
    { new: true },
  );

  return { lessonProgress: doc.toObject(), courseProgress: { progressPercent, completedLessons, totalLessons }, enrollment };
}

/* ---------------------------------- Quizzes --------------------------------- */

export async function startQuiz(orgId: Types.ObjectId, studentId: Types.ObjectId, quizId: string) {
  const quiz = await Quiz.findOne({ _id: quizId, organizationId: orgId, isPublished: true }).lean();
  if (!quiz) throw ApiError.notFound('Quiz not found');
  await assertEnrolled(orgId, studentId, quiz.courseId);

  const attempts = await QuizAttempt.countDocuments({ organizationId: orgId, quizId: quiz._id, studentId, status: 'SUBMITTED' });
  if (attempts >= quiz.maxAttempts) {
    throw ApiError.forbidden(`You have used all ${quiz.maxAttempts} attempts for this quiz`);
  }

  const questions = await QuizQuestion.find({ organizationId: orgId, quizId: quiz._id })
    .select('-correctOptions -explanation')
    .sort({ order: 1 })
    .lean();
  if (!questions.length) throw ApiError.badRequest('This quiz has no questions yet');

  const ordered = quiz.shuffleQuestions ? questions.sort(() => Math.random() - 0.5) : questions;

  const attempt = await QuizAttempt.create({
    organizationId: orgId,
    quizId: quiz._id,
    studentId,
    courseId: quiz.courseId,
    answers: [],
    totalMarks: questions.reduce((a, q) => a + q.marks, 0),
    status: 'IN_PROGRESS',
    startedAt: new Date(),
    attemptNumber: attempts + 1,
  });

  return { attemptId: String(attempt._id), quiz, questions: ordered, attemptNumber: attempts + 1 };
}

export async function submitQuiz(
  orgId: Types.ObjectId,
  studentId: Types.ObjectId,
  attemptId: string,
  answers: { questionId: string; selected: string[] }[],
) {
  const attempt = await QuizAttempt.findOne({ _id: attemptId, organizationId: orgId, studentId });
  if (!attempt) throw ApiError.notFound('Quiz attempt not found');
  if (attempt.status === 'SUBMITTED') throw ApiError.conflict('This attempt has already been submitted');

  const quiz = await Quiz.findOne({ _id: attempt.quizId, organizationId: orgId }).lean();
  if (!quiz) throw ApiError.notFound('Quiz not found');

  const elapsedMinutes = (Date.now() - new Date(attempt.startedAt).getTime()) / 60000;
  if (elapsedMinutes > quiz.timeLimitMinutes + 1) {
    attempt.status = 'EXPIRED';
    await attempt.save();
    throw ApiError.badRequest('Time limit exceeded — this attempt has expired');
  }

  const questions = await QuizQuestion.find({ organizationId: orgId, quizId: quiz._id }).lean();
  const qMap = new Map(questions.map((q) => [String(q._id), q]));

  let score = 0;
  const graded = answers.map((a) => {
    const q = qMap.get(a.questionId);
    if (!q) return { questionId: new Types.ObjectId(a.questionId), selected: a.selected, correct: false, marksAwarded: 0 };
    const correctSet = new Set(q.correctOptions);
    const selSet = new Set(a.selected);
    const correct = correctSet.size === selSet.size && [...correctSet].every((c) => selSet.has(c));
    const marksAwarded = correct ? q.marks : 0;
    score += marksAwarded;
    return { questionId: q._id, selected: a.selected, correct, marksAwarded };
  });

  const totalMarks = questions.reduce((a, q) => a + q.marks, 0);
  const percentage = totalMarks ? Math.round((score / totalMarks) * 1000) / 10 : 0;

  attempt.answers = graded as never;
  attempt.score = score;
  attempt.totalMarks = totalMarks;
  attempt.percentage = percentage;
  attempt.passed = percentage >= quiz.passingPercentage;
  attempt.status = 'SUBMITTED';
  attempt.submittedAt = new Date();
  attempt.timeTakenSeconds = Math.round((Date.now() - new Date(attempt.startedAt).getTime()) / 1000);
  await attempt.save();

  // Mark the linked lesson complete when the quiz is passed
  if (attempt.passed && quiz.lessonId) {
    await saveLessonProgress(orgId, studentId, String(quiz.lessonId), { completed: true, percent: 100 });
  }

  return {
    attempt: attempt.toObject(),
    review: graded.map((g) => {
      const q = qMap.get(String(g.questionId));
      return {
        questionId: String(g.questionId),
        question: q?.question,
        selected: g.selected,
        correctOptions: q?.correctOptions ?? [],
        correct: g.correct,
        marksAwarded: g.marksAwarded,
        explanation: q?.explanation,
      };
    }),
  };
}
