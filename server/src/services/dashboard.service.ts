import { Types } from 'mongoose';
import dayjs from 'dayjs';
import {
  Student, Lead, Admission, FeePlan, FeeInstallment, Payment, Attendance, Course, Batch, ClassSession, Exam, FollowUp, CourseEnrollment, TestResult, Assignment, AssignmentSubmission, QuizAttempt, Organization, BatchEnrollment,
} from '../models';

export async function adminDashboard(orgId: Types.ObjectId) {
  const now = new Date();
  const monthStart = dayjs().startOf('month').toDate();
  const todayStart = dayjs().startOf('day').toDate();
  const todayEnd = dayjs().endOf('day').toDate();

  const [
    totalStudents, activeStudents, newLeads, admissionsThisMonth, totalLeads, convertedLeads,
    feeAgg, collectedAgg, overdueAgg, attendanceAgg, activeCourses, activeBatches,
    admissionSeries, revenueSeries, leadSources, attendanceSeries, courseEnrollment,
    todaysFollowUps, overdueFollowUps, overdueFeeList, lowAttendance, todaysClasses,
    upcomingExams, pendingAdmissions, resultsAvg, org,
  ] = await Promise.all([
    Student.countDocuments({ organizationId: orgId }),
    Student.countDocuments({ organizationId: orgId, status: 'ACTIVE' }),
    Lead.countDocuments({ organizationId: orgId, createdAt: { $gte: monthStart } }),
    Admission.countDocuments({ organizationId: orgId, admissionDate: { $gte: monthStart } }),
    Lead.countDocuments({ organizationId: orgId }),
    Lead.countDocuments({ organizationId: orgId, status: 'ADMITTED' }),
    FeePlan.aggregate<{ net: number; paid: number; pending: number }>([
      { $match: { organizationId: orgId, status: { $ne: 'CANCELLED' } } },
      { $group: { _id: null, net: { $sum: '$netAmount' }, paid: { $sum: '$paidAmount' }, pending: { $sum: '$pendingAmount' } } },
    ]),
    Payment.aggregate<{ total: number }>([
      { $match: { organizationId: orgId, status: 'SUCCESS' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    FeeInstallment.aggregate<{ total: number; count: number }>([
      { $match: { organizationId: orgId, status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] }, dueDate: { $lt: todayStart } } },
      { $group: { _id: null, total: { $sum: { $subtract: ['$amount', '$paidAmount'] } }, count: { $sum: 1 } } },
    ]),
    Attendance.aggregate<{ _id: string; c: number }>([
      { $match: { organizationId: orgId, date: { $gte: dayjs().subtract(30, 'day').toDate() } } },
      { $group: { _id: '$status', c: { $sum: 1 } } },
    ]),
    Course.countDocuments({ organizationId: orgId, status: 'PUBLISHED' }),
    Batch.countDocuments({ organizationId: orgId, status: { $in: ['ONGOING', 'UPCOMING'] } }),
    Admission.aggregate<{ _id: { y: number; m: number }; c: number }>([
      { $match: { organizationId: orgId, admissionDate: { $gte: dayjs().subtract(11, 'month').startOf('month').toDate() } } },
      { $group: { _id: { y: { $year: '$admissionDate' }, m: { $month: '$admissionDate' } }, c: { $sum: 1 } } },
    ]),
    Payment.aggregate<{ _id: { y: number; m: number }; t: number }>([
      { $match: { organizationId: orgId, status: 'SUCCESS', paidAt: { $gte: dayjs().subtract(11, 'month').startOf('month').toDate() } } },
      { $group: { _id: { y: { $year: '$paidAt' }, m: { $month: '$paidAt' } }, t: { $sum: '$amount' } } },
    ]),
    Lead.aggregate<{ _id: string; c: number }>([
      { $match: { organizationId: orgId } },
      { $group: { _id: '$source', c: { $sum: 1 } } },
      { $sort: { c: -1 } },
    ]),
    Attendance.aggregate<{ _id: { y: number; m: number; s: string }; c: number }>([
      { $match: { organizationId: orgId, date: { $gte: dayjs().subtract(5, 'month').startOf('month').toDate() } } },
      { $group: { _id: { y: { $year: '$date' }, m: { $month: '$date' }, s: '$status' }, c: { $sum: 1 } } },
    ]),
    CourseEnrollment.aggregate<{ _id: Types.ObjectId; c: number }>([
      { $match: { organizationId: orgId } },
      { $group: { _id: '$courseId', c: { $sum: 1 } } },
      { $sort: { c: -1 } },
      { $limit: 8 },
    ]),
    FollowUp.find({ organizationId: orgId, status: 'PENDING', scheduledAt: { $gte: todayStart, $lte: todayEnd } })
      .populate('leadId', 'name phone status').populate('assignedTo', 'name').sort({ scheduledAt: 1 }).limit(12).lean(),
    FollowUp.countDocuments({ organizationId: orgId, status: 'PENDING', scheduledAt: { $lt: todayStart } }),
    FeeInstallment.find({ organizationId: orgId, status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] }, dueDate: { $lt: todayStart } })
      .populate('studentId', 'name studentCode phone').sort({ dueDate: 1 }).limit(12).lean(),
    lowAttendanceStudents(orgId),
    ClassSession.find({ organizationId: orgId, startAt: { $gte: todayStart, $lte: todayEnd } })
      .populate('batchId', 'name').populate('teacherId', 'name').sort({ startAt: 1 }).limit(12).lean(),
    Exam.find({ organizationId: orgId, date: { $gte: now }, status: { $in: ['PUBLISHED', 'DRAFT'] } })
      .populate('courseId', 'title').sort({ date: 1 }).limit(10).lean(),
    Lead.find({ organizationId: orgId, status: 'ADMISSION_PENDING' })
      .populate('assignedCounselorId', 'name').sort({ updatedAt: -1 }).limit(10).lean(),
    TestResult.aggregate<{ avg: number }>([
      { $match: { organizationId: orgId } },
      { $group: { _id: null, avg: { $avg: '$percentage' } } },
    ]),
    Organization.findById(orgId).select('settings.attendanceThreshold settings.currencySymbol name').lean(),
  ]);

  const present = attendanceAgg.find((a) => a._id === 'PRESENT')?.c ?? 0;
  const late = attendanceAgg.find((a) => a._id === 'LATE')?.c ?? 0;
  const totalAtt = attendanceAgg.reduce((a, r) => a + r.c, 0);

  const courseIds = courseEnrollment.map((c) => c._id);
  const courses = await Course.find({ _id: { $in: courseIds }, organizationId: orgId }).select('title').lean();
  const courseMap = new Map(courses.map((c) => [String(c._id), c.title]));

  const months = (n: number) => Array.from({ length: n }, (_, i) => dayjs().subtract(n - 1 - i, 'month'));

  return {
    cards: {
      totalStudents,
      activeStudents,
      newLeads,
      admissionsThisMonth,
      conversionRate: totalLeads ? Math.round((convertedLeads / totalLeads) * 1000) / 10 : 0,
      feesCollected: collectedAgg[0]?.total ?? 0,
      feesPending: feeAgg[0]?.pending ?? 0,
      feesOverdue: overdueAgg[0]?.total ?? 0,
      overdueCount: overdueAgg[0]?.count ?? 0,
      attendancePercentage: totalAtt ? Math.round(((present + late) / totalAtt) * 1000) / 10 : 0,
      activeCourses,
      activeBatches,
      averageResult: resultsAvg[0]?.avg ? Math.round(resultsAvg[0].avg * 10) / 10 : 0,
      totalFees: feeAgg[0]?.net ?? 0,
    },
    charts: {
      admissionsTrend: months(12).map((d) => ({
        month: d.format('MMM YY'),
        admissions: admissionSeries.find((a) => a._id.y === d.year() && a._id.m === d.month() + 1)?.c ?? 0,
      })),
      revenueTrend: months(12).map((d) => ({
        month: d.format('MMM YY'),
        revenue: revenueSeries.find((a) => a._id.y === d.year() && a._id.m === d.month() + 1)?.t ?? 0,
      })),
      leadSources: leadSources.map((s) => ({ source: s._id, count: s.c })),
      attendanceTrend: months(6).map((d) => {
        const rows = attendanceSeries.filter((r) => r._id.y === d.year() && r._id.m === d.month() + 1);
        const p = rows.find((r) => r._id.s === 'PRESENT')?.c ?? 0;
        const l = rows.find((r) => r._id.s === 'LATE')?.c ?? 0;
        const t = rows.reduce((a, r) => a + r.c, 0);
        return { month: d.format('MMM YY'), percentage: t ? Math.round(((p + l) / t) * 100) : 0 };
      }),
      courseEnrollment: courseEnrollment.map((c) => ({ course: courseMap.get(String(c._id)) ?? 'Unknown', students: c.c })),
      studentPerformance: await performanceDistribution(orgId),
    },
    actionCenter: {
      todaysFollowUps,
      overdueFollowUpCount: overdueFollowUps,
      overdueFees: overdueFeeList,
      lowAttendance,
      todaysClasses,
      upcomingExams,
      pendingAdmissions,
    },
    meta: {
      attendanceThreshold: org?.settings?.attendanceThreshold ?? 75,
      currencySymbol: org?.settings?.currencySymbol ?? '₹',
      organizationName: org?.name,
    },
  };
}

