import { Request, Response } from 'express';
import dayjs from 'dayjs';
import { asyncHandler, ok } from '../utils/http';
import { requireAuth, requireOrg } from '../middleware/auth';
import * as reports from '../services/report.service';
import { toCsv, parseCsv } from '../utils/csv';
import {
  Student, Lead, Payment, Attendance, TestResult, Course, Batch, Teacher, FeeInstallment,
} from '../models';
import { ApiError } from '../utils/ApiError';
import { createStudent } from '../services/student.service';
import { createLead } from '../services/lead.service';
import { recordAudit } from '../services/audit.service';
import { toObjectId } from '../utils/ids';

export const revenue = asyncHandler(async (req, res: Response) => ok(res, await reports.revenueReport(requireOrg(req), req.query as never)));
export const admissions = asyncHandler(async (req, res: Response) => ok(res, await reports.admissionsReport(requireOrg(req), req.query as never)));
export const attendance = asyncHandler(async (req, res: Response) => ok(res, await reports.attendanceReport(requireOrg(req), req.query as never)));
export const performance = asyncHandler(async (req, res: Response) => ok(res, await reports.performanceReport(requireOrg(req), req.query as never)));
export const teachers = asyncHandler(async (req, res: Response) => ok(res, await reports.teacherReport(requireOrg(req), req.query as never)));
export const students = asyncHandler(async (req, res: Response) => ok(res, await reports.studentsReport(requireOrg(req), req.query as never)));

/* ---------------------------------- Export ---------------------------------- */

function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
}

