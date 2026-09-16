import { z } from 'zod';
import { paginationSchema, objectIdString } from '../utils/query';
import { COURSE_STATUSES, COURSE_TYPES, COURSE_LEVELS, LESSON_TYPES } from '../models/Course';
import { BATCH_STATUSES } from '../models/Batch';
import { EXAM_STATUSES, EXAM_TYPES } from '../models/Exam';
import { ATTENDANCE_STATUSES } from '../models/Batch';
import { MATERIAL_TYPES } from '../models/Lms';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm format');

/* ---------------------------------- Courses --------------------------------- */

export const createCourseSchema = z.object({
  title: z.string().trim().min(2, 'Title is required').max(160),
  code: z.string().trim().max(20).optional(),
  description: z.string().trim().max(5000).optional(),
  shortDescription: z.string().trim().max(300).optional(),
  thumbnailUrl: z.string().trim().max(500).optional().or(z.literal('')),
  category: z.string().trim().max(80).optional(),
  level: z.enum(COURSE_LEVELS).default('ALL_LEVELS'),
  type: z.enum(COURSE_TYPES).default('OFFLINE'),
  durationWeeks: z.coerce.number().min(0).max(520).optional(),
  durationHours: z.coerce.number().min(0).max(10000).optional(),
  price: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).default(0),
  instructorId: objectIdString.optional().or(z.literal('')),
  subjectIds: z.array(objectIdString).max(40).default([]),
  status: z.enum(COURSE_STATUSES).default('DRAFT'),
  tags: z.array(z.string().trim().max(30)).max(20).default([]),
  outcomes: z.array(z.string().trim().max(200)).max(20).default([]),
  prerequisites: z.array(z.string().trim().max(200)).max(20).default([]),
});

export const updateCourseSchema = createCourseSchema.partial();

export const courseQuerySchema = paginationSchema.extend({
  status: z.enum(COURSE_STATUSES).optional(),
  type: z.enum(COURSE_TYPES).optional(),
  category: z.string().trim().max(80).optional(),
  instructorId: objectIdString.optional(),
});

export const createSubjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(20),
  description: z.string().trim().max(1000).optional(),
  courseIds: z.array(objectIdString).max(60).default([]),
  teacherIds: z.array(objectIdString).max(60).default([]),
  isActive: z.boolean().default(true),
});
export const updateSubjectSchema = createSubjectSchema.partial();

/* ------------------------------ Course builder ------------------------------ */

export const createModuleSchema = z.object({
  title: z.string().trim().min(2, 'Module title is required').max(160),
  description: z.string().trim().max(2000).optional(),
  order: z.coerce.number().min(0).optional(),
  isPublished: z.boolean().default(true),
});
export const updateModuleSchema = createModuleSchema.partial();

export const reorderSchema = z.object({
  items: z.array(z.object({ id: objectIdString, order: z.coerce.number().min(0) })).min(1),
});

export const createLessonSchema = z.object({
  moduleId: objectIdString,
  title: z.string().trim().min(2, 'Lesson title is required').max(160),
  description: z.string().trim().max(3000).optional(),
  type: z.enum(LESSON_TYPES).default('VIDEO'),
  order: z.coerce.number().min(0).optional(),
  durationSeconds: z.coerce.number().min(0).max(86400).default(0),
  videoId: objectIdString.optional().or(z.literal('')),
  quizId: objectIdString.optional().or(z.literal('')),
  content: z.string().trim().max(50000).optional(),
  externalUrl: z.string().trim().max(1000).optional().or(z.literal('')),
  attachmentIds: z.array(objectIdString).max(30).default([]),
  isPreview: z.boolean().default(false),
  isPublished: z.boolean().default(true),
});
export const updateLessonSchema = createLessonSchema.partial().omit({ moduleId: true }).extend({
  moduleId: objectIdString.optional(),
});

export const createVideoSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  provider: z.enum(['local', 's3', 'cloudinary', 'vimeo', 'youtube']).default('youtube'),
  storageKey: z.string().trim().min(1, 'Provide a storage key, video ID or URL').max(500),
  publicUrl: z.string().trim().max(1000).optional().or(z.literal('')),
  thumbnailUrl: z.string().trim().max(1000).optional().or(z.literal('')),
  durationSeconds: z.coerce.number().min(0).max(86400).default(0),
  sizeBytes: z.coerce.number().min(0).default(0),
  courseId: objectIdString.optional().or(z.literal('')),
  lessonId: objectIdString.optional().or(z.literal('')),
  visibility: z.enum(['PRIVATE', 'ENROLLED', 'PUBLIC']).default('ENROLLED'),
});
export const updateVideoSchema = createVideoSchema.partial();