async function performanceDistribution(orgId: Types.ObjectId) {
  const rows = await TestResult.aggregate<{ _id: string; c: number }>([
    { $match: { organizationId: orgId } },
    {
      $bucket: {
        groupBy: '$percentage',
        boundaries: [0, 40, 50, 60, 70, 80, 90, 101],
        default: 'other',
        output: { c: { $sum: 1 } },
      },
    },
  ]);
  const labels: Record<string, string> = {
    '0': '<40%', '40': '40-49%', '50': '50-59%', '60': '60-69%', '70': '70-79%', '80': '80-89%', '90': '90-100%',
  };
  return Object.entries(labels).map(([k, label]) => ({
    band: label,
    students: rows.find((r) => String(r._id) === k)?.c ?? 0,
  }));
}

/** Students below the academy attendance threshold over the last 60 days. */
export async function lowAttendanceStudents(orgId: Types.ObjectId, limit = 10) {
  const org = await Organization.findById(orgId).select('settings.attendanceThreshold').lean();
  const threshold = org?.settings?.attendanceThreshold ?? 75;
  const since = dayjs().subtract(60, 'day').toDate();

  const rows = await Attendance.aggregate<{ _id: Types.ObjectId; total: number; present: number }>([
    { $match: { organizationId: orgId, date: { $gte: since } } },
    {
      $group: {
        _id: '$studentId',
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $in: ['$status', ['PRESENT', 'LATE']] }, 1, 0] } },
      },
    },
    { $match: { total: { $gte: 5 } } },
    { $addFields: { pct: { $multiply: [{ $divide: ['$present', '$total'] }, 100] } } },
    { $match: { pct: { $lt: threshold } } },
    { $sort: { pct: 1 } },
    { $limit: limit },
  ]);

  const students = await Student.find({ _id: { $in: rows.map((r) => r._id) }, organizationId: orgId })
    .select('name studentCode phone').lean();
  const map = new Map(students.map((s) => [String(s._id), s]));

  return rows.map((r) => ({
    studentId: String(r._id),
    student: map.get(String(r._id)) ?? null,
    total: r.total,
    present: r.present,
    percentage: Math.round((r.present / r.total) * 1000) / 10,
    threshold,
  }));
}