export const exportCsv = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const entity = String(req.params.entity);
  const stamp = dayjs().format('YYYYMMDD-HHmm');
  const need = (permission: string) => {
    if (!auth.permissions.includes(permission as never)) throw ApiError.forbidden('You cannot export this data');
  };

  switch (entity) {
    case 'students': {
      need('student:read');
      const rows = await Student.find({ organizationId: orgId })
        .populate('primaryCourseId', 'title').populate('primaryBatchId', 'name')
        .sort({ createdAt: -1 }).limit(10000).lean();
      return sendCsv(res, `students-${stamp}.csv`, toCsv(
        rows.map((s) => ({
          studentCode: s.studentCode, name: s.name, email: s.email, phone: s.phone,
          gender: s.gender, dateOfBirth: s.dateOfBirth ? dayjs(s.dateOfBirth).format('YYYY-MM-DD') : '',
          status: s.status,
          course: (s.primaryCourseId as unknown as { title?: string })?.title ?? '',
          batch: (s.primaryBatchId as unknown as { name?: string })?.name ?? '',
          city: s.address?.city ?? '',
          admissionDate: s.admissionDate ? dayjs(s.admissionDate).format('YYYY-MM-DD') : '',
        })),
        [
          { key: 'studentCode', label: 'Student Code' }, { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
          { key: 'gender', label: 'Gender' }, { key: 'dateOfBirth', label: 'Date of Birth' },
          { key: 'status', label: 'Status' }, { key: 'course', label: 'Course' },
          { key: 'batch', label: 'Batch' }, { key: 'city', label: 'City' },
          { key: 'admissionDate', label: 'Admission Date' },
        ],
      ));
    }
    case 'leads': {
      need('lead:read');
      const rows = await Lead.find({ organizationId: orgId }).sort({ createdAt: -1 }).limit(10000).lean();
      return sendCsv(res, `leads-${stamp}.csv`, toCsv(
        rows.map((l) => ({
          name: l.name, phone: l.phone, email: l.email, source: l.source, status: l.status,
          interestedCourse: l.courseInterest ?? '', priority: l.priority, city: l.city ?? '',
          createdAt: dayjs(l.createdAt).format('YYYY-MM-DD'),
        })),
      ));
    }
    case 'payments': {
      need('finance:read');
      const rows = await Payment.find({ organizationId: orgId })
        .populate('studentId', 'name studentCode').sort({ paidAt: -1 }).limit(10000).lean();
      return sendCsv(res, `payments-${stamp}.csv`, toCsv(
        rows.map((p) => ({
          paymentNumber: p.paymentNumber,
          student: (p.studentId as unknown as { name?: string })?.name ?? '',
          studentCode: (p.studentId as unknown as { studentCode?: string })?.studentCode ?? '',
          amount: p.amount, method: p.method, status: p.status,
          reference: p.transactionId ?? '',
          paidAt: dayjs(p.paidAt).format('YYYY-MM-DD HH:mm'),
        })),
      ));
    }
    case 'pending-fees': {
      need('finance:read');
      const rows = await FeeInstallment.find({ organizationId: orgId, status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] } })
        .populate('studentId', 'name studentCode phone').sort({ dueDate: 1 }).limit(10000).lean();
      return sendCsv(res, `pending-fees-${stamp}.csv`, toCsv(
        rows.map((i) => ({
          student: (i.studentId as unknown as { name?: string })?.name ?? '',
          studentCode: (i.studentId as unknown as { studentCode?: string })?.studentCode ?? '',
          phone: (i.studentId as unknown as { phone?: string })?.phone ?? '',
          title: i.title, dueDate: dayjs(i.dueDate).format('YYYY-MM-DD'),
          amount: i.amount, paid: i.paidAmount, balance: i.amount - i.paidAmount, status: i.status,
        })),
      ));
    }
    case 'attendance': {
      need('attendance:read');
      const filter: Record<string, unknown> = { organizationId: orgId };
      if (req.query.batchId) filter.batchId = toObjectId(String(req.query.batchId));
      if (req.query.from || req.query.to) {
        filter.date = {
          ...(req.query.from ? { $gte: dayjs(String(req.query.from)).startOf('day').toDate() } : {}),
          ...(req.query.to ? { $lte: dayjs(String(req.query.to)).endOf('day').toDate() } : {}),
        };
      }
      const rows = await Attendance.find(filter)
        .populate('studentId', 'name studentCode').populate('batchId', 'name')
        .sort({ date: -1 }).limit(20000).lean();
      return sendCsv(res, `attendance-${stamp}.csv`, toCsv(
        rows.map((a) => ({
          date: dayjs(a.date).format('YYYY-MM-DD'),
          student: (a.studentId as unknown as { name?: string })?.name ?? '',
          studentCode: (a.studentId as unknown as { studentCode?: string })?.studentCode ?? '',
          batch: (a.batchId as unknown as { name?: string })?.name ?? '',
          status: a.status, remarks: a.remarks ?? '',
        })),
      ));
    }
    case 'results': {
      need('result:read');
      const rows = await TestResult.find({ organizationId: orgId })
        .populate('studentId', 'name studentCode').populate('examId', 'title date')
        .sort({ createdAt: -1 }).limit(10000).lean();
      return sendCsv(res, `results-${stamp}.csv`, toCsv(
        rows.map((r) => ({
          exam: (r.examId as unknown as { title?: string })?.title ?? '',
          student: (r.studentId as unknown as { name?: string })?.name ?? '',
          studentCode: (r.studentId as unknown as { studentCode?: string })?.studentCode ?? '',
          marks: r.marksObtained, total: r.totalMarks, percentage: r.percentage,
          grade: r.grade, passed: r.passed ? 'PASS' : 'FAIL', rank: r.rank ?? '',
        })),
      ));
    }
    case 'courses': {
      need('course:read');
      const rows = await Course.find({ organizationId: orgId }).sort({ title: 1 }).limit(5000).lean();
      return sendCsv(res, `courses-${stamp}.csv`, toCsv(
        rows.map((c) => ({
          code: c.code, title: c.title, type: c.type, status: c.status,
          price: c.price, discount: c.discount, durationWeeks: c.durationWeeks ?? '', level: c.level,
        })),
      ));
    }
    case 'batches': {
      need('batch:read');
      const rows = await Batch.find({ organizationId: orgId }).populate('courseId', 'title').sort({ name: 1 }).limit(5000).lean();
      return sendCsv(res, `batches-${stamp}.csv`, toCsv(
        rows.map((b) => ({
          code: b.code, name: b.name, course: (b.courseId as unknown as { title?: string })?.title ?? '',
          capacity: b.capacity, enrolled: b.enrolledCount, status: b.status,
          startDate: dayjs(b.startDate).format('YYYY-MM-DD'), room: b.room ?? '',
        })),
      ));
    }
    case 'teachers': {
      need('teacher:read');
      const rows = await Teacher.find({ organizationId: orgId }).sort({ name: 1 }).limit(5000).lean();
      return sendCsv(res, `teachers-${stamp}.csv`, toCsv(
        rows.map((t) => ({
          employeeCode: t.employeeCode, name: t.name, email: t.email, phone: t.phone ?? '',
          qualification: t.qualification ?? '', specialization: t.specialization ?? '',
          experienceYears: t.experienceYears ?? '', isActive: t.isActive ? 'ACTIVE' : 'INACTIVE',
        })),
      ));
    }
    default:
      throw ApiError.badRequest(`Unsupported export "${entity}"`);
  }
});

