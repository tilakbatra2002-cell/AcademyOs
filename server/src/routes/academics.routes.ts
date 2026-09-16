import { Router } from 'express';
import * as c from '../controllers/academics.controller';
import * as lms from '../controllers/lms.controller';
import { validate } from '../middleware/validate';
import { requirePermission, requireAnyPermission } from '../middleware/auth';
import { idParamSchema, paginationSchema } from '../utils/query';
import {
  createCourseSchema, updateCourseSchema, courseQuerySchema,
  createSubjectSchema, updateSubjectSchema,
  createModuleSchema, updateModuleSchema, reorderSchema,
  createLessonSchema, updateLessonSchema,
  createVideoSchema, updateVideoSchema, videoQuerySchema,
  createMaterialSchema, updateMaterialSchema,
  createQuizSchema, updateQuizSchema, quizQuestionSchema,
  createBatchSchema, updateBatchSchema, batchQuerySchema, enrollBatchSchema,
  createClassSchema, updateClassSchema, classQuerySchema, generateClassesSchema,
  markAttendanceSchema, attendanceQuerySchema,
  createExamSchema, updateExamSchema, examQuerySchema, enterResultsSchema, resultQuerySchema,
  createAssignmentSchema, updateAssignmentSchema, assignmentQuerySchema, gradeSubmissionSchema,
} from '../validators/academics.validators';

const router = Router();

/* ---------------------------------- Options --------------------------------- */
router.get('/options', requireAnyPermission('course:read', 'student:read', 'lead:read'), c.courseOptions);

/* ---------------------------------- Courses --------------------------------- */
router.get('/courses', requirePermission('course:read'), validate({ query: courseQuerySchema }), c.listCourses);
router.post('/courses', requirePermission('course:create'), validate({ body: createCourseSchema }), c.createCourse);
router.get('/courses/:id', requirePermission('course:read'), validate({ params: idParamSchema }), c.getCourse);
router.patch('/courses/:id', requirePermission('course:update'), validate({ params: idParamSchema, body: updateCourseSchema }), c.updateCourse);
router.delete('/courses/:id', requirePermission('course:delete'), validate({ params: idParamSchema }), c.deleteCourse);

/* --------------------------------- Subjects --------------------------------- */
router.get('/subjects', requirePermission('subject:read'), validate({ query: paginationSchema }), c.listSubjects);
router.post('/subjects', requirePermission('subject:create'), validate({ body: createSubjectSchema }), c.createSubject);
router.patch('/subjects/:id', requirePermission('subject:update'), validate({ params: idParamSchema, body: updateSubjectSchema }), c.updateSubject);
router.delete('/subjects/:id', requirePermission('subject:delete'), validate({ params: idParamSchema }), c.deleteSubject);

/* ------------------------------ Course builder ------------------------------ */
router.post('/courses/:id/modules', requirePermission('lesson:create'), validate({ params: idParamSchema, body: createModuleSchema }), c.createModule);
router.patch('/modules/:moduleId', requirePermission('lesson:update'), validate({ body: updateModuleSchema }), c.updateModule);
router.delete('/modules/:moduleId', requirePermission('lesson:delete'), c.deleteModule);
router.post('/modules/reorder', requirePermission('lesson:update'), validate({ body: reorderSchema }), c.reorderModules);

router.get('/lessons', requirePermission('lesson:read'), validate({ query: paginationSchema }), c.listLessons);
router.post('/courses/:id/lessons', requirePermission('lesson:create'), validate({ params: idParamSchema, body: createLessonSchema }), c.createLesson);
router.patch('/lessons/:lessonId', requirePermission('lesson:update'), validate({ body: updateLessonSchema }), c.updateLesson);
router.delete('/lessons/:lessonId', requirePermission('lesson:delete'), c.deleteLesson);
router.post('/lessons/reorder', requirePermission('lesson:update'), validate({ body: reorderSchema }), c.reorderLessons);

/* ---------------------------------- Videos ---------------------------------- */
router.get('/videos', requirePermission('video:read'), validate({ query: videoQuerySchema }), lms.listVideos);
router.post('/videos', requirePermission('video:create'), validate({ body: createVideoSchema }), lms.createVideo);
router.get('/videos/:id', requirePermission('video:read'), validate({ params: idParamSchema }), lms.getVideo);
router.get('/videos/:id/play', requirePermission('video:read'), validate({ params: idParamSchema }), lms.streamVideoForStudent);
router.patch('/videos/:id', requirePermission('video:update'), validate({ params: idParamSchema, body: updateVideoSchema }), lms.updateVideo);
router.delete('/videos/:id', requirePermission('video:delete'), validate({ params: idParamSchema }), lms.deleteVideo);

/* ------------------------------- Study material ------------------------------ */
router.get('/materials', requirePermission('material:read'), validate({ query: paginationSchema }), lms.listMaterials);
router.post('/materials', requirePermission('material:create'), validate({ body: createMaterialSchema }), lms.createMaterial);
router.get('/materials/:id/download', requirePermission('material:read'), validate({ params: idParamSchema }), lms.materialDownload);
router.patch('/materials/:id', requirePermission('material:update'), validate({ params: idParamSchema, body: updateMaterialSchema }), lms.updateMaterial);
router.delete('/materials/:id', requirePermission('material:delete'), validate({ params: idParamSchema }), lms.deleteMaterial);