/* ------------------------------ Teacher dashboard ----------------------------- */

export async function teacherDashboard(orgId: Types.ObjectId, teacherId: Types.ObjectId) {
  const todayStart = dayjs().startOf('day').toDate();
  const todayEnd = dayjs().endOf('day').toDate();

  const batches = await Batch.find({ organizationId: orgId, teacherId }).select('_id name courseId enrolledCount').lean();
  const batchIds = batches.map((b) => b._id);

  const [todaysClasses, upcoming, pendingAttendance, assignments, exams, students, submissionsToGrade, attendanceAgg] =
    await Promise.all([
      ClassSession.find({ organizationId: orgId, teacherId, startAt: { $gte: todayStart, $lte: todayEnd } })
        .populate('batchId', 'name').sort({ startAt: 1 }).lean(),
      ClassSession.find({ organizationId: orgId, teacherId, startAt: { $gt: todayEnd } })
        .populate('batchId', 'name').sort({ startAt: 1 }).limit(10).lean(),
      ClassSession.find({ organizationId: orgId, teacherId, attendanceMarked: false, endAt: { $lt: new Date() } })
        .populate('batchId', 'name').sort({ startAt: -1 }).limit(10).lean(),
      Assignment.find({ organizationId: orgId, teacherId }).sort({ dueDate: -1 }).limit(10)
        .populate('courseId', 'title').lean(),
      Exam.find({ organizationId: orgId, teacherId, date: { $gte: todayStart } }).sort({ date: 1 }).limit(10)
        .populate('courseId', 'title').lean(),
      BatchEnrollment.countDocuments({ organizationId: orgId, batchId: { $in: batchIds }, status: 'ACTIVE' }),
      AssignmentSubmission.countDocuments({ organizationId: orgId, status: 'SUBMITTED' }),
      Attendance.aggregate<{ _id: string; c: number }>([
        { $match: { organizationId: orgId, batchId: { $in: batchIds }, date: { $gte: dayjs().subtract(30, 'day').toDate() } } },
        { $group: { _id: '$status', c: { $sum: 1 } } },
      ]),
    ]);

  const present = attendanceAgg.find((a) => a._id === 'PRESENT')?.c ?? 0;
  const late = attendanceAgg.find((a) => a._id === 'LATE')?.c ?? 0;
  const total = attendanceAgg.reduce((a, r) => a + r.c, 0);

  return {
    cards: {
      batches: batches.length,
      students,
      todaysClasses: todaysClasses.length,
      pendingAttendance: pendingAttendance.length,
      assignments: assignments.length,
      upcomingExams: exams.length,
      attendancePercentage: total ? Math.round(((present + late) / total) * 1000) / 10 : 0,
      submissionsToGrade,
    },
    todaysClasses,
    upcomingClasses: upcoming,
    pendingAttendance,
    assignments,
    exams,
    batches,
  };
}

