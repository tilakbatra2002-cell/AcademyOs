export type Role =
  | 'SAAS_OWNER'
  | 'ORGANIZATION_ADMIN'
  | 'COUNSELOR'
  | 'TEACHER'
  | 'ACCOUNTANT'
  | 'STAFF'
  | 'PARENT'
  | 'STUDENT';

export type PortalKey = 'owner' | 'admin' | 'teacher' | 'student' | 'parent';

export interface SessionUser {
  id: string;
  /** Mongo id; present on user documents returned by /people/users. */
  _id?: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  permissions: string[];
  organizationId?: string | null;
  studentId?: string | null;
  teacherId?: string | null;
  parentId?: string | null;
  mustChangePassword?: boolean;
  avatarUrl?: string;
  isActive?: boolean;
  lastLoginAt?: string;
}

export interface Branding {
  primaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  tagline?: string;
}

export interface OrganizationSummary {
  _id: string;
  name: string;
  slug: string;
  code: string;
  status: string;
  branding?: Branding;
  settings?: Record<string, unknown>;
}

export interface SessionResponse {
  user: SessionUser;
  organization?: OrganizationSummary | null;
  subscription?: {
    plan: string;
    status: string;
    trialEndsAt?: string;
    currentPeriodEnd?: string;
    limits?: Record<string, number>;
    usage?: Record<string, number>;
  } | null;
}