export const videoQuerySchema = paginationSchema.extend({
  courseId: objectIdString.optional(),
  provider: z.string().max(20).optional(),
});

export const createMaterialSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  type: z.enum(MATERIAL_TYPES).default('PDF'),
  courseId: objectIdString.optional().or(z.literal('')),
  moduleId: objectIdString.optional().or(z.literal('')),
  lessonId: objectIdString.optional().or(z.literal('')),
  batchId: objectIdString.optional().or(z.literal('')),
  externalUrl: z.string().trim().max(1000).optional().or(z.literal('')),
  content: z.string().trim().max(50000).optional(),
  storageKey: z.string().trim().max(500).optional(),
  fileName: z.string().trim().max(200).optional(),
  sizeBytes: z.coerce.number().min(0).default(0),
  visibility: z.enum(['PRIVATE', 'ENROLLED', 'PUBLIC']).default('ENROLLED'),
});
export const updateMaterialSchema = createMaterialSchema.partial();

/* ----------------------------------- Quiz ----------------------------------- */

export const createQuizSchema = z.object({
  courseId: objectIdString,
  moduleId: objectIdString.optional().or(z.literal('')),
  lessonId: objectIdString.optional().or(z.literal('')),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional(),
  passingPercentage: z.coerce.number().min(0).max(100).default(40),
  timeLimitMinutes: z.coerce.number().min(1).max(300).default(15),
  maxAttempts: z.coerce.number().min(1).max(20).default(3),
  shuffleQuestions: z.boolean().default(false),
  isPublished: z.boolean().default(true),
});
export const updateQuizSchema = createQuizSchema.partial().omit({ courseId: true });

export const quizQuestionSchema = z.object({
  question: z.string().trim().min(2, 'Question text is required').max(2000),
  type: z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE']).default('SINGLE_CHOICE'),
  options: z.array(z.object({ key: z.string().trim().min(1).max(5), text: z.string().trim().min(1).max(500) })).min(2, 'Add at least two options').max(8),
  correctOptions: z.array(z.string().trim().max(5)).min(1, 'Mark at least one correct option'),
  marks: z.coerce.number().min(0).max(100).default(1),
  explanation: z.string().trim().max(2000).optional(),
  order: z.coerce.number().min(0).optional(),
});

export const submitQuizSchema = z.object({
  answers: z.array(z.object({ questionId: objectIdString, selected: z.array(z.string().max(5)).max(8) })).min(1),
});

/* ---------------------------------- Batches --------------------------------- */

export const createBatchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(20).optional(),
  courseId: objectIdString,
  teacherId: objectIdString.optional().or(z.literal('')),
  capacity: z.coerce.number().min(1).max(1000).default(30),
  room: z.string().trim().max(60).optional(),
  mode: z.enum(['ONLINE', 'OFFLINE', 'HYBRID']).default('OFFLINE'),
  schedule: z.array(z.object({
    day: z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
    startTime: time,
    endTime: time,
  })).max(7).default([]),
  startDate: z.string().min(4, 'Start date is required'),
  endDate: z.string().optional().or(z.literal('')),
  status: z.enum(BATCH_STATUSES).default('UPCOMING'),
  description: z.string().trim().max(2000).optional(),
});
export const updateBatchSchema = createBatchSchema.partial();

export const batchQuerySchema = paginationSchema.extend({
  status: z.enum(BATCH_STATUSES).optional(),
  courseId: objectIdString.optional(),
  teacherId: objectIdString.optional(),
});

export const enrollBatchSchema = z.object({
  studentIds: z.array(objectIdString).min(1, 'Select at least one student').max(200),
});

/* ---------------------------------- Classes --------------------------------- */

