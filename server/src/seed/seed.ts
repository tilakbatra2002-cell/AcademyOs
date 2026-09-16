/* eslint-disable no-console */
import mongoose, { Types } from 'mongoose';
import dayjs from 'dayjs';
import { connectDB, disconnectDB } from '../config/db';
import { env } from '../config/env';
import { hashPassword } from '../services/password.service';
import { PLANS } from '../config/plans';
import { calculateGrade } from '../models/Exam';
import {
  Organization, Subscription, User, AuditLog, Lead, FollowUp, Student, Parent, Teacher, Admission,
  Course, CourseModule, Lesson, Subject, Video, StudyMaterial, Quiz, QuizQuestion, QuizAttempt,
  CourseEnrollment, LessonProgress, Batch, BatchEnrollment, ClassSession, Attendance,
  Exam, TestResult, Assignment, AssignmentSubmission,
  FeePlan, FeeInstallment, Payment, Invoice, Receipt,
  Announcement, Notification, Communication, DocumentFile, CalendarEvent,
} from '../models';
import {
  rnd, resetRandom, pick, pickMany, int, chance, personName, phone, emailFor,
  HP_CITIES, SCHOOLS, OCCUPATIONS, SUBJECT_POOL, COURSE_LIBRARY, LEAD_SOURCES, LEAD_STATUSES,
  ANNOUNCEMENT_LIBRARY, FOLLOWUP_NOTES, LEAD_NOTES, MATERIAL_TITLES, EXAM_TITLES,
  ASSIGNMENT_TITLES, DEMO_VIDEOS,
} from './data';

/* ----------------------------- Tenant definitions ---------------------------- */

interface OrgSpec {
  name: string;
  slug: string;
  code: string;
  domain: string;
  city: string;
  plan: 'STARTER' | 'GROWTH' | 'PRO';
  status: 'TRIAL' | 'ACTIVE';
  primaryColor: string;
  accentColor: string;
  tagline: string;
  courses: number;
  students: number;
  teachers: number;
  counselors: number;
  accountants: number;
  batches: number;
  leads: number;
  parents: number;
}

const ORGS: OrgSpec[] = [
  {
    name: 'Brilliant Academy', slug: 'brilliant-academy', code: 'BRIL', domain: 'brilliantacademy.test',
    city: 'Shimla', plan: 'PRO', status: 'ACTIVE',
    primaryColor: '#4f46e5', accentColor: '#0ea5e9', tagline: 'Where toppers are made',
    courses: 6, students: 70, teachers: 5, counselors: 2, accountants: 1, batches: 13, leads: 22, parents: 45,
  },
  {
    name: 'ABC Coaching', slug: 'abc-coaching', code: 'ABCC', domain: 'abccoaching.test',
    city: 'Solan', plan: 'GROWTH', status: 'ACTIVE',
    primaryColor: '#0f766e', accentColor: '#f59e0b', tagline: 'Learn today, lead tomorrow',
    courses: 5, students: 50, teachers: 3, counselors: 2, accountants: 1, batches: 10, leads: 18, parents: 35,
  },
  {
    name: 'Future Skills Academy', slug: 'future-skills-academy', code: 'FSKA', domain: 'futureskills.test',
    city: 'Dharamshala', plan: 'STARTER', status: 'TRIAL',
    primaryColor: '#be123c', accentColor: '#7c3aed', tagline: 'Skills for the real world',
    courses: 4, students: 30, teachers: 2, counselors: 1, accountants: 1, batches: 7, leads: 10, parents: 20,
  },
];

const DEMO_PASSWORD = 'Password@123';
const OWNER_EMAIL = 'owner@academyos.com';
const OWNER_PASSWORD = 'Owner@12345';

interface Credential { portal: string; role: string; org: string; email: string; password: string; note?: string }
const credentials: Credential[] = [];

/* --------------------------------- Utilities -------------------------------- */

const COLLECTIONS = [
  Organization, Subscription, User, AuditLog, Lead, FollowUp, Student, Parent, Teacher, Admission,
  Course, CourseModule, Lesson, Subject, Video, StudyMaterial, Quiz, QuizQuestion, QuizAttempt,
  CourseEnrollment, LessonProgress, Batch, BatchEnrollment, ClassSession, Attendance,
  Exam, TestResult, Assignment, AssignmentSubmission,
  FeePlan, FeeInstallment, Payment, Invoice, Receipt,
  Announcement, Notification, Communication, DocumentFile, CalendarEvent,
];

async function wipe() {
  console.log('  clearing existing collections…');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await Promise.all(COLLECTIONS.map((m) => (m as any).deleteMany({})));
}

function at(day: dayjs.Dayjs, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return day.hour(h).minute(m).second(0).millisecond(0).toDate();
}

const DAY_INDEX: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

/* ----------------------------------- Seed ----------------------------------- */

async function seedOwner() {
  const owner = await User.create({
    organizationId: null,
    name: 'Platform Owner',
    email: OWNER_EMAIL,
    phone: '9418000000',
    passwordHash: await hashPassword(OWNER_PASSWORD),
    role: 'SAAS_OWNER',
    isActive: true,
    mustChangePassword: false,
  });
  credentials.push({ portal: '/owner/login', role: 'SAAS_OWNER', org: '— platform —', email: OWNER_EMAIL, password: OWNER_PASSWORD });
  return owner;
}