/* ------------------------------ Student dashboard ----------------------------- */

export async function studentDashboard(orgId: Types.ObjectId, studentId: Types.ObjectId) {
  const todayStart = dayjs().startOf('day').toDate();
  const todayEnd = dayjs().endOf('day').toDate();

  const [enrollments, batchEnrollments, attendanceAgg, feePlans, nextInstallment, results, assignments, quizAttempts] =
    await Promise.all([
      CourseEnrollment.find({ organizationId: orgId, studentId })
        .populate('courseId', 'title code thumbnailUrl category').sort({ lastAccessedAt: -1 }).lean(),
      BatchEnrollment.find({ organizationId: orgId, studentId, status: 'ACTIVE' }).select('batchId').lean(),
      Attendance.aggregate<{ _id: string; c: number }>([
        { $match: { organizationId: orgId, studentId } },
        { $group: { _id: '$status', c: { $sum: 1 } } },
      ]),
      FeePlan.find({ organizationId: orgId, studentId }).lean(),
      FeeInstallment.findOne({ organizationId: orgId, studentId, status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] } })
        .sort({ dueDate: 1 }).lean(),
      TestResult.find({ organizationId: orgId, studentId }).sort({ createdAt: -1 }).limit(10)
        .populate('examId', 'title date type').lean(),
      Assignment.find({ organizationId: orgId, status: 'PUBLISHED', dueDate: { $gte: dayjs().subtract(7, 'day').toDate() } })
        .sort({ dueDate: 1 }).limit(10).populate('courseId', 'title').lean(),
      QuizAttempt.find({ organizationId: orgId, studentId, status: 'SUBMITTED' }).sort({ submittedAt: -1 }).limit(5).lean(),
    ]);

  const batchIds = batchEnrollments.map((b: { batchId: Types.ObjectId }) => b.batchId);
  const [todaysClasses, upcomingClasses] = await Promise.all([
    ClassSession.find({ organizationId: orgId, batchId: { $in: batchIds }, startAt: { $gte: todayStart, $lte: todayEnd } })
      .populate('teacherId', 'name').populate('batchId', 'name').sort({ startAt: 1 }).lean(),
    ClassSession.find({ organizationId: orgId, batchId: { $in: batchIds }, startAt: { $gt: todayEnd } })
      .populate('teacherId', 'name').populate('batchId', 'name').sort({ startAt: 1 }).limit(8).lean(),
  ]);

  const present = attendanceAgg.find((a) => a._id === 'PRESENT')?.c ?? 0;
  const late = attendanceAgg.find((a) => a._id === 'LATE')?.c ?? 0;
  const total = attendanceAgg.reduce((a, r) => a + r.c, 0);
  const fees = feePlans.reduce((acc, p) => ({ total: acc.total + p.netAmount, paid: acc.paid + p.paidAmount, pending: acc.pending + p.pendingAmount }), { total: 0, paid: 0, pending: 0 });

  return {
    cards: {
      courses: enrollments.length,
      averageProgress: enrollments.length ? Math.round(enrollments.reduce((a, e) => a + e.progressPercent, 0) / enrollments.length) : 0,
      attendancePercentage: total ? Math.round(((present + late) / total) * 1000) / 10 : 0,
      averageResult: results.length ? Math.round((results.reduce((a, r) => a + r.percentage, 0) / results.length) * 10) / 10 : 0,
      feesPending: fees.pending,
      feesPaid: fees.paid,
      nextDueDate: nextInstallment?.dueDate ?? null,
      nextDueAmount: nextInstallment ? nextInstallment.amount - nextInstallment.paidAmount : 0,
    },
    courses: enrollments,
    todaysClasses,
    upcomingClasses,
    recentResults: results,
    assignments,
    quizAttempts,
    performanceSeries: results.slice().reverse().map((r) => ({
      exam: (r.examId as unknown as { title?: string })?.title ?? 'Exam',
      percentage: r.percentage,
    })),
  };
}

