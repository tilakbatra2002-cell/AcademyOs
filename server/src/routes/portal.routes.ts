import { Router } from 'express';
import * as c from '../controllers/portal.controller';
import { validate } from '../middleware/validate';
import { requireRole, requirePermission } from '../middleware/auth';
import { idParamSchema, paginationSchema } from '../utils/query';
import { submitQuizSchema, submitAssignmentSchema } from '../validators/academics.validators';
import { z } from 'zod';

const router = Router();

const progressSchema = z.object({
  positionSeconds: z.coerce.number().min(0).max(86400).default(0),
  watchedSeconds: z.coerce.number().min(0).max(86400).optional(),
  percent: z.coerce.number().min(0).max(100).optional(),
  completed: z.boolean().optional(),
});

/* -------------------------------- Dashboards -------------------------------- */
router.get('/dashboard/admin', requireRole('ORGANIZATION_ADMIN', 'COUNSELOR', 'ACCOUNTANT', 'STAFF'), c.adminDashboard);
router.get('/dashboard/teacher', requireRole('TEACHER'), c.teacherDashboard);
router.get('/dashboard/student', requireRole('STUDENT'), c.studentDashboard);
router.get('/dashboard/parent', requireRole('PARENT'), c.parentDashboard);
router.get('/subscription', requireRole('ORGANIZATION_ADMIN'), c.subscriptionSummary);

/* ------------------------------ Student portal ------------------------------ */
router.get('/me/profile', requireRole('STUDENT', 'TEACHER', 'PARENT'), c.myProfile);
router.get('/me/courses', requireRole('STUDENT'), c.myCourses);
router.get('/me/courses/:courseId/learn', requireRole('STUDENT'), c.learnCourse);
router.post('/me/lessons/:lessonId/progress', requireRole('STUDENT'), validate({ body: progressSchema }), c.saveProgress);
router.get('/me/lessons/:lessonId/attachment', requireRole('STUDENT'), c.lessonMaterialUrl);
router.post('/me/quizzes/:quizId/start', requireRole('STUDENT'), c.startQuiz);
router.post('/me/quiz-attempts/:attemptId/submit', requireRole('STUDENT'), validate({ body: submitQuizSchema }), c.submitQuiz);
router.get('/me/attendance', requireRole('STUDENT'), c.myAttendance);
router.get('/me/schedule', requireRole('STUDENT'), c.mySchedule);
router.get('/me/results', requireRole('STUDENT'), c.myResults);
router.get('/me/assignments', requireRole('STUDENT'), c.myAssignments);
router.post('/me/assignments/:id/submit', requireRole('STUDENT'), validate({ params: idParamSchema, body: submitAssignmentSchema }), c.submitAssignment);
router.get('/me/fees', requireRole('STUDENT'), c.myFees);
router.get('/me/materials', requireRole('STUDENT'), c.myMaterials);
router.get('/me/catalog', requireRole('STUDENT'), c.courseCatalog);

/* ------------------------------ Teacher portal ------------------------------ */
router.get('/me/batches', requireRole('TEACHER'), c.myBatches);
router.get('/me/classes', requireRole('TEACHER'), c.myClasses);
router.get('/me/students', requireRole('TEACHER'), validate({ query: paginationSchema }), c.myStudents);
router.get('/batches/:batchId/students', requirePermission('student:read'), c.batchStudents);

/* ------------------------------- Parent portal ------------------------------- */
router.get('/me/children', requireRole('PARENT'), c.myChildren);
router.get('/me/children/:studentId/attendance', requireRole('PARENT'), c.myAttendance);
router.get('/me/children/:studentId/results', requireRole('PARENT'), c.myResults);
router.get('/me/children/:studentId/assignments', requireRole('PARENT'), c.myAssignments);
router.get('/me/children/:studentId/fees', requireRole('PARENT'), c.myFees);
router.get('/me/children/:studentId/schedule', requireRole('PARENT'), c.mySchedule);
router.get('/me/children/:studentId/progress', requireRole('PARENT'), c.childProgress);

export default router;