/* ---------------------------------- Import ---------------------------------- */

const STUDENT_ALIASES: Record<string, string> = {
  name: 'name', 'full name': 'name', 'student name': 'name',
  email: 'email', 'email address': 'email',
  phone: 'phone', mobile: 'phone', 'phone number': 'phone', contact: 'phone',
  gender: 'gender', dob: 'dateOfBirth', 'date of birth': 'dateOfBirth', dateofbirth: 'dateOfBirth',
  city: 'city', address: 'line1', status: 'status', school: 'schoolName', 'school name': 'schoolName',
  notes: 'notes',
};

const LEAD_ALIASES: Record<string, string> = {
  name: 'name', 'full name': 'name', 'lead name': 'name',
  email: 'email', phone: 'phone', mobile: 'phone', 'phone number': 'phone',
  source: 'source', status: 'status', course: 'interestedCourseName', 'interested course': 'interestedCourseName',
  city: 'city', notes: 'notes', budget: 'budget',
};

function normalizeRow(row: Record<string, unknown>, aliases: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = aliases[k.trim().toLowerCase()] ?? k.trim();
    if (v !== '' && v !== null && v !== undefined) out[key] = v;
  }
  return out;
}

export const importStudents = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const { rows, dryRun } = req.body as { rows: Record<string, unknown>[]; dryRun: boolean };

  const results = { total: rows.length, created: 0, failed: 0, errors: [] as { row: number; name?: string; error: string }[] };

  for (let i = 0; i < rows.length; i++) {
    const raw = normalizeRow(rows[i], STUDENT_ALIASES);
    try {
      if (!raw.name || String(raw.name).trim().length < 2) throw new Error('Name is required');
      const payload: Record<string, unknown> = {
        name: String(raw.name).trim(),
        email: raw.email ? String(raw.email).trim().toLowerCase() : undefined,
        phone: raw.phone ? String(raw.phone).trim() : undefined,
        gender: ['MALE', 'FEMALE', 'OTHER'].includes(String(raw.gender ?? '').toUpperCase()) ? String(raw.gender).toUpperCase() : undefined,
        dateOfBirth: raw.dateOfBirth && dayjs(String(raw.dateOfBirth)).isValid() ? dayjs(String(raw.dateOfBirth)).toISOString() : undefined,
        schoolName: raw.schoolName ? String(raw.schoolName) : undefined,
        notes: raw.notes ? String(raw.notes) : undefined,
        status: ['ACTIVE', 'INACTIVE', 'ALUMNI', 'DROPPED', 'SUSPENDED'].includes(String(raw.status ?? '').toUpperCase())
          ? String(raw.status).toUpperCase() : 'ACTIVE',
        address: raw.city || raw.line1 ? { city: raw.city ? String(raw.city) : undefined, line1: raw.line1 ? String(raw.line1) : undefined } : undefined,
        tags: ['imported'],
        createLogin: false,
      };
      if (dryRun) { results.created += 1; continue; }
      await createStudent(orgId, auth, payload);
      results.created += 1;
    } catch (err) {
      results.failed += 1;
      if (results.errors.length < 50) {
        results.errors.push({ row: i + 2, name: raw.name ? String(raw.name) : undefined, error: (err as Error).message });
      }
    }
  }

  if (!dryRun) {
    await recordAudit(req, { action: 'STUDENTS_IMPORTED', entity: 'Student', metadata: { total: results.total, created: results.created, failed: results.failed } });
  }
  return ok(res, { ...results, dryRun });
});