/* ------------------------------- Parent dashboard ----------------------------- */

export async function parentDashboard(orgId: Types.ObjectId, childIds: Types.ObjectId[]) {
  if (!childIds.length) return { children: [], summary: { children: 0, feesPending: 0, averageAttendance: 0, averageResult: 0 } };

  const children = await Student.find({ _id: { $in: childIds }, organizationId: orgId })
    .populate('primaryCourseId', 'title')
    .populate('primaryBatchId', 'name')
    .lean();

  const details = await Promise.all(
    children.map(async (child) => {
      const [attendanceAgg, feePlans, results, nextInst] = await Promise.all([
        Attendance.aggregate<{ _id: string; c: number }>([
          { $match: { organizationId: orgId, studentId: child._id } },
          { $group: { _id: '$status', c: { $sum: 1 } } },
        ]),
        FeePlan.find({ organizationId: orgId, studentId: child._id }).lean(),
        TestResult.find({ organizationId: orgId, studentId: child._id }).sort({ createdAt: -1 }).limit(5)
          .populate('examId', 'title date').lean(),
        FeeInstallment.findOne({ organizationId: orgId, studentId: child._id, status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] } })
          .sort({ dueDate: 1 }).lean(),
      ]);
      const present = attendanceAgg.find((a) => a._id === 'PRESENT')?.c ?? 0;
      const late = attendanceAgg.find((a) => a._id === 'LATE')?.c ?? 0;
      const total = attendanceAgg.reduce((a, r) => a + r.c, 0);
      const fees = feePlans.reduce((acc, p) => ({ total: acc.total + p.netAmount, paid: acc.paid + p.paidAmount, pending: acc.pending + p.pendingAmount }), { total: 0, paid: 0, pending: 0 });
      return {
        student: child,
        attendancePercentage: total ? Math.round(((present + late) / total) * 1000) / 10 : 0,
        averageResult: results.length ? Math.round((results.reduce((a, r) => a + r.percentage, 0) / results.length) * 10) / 10 : 0,
        fees,
        nextDue: nextInst ? { dueDate: nextInst.dueDate, amount: nextInst.amount - nextInst.paidAmount, title: nextInst.title } : null,
        recentResults: results,
      };
    }),
  );

  return {
    children: details,
    summary: {
      children: details.length,
      feesPending: details.reduce((a, d) => a + d.fees.pending, 0),
      averageAttendance: details.length ? Math.round((details.reduce((a, d) => a + d.attendancePercentage, 0) / details.length) * 10) / 10 : 0,
      averageResult: details.length ? Math.round((details.reduce((a, d) => a + d.averageResult, 0) / details.length) * 10) / 10 : 0,
    },
  };
}
