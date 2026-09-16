import { Types } from 'mongoose';
import dayjs from 'dayjs';
import {
  Student, Lead, Payment, FeeInstallment, Attendance, TestResult, CourseEnrollment,
  Batch, Course, Admission, Teacher, ClassSession,
} from '../models';

export interface ReportFilters {
  from?: string;
  to?: string;
  courseId?: string;
  batchId?: string;
  groupBy?: 'day' | 'week' | 'month';
}

function range(f: ReportFilters) {
  const to = f.to ? dayjs(f.to).endOf('day') : dayjs().endOf('day');
  const from = f.from ? dayjs(f.from).startOf('day') : to.subtract(6, 'month').startOf('day');
  return { from: from.toDate(), to: to.toDate() };
}

function groupExpr(groupBy: 'day' | 'week' | 'month', field: string) {
  const format = groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'week' ? '%Y-W%V' : '%Y-%m';
  return { $dateToString: { format, date: `$${field}` } };
}

/* ------------------------------ Revenue report ------------------------------ */

export async function revenueReport(organizationId: Types.ObjectId, f: ReportFilters) {
  const { from, to } = range(f);
  const groupBy = f.groupBy ?? 'month';
  const match: Record<string, unknown> = { organizationId, status: 'SUCCESS', paidAt: { $gte: from, $lte: to } };
  if (f.courseId) match.courseId = new Types.ObjectId(f.courseId);

  const [series, byMethod, byCourse, totals, pending] = await Promise.all([
    Payment.aggregate([
      { $match: match },
      { $group: { _id: groupExpr(groupBy, 'paidAt'), amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      { $match: match },
      { $group: { _id: '$method', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
    Payment.aggregate([
      { $match: match },
      { $group: { _id: '$courseId', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
      { $limit: 15 },
    ]),
    Payment.aggregate<{ total: number; count: number; avg: number }>([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 }, avg: { $avg: '$amount' } } },
    ]),
    FeeInstallment.aggregate<{ pending: number; overdue: number; pendingCount: number; overdueCount: number }>([
      { $match: { organizationId, status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] } } },
      {
        $group: {
          _id: null,
          pending: { $sum: { $subtract: ['$amount', '$paidAmount'] } },
          pendingCount: { $sum: 1 },
          overdue: { $sum: { $cond: [{ $eq: ['$status', 'OVERDUE'] }, { $subtract: ['$amount', '$paidAmount'] }, 0] } },
          overdueCount: { $sum: { $cond: [{ $eq: ['$status', 'OVERDUE'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const courses = await Course.find({ _id: { $in: byCourse.map((c) => c._id).filter(Boolean) }, organizationId })
    .select('title code').lean();
  const courseMap = new Map(courses.map((c) => [String(c._id), c.title]));

  return {
    range: { from, to, groupBy },
    series: series.map((s) => ({ period: s._id, amount: s.amount, count: s.count })),
    byMethod: byMethod.map((m) => ({ method: m._id ?? 'UNKNOWN', amount: m.amount, count: m.count })),
    byCourse: byCourse.map((c) => ({ courseId: String(c._id ?? ''), course: courseMap.get(String(c._id)) ?? 'Unassigned', amount: c.amount, count: c.count })),
    totals: {
      collected: totals[0]?.total ?? 0,
      payments: totals[0]?.count ?? 0,
      averagePayment: Math.round(totals[0]?.avg ?? 0),
      pending: Math.round(pending[0]?.pending ?? 0),
      pendingCount: pending[0]?.pendingCount ?? 0,
      overdue: Math.round(pending[0]?.overdue ?? 0),
      overdueCount: pending[0]?.overdueCount ?? 0,
    },
  };
}

/* ---------------------------- Admissions report ----------------------------- */

export async function admissionsReport(organizationId: Types.ObjectId, f: ReportFilters) {
  const { from, to } = range(f);
  const groupBy = f.groupBy ?? 'month';

  const [series, bySource, byCourse, leadFunnel, conversion] = await Promise.all([
    Admission.aggregate([
      { $match: { organizationId, admissionDate: { $gte: from, $lte: to } } },
      { $group: { _id: groupExpr(groupBy, 'admissionDate'), count: { $sum: 1 }, fees: { $sum: '$totalFee' } } },
      { $sort: { _id: 1 } },
    ]),
    Lead.aggregate([
      { $match: { organizationId, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: '$source', leads: { $sum: 1 }, admitted: { $sum: { $cond: [{ $eq: ['$status', 'ADMITTED'] }, 1, 0] } } } },
      { $sort: { leads: -1 } },
    ]),
    Admission.aggregate([
      { $match: { organizationId, admissionDate: { $gte: from, $lte: to } } },
      { $group: { _id: '$courseId', count: { $sum: 1 }, fees: { $sum: '$totalFee' } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    Lead.aggregate([
      { $match: { organizationId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Lead.aggregate<{ total: number; admitted: number; lost: number }>([
      { $match: { organizationId, createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          admitted: { $sum: { $cond: [{ $eq: ['$status', 'ADMITTED'] }, 1, 0] } },
          lost: { $sum: { $cond: [{ $eq: ['$status', 'LOST'] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const courses = await Course.find({ _id: { $in: byCourse.map((c) => c._id).filter(Boolean) }, organizationId }).select('title').lean();
  const courseMap = new Map(courses.map((c) => [String(c._id), c.title]));
  const c = conversion[0];

  return {
    range: { from, to, groupBy },
    series: series.map((s) => ({ period: s._id, admissions: s.count, fees: s.fees })),
    bySource: bySource.map((s) => ({
      source: s._id ?? 'UNKNOWN', leads: s.leads, admitted: s.admitted,
      conversionRate: s.leads ? Math.round((s.admitted / s.leads) * 1000) / 10 : 0,
    })),
    byCourse: byCourse.map((b) => ({ course: courseMap.get(String(b._id)) ?? 'Unknown', admissions: b.count, fees: b.fees })),
    funnel: leadFunnel.map((l) => ({ status: l._id, count: l.count })),
    conversion: {
      leads: c?.total ?? 0,
      admitted: c?.admitted ?? 0,
      lost: c?.lost ?? 0,
      rate: c?.total ? Math.round((c.admitted / c.total) * 1000) / 10 : 0,
    },
  };
}

/* ---------------------------- Attendance report ----------------------------- */

export async function attendanceReport(organizationId: Types.ObjectId, f: ReportFilters) {
  const { from, to } = range(f);
  const groupBy = f.groupBy ?? 'month';
  const match: Record<string, unknown> = { organizationId, date: { $gte: from, $lte: to } };
  if (f.batchId) match.batchId = new Types.ObjectId(f.batchId);
  if (f.courseId) match.courseId = new Types.ObjectId(f.courseId);

  const [series, byBatch, byStatus, lowest] = await Promise.all([
    Attendance.aggregate([
      { $match: match },
      {
        $group: {
          _id: groupExpr(groupBy, 'date'),
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $in: ['$status', ['PRESENT', 'LATE']] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Attendance.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$batchId',
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $in: ['$status', ['PRESENT', 'LATE']] }, 1, 0] } },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 20 },
    ]),
    Attendance.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Attendance.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$studentId',
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $in: ['$status', ['PRESENT', 'LATE']] }, 1, 0] } },
        },
      },
      { $match: { total: { $gte: 5 } } },
      { $addFields: { pct: { $multiply: [{ $divide: ['$present', '$total'] }, 100] } } },
      { $sort: { pct: 1 } },
      { $limit: 20 },
    ]),
  ]);

  const [batches, students] = await Promise.all([
    Batch.find({ _id: { $in: byBatch.map((b) => b._id).filter(Boolean) }, organizationId }).select('name code').lean(),
    Student.find({ _id: { $in: lowest.map((l) => l._id) }, organizationId }).select('name studentCode').lean(),
  ]);
  const batchMap = new Map(batches.map((b) => [String(b._id), b]));
  const studentMap = new Map(students.map((s) => [String(s._id), s]));

  return {
    range: { from, to, groupBy },
    series: series.map((s) => ({ period: s._id, total: s.total, present: s.present, percentage: s.total ? Math.round((s.present / s.total) * 1000) / 10 : 0 })),
    byBatch: byBatch.map((b) => ({
      batch: batchMap.get(String(b._id))?.name ?? 'Unknown',
      code: batchMap.get(String(b._id))?.code,
      total: b.total, present: b.present,
      percentage: b.total ? Math.round((b.present / b.total) * 1000) / 10 : 0,
    })),
    byStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
    lowestStudents: lowest.map((l) => ({
      studentId: String(l._id),
      name: studentMap.get(String(l._id))?.name ?? 'Unknown',
      studentCode: studentMap.get(String(l._id))?.studentCode,
      total: l.total, present: l.present, percentage: Math.round(l.pct * 10) / 10,
    })),
  };
}

/* ---------------------------- Performance report ---------------------------- */

export async function performanceReport(organizationId: Types.ObjectId, f: ReportFilters) {
  const { from, to } = range(f);
  const match: Record<string, unknown> = { organizationId, createdAt: { $gte: from, $lte: to } };
  if (f.courseId) match.courseId = new Types.ObjectId(f.courseId);
  if (f.batchId) match.batchId = new Types.ObjectId(f.batchId);

  const [distribution, byCourse, topStudents, trend, passRate] = await Promise.all([
    TestResult.aggregate([
      { $match: match },
      { $bucket: { groupBy: '$percentage', boundaries: [0, 40, 50, 60, 70, 80, 90, 101], default: 'other', output: { count: { $sum: 1 } } } },
    ]),
    TestResult.aggregate([
      { $match: match },
      { $group: { _id: '$courseId', avg: { $avg: '$percentage' }, count: { $sum: 1 }, passed: { $sum: { $cond: ['$passed', 1, 0] } } } },
      { $sort: { count: -1 } },
      { $limit: 15 },
    ]),
    TestResult.aggregate([
      { $match: match },
      { $group: { _id: '$studentId', avg: { $avg: '$percentage' }, exams: { $sum: 1 } } },
      { $match: { exams: { $gte: 2 } } },
      { $sort: { avg: -1 } },
      { $limit: 15 },
    ]),
    TestResult.aggregate([
      { $match: match },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, avg: { $avg: '$percentage' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    TestResult.aggregate<{ total: number; passed: number; avg: number }>([
      { $match: match },
      { $group: { _id: null, total: { $sum: 1 }, passed: { $sum: { $cond: ['$passed', 1, 0] } }, avg: { $avg: '$percentage' } } },
    ]),
  ]);

  const [courses, students] = await Promise.all([
    Course.find({ _id: { $in: byCourse.map((c) => c._id).filter(Boolean) }, organizationId }).select('title').lean(),
    Student.find({ _id: { $in: topStudents.map((s) => s._id) }, organizationId }).select('name studentCode').lean(),
  ]);
  const courseMap = new Map(courses.map((c) => [String(c._id), c.title]));
  const studentMap = new Map(students.map((s) => [String(s._id), s]));

  const bandLabels: Record<string, string> = {
    '0': 'Fail (<40)', '40': '40-49', '50': '50-59', '60': '60-69', '70': '70-79', '80': '80-89', '90': '90-100',
  };

  return {
    range: { from, to },
    distribution: distribution.map((d) => ({ band: bandLabels[String(d._id)] ?? String(d._id), count: d.count })),
    byCourse: byCourse.map((c) => ({
      course: courseMap.get(String(c._id)) ?? 'Unknown',
      average: Math.round(c.avg * 10) / 10,
      results: c.count,
      passRate: c.count ? Math.round((c.passed / c.count) * 1000) / 10 : 0,
    })),
    topStudents: topStudents.map((s) => ({
      studentId: String(s._id),
      name: studentMap.get(String(s._id))?.name ?? 'Unknown',
      studentCode: studentMap.get(String(s._id))?.studentCode,
      average: Math.round(s.avg * 10) / 10,
      exams: s.exams,
    })),
    trend: trend.map((t) => ({ period: t._id, average: Math.round(t.avg * 10) / 10, results: t.count })),
    summary: {
      results: passRate[0]?.total ?? 0,
      passed: passRate[0]?.passed ?? 0,
      passRate: passRate[0]?.total ? Math.round((passRate[0].passed / passRate[0].total) * 1000) / 10 : 0,
      average: Math.round((passRate[0]?.avg ?? 0) * 10) / 10,
    },
  };
}

/* ------------------------------- Teacher report ------------------------------ */

export async function teacherReport(organizationId: Types.ObjectId, f: ReportFilters) {
  const { from, to } = range(f);
  const [classes, batches] = await Promise.all([
    ClassSession.aggregate([
      { $match: { organizationId, startAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: '$teacherId',
          total: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } },
          marked: { $sum: { $cond: ['$attendanceMarked', 1, 0] } },
        },
      },
      { $sort: { total: -1 } },
    ]),
    Batch.aggregate([
      { $match: { organizationId, status: { $in: ['UPCOMING', 'ONGOING'] } } },
      { $group: { _id: '$teacherId', batches: { $sum: 1 }, students: { $sum: '$enrolledCount' } } },
    ]),
  ]);

  const teachers = await Teacher.find({ organizationId }).select('name employeeCode email isActive').lean();
  const classMap = new Map(classes.map((c) => [String(c._id), c]));
  const batchMap = new Map(batches.map((b) => [String(b._id), b]));

  return {
    range: { from, to },
    rows: teachers.map((t) => {
      const c = classMap.get(String(t._id));
      const b = batchMap.get(String(t._id));
      return {
        teacherId: String(t._id),
        name: t.name,
        employeeCode: t.employeeCode,
        email: t.email,
        isActive: t.isActive,
        classes: c?.total ?? 0,
        completed: c?.completed ?? 0,
        cancelled: c?.cancelled ?? 0,
        attendanceMarked: c?.marked ?? 0,
        attendanceCompliance: c?.completed ? Math.round(((c.marked ?? 0) / c.completed) * 1000) / 10 : 0,
        batches: b?.batches ?? 0,
        students: b?.students ?? 0,
      };
    }).sort((a, b) => b.classes - a.classes),
  };
}

/* ------------------------------ Students report ------------------------------ */

export async function studentsReport(organizationId: Types.ObjectId, f: ReportFilters) {
  const { from, to } = range(f);
  const [byStatus, byMonth, byCourse, byGender, retention] = await Promise.all([
    Student.aggregate([{ $match: { organizationId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Student.aggregate([
      { $match: { organizationId, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    CourseEnrollment.aggregate([
      { $match: { organizationId } },
      { $group: { _id: '$courseId', enrolled: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } }, dropped: { $sum: { $cond: [{ $eq: ['$status', 'DROPPED'] }, 1, 0] } } } },
      { $sort: { enrolled: -1 } },
      { $limit: 15 },
    ]),
    Student.aggregate([{ $match: { organizationId } }, { $group: { _id: '$gender', count: { $sum: 1 } } }]),
    Student.aggregate<{ active: number; total: number }>([
      { $match: { organizationId } },
      { $group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } } } },
    ]),
  ]);

  const courses = await Course.find({ _id: { $in: byCourse.map((c) => c._id).filter(Boolean) }, organizationId }).select('title').lean();
  const courseMap = new Map(courses.map((c) => [String(c._id), c.title]));

  return {
    range: { from, to },
    byStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
    byMonth: byMonth.map((m) => ({ period: m._id, count: m.count })),
    byCourse: byCourse.map((c) => ({ course: courseMap.get(String(c._id)) ?? 'Unknown', ...c, _id: undefined })),
    byGender: byGender.map((g) => ({ gender: g._id ?? 'UNSPECIFIED', count: g.count })),
    retention: {
      total: retention[0]?.total ?? 0,
      active: retention[0]?.active ?? 0,
      rate: retention[0]?.total ? Math.round((retention[0].active / retention[0].total) * 1000) / 10 : 0,
    },
  };
}