async function seedOrganization(spec: OrgSpec, ownerId: Types.ObjectId) {
  console.log(`\n▸ ${spec.name}`);
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = dayjs();

  /* ------------------------------- Organization ------------------------------ */
  const org = await Organization.create({
    name: spec.name,
    slug: spec.slug,
    code: spec.code,
    status: spec.status,
    email: `info@${spec.domain}`,
    phone: phone(),
    website: `https://www.${spec.domain}`,
    address: { line1: `${int(1, 90)} Mall Road`, city: spec.city, state: 'Himachal Pradesh', country: 'India', postalCode: `17${int(1000, 9999)}` },
    branding: { primaryColor: spec.primaryColor, accentColor: spec.accentColor, tagline: spec.tagline },
    settings: { studentIdPrefix: 'STU', invoicePrefix: 'INV', receiptPrefix: 'RCP', attendanceThreshold: 75 },
    createdBy: ownerId,
  });
  const orgId = org._id;

  const planDef = PLANS[spec.plan];
  await Subscription.create({
    organizationId: orgId,
    plan: spec.plan,
    status: spec.status === 'TRIAL' ? 'TRIALING' : 'ACTIVE',
    billingCycle: 'MONTHLY',
    amount: planDef.monthlyPrice,
    currency: 'INR',
    trialEndsAt: spec.status === 'TRIAL' ? now.add(9, 'day').toDate() : now.subtract(60, 'day').toDate(),
    currentPeriodStart: now.startOf('month').toDate(),
    currentPeriodEnd: now.endOf('month').toDate(),
    limits: planDef.limits,
    usage: { storageBytes: 0 },
    invoices: spec.status === 'ACTIVE'
      ? [0, 1, 2].map((i) => ({
          number: `PLTINV-${now.subtract(i, 'month').format('YYYYMM')}-001`,
          amount: planDef.monthlyPrice,
          status: 'PAID' as const,
          issuedAt: now.subtract(i, 'month').startOf('month').toDate(),
          paidAt: now.subtract(i, 'month').startOf('month').add(2, 'day').toDate(),
          method: 'BANK_TRANSFER',
        }))
      : [],
  });

  /* ----------------------------------- Staff ---------------------------------- */
  const adminName = personName(chance(0.5) ? 'MALE' : 'FEMALE');
  const adminEmail = `admin@${spec.domain}`;
  const admin = await User.create({
    organizationId: orgId, name: adminName, email: adminEmail, phone: phone(),
    passwordHash, role: 'ORGANIZATION_ADMIN', isActive: true, mustChangePassword: false, createdBy: ownerId,
  });
  credentials.push({ portal: '/admin/login', role: 'ORGANIZATION_ADMIN', org: spec.name, email: adminEmail, password: DEMO_PASSWORD });

  const counselors = [];
  for (let i = 0; i < spec.counselors; i++) {
    const g = chance(0.6) ? 'FEMALE' : 'MALE';
    const name = personName(g as 'MALE' | 'FEMALE');
    const email = `counselor${i + 1}@${spec.domain}`;
    counselors.push(await User.create({
      organizationId: orgId, name, email, phone: phone(), passwordHash,
      role: 'COUNSELOR', isActive: true, mustChangePassword: false, createdBy: admin._id,
    }));
    if (i === 0) credentials.push({ portal: '/admin/login', role: 'COUNSELOR', org: spec.name, email, password: DEMO_PASSWORD });
  }

  const accountants = [];
  for (let i = 0; i < spec.accountants; i++) {
    const email = `accounts${i + 1}@${spec.domain}`;
    accountants.push(await User.create({
      organizationId: orgId, name: personName(chance(0.5) ? 'MALE' : 'FEMALE'), email, phone: phone(),
      passwordHash, role: 'ACCOUNTANT', isActive: true, mustChangePassword: false, createdBy: admin._id,
    }));
    if (i === 0) credentials.push({ portal: '/admin/login', role: 'ACCOUNTANT', org: spec.name, email, password: DEMO_PASSWORD });
  }

  const staffEmail = `frontdesk@${spec.domain}`;
  await User.create({
    organizationId: orgId, name: personName('FEMALE'), email: staffEmail, phone: phone(),
    passwordHash, role: 'STAFF', isActive: true, mustChangePassword: false, createdBy: admin._id,
  });
  credentials.push({ portal: '/admin/login', role: 'STAFF', org: spec.name, email: staffEmail, password: DEMO_PASSWORD });

  /* --------------------------------- Subjects --------------------------------- */
  const subjectDocs = await Subject.insertMany(
    SUBJECT_POOL.map((s) => ({ organizationId: orgId, name: s.name, code: s.code, isActive: true })),
  );
  const subjectByCode = new Map(subjectDocs.map((s) => [s.code, s]));

  /* --------------------------------- Teachers --------------------------------- */
  const teachers = [];
  for (let i = 0; i < spec.teachers; i++) {
    const g: 'MALE' | 'FEMALE' = chance(0.5) ? 'MALE' : 'FEMALE';
    const name = personName(g);
    const email = `teacher${i + 1}@${spec.domain}`;
    const user = await User.create({
      organizationId: orgId, name, email, phone: phone(), passwordHash,
      role: 'TEACHER', isActive: true, mustChangePassword: false, createdBy: admin._id,
    });
    const teacherSubjects = pickMany(subjectDocs, int(2, 4));
    const teacher = await Teacher.create({
      organizationId: orgId,
      userId: user._id,
      employeeCode: `EMP${String(i + 1).padStart(4, '0')}`,
      name, email, phone: phone(),
      qualification: pick(['M.Sc. Physics', 'M.Sc. Chemistry', 'M.Tech CSE', 'M.A. English', 'M.Com', 'M.Sc. Mathematics', 'B.Tech + B.Ed', 'Ph.D. Biotechnology']),
      specialization: teacherSubjects.map((s) => s.name).join(', '),
      experienceYears: int(2, 18),
      joiningDate: now.subtract(int(6, 60), 'month').toDate(),
      salary: int(28000, 75000),
      subjectIds: teacherSubjects.map((s) => s._id),
      bio: `${name} has been teaching ${teacherSubjects[0]?.name ?? 'core subjects'} for over ${int(2, 15)} years and focuses on concept clarity through worked examples.`,
      isActive: true,
      createdBy: admin._id,
    });
    await User.updateOne({ _id: user._id }, { teacherId: teacher._id });
    teachers.push(teacher);
    if (i === 0) credentials.push({ portal: '/teacher/login', role: 'TEACHER', org: spec.name, email, password: DEMO_PASSWORD });
  }

  /* ---------------------------------- Courses --------------------------------- */
  const courseSpecs = pickMany(COURSE_LIBRARY, spec.courses);
  const courses = [];
  const lessonsByCourse = new Map<string, (typeof Lesson.prototype)[]>();
  let videoCount = 0;

  for (let ci = 0; ci < courseSpecs.length; ci++) {
    const cs = courseSpecs[ci];
    const instructor = pick(teachers);
    const course = await Course.create({
      organizationId: orgId,
      title: cs.title,
      slug: `${cs.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      code: `CRS${String(ci + 1).padStart(3, '0')}`,
      description: cs.description,
      shortDescription: cs.shortDescription,
      category: cs.category,
      level: cs.level,
      type: cs.type,
      durationWeeks: cs.durationWeeks,
      durationHours: cs.durationHours,
      price: cs.price,
      discount: cs.discount,
      instructorId: instructor._id,
      subjectIds: cs.subjects.map((code) => subjectByCode.get(code)?._id).filter(Boolean),
      status: 'PUBLISHED',
      tags: [cs.category, cs.level],
      outcomes: cs.outcomes,
      prerequisites: cs.prerequisites,
      publishedAt: now.subtract(int(30, 300), 'day').toDate(),
      createdBy: admin._id,
    });
    await Teacher.updateOne({ _id: instructor._id }, { $addToSet: { courseIds: course._id } });
    courses.push(course);

    const courseLessons = [];
    for (let mi = 0; mi < cs.modules.length; mi++) {
      const ms = cs.modules[mi];
      const mod = await CourseModule.create({
        organizationId: orgId, courseId: course._id, title: ms.title, order: mi, isPublished: true,
        description: `Covers ${ms.lessons.length} lessons on ${ms.title.toLowerCase()}.`,
      });

      for (let li = 0; li < ms.lessons.length; li++) {
        const demo = DEMO_VIDEOS[videoCount % DEMO_VIDEOS.length];
        const video = await Video.create({
          organizationId: orgId,
          courseId: course._id,
          title: `${ms.lessons[li]} — video lecture`,
          description: `Recorded lecture for ${ms.lessons[li]}.`,
          provider: demo.provider,
          storageKey: demo.key,
          publicUrl: `https://www.youtube.com/watch?v=${demo.key}`,
          thumbnailUrl: `https://i.ytimg.com/vi/${demo.key}/hqdefault.jpg`,
          durationSeconds: demo.duration,
          sizeBytes: demo.duration * 128 * 1024,
          visibility: 'ENROLLED',
          status: 'READY',
          uploadedBy: admin._id,
        });
        videoCount += 1;

        const lesson = await Lesson.create({
          organizationId: orgId,
          courseId: course._id,
          moduleId: mod._id,
          title: ms.lessons[li],
          description: `In this lesson we work through ${ms.lessons[li].toLowerCase()} with solved examples and practice questions.`,
          type: 'VIDEO',
          order: li,
          durationSeconds: demo.duration,
          videoId: video._id,
          isPreview: mi === 0 && li === 0,
          isPublished: true,
          createdBy: admin._id,
        });
        await Video.updateOne({ _id: video._id }, { lessonId: lesson._id });
        courseLessons.push(lesson);
      }
    }
    lessonsByCourse.set(String(course._id), courseLessons);

    /* ------------------------------ Study material ----------------------------- */
    for (let i = 0; i < int(3, 6); i++) {
      const lesson = pick(courseLessons);
      await StudyMaterial.create({
        organizationId: orgId,
        title: `${cs.title.split(' ').slice(0, 3).join(' ')} — ${pick(MATERIAL_TITLES)}`,
        description: `Supplementary material for ${lesson.title}.`,
        type: pick(['PDF', 'DOC', 'LINK', 'NOTE'] as const),
        courseId: course._id,
        lessonId: lesson._id,
        externalUrl: 'https://ncert.nic.in/textbook.php',
        visibility: 'ENROLLED',
        downloadCount: int(0, 45),
        uploadedBy: admin._id,
      });
    }

    /* ---------------------------------- Quiz ----------------------------------- */
    const quizLesson = pick(courseLessons);
    const quiz = await Quiz.create({
      organizationId: orgId,
      courseId: course._id,
      lessonId: quizLesson._id,
      title: `${cs.title.split(' ').slice(0, 3).join(' ')} — Concept Check`,
      description: 'A short quiz to check your understanding of the fundamentals covered so far.',
      passingPercentage: 40,
      timeLimitMinutes: 15,
      maxAttempts: 3,
      shuffleQuestions: true,
      isPublished: true,
      createdBy: admin._id,
    });
    const questionBank = [
      { q: `Which of the following best describes the main focus of ${cs.category.toLowerCase()} preparation?`, opts: ['Rote memorisation only', 'Conceptual clarity with practice', 'Skipping fundamentals', 'Reading without solving'], correct: 'B' },
      { q: 'What is the recommended first step when approaching a new topic?', opts: ['Attempt advanced problems immediately', 'Understand the underlying concept', 'Memorise the answer key', 'Skip to the summary'], correct: 'B' },
      { q: 'How often should you revise previously covered chapters?', opts: ['Never', 'Only before the final exam', 'Regularly, in spaced intervals', 'Once a year'], correct: 'C' },
      { q: 'Which habit most improves exam performance?', opts: ['Timed practice tests', 'Studying only at night', 'Avoiding mock tests', 'Reading passively'], correct: 'A' },
      { q: 'What should you do after getting a question wrong?', opts: ['Ignore it', 'Analyse the mistake and re-attempt', 'Change the subject', 'Guess next time'], correct: 'B' },
    ];
    let totalMarks = 0;
    for (let qi = 0; qi < questionBank.length; qi++) {
      const qb = questionBank[qi];
      await QuizQuestion.create({
        organizationId: orgId,
        quizId: quiz._id,
        question: qb.q,
        type: 'SINGLE_CHOICE',
        options: qb.opts.map((text, idx) => ({ key: String.fromCharCode(65 + idx), text })),
        correctOptions: [qb.correct],
        marks: 2,
        explanation: 'Consistent, concept-first practice produces the best outcomes.',
        order: qi,
      });
      totalMarks += 2;
    }
    await Quiz.updateOne({ _id: quiz._id }, { totalMarks });
    await Lesson.updateOne({ _id: quizLesson._id }, { quizId: quiz._id });
  }

  /* ---------------------------------- Batches --------------------------------- */
  const batches = [];
  const SCHEDULE_TEMPLATES = [
    [{ day: 'MON', startTime: '07:00', endTime: '09:00' }, { day: 'WED', startTime: '07:00', endTime: '09:00' }, { day: 'FRI', startTime: '07:00', endTime: '09:00' }],
    [{ day: 'TUE', startTime: '16:00', endTime: '18:00' }, { day: 'THU', startTime: '16:00', endTime: '18:00' }],
    [{ day: 'SAT', startTime: '10:00', endTime: '13:00' }],
    [{ day: 'MON', startTime: '18:00', endTime: '20:00' }, { day: 'THU', startTime: '18:00', endTime: '20:00' }],
    [{ day: 'TUE', startTime: '09:00', endTime: '11:00' }, { day: 'FRI', startTime: '09:00', endTime: '11:00' }],
  ];
  const ROOMS = ['Room A1', 'Room A2', 'Room B1', 'Room B2', 'Lab 1', 'Seminar Hall', 'Online'];

  for (let bi = 0; bi < spec.batches; bi++) {
    const course = courses[bi % courses.length];
    const teacher = teachers[bi % teachers.length];
    const schedule = SCHEDULE_TEMPLATES[bi % SCHEDULE_TEMPLATES.length];
    const startDate = now.subtract(int(20, 150), 'day');
    const status = bi % 7 === 0 ? 'UPCOMING' : bi % 11 === 0 ? 'COMPLETED' : 'ONGOING';
    const batch = await Batch.create({
      organizationId: orgId,
      name: `${course.title.split(' ').slice(0, 2).join(' ')} — ${pick(['Morning', 'Evening', 'Weekend', 'Fast Track', 'Regular'])} ${startDate.format('MMM YY')}`,
      code: `B${String(bi + 1).padStart(3, '0')}`,
      courseId: course._id,
      teacherId: teacher._id,
      capacity: int(15, 40),
      enrolledCount: 0,
      room: ROOMS[bi % ROOMS.length],
      mode: course.type === 'ONLINE' ? 'ONLINE' : course.type === 'HYBRID' ? 'HYBRID' : 'OFFLINE',
      schedule,
      startDate: status === 'UPCOMING' ? now.add(int(5, 30), 'day').toDate() : startDate.toDate(),
      endDate: startDate.add(course.durationWeeks ?? 24, 'week').toDate(),
      status,
      description: `${course.title} batch conducted by ${teacher.name}.`,
      createdBy: admin._id,
    });
    batches.push(batch);
  }

  /* ---------------------------------- Parents --------------------------------- */
  const parents = [];
  for (let pi = 0; pi < spec.parents; pi++) {
    const relation = chance(0.65) ? 'FATHER' : 'MOTHER';
    const name = personName(relation === 'FATHER' ? 'MALE' : 'FEMALE');
    const email = emailFor(name, spec.domain, pi + 1);
    const parent = await Parent.create({
      organizationId: orgId,
      name, phone: phone(), email,
      alternatePhone: chance(0.4) ? phone() : undefined,
      occupation: pick(OCCUPATIONS),
      relation,
      address: { line1: `House ${int(1, 200)}, Ward ${int(1, 12)}`, city: pick(HP_CITIES), state: 'Himachal Pradesh', country: 'India' },
      childrenIds: [],
      isActive: true,
      createdBy: admin._id,
    });
    // Give roughly half of the parents a portal login.
    if (pi < Math.ceil(spec.parents * 0.6)) {
      const user = await User.create({
        organizationId: orgId, name, email, phone: parent.phone, passwordHash,
        role: 'PARENT', isActive: true, mustChangePassword: false, parentId: parent._id, createdBy: admin._id,
      });
      await Parent.updateOne({ _id: parent._id }, { userId: user._id });
      parent.userId = user._id;
      if (pi === 0) credentials.push({ portal: '/parent/login', role: 'PARENT', org: spec.name, email, password: DEMO_PASSWORD });
    }
    parents.push(parent);
  }

  /* ---------------------------------- Students -------------------------------- */
  const students = [];
  let studentCounter = 0;
  const yy = now.format('YY');

  for (let si = 0; si < spec.students; si++) {
    const gender: 'MALE' | 'FEMALE' = chance(0.52) ? 'MALE' : 'FEMALE';
    const name = personName(gender);
    studentCounter += 1;
    const studentCode = `STU${yy}${String(studentCounter).padStart(5, '0')}`;
    const email = emailFor(name, spec.domain, 1000 + si);
    const guardian = parents[si % parents.length];
    const course = courses[si % courses.length];
    const courseBatches = batches.filter((b) => String(b.courseId) === String(course._id) && b.status !== 'UPCOMING');
    const batch = courseBatches.length ? courseBatches[si % courseBatches.length] : undefined;
    const admissionDate = now.subtract(int(5, 300), 'day');
    // Index 0 is the documented demo login for each org, so it must stay ACTIVE.
    const status = si === 0 ? 'ACTIVE' : si % 23 === 0 ? 'INACTIVE' : si % 31 === 0 ? 'DROPPED' : 'ACTIVE';

    const student = await Student.create({
      organizationId: orgId,
      studentCode,
      name, email, phone: phone(),
      dateOfBirth: now.subtract(int(15, 24), 'year').subtract(int(0, 360), 'day').toDate(),
      gender,
      bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'A-', 'O-']),
      address: { line1: `${int(1, 120)}, ${pick(['Sanjauli', 'Chotta Shimla', 'Kasumpti', 'Mall Road', 'Vikasnagar', 'New Shimla'])}`, city: pick(HP_CITIES), state: 'Himachal Pradesh', country: 'India', postalCode: `17${int(1000, 9999)}` },
      guardianId: guardian._id,
      emergencyContact: { name: guardian.name, phone: guardian.phone, relation: guardian.relation },
      schoolName: pick(SCHOOLS),
      previousQualification: pick(['Class 10 CBSE', 'Class 12 CBSE', 'Class 12 HPBOSE', 'B.A. First Year', 'Class 11']),
      status,
      admissionDate: admissionDate.toDate(),
      primaryCourseId: course._id,
      primaryBatchId: batch?._id,
      tags: chance(0.25) ? [pick(['scholarship', 'topper', 'needs-attention', 'sports-quota'])] : [],
      createdBy: admin._id,
    });

    await Parent.updateOne({ _id: guardian._id }, { $addToSet: { childrenIds: student._id } });

    // ~70% of students get a portal login
    if (si % 10 < 7) {
      const user = await User.create({
        organizationId: orgId, name, email, phone: student.phone, passwordHash,
        role: 'STUDENT', isActive: status === 'ACTIVE', mustChangePassword: false, studentId: student._id, createdBy: admin._id,
      });
      await Student.updateOne({ _id: student._id }, { userId: user._id });
      student.userId = user._id;
      if (si === 0) credentials.push({ portal: '/student/login', role: 'STUDENT', org: spec.name, email, password: DEMO_PASSWORD });
    }

    students.push(student);

    /* ------------------------ Enrollments (course + batch) --------------------- */
    const courseLessons = lessonsByCourse.get(String(course._id)) ?? [];
    if (batch && status !== 'DROPPED') {
      await BatchEnrollment.create({
        organizationId: orgId, batchId: batch._id, studentId: student._id, courseId: course._id,
        status: 'ACTIVE', enrolledAt: admissionDate.toDate(),
      });
      await Batch.updateOne({ _id: batch._id }, { $inc: { enrolledCount: 1 } });
    }

    const completedLessons = status === 'ACTIVE' ? int(0, courseLessons.length) : int(0, Math.floor(courseLessons.length / 3));
    const progressPercent = courseLessons.length ? Math.round((completedLessons / courseLessons.length) * 100) : 0;
    const enrollment = await CourseEnrollment.create({
      organizationId: orgId,
      studentId: student._id,
      courseId: course._id,
      batchId: batch?._id,
      status: status === 'DROPPED' ? 'DROPPED' : progressPercent >= 100 ? 'COMPLETED' : 'ACTIVE',
      enrolledAt: admissionDate.toDate(),
      progressPercent,
      completedLessons,
      totalLessons: courseLessons.length,
      lastAccessedAt: now.subtract(int(0, 20), 'day').toDate(),
      lastLessonId: courseLessons[Math.max(0, completedLessons - 1)]?._id,
    });

    for (let li = 0; li < completedLessons; li++) {
      const lesson = courseLessons[li];
      await LessonProgress.create({
        organizationId: orgId,
        studentId: student._id,
        courseId: course._id,
        moduleId: lesson.moduleId,
        lessonId: lesson._id,
        progressPercent: 100,
        lastPositionSeconds: lesson.durationSeconds,
        watchedSeconds: lesson.durationSeconds,
        completed: true,
        completedAt: now.subtract(int(1, 60), 'day').toDate(),
        lastWatchedAt: now.subtract(int(0, 30), 'day').toDate(),
      });
    }
    // One in-progress lesson so "resume" has something to resume.
    if (completedLessons < courseLessons.length) {
      const lesson = courseLessons[completedLessons];
      const pos = Math.floor(lesson.durationSeconds * (0.15 + rnd() * 0.6));
      await LessonProgress.create({
        organizationId: orgId,
        studentId: student._id,
        courseId: course._id,
        moduleId: lesson.moduleId,
        lessonId: lesson._id,
        progressPercent: Math.round((pos / lesson.durationSeconds) * 100),
        lastPositionSeconds: pos,
        watchedSeconds: pos,
        completed: false,
        lastWatchedAt: now.subtract(int(0, 6), 'day').toDate(),
      });
    }

    /* --------------------------------- Admission ------------------------------- */
    const gross = course.price;
    const discount = chance(0.3) ? Math.round(course.discount || gross * 0.05) : 0;
    const net = gross - discount;
    const instalmentCount = pick([1, 2, 3, 4]);
    const per = Math.round(net / instalmentCount);

    const feePlan = await FeePlan.create({
      organizationId: orgId,
      studentId: student._id,
      courseId: course._id,
      batchId: batch?._id,
      title: `${course.title} — fee plan`,
      totalAmount: gross,
      discountAmount: discount,
      netAmount: net,
      paidAmount: 0,
      pendingAmount: net,
      status: 'ACTIVE',
      startDate: admissionDate.toDate(),
      createdBy: admin._id,
    });

    const instalments = [];
    for (let ii = 0; ii < instalmentCount; ii++) {
      const amount = ii === instalmentCount - 1 ? net - per * (instalmentCount - 1) : per;
      const dueDate = admissionDate.add(ii * 3, 'month');
      instalments.push(await FeeInstallment.create({
        organizationId: orgId,
        feePlanId: feePlan._id,
        studentId: student._id,
        courseId: course._id,
        sequence: ii + 1,
        title: instalmentCount === 1 ? 'Full fee' : `Instalment ${ii + 1} of ${instalmentCount}`,
        amount,
        paidAmount: 0,
        dueDate: dueDate.toDate(),
        status: 'PENDING',
        lateFee: 0,
      }));
    }

    const admissionNumber = `ADM-${spec.code}-${admissionDate.year()}-${String(studentCounter).padStart(4, '0')}`;
    const admission = await Admission.create({
      organizationId: orgId,
      admissionNumber,
      studentId: student._id,
      parentId: guardian._id,
      courseId: course._id,
      batchId: batch?._id,
      feePlanId: feePlan._id,
      status: 'CONFIRMED',
      admissionDate: admissionDate.toDate(),
      totalFee: gross,
      discount,
      netFee: net,
      initialPayment: 0,
      counselorId: pick(counselors)._id,
      source: pick(LEAD_SOURCES),
      remarks: 'Seeded admission record.',
      createdBy: admin._id,
    });
    await Student.updateOne({ _id: student._id }, { admissionId: admission._id });

    /* ---------------------------------- Payments -------------------------------- */
    // Pay some instalments so finance dashboards have real collected/pending money.
    const payUpTo = status === 'DROPPED' ? int(0, 1) : chance(0.18) ? 0 : int(1, instalmentCount);
    let paidTotal = 0;
    let initialPayment = 0;

    for (let pi2 = 0; pi2 < payUpTo; pi2++) {
      const inst = instalments[pi2];
      const paidAt = dayjs(inst.dueDate).subtract(int(0, 10), 'day');
      if (paidAt.isAfter(now)) break;
      const method = pick(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE'] as const);

      const invoiceNumber = `INV-${paidAt.year()}-${String(await Invoice.countDocuments({ organizationId: orgId }) + 1).padStart(5, '0')}`;
      const invoice = await Invoice.create({
        organizationId: orgId,
        invoiceNumber,
        studentId: student._id,
        feePlanId: feePlan._id,
        installmentId: inst._id,
        courseId: course._id,
        items: [{ description: `${course.title} — ${inst.title}`, amount: inst.amount, quantity: 1 }],
        subtotal: inst.amount,
        discount: 0,
        tax: 0,
        total: inst.amount,
        amountPaid: inst.amount,
        status: 'PAID',
        issuedAt: paidAt.toDate(),
        dueDate: inst.dueDate,
        createdBy: admin._id,
      });

      const paymentNumber = `PAY-${paidAt.format('YYYYMMDD')}-${String(int(100000, 999999))}`;
      const payment = await Payment.create({
        organizationId: orgId,
        paymentNumber,
        studentId: student._id,
        feePlanId: feePlan._id,
        installmentId: inst._id,
        courseId: course._id,
        amount: inst.amount,
        method,
        transactionId: method === 'CASH' ? undefined : `TXN${int(100000000, 999999999)}`,
        gateway: 'manual',
        status: 'SUCCESS',
        paidAt: paidAt.toDate(),
        receivedBy: pick(accountants)._id,
        receivedByName: pick(accountants).name,
        invoiceId: invoice._id,
        notes: 'Seeded payment record.',
      });

      const receiptNumber = `RCP-${paidAt.year()}-${String(await Receipt.countDocuments({ organizationId: orgId }) + 1).padStart(5, '0')}`;
      const receipt = await Receipt.create({
        organizationId: orgId,
        receiptNumber,
        paymentId: payment._id,
        invoiceId: invoice._id,
        studentId: student._id,
        courseId: course._id,
        amount: inst.amount,
        method,
        issuedAt: paidAt.toDate(),
        issuedBy: admin._id,
        issuedByName: admin.name,
      });
      await Payment.updateOne({ _id: payment._id }, { receiptId: receipt._id });

      await FeeInstallment.updateOne({ _id: inst._id }, { paidAmount: inst.amount, status: 'PAID', paidAt: paidAt.toDate() });
      paidTotal += inst.amount;
      if (pi2 === 0) initialPayment = inst.amount;
    }

    // Mark genuinely overdue instalments
    await FeeInstallment.updateMany(
      { organizationId: orgId, feePlanId: feePlan._id, status: { $in: ['PENDING', 'PARTIAL'] }, dueDate: { $lt: now.toDate() } },
      { status: 'OVERDUE' },
    );

    await FeePlan.updateOne({ _id: feePlan._id }, {
      paidAmount: paidTotal,
      pendingAmount: Math.max(0, net - paidTotal),
      status: net - paidTotal <= 0.5 ? 'COMPLETED' : 'ACTIVE',
    });
    await Admission.updateOne({ _id: admission._id }, { initialPayment });
    void enrollment;
  }

  console.log(`  students: ${students.length}, parents: ${parents.length}, teachers: ${teachers.length}, courses: ${courses.length}, batches: ${batches.length}`);

  /* ------------------------- Classes + attendance ----------------------------- */
  let classCount = 0;
  let attendanceCount = 0;

  for (const batch of batches) {
    if (batch.status === 'UPCOMING') continue;
    const enrolled = await BatchEnrollment.find({ organizationId: orgId, batchId: batch._id, status: 'ACTIVE' }).select('studentId').lean();
    if (!enrolled.length) continue;
    const teacher = teachers.find((t) => String(t._id) === String(batch.teacherId)) ?? teachers[0];

    // Generate sessions from 5 weeks back to 2 weeks ahead following the batch schedule.
    let cursor = now.subtract(5, 'week').startOf('day');
    const until = now.add(2, 'week').endOf('day');

    while (cursor.isBefore(until)) {
      for (const slot of batch.schedule) {
        if (cursor.day() !== DAY_INDEX[slot.day]) continue;
        if (cursor.isBefore(dayjs(batch.startDate).startOf('day'))) continue;

        const startAt = at(cursor, slot.startTime);
        const endAt = at(cursor, slot.endTime);
        const isPast = dayjs(endAt).isBefore(now);

        const session = await ClassSession.create({
          organizationId: orgId,
          title: `${batch.name} — session`,
          courseId: batch.courseId,
          batchId: batch._id,
          teacherId: teacher._id,
          room: batch.room,
          mode: batch.mode === 'HYBRID' ? 'OFFLINE' : (batch.mode as 'ONLINE' | 'OFFLINE'),
          meetingUrl: batch.mode === 'ONLINE' ? 'https://meet.example.com/academyos-demo' : undefined,
          date: cursor.toDate(),
          startTime: slot.startTime,
          endTime: slot.endTime,
          startAt,
          endAt,
          status: isPast ? 'COMPLETED' : 'SCHEDULED',
          topic: pick(['Concept building', 'Problem solving', 'Doubt clearing', 'Revision', 'Test discussion', 'New chapter introduction']),
          attendanceMarked: isPast,
          createdBy: admin._id,
        });
        classCount += 1;

        if (isPast) {
          const docs = enrolled.map((e) => {
            const r = rnd();
            const status = r < 0.8 ? 'PRESENT' : r < 0.88 ? 'LATE' : r < 0.96 ? 'ABSENT' : 'LEAVE';
            return {
              organizationId: orgId,
              classSessionId: session._id,
              batchId: batch._id,
              courseId: batch.courseId,
              studentId: e.studentId,
              date: cursor.toDate(),
              status,
              remarks: status === 'LEAVE' ? 'Informed leave' : undefined,
              markedBy: teacher.userId,
              markedAt: dayjs(endAt).toDate(),
            };
          });
          await Attendance.insertMany(docs);
          attendanceCount += docs.length;
        }
      }
      cursor = cursor.add(1, 'day');
    }
  }
  console.log(`  classes: ${classCount}, attendance marks: ${attendanceCount}`);

  /* -------------------------------- Exams + results ---------------------------- */
  let resultCount = 0;
  for (const batch of batches) {
    if (batch.status === 'UPCOMING') continue;
    const enrolled = await BatchEnrollment.find({ organizationId: orgId, batchId: batch._id, status: 'ACTIVE' }).select('studentId').lean();
    if (!enrolled.length) continue;
    const course = courses.find((c) => String(c._id) === String(batch.courseId))!;
    const teacher = teachers.find((t) => String(t._id) === String(batch.teacherId)) ?? teachers[0];

    for (let ei = 0; ei < int(1, 3); ei++) {
      const examDate = now.subtract(int(3, 70), 'day');
      const totalMarks = pick([50, 100, 120]);
      const passingMarks = Math.round(totalMarks * 0.35);
      const exam = await Exam.create({
        organizationId: orgId,
        title: `${pick(EXAM_TITLES)} — ${course.title.split(' ').slice(0, 3).join(' ')}`,
        type: pick(['TEST', 'EXAM', 'QUIZ', 'ASSESSMENT'] as const),
        subjectId: course.subjectIds[0],
        courseId: course._id,
        batchId: batch._id,
        teacherId: teacher._id,
        date: examDate.toDate(),
        durationMinutes: pick([60, 90, 120, 180]),
        totalMarks,
        passingMarks,
        status: 'COMPLETED',
        resultPublished: true,
        room: batch.room,
        instructions: 'Answer all questions. Calculators are not permitted. Write clearly and show your working.',
        createdBy: admin._id,
      });

      const rows = enrolled.map((e) => {
        // Bell-ish distribution around 62%
        const base = 0.62 + (rnd() - 0.5) * 0.5;
        const marks = Math.max(0, Math.min(totalMarks, Math.round(totalMarks * base)));
        const percentage = Math.round((marks / totalMarks) * 1000) / 10;
        return {
          organizationId: orgId,
          examId: exam._id,
          studentId: e.studentId,
          courseId: course._id,
          batchId: batch._id,
          marksObtained: marks,
          totalMarks,
          percentage,
          grade: calculateGrade(percentage),
          passed: marks >= passingMarks,
          evaluatedBy: teacher.userId,
          evaluatedAt: examDate.add(3, 'day').toDate(),
        };
      });
      rows.sort((a, b) => b.marksObtained - a.marksObtained);
      const created = await TestResult.insertMany(rows.map((r, idx) => ({ ...r, rank: idx + 1 })));
      resultCount += created.length;
    }
  }
  console.log(`  exam results: ${resultCount}`);

  /* -------------------------------- Assignments -------------------------------- */
  let submissionCount = 0;
  for (const course of courses) {
    const courseBatches = batches.filter((b) => String(b.courseId) === String(course._id));
    const teacher = teachers.find((t) => String(t._id) === String(course.instructorId)) ?? teachers[0];
    for (let ai = 0; ai < int(1, 3); ai++) {
      const dueDate = now.add(int(-25, 12), 'day');
      const assignment = await Assignment.create({
        organizationId: orgId,
        title: `${pick(ASSIGNMENT_TITLES)} — ${course.title.split(' ').slice(0, 2).join(' ')}`,
        description: 'Complete all questions and submit before the due date. Show complete working for numerical problems. Late submissions are accepted with a penalty.',
        courseId: course._id,
        batchId: courseBatches[0]?._id,
        teacherId: teacher._id,
        dueDate: dueDate.toDate(),
        totalMarks: pick([20, 25, 50]),
        submissionType: 'ANY',
        allowLateSubmission: true,
        status: 'PUBLISHED',
        createdBy: admin._id,
      });

      if (dueDate.isBefore(now)) {
        const enrolledStudents = await CourseEnrollment.find({ organizationId: orgId, courseId: course._id, status: 'ACTIVE' })
          .select('studentId').limit(25).lean();
        for (const e of enrolledStudents) {
          if (!chance(0.7)) continue;
          const isLate = chance(0.2);
          const graded = chance(0.6);
          const marks = graded ? int(Math.floor(assignment.totalMarks * 0.4), assignment.totalMarks) : undefined;
          await AssignmentSubmission.create({
            organizationId: orgId,
            assignmentId: assignment._id,
            studentId: e.studentId,
            contentText: 'Submitted my completed worksheet with all questions attempted and working shown.',
            submittedAt: dueDate.add(isLate ? int(1, 3) : -int(0, 3), 'day').toDate(),
            isLate,
            status: graded ? 'GRADED' : 'SUBMITTED',
            marksAwarded: marks,
            feedback: graded ? pick(['Well done, neat presentation.', 'Good attempt — revise the last two questions.', 'Check your calculation in question 3.', 'Excellent work, keep it up.']) : undefined,
            gradedBy: graded ? teacher.userId : undefined,
            gradedAt: graded ? dueDate.add(5, 'day').toDate() : undefined,
          });
          submissionCount += 1;
        }
      }
    }
  }
  console.log(`  assignment submissions: ${submissionCount}`);

  /* ------------------------------ Quiz attempts -------------------------------- */
  const quizzes = await Quiz.find({ organizationId: orgId }).lean();
  let attemptCount = 0;
  for (const quiz of quizzes) {
    const questions = await QuizQuestion.find({ organizationId: orgId, quizId: quiz._id }).lean();
    const enrolledStudents = await CourseEnrollment.find({ organizationId: orgId, courseId: quiz.courseId, status: 'ACTIVE' })
      .select('studentId').limit(15).lean();
    for (const e of enrolledStudents) {
      if (!chance(0.5)) continue;
      const answers = questions.map((q) => {
        const correct = chance(0.68);
        const wrong = q.options.map((o) => o.key).filter((k) => !q.correctOptions.includes(k));
        return {
          questionId: q._id,
          selected: correct ? q.correctOptions : [pick(wrong)],
          correct,
          marksAwarded: correct ? q.marks : 0,
        };
      });
      const score = answers.reduce((a, x) => a + x.marksAwarded, 0);
      const percentage = quiz.totalMarks ? Math.round((score / quiz.totalMarks) * 1000) / 10 : 0;
      const startedAt = now.subtract(int(1, 40), 'day');
      await QuizAttempt.create({
        organizationId: orgId,
        quizId: quiz._id,
        studentId: e.studentId,
        courseId: quiz.courseId,
        answers,
        score,
        totalMarks: quiz.totalMarks,
        percentage,
        passed: percentage >= quiz.passingPercentage,
        status: 'SUBMITTED',
        startedAt: startedAt.toDate(),
        submittedAt: startedAt.add(int(5, 14), 'minute').toDate(),
        attemptNumber: 1,
      });
      attemptCount += 1;
    }
  }
  console.log(`  quiz attempts: ${attemptCount}`);

  /* ----------------------------------- Leads ----------------------------------- */
  const leads = [];
  for (let li = 0; li < spec.leads; li++) {
    const gender: 'MALE' | 'FEMALE' = chance(0.5) ? 'MALE' : 'FEMALE';
    const name = personName(gender);
    const status = LEAD_STATUSES[li % LEAD_STATUSES.length];
    const course = pick(courses);
    const createdAt = now.subtract(int(1, 90), 'day');
    const lead = await Lead.create({
      organizationId: orgId,
      name,
      phone: phone(),
      email: chance(0.7) ? emailFor(name, 'gmail.test', 2000 + li) : undefined,
      parentName: personName(chance(0.6) ? 'MALE' : 'FEMALE'),
      parentPhone: phone(),
      courseId: course._id,
      courseInterest: course.title,
      source: pick(LEAD_SOURCES),
      assignedCounselorId: pick(counselors)._id,
      status,
      priority: pick(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const),
      expectedJoiningDate: now.add(int(5, 60), 'day').toDate(),
      expectedValue: course.price,
      notes: pick(LEAD_NOTES),
      city: pick(HP_CITIES),
      lostReason: status === 'LOST' ? pick(['Chose another institute', 'Fee too high', 'Relocated', 'Not responding']) : undefined,
      lastContactedAt: chance(0.8) ? now.subtract(int(0, 20), 'day').toDate() : undefined,
      createdBy: pick(counselors)._id,
      createdAt: createdAt.toDate(),
    });
    leads.push(lead);
  }

  /* --------------------------------- Follow-ups --------------------------------- */
  let followUpCount = 0;
  for (const lead of leads) {
    if (['ADMITTED', 'LOST'].includes(lead.status)) continue;
    for (let fi = 0; fi < int(1, 3); fi++) {
      const isPast = chance(0.55);
      const scheduledAt = isPast ? now.subtract(int(1, 20), 'day') : now.add(int(0, 12), 'day');
      const status = isPast ? pick(['COMPLETED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'] as const) : 'PENDING';
      await FollowUp.create({
        organizationId: orgId,
        leadId: lead._id,
        assignedTo: lead.assignedCounselorId,
        mode: pick(['CALL', 'WHATSAPP', 'EMAIL', 'VISIT', 'SMS', 'DEMO'] as const),
        scheduledAt: scheduledAt.toDate(),
        scheduledTime: `${String(int(9, 18)).padStart(2, '0')}:${pick(['00', '15', '30', '45'])}`,
        priority: pick(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const),
        status,
        outcome: status === 'COMPLETED' ? pick(['INTERESTED', 'NOT_INTERESTED', 'CALL_BACK', 'VISITED']) : undefined,
        notes: pick(FOLLOWUP_NOTES),
        completedAt: status === 'COMPLETED' ? scheduledAt.add(1, 'hour').toDate() : undefined,
        completedBy: status === 'COMPLETED' ? lead.assignedCounselorId : undefined,
        createdBy: lead.assignedCounselorId,
      });
      followUpCount += 1;
    }
  }
  // A few follow-ups scheduled for today so the action centre is never empty.
  for (let i = 0; i < 3; i++) {
    const lead = pick(leads.filter((l) => !['ADMITTED', 'LOST'].includes(l.status)));
    if (!lead) break;
    await FollowUp.create({
      organizationId: orgId,
      leadId: lead._id,
      assignedTo: lead.assignedCounselorId,
      mode: 'CALL',
      scheduledAt: now.hour(10 + i).minute(30).toDate(),
      scheduledTime: `${10 + i}:30`,
      priority: 'HIGH',
      status: 'PENDING',
      notes: 'Confirm admission decision and share the fee structure.',
      createdBy: lead.assignedCounselorId,
    });
    followUpCount += 1;
  }
  console.log(`  leads: ${leads.length}, follow-ups: ${followUpCount}`);

  /* -------------------------------- Announcements ------------------------------- */
  const allUsers = await User.find({ organizationId: orgId, isActive: true }).select('_id role').lean();
  for (const a of ANNOUNCEMENT_LIBRARY) {
    const publishedAt = now.subtract(int(0, 25), 'day');
    const ann = await Announcement.create({
      organizationId: orgId,
      title: a.title,
      body: a.body,
      audience: a.audience,
      priority: a.priority,
      isPinned: a.priority === 'URGENT',
      publishedAt: publishedAt.toDate(),
      status: 'PUBLISHED',
      createdBy: admin._id,
      createdByName: admin.name,
      readBy: pickMany(allUsers, int(0, Math.min(8, allUsers.length))).map((u) => u._id),
    });
    void ann;
  }

  /* -------------------------------- Notifications ------------------------------- */
  const notifyTargets = allUsers.filter((u) => ['STUDENT', 'PARENT', 'TEACHER'].includes(u.role)).slice(0, 60);
  const notifications = [];
  for (const u of notifyTargets) {
    for (let ni = 0; ni < int(1, 3); ni++) {
      const type = pick(['FEE_DUE', 'CLASS', 'EXAM', 'ASSIGNMENT', 'RESULT', 'ANNOUNCEMENT'] as const);
      const copy: Record<string, { title: string; message: string; link: string }> = {
        FEE_DUE: { title: 'Fee instalment due soon', message: 'Your next fee instalment is due this week. Please pay at the front desk or online.', link: '/student/fees' },
        CLASS: { title: 'Class scheduled tomorrow', message: 'You have a class scheduled tomorrow morning. Please carry your notebook.', link: '/student/schedule' },
        EXAM: { title: 'Upcoming test', message: 'A chapter test has been scheduled for your batch this week.', link: '/student/results' },
        ASSIGNMENT: { title: 'New assignment published', message: 'A new assignment has been published for your course.', link: '/student/assignments' },
        RESULT: { title: 'Result published', message: 'Your latest test result is now available in the portal.', link: '/student/results' },
        ANNOUNCEMENT: { title: 'New announcement', message: 'A new announcement has been posted by the academy.', link: '/announcements' },
      };
      notifications.push({
        organizationId: orgId,
        userId: u._id,
        type,
        ...copy[type],
        isRead: chance(0.45),
        priority: type === 'FEE_DUE' ? 'HIGH' : 'NORMAL',
        createdAt: now.subtract(int(0, 14), 'day').toDate(),
      });
    }
  }
  await Notification.insertMany(notifications);

  /* -------------------------------- Communication -------------------------------- */
  const commDocs = [];
  for (let i = 0; i < 25; i++) {
    const student = pick(students);
    const channel = pick(['EMAIL', 'SMS', 'WHATSAPP', 'PHONE'] as const);
    commDocs.push({
      organizationId: orgId,
      channel,
      direction: 'OUTBOUND',
      subject: channel === 'EMAIL' ? pick(['Fee reminder', 'Attendance update', 'Test schedule', 'Parent meeting invite']) : undefined,
      body: pick([
        'This is a reminder that your fee instalment is due this week.',
        'Your ward was absent from class today. Please ensure regular attendance.',
        'The monthly test schedule has been published in the portal.',
        'You are invited to the parent-teacher meeting this Saturday.',
      ]),
      recipientType: 'STUDENT',
      recipientId: student._id,
      recipientName: student.name,
      recipientAddress: channel === 'EMAIL' ? student.email : student.phone,
      // No provider is configured in development, so history reflects that honestly.
      status: 'NOT_CONFIGURED',
      providerName: channel === 'EMAIL' ? 'smtp' : channel.toLowerCase(),
      failureReason: 'Provider not configured in this environment — message logged only.',
      sentBy: admin._id,
      sentByName: admin.name,
      createdAt: now.subtract(int(0, 30), 'day').toDate(),
    });
  }
  await Communication.insertMany(commDocs);

  /* ---------------------------------- Calendar ----------------------------------- */
  const events = [
    { title: 'Scholarship Test', type: 'EVENT', offset: 8, hours: 3 },
    { title: 'Parent-Teacher Meeting', type: 'MEETING', offset: 5, hours: 4 },
    { title: 'Institute Foundation Day', type: 'HOLIDAY', offset: 20, hours: 8 },
    { title: 'Career Counselling Seminar', type: 'EVENT', offset: 12, hours: 2 },
    { title: 'Staff Review Meeting', type: 'MEETING', offset: -3, hours: 2 },
  ];
  await CalendarEvent.insertMany(events.map((e) => ({
    organizationId: orgId,
    title: e.title,
    description: `${e.title} organised by ${spec.name}.`,
    type: e.type,
    startAt: now.add(e.offset, 'day').hour(10).minute(0).toDate(),
    endAt: now.add(e.offset, 'day').hour(10 + e.hours).minute(0).toDate(),
    allDay: e.type === 'HOLIDAY',
    location: e.type === 'HOLIDAY' ? undefined : 'Main Campus',
    audience: 'ALL',
    color: e.type === 'HOLIDAY' ? '#ef4444' : '#22c55e',
    createdBy: admin._id,
  })));

  /* ----------------------------------- Audit ------------------------------------- */
  await AuditLog.insertMany(
    Array.from({ length: 30 }).map(() => ({
      organizationId: orgId,
      userId: admin._id,
      userName: admin.name,
      userRole: 'ORGANIZATION_ADMIN',
      action: pick(['STUDENT_CREATED', 'PAYMENT_RECORDED', 'BATCH_CREATED', 'ATTENDANCE_MARKED', 'COURSE_UPDATED', 'USER_CREATED', 'RESULTS_ENTERED']),
      entity: pick(['Student', 'Payment', 'Batch', 'Attendance', 'Course', 'User', 'TestResult']),
      status: 'SUCCESS',
      ip: `10.0.${int(0, 255)}.${int(1, 254)}`,
      createdAt: now.subtract(int(0, 45), 'day').toDate(),
    })),
  );

  return { orgId, students: students.length };
}