export const importLeads = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const { rows, dryRun } = req.body as { rows: Record<string, unknown>[]; dryRun: boolean };
  const results = { total: rows.length, created: 0, failed: 0, errors: [] as { row: number; name?: string; error: string }[] };

  const validSources = [
    'WALK_IN', 'REFERRAL', 'WEBSITE', 'GOOGLE_ADS', 'FACEBOOK', 'INSTAGRAM',
    'PHONE_ENQUIRY', 'SEMINAR', 'NEWSPAPER', 'JUSTDIAL', 'OTHER',
  ];

  for (let i = 0; i < rows.length; i++) {
    const raw = normalizeRow(rows[i], LEAD_ALIASES);
    try {
      if (!raw.name || String(raw.name).trim().length < 2) throw new Error('Name is required');
      if (!raw.phone) throw new Error('Phone is required');
      const payload: Record<string, unknown> = {
        name: String(raw.name).trim(),
        phone: String(raw.phone).trim(),
        email: raw.email ? String(raw.email).trim().toLowerCase() : undefined,
        source: validSources.includes(String(raw.source ?? '').toUpperCase().replace(/\s+/g, '_'))
          ? String(raw.source).toUpperCase().replace(/\s+/g, '_') : 'OTHER',
        courseInterest: raw.interestedCourseName ? String(raw.interestedCourseName) : undefined,
        city: raw.city ? String(raw.city) : undefined,
        notes: raw.notes ? String(raw.notes) : undefined,
        expectedValue: raw.budget ? Number(raw.budget) || undefined : undefined,
        tags: ['imported'],
      };
      if (dryRun) { results.created += 1; continue; }
      await createLead(orgId, auth, payload);
      results.created += 1;
    } catch (err) {
      results.failed += 1;
      if (results.errors.length < 50) {
        results.errors.push({ row: i + 2, name: raw.name ? String(raw.name) : undefined, error: (err as Error).message });
      }
    }
  }

  if (!dryRun) {
    await recordAudit(req, { action: 'LEADS_IMPORTED', entity: 'Lead', metadata: { total: results.total, created: results.created, failed: results.failed } });
  }
  return ok(res, { ...results, dryRun });
});

/** Accepts a raw CSV file upload and returns parsed rows for preview before import. */
export const parseUploadedCsv = asyncHandler(async (req: Request, res: Response) => {
  requireOrg(req);
  const file = req.file;
  if (!file) throw ApiError.validation('Upload a CSV file', { file: 'Required' });
  const rows = parseCsv(file.buffer.toString('utf8'));
  if (!rows.length) throw ApiError.validation('The CSV file has no data rows', { file: 'Empty file' });
  if (rows.length > 2000) throw ApiError.validation('Please import at most 2000 rows at a time', { file: 'Too many rows' });
  return ok(res, { rows: rows.slice(0, 2000), columns: Object.keys(rows[0]), total: rows.length });
});

/** Downloadable import templates so users know the exact expected columns. */
export const importTemplate = asyncHandler(async (req: Request, res: Response) => {
  const entity = String(req.params.entity);
  if (entity === 'students') {
    return sendCsv(res, 'students-template.csv', toCsv([
      { name: 'Aarav Sharma', email: 'aarav@example.com', phone: '9876543210', gender: 'MALE', dob: '2006-04-12', city: 'Shimla', status: 'ACTIVE', school: 'DAV Public School' },
    ]));
  }
  if (entity === 'leads') {
    return sendCsv(res, 'leads-template.csv', toCsv([
      { name: 'Ishita Verma', phone: '9812345670', email: 'ishita@example.com', source: 'WEBSITE', course: 'NEET Crash Course', city: 'Solan', notes: 'Asked about weekend batch' },
    ]));
  }
  throw ApiError.badRequest(`No template available for "${entity}"`);
});