export const createClassSchema = z.object({
  title: z.string().trim().min(2).max(160),
  courseId: objectIdString,
  batchId: objectIdString,
  teacherId: objectIdString,
  subjectId: objectIdString.optional().or(z.literal('')),
  room: z.string().trim().max(60).optional(),
  mode: z.enum(['ONLINE', 'OFFLINE']).default('OFFLINE'),
  meetingUrl: z.string().trim().max(500).optional().or(z.literal('')),
  date: z.string().min(4, 'Date is required'),
  startTime: time,
  endTime: time,
  topic: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export const updateClassSchema = createClassSchema.partial().extend({
  status: z.enum(['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED']).optional(),
});

export const classQuerySchema = paginationSchema.extend({
  batchId: objectIdString.optional(),
  teacherId: objectIdString.optional(),
  courseId: objectIdString.optional(),
  status: z.string().max(20).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const generateClassesSchema = z.object({
  batchId: objectIdString,
  from: z.string().min(4),
  to: z.string().min(4),
  topicPrefix: z.string().trim().max(80).optional(),
});

/* -------------------------------- Attendance -------------------------------- */

export const markAttendanceSchema = z.object({
  classSessionId: objectIdString,
  records: z.array(z.object({
    studentId: objectIdString,
    status: z.enum(ATTENDANCE_STATUSES),
    remarks: z.string().trim().max(200).optional(),
  })).min(1, 'No attendance records supplied').max(500),
});

export const attendanceQuerySchema = paginationSchema.extend({
  batchId: objectIdString.optional(),
  studentId: objectIdString.optional(),
  classSessionId: objectIdString.optional(),
  status: z.enum(ATTENDANCE_STATUSES).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

/* ----------------------------- Exams and results ---------------------------- */

export const createExamSchema = z.object({
  title: z.string().trim().min(2).max(160),
  type: z.enum(EXAM_TYPES).default('EXAM'),
  subjectId: objectIdString.optional().or(z.literal('')),
  courseId: objectIdString,
  batchId: objectIdString.optional().or(z.literal('')),
  teacherId: objectIdString.optional().or(z.literal('')),
  date: z.string().min(4, 'Exam date is required'),
  durationMinutes: z.coerce.number().min(5).max(600).default(60),
  totalMarks: z.coerce.number().min(1).max(1000).default(100),
  passingMarks: z.coerce.number().min(0).max(1000).default(35),
  status: z.enum(EXAM_STATUSES).default('DRAFT'),
  instructions: z.string().trim().max(3000).optional(),
  room: z.string().trim().max(60).optional(),
});
export const updateExamSchema = createExamSchema.partial();

export const examQuerySchema = paginationSchema.extend({
  status: z.enum(EXAM_STATUSES).optional(),
  courseId: objectIdString.optional(),
  batchId: objectIdString.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const enterResultsSchema = z.object({
  results: z.array(z.object({
    studentId: objectIdString,
    marksObtained: z.coerce.number().min(0).max(1000),
    remarks: z.string().trim().max(300).optional(),
  })).min(1, 'Enter marks for at least one student').max(500),
  publish: z.boolean().default(false),
});

export const resultQuerySchema = paginationSchema.extend({
  examId: objectIdString.optional(),
  studentId: objectIdString.optional(),
  batchId: objectIdString.optional(),
  courseId: objectIdString.optional(),
  passed: z.enum(['true', 'false']).optional(),
});

/* -------------------------------- Assignments -------------------------------- */

export const createAssignmentSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(5000).optional(),
  courseId: objectIdString,
  batchId: objectIdString.optional().or(z.literal('')),
  lessonId: objectIdString.optional().or(z.literal('')),
  teacherId: objectIdString.optional().or(z.literal('')),
  dueDate: z.string().min(4, 'Due date is required'),
  totalMarks: z.coerce.number().min(1).max(1000).default(100),
  submissionType: z.enum(['TEXT', 'FILE', 'LINK', 'ANY']).default('ANY'),
  allowLateSubmission: z.boolean().default(true),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).default('PUBLISHED'),
  attachmentKey: z.string().trim().max(500).optional(),
  attachmentName: z.string().trim().max(200).optional(),
});
export const updateAssignmentSchema = createAssignmentSchema.partial();

export const assignmentQuerySchema = paginationSchema.extend({
  courseId: objectIdString.optional(),
  batchId: objectIdString.optional(),
  status: z.string().max(20).optional(),
});

export const submitAssignmentSchema = z.object({
  contentText: z.string().trim().max(20000).optional(),
  link: z.string().trim().max(1000).optional().or(z.literal('')),
  fileKey: z.string().trim().max(500).optional(),
  fileName: z.string().trim().max(200).optional(),
});

export const gradeSubmissionSchema = z.object({
  marksAwarded: z.coerce.number().min(0).max(1000),
  feedback: z.string().trim().max(3000).optional(),
});