/* ----------------------------------- Runner ---------------------------------- */

async function main() {
  const started = Date.now();
  console.log('AcademyOS seed starting…');
  console.log(`  target: ${env.MONGO_URI}`);
  await connectDB();
  resetRandom();
  await wipe();

  const owner = await seedOwner();
  for (const spec of ORGS) {
    await seedOrganization(spec, owner._id);
  }

  /* ------------------------------ Summary counts ------------------------------ */
  const counts = {
    organizations: await Organization.countDocuments(),
    users: await User.countDocuments(),
    students: await Student.countDocuments(),
    parents: await Parent.countDocuments(),
    teachers: await Teacher.countDocuments(),
    courses: await Course.countDocuments(),
    modules: await CourseModule.countDocuments(),
    lessons: await Lesson.countDocuments(),
    videos: await Video.countDocuments(),
    materials: await StudyMaterial.countDocuments(),
    quizzes: await Quiz.countDocuments(),
    quizAttempts: await QuizAttempt.countDocuments(),
    batches: await Batch.countDocuments(),
    classSessions: await ClassSession.countDocuments(),
    attendance: await Attendance.countDocuments(),
    exams: await Exam.countDocuments(),
    results: await TestResult.countDocuments(),
    assignments: await Assignment.countDocuments(),
    submissions: await AssignmentSubmission.countDocuments(),
    enrollments: await CourseEnrollment.countDocuments(),
    lessonProgress: await LessonProgress.countDocuments(),
    leads: await Lead.countDocuments(),
    followUps: await FollowUp.countDocuments(),
    admissions: await Admission.countDocuments(),
    feePlans: await FeePlan.countDocuments(),
    installments: await FeeInstallment.countDocuments(),
    payments: await Payment.countDocuments(),
    invoices: await Invoice.countDocuments(),
    receipts: await Receipt.countDocuments(),
    announcements: await Announcement.countDocuments(),
    notifications: await Notification.countDocuments(),
    communications: await Communication.countDocuments(),
    calendarEvents: await CalendarEvent.countDocuments(),
    auditLogs: await AuditLog.countDocuments(),
  };

  console.log('\n──────────────── Seed summary ────────────────');
  Object.entries(counts).forEach(([k, v]) => console.log(`  ${k.padEnd(18)} ${v}`));

  console.log('\n──────────────── Login credentials ────────────────');
  console.table(credentials);

  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await disconnectDB();
  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\nSeed failed:', err);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