/* ---------------------------------- Quizzes --------------------------------- */
router.get('/quizzes', requirePermission('quiz:read'), validate({ query: paginationSchema }), lms.listQuizzes);
router.post('/quizzes', requirePermission('quiz:create'), validate({ body: createQuizSchema }), lms.createQuiz);
router.get('/quizzes/:id', requirePermission('quiz:read'), validate({ params: idParamSchema }), lms.getQuiz);
router.patch('/quizzes/:id', requirePermission('quiz:update'), validate({ params: idParamSchema, body: updateQuizSchema }), lms.updateQuiz);
router.delete('/quizzes/:id', requirePermission('quiz:delete'), validate({ params: idParamSchema }), lms.deleteQuiz);
router.post('/quizzes/:id/questions', requirePermission('quiz:update'), validate({ params: idParamSchema, body: quizQuestionSchema }), lms.addQuestion);
router.patch('/questions/:questionId', requirePermission('quiz:update'), validate({ body: quizQuestionSchema.partial() }), lms.updateQuestion);
router.delete('/questions/:questionId', requirePermission('quiz:update'), lms.deleteQuestion);

/* -------------------------------- Enrollments -------------------------------- */
router.get('/enrollments', requirePermission('enrollment:read'), validate({ query: paginationSchema }), lms.listEnrollments);
router.post('/enrollments', requirePermission('enrollment:create'), lms.createEnrollment);
router.delete('/enrollments/:id', requirePermission('enrollment:delete'), validate({ params: idParamSchema }), lms.deleteEnrollment);
router.get('/progress/overview', requirePermission('progress:read'), lms.progressOverview);

/* ---------------------------------- Batches --------------------------------- */
router.get('/batches', requirePermission('batch:read'), validate({ query: batchQuerySchema }), c.listBatches);
router.post('/batches', requirePermission('batch:create'), validate({ body: createBatchSchema }), c.createBatch);
router.get('/batches/:id', requirePermission('batch:read'), validate({ params: idParamSchema }), c.getBatch);
router.patch('/batches/:id', requirePermission('batch:update'), validate({ params: idParamSchema, body: updateBatchSchema }), c.updateBatch);
router.delete('/batches/:id', requirePermission('batch:delete'), validate({ params: idParamSchema }), c.deleteBatch);
router.post('/batches/:id/enroll', requirePermission('enrollment:create'), validate({ params: idParamSchema, body: enrollBatchSchema }), c.enrollInBatch);
router.delete('/batches/:id/students/:studentId', requirePermission('enrollment:delete'), c.removeFromBatch);

/* ---------------------------------- Classes --------------------------------- */
router.get('/classes', requirePermission('class:read'), validate({ query: classQuerySchema }), c.listClasses);
router.post('/classes', requirePermission('class:create'), validate({ body: createClassSchema }), c.createClass);
router.post('/classes/generate', requirePermission('class:create'), validate({ body: generateClassesSchema }), c.generateClasses);
router.get('/classes/:id', requirePermission('class:read'), validate({ params: idParamSchema }), c.getClass);
router.patch('/classes/:id', requirePermission('class:update'), validate({ params: idParamSchema, body: updateClassSchema }), c.updateClass);
router.delete('/classes/:id', requirePermission('class:delete'), validate({ params: idParamSchema }), c.deleteClass);

/* -------------------------------- Attendance -------------------------------- */
router.get('/attendance', requirePermission('attendance:read'), validate({ query: attendanceQuerySchema }), c.listAttendance);
router.get('/attendance/report', requirePermission('attendance:read'), c.attendanceReport);
router.get('/attendance/sheet/:classSessionId', requirePermission('attendance:read'), c.attendanceSheet);
router.post('/attendance', requirePermission('attendance:create'), validate({ body: markAttendanceSchema }), c.markAttendance);

/* ----------------------------------- Exams ---------------------------------- */
router.get('/exams', requirePermission('exam:read'), validate({ query: examQuerySchema }), c.listExams);
router.post('/exams', requirePermission('exam:create'), validate({ body: createExamSchema }), c.createExam);
router.get('/exams/:id', requirePermission('exam:read'), validate({ params: idParamSchema }), c.getExam);
router.patch('/exams/:id', requirePermission('exam:update'), validate({ params: idParamSchema, body: updateExamSchema }), c.updateExam);
router.delete('/exams/:id', requirePermission('exam:delete'), validate({ params: idParamSchema }), c.deleteExam);
router.post('/exams/:id/results', requirePermission('result:create'), validate({ params: idParamSchema, body: enterResultsSchema }), c.enterResults);

/* ---------------------------------- Results --------------------------------- */
router.get('/results', requirePermission('result:read'), validate({ query: resultQuerySchema }), c.listResults);
router.delete('/results/:id', requirePermission('result:delete'), validate({ params: idParamSchema }), c.deleteResult);

/* -------------------------------- Assignments -------------------------------- */
router.get('/assignments', requirePermission('assignment:read'), validate({ query: assignmentQuerySchema }), c.listAssignments);
router.post('/assignments', requirePermission('assignment:create'), validate({ body: createAssignmentSchema }), c.createAssignment);
router.get('/assignments/:id', requirePermission('assignment:read'), validate({ params: idParamSchema }), c.getAssignment);
router.patch('/assignments/:id', requirePermission('assignment:update'), validate({ params: idParamSchema, body: updateAssignmentSchema }), c.updateAssignment);
router.delete('/assignments/:id', requirePermission('assignment:delete'), validate({ params: idParamSchema }), c.deleteAssignment);
router.post('/submissions/:submissionId/grade', requirePermission('assignment:grade'), validate({ body: gradeSubmissionSchema }), c.gradeSubmission);

export default router;