export interface Address {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface Student {
  _id: string;
  organizationId: string;
  studentCode: string;
  name: string;
  email?: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  bloodGroup?: string;
  address?: Address;
  guardianId?: { _id: string; name: string; phone?: string; email?: string; occupation?: string; relation?: string } | string;
  schoolName?: string;
  previousQualification?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DROPPED' | 'COMPLETED' | 'SUSPENDED';
  admissionDate: string;
  primaryCourseId?: { _id: string; title: string; code?: string } | string;
  primaryBatchId?: { _id: string; name: string; code?: string } | string;
  tags?: string[];
  userId?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Parent {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  alternatePhone?: string;
  occupation?: string;
  relation: 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER';
  address?: Address;
  childrenIds?: Array<{ _id: string; name: string; studentCode: string } | string>;
  userId?: string;
  isActive: boolean;
}

export interface Teacher {
  _id: string;
  name: string;
  email: string;
  phone: string;
  employeeCode: string;
  qualification?: string;
  specialization?: string;
  experienceYears?: number;
  joiningDate?: string;
  salary?: number;
  subjectIds?: Array<{ _id: string; name: string } | string>;
  courseIds?: string[];
  bio?: string;
  isActive: boolean;
  userId?: string;
}

export interface Course {
  _id: string;
  title: string;
  slug: string;
  code: string;
  description?: string;
  shortDescription?: string;
  category: string;
  level: string;
  type: string;
  durationWeeks?: number;
  durationHours?: number;
  price: number;
  discount?: number;
  instructorId?: { _id: string; name: string } | string;
  subjectIds?: Array<{ _id: string; name: string } | string>;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  thumbnailUrl?: string;
  tags?: string[];
  outcomes?: string[];
  prerequisites?: string[];
  enrolledCount?: number;
  publishedAt?: string;
  createdAt: string;
}

export interface CourseModule {
  _id: string;
  courseId: string;
  title: string;
  description?: string;
  order: number;
  isPublished: boolean;
}

export interface Lesson {
  _id: string;
  courseId: { _id: string; title: string; code?: string } | string;
  moduleId: { _id: string; title: string } | string;
  title: string;
  description?: string;
  type: 'VIDEO' | 'TEXT' | 'QUIZ' | 'ASSIGNMENT' | 'LIVE' | 'DOCUMENT';
  order: number;
  durationSeconds?: number;
  /** Convenience alias used by the course builder form. */
  durationMinutes?: number;
  videoId?: string;
  videoUrl?: string;
  quizId?: string;
  content?: string;
  isPreview: boolean;
  /** Alias of isPreview used in the builder form. */
  isFreePreview?: boolean;
  isPublished: boolean;
  attachmentIds?: string[];
}

export interface Video {
  _id: string;
  title: string;
  description?: string;
  courseId?: { _id: string; title: string } | string;
  lessonId?: string;
  provider: string;
  storageKey: string;
  publicUrl?: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  sizeBytes: number;
  visibility: 'PRIVATE' | 'ENROLLED' | 'PUBLIC';
  status: 'READY' | 'PROCESSING' | 'FAILED';
  createdAt: string;
}

export interface Batch {
  _id: string;
  name: string;
  code: string;
  courseId?: { _id: string; title: string } | string;
  teacherId?: { _id: string; name: string } | string;
  capacity: number;
  enrolledCount: number;
  room?: string;
  mode: 'ONLINE' | 'OFFLINE' | 'HYBRID';
  schedule: Array<{ day: string; startTime: string; endTime: string }>;
  startDate: string;
  endDate?: string;
  status: 'UPCOMING' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  description?: string;
}

export interface Lead {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  parentName?: string;
  parentPhone?: string;
  courseId?: { _id: string; title: string } | string;
  courseInterest?: string;
  source: string;
  assignedCounselorId?: { _id: string; name: string } | string;
  status: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  expectedJoiningDate?: string;
  expectedValue?: number;
  notes?: string;
  city?: string;
  lostReason?: string;
  lastContactedAt?: string;
  activities?: Array<{ type: string; note: string; at: string; byName?: string }>;
  createdAt: string;
}

export interface FollowUp {
  _id: string;
  leadId?: { _id: string; name: string; phone: string } | string;
  studentId?: string;
  assignedTo?: { _id: string; name: string } | string;
  mode: string;
  scheduledAt: string;
  scheduledTime?: string;
  priority: string;
  status: 'PENDING' | 'COMPLETED' | 'RESCHEDULED' | 'CANCELLED';
  outcome?: string;
  notes?: string;
  completedAt?: string;
}

export interface ClassSession {
  _id: string;
  title: string;
  courseId?: { _id: string; title: string } | string;
  batchId?: { _id: string; name: string } | string;
  teacherId?: { _id: string; name: string } | string;
  room?: string;
  mode: string;
  meetingUrl?: string;
  date: string;
  startTime: string;
  endTime: string;
  startAt: string;
  endAt: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  topic?: string;
  attendanceMarked: boolean;
}

export interface AttendanceRecord {
  _id: string;
  studentId: { _id: string; name: string; studentCode: string } | string;
  classSessionId: string;
  batchId?: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';
  remarks?: string;
}

export interface Exam {
  _id: string;
  title: string;
  type: string;
  courseId?: { _id: string; title: string } | string;
  batchId?: { _id: string; name: string } | string;
  teacherId?: { _id: string; name: string } | string;
  subjectId?: { _id: string; name: string } | string;
  date: string;
  startTime?: string;
  durationMinutes?: number;
  totalMarks: number;
  passingMarks: number;
  status: string;
  resultPublished: boolean;
  room?: string;
  instructions?: string;
}

export interface TestResult {
  _id: string;
  examId: { _id: string; title: string; totalMarks: number; date?: string } | string;
  studentId: { _id: string; name: string; studentCode: string } | string;
  marksObtained: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  passed: boolean;
  rank?: number;
  remarks?: string;
}

export interface Assignment {
  _id: string;
  title: string;
  description?: string;
  courseId?: { _id: string; title: string } | string;
  batchId?: { _id: string; name: string } | string;
  teacherId?: { _id: string; name: string } | string;
  dueDate: string;
  totalMarks: number;
  /** Alias of totalMarks used by the assignment form. */
  maxMarks?: number;
  submissionType: 'TEXT' | 'FILE' | 'LINK' | 'ANY';
  allowLateSubmission: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  /** Returned by the list endpoint as `submissions` / `graded`. */
  submissions?: number;
  graded?: number;
  submissionCount?: number;
  pendingGradingCount?: number;
}

export interface AssignmentSubmission {
  _id: string;
  assignmentId: string;
  studentId: { _id: string; name: string; studentCode: string } | string;
  /** Alias of contentText. */
  content?: string;
  marksObtained?: number;
  contentText?: string;
  fileKey?: string;
  fileName?: string;
  link?: string;
  submittedAt: string;
  isLate: boolean;
  status: 'SUBMITTED' | 'GRADED' | 'RETURNED';
  marksAwarded?: number;
  feedback?: string;
  gradedAt?: string;
}

export interface FeePlan {
  _id: string;
  studentId: { _id: string; name: string; studentCode: string } | string;
  courseId?: { _id: string; title: string } | string;
  title: string;
  totalAmount: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  pendingAmount: number;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  startDate: string;
}

export interface FeeInstallment {
  _id: string;
  feePlanId: string;
  studentId: { _id: string; name: string; studentCode: string } | string;
  sequence: number;
  title: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED';
  lateFee?: number;
  paidAt?: string;
}

export interface Payment {
  _id: string;
  paymentNumber: string;
  studentId: { _id: string; name: string; studentCode: string } | string;
  courseId?: { _id: string; title: string } | string;
  amount: number;
  method: string;
  transactionId?: string;
  gateway?: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'REFUNDED';
  paidAt: string;
  receiptId?: string;
  invoiceId?: string;
  notes?: string;
}

export interface Announcement {
  _id: string;
  title: string;
  body: string;
  audience: string;
  priority: string;
  isPinned: boolean;
  status: string;
  publishedAt?: string;
  createdByName?: string;
  createdAt: string;
  isRead?: boolean;
  readCount?: number;
}

export interface NotificationItem {
  _id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  priority: string;
  createdAt: string;
}

export interface CalendarEventItem {
  _id: string;
  title: string;
  description?: string;
  type: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location?: string;
  color?: string;
}

export interface DocumentFile {
  _id: string;
  ownerName?: string;
  ownerType: string;
  ownerId: string;
  category: string;
  title: string;
  fileName: string;
  mimeType?: string;
  sizeBytes: number;
  visibility: string;
  createdAt: string;
}

export interface AuditLogItem {
  _id: string;
  userName?: string;
  userRole?: string;
  action: string;
  entity?: string;
  entityId?: string;
  status: string;
  ip?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
  link: string;
}


/* ----------------------------- Name aliases -------------------------------- */
/** The API calls these by slightly different names in different places. */
export type Result = TestResult;
export type Submission = AssignmentSubmission;
export type VideoItem = Video;
export type DocumentItem = DocumentFile;
export type CalendarEvent = CalendarEventItem & { date?: string };
export type User = SessionUser & {
  _id: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt?: string;
};

export interface Subject {
  _id: string;
  name: string;
  code: string;
  description?: string;
  courseCount?: number;
  isActive?: boolean;
}

export interface StudyMaterial {
  _id: string;
  title: string;
  description?: string;
  type: string;
  courseId?: { _id: string; title: string } | string;
  lessonId?: { _id: string; title: string } | string;
  externalUrl?: string;
  storageKey?: string;
  fileName?: string;
  sizeBytes?: number;
  visibility: string;
  downloadCount?: number;
  createdAt: string;
}

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  studentId: { _id: string; name: string; studentCode: string } | string;
  courseId?: { _id: string; title: string } | string;
  feePlanId?: string;
  amount: number;
  totalAmount?: number;
  taxAmount?: number;
  status: string;
  issueDate: string;
  dueDate?: string;
  paidAt?: string;
}

export interface Receipt {
  _id: string;
  receiptNumber: string;
  paymentId: string;
  studentId: { _id: string; name: string; studentCode: string } | string;
  amount: number;
  issuedAt: string;
}

export interface Admission {
  _id: string;
  admissionNumber: string;
  studentId: { _id: string; name: string; studentCode: string } | string;
  parentId?: string;
  courseId?: { _id: string; title: string } | string;
  batchId?: { _id: string; name: string } | string;
  feePlanId?: string;
  status: string;
  admissionDate: string;
  totalFee?: number;
  totalAmount?: number;
  discount?: number;
  netFee?: number;
  netAmount?: number;
  initialPayment?: number;
  source?: string;
  leadId?: string;
}

export interface CourseEnrollment {
  _id: string;
  studentId: { _id: string; name: string; studentCode: string } | string;
  courseId: { _id: string; title: string; code?: string } | string;
  batchId?: { _id: string; name: string } | string;
  status: string;
  enrolledAt: string;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  lastAccessedAt?: string;
  lastLessonId?: string;
}

export interface Organization {
  _id: string;
  name: string;
  slug: string;
  code: string;
  status: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: Address;
  branding?: Branding & { tagline?: string };
  settings?: {
    attendanceThreshold?: number;
    studentIdPrefix?: string;
    invoicePrefix?: string;
    receiptPrefix?: string;
    currency?: string;
    currencySymbol?: string;
    timezone?: string;
    locale?: string;
    academicYearStartMonth?: number;
    restrictOnTrialExpiry?: boolean;
  };
  counters?: Record<string, number>;
  createdAt?: string;
}
