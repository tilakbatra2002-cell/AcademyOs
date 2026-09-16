import { Types, FilterQuery } from 'mongoose';
import dayjs from 'dayjs';
import {
  Batch, IBatch, BatchEnrollment, ClassSession, IClassSession, Attendance, Course, Teacher,
  Student, Subject, CourseEnrollment, Lesson,
} from '../models';
import { listScoped, assertBelongsToOrg } from './crud.factory';
import { ApiError } from '../utils/ApiError';
import { dateRangeFilter } from '../utils/query';
import { assertWithinLimit } from './subscription.service';
import { randomCode } from '../utils/ids';
import { AuthContext } from '../types/express';

/* ---------------------------------- Batches --------------------------------- */

export async function listBatches(
  orgId: Types.ObjectId,
  params: { page: number; limit: number; sort?: string; order?: 'asc' | 'desc'; search?: string; status?: string; courseId?: string; teacherId?: string },
) {
  const filter: FilterQuery<IBatch> = {};
  if (params.status) filter.status = params.status as never;
  if (params.courseId) filter.courseId = new Types.ObjectId(params.courseId);
  if (params.teacherId) filter.teacherId = new Types.ObjectId(params.teacherId);

  const { items, total } = await listScoped(Batch, {
    organizationId: orgId,
    page: params.page, limit: params.limit, sort: params.sort, order: params.order, search: params.search,
    searchFields: ['name', 'code', 'room'],
    filter,
    populate: [{ path: 'courseId', select: 'title code' }, { path: 'teacherId', select: 'name email' }],
    defaultSort: 'startDate',
  });

  return {
    items: items.map((b) => {
      const batch = b as { capacity: number; enrolledCount: number };
      return { ...b, available: Math.max(0, batch.capacity - batch.enrolledCount) };
    }),
    total,
  };
}

export async function createBatch(orgId: Types.ObjectId, auth: AuthContext, input: Record<string, unknown>) {
  await assertWithinLimit(orgId, 'batches', 1);
  await assertBelongsToOrg(Course, input.courseId as string, orgId, 'Course');
  if (input.teacherId) await assertBelongsToOrg(Teacher, input.teacherId as string, orgId, 'Teacher');

  const count = await Batch.countDocuments({ organizationId: orgId });
  let code = ((input.code as string) || `B${String(count + 1).padStart(3, '0')}`).toUpperCase();
  if (await Batch.exists({ organizationId: orgId, code })) code = `${code}${randomCode(2)}`;

  const batch = await Batch.create({
    ...input,
    code,
    teacherId: input.teacherId || undefined,
    startDate: new Date(input.startDate as string),
    endDate: input.endDate ? new Date(input.endDate as string) : undefined,
    organizationId: orgId,
    createdBy: auth.userId,
  });
  return batch.toObject();
}

export async function updateBatch(orgId: Types.ObjectId, id: string, input: Record<string, unknown>) {
  const batch = await Batch.findOne({ _id: id, organizationId: orgId });
  if (!batch) throw ApiError.notFound('Batch not found');
  if (input.courseId) await assertBelongsToOrg(Course, input.courseId as string, orgId, 'Course');
  if (input.teacherId) await assertBelongsToOrg(Teacher, input.teacherId as string, orgId, 'Teacher');
  if (input.capacity && (input.capacity as number) < batch.enrolledCount) {
    throw ApiError.validation(`Capacity cannot be less than the ${batch.enrolledCount} students already enrolled`, { capacity: 'Too low' });
  }

  Object.entries(input).forEach(([k, v]) => {
    if (v === undefined) return;
    if (k === 'startDate' || k === 'endDate') (batch as never as Record<string, unknown>)[k] = v ? new Date(v as string) : undefined;
    else if (k === 'teacherId' && v === '') batch.teacherId = undefined;
    else (batch as never as Record<string, unknown>)[k] = v;
  });
  await batch.save();
  return batch.toObject();
}

export async function batchDetail(orgId: Types.ObjectId, id: string) {
  const batch = await Batch.findOne({ _id: id, organizationId: orgId })
    .populate('courseId', 'title code price type')
    .populate('teacherId', 'name email phone photoUrl')
    .lean();
  if (!batch) throw ApiError.notFound('Batch not found');

  const [enrollments, classes, upcoming, attendanceAgg] = await Promise.all([
    BatchEnrollment.find({ organizationId: orgId, batchId: batch._id, status: 'ACTIVE' })
      .populate('studentId', 'name studentCode phone email photoUrl status').lean(),
    ClassSession.countDocuments({ organizationId: orgId, batchId: batch._id }),
    ClassSession.find({ organizationId: orgId, batchId: batch._id, startAt: { $gte: new Date() } })
      .sort({ startAt: 1 }).limit(10).lean(),
    Attendance.aggregate<{ _id: string; c: number }>([
      { $match: { organizationId: orgId, batchId: batch._id } },
      { $group: { _id: '$status', c: { $sum: 1 } } },
    ]),
  ]);

  const present = attendanceAgg.find((a) => a._id === 'PRESENT')?.c ?? 0;
  const late = attendanceAgg.find((a) => a._id === 'LATE')?.c ?? 0;
  const totalMarks = attendanceAgg.reduce((a, r) => a + r.c, 0);

  return {
    batch: { ...batch, available: Math.max(0, batch.capacity - batch.enrolledCount) },
    students: enrollments,
    stats: {
      classes,
      attendancePercentage: totalMarks ? Math.round(((present + late) / totalMarks) * 1000) / 10 : 0,
    },
    upcomingClasses: upcoming,
  };
}

export async function enrollStudentsInBatch(orgId: Types.ObjectId, batchId: string, studentIds: string[]) {
  const batch = await Batch.findOne({ _id: batchId, organizationId: orgId });
  if (!batch) throw ApiError.notFound('Batch not found');

  const students = await Student.find({ _id: { $in: studentIds }, organizationId: orgId }).select('_id').lean();
  if (students.length !== studentIds.length) throw ApiError.notFound('One or more students were not found in your academy');

  const existing = await BatchEnrollment.find({ organizationId: orgId, batchId: batch._id, studentId: { $in: studentIds }, status: 'ACTIVE' }).lean();
  const existingSet = new Set(existing.map((e) => String(e.studentId)));
  const toAdd = students.filter((s) => !existingSet.has(String(s._id)));

  if (batch.enrolledCount + toAdd.length > batch.capacity) {
    throw ApiError.conflict(
      `Adding ${toAdd.length} student(s) would exceed the batch capacity (${batch.enrolledCount}/${batch.capacity}).`,
    );
  }

  if (toAdd.length) {
    await BatchEnrollment.insertMany(
      toAdd.map((s) => ({ organizationId: orgId, batchId: batch._id, studentId: s._id, courseId: batch.courseId, status: 'ACTIVE' })),
    );
    const totalLessons = await Lesson.countDocuments({ organizationId: orgId, courseId: batch.courseId });
    await Promise.all(
      toAdd.map((s) =>
        CourseEnrollment.updateOne(
          { organizationId: orgId, studentId: s._id, courseId: batch.courseId },
          { $setOnInsert: { batchId: batch._id, status: 'ACTIVE', enrolledAt: new Date(), totalLessons } },
          { upsert: true },
        ),
      ),
    );
    await Student.updateMany(
      { _id: { $in: toAdd.map((s) => s._id) }, organizationId: orgId, primaryBatchId: { $exists: false } },
      { primaryBatchId: batch._id, primaryCourseId: batch.courseId },
    );
    batch.enrolledCount += toAdd.length;
    await batch.save();
  }

  return { added: toAdd.length, skipped: studentIds.length - toAdd.length, enrolledCount: batch.enrolledCount };
}

export async function removeStudentFromBatch(orgId: Types.ObjectId, batchId: string, studentId: string) {
  const enrollment = await BatchEnrollment.findOne({ organizationId: orgId, batchId, studentId, status: 'ACTIVE' });
  if (!enrollment) throw ApiError.notFound('This student is not enrolled in the batch');
  enrollment.status = 'DROPPED';
  enrollment.exitedAt = new Date();
  await enrollment.save();
  await Batch.updateOne({ _id: batchId, organizationId: orgId }, { $inc: { enrolledCount: -1 } });
  return { studentId };
}

/* ---------------------------------- Classes --------------------------------- */

function toDateTime(date: string, time: string): Date {
  return dayjs(`${dayjs(date).format('YYYY-MM-DD')}T${time}:00`).toDate();
}

/** Rejects teacher double-booking and room clashes within the tenant. */
export async function assertNoConflicts(
  orgId: Types.ObjectId,
  input: { teacherId: Types.ObjectId; room?: string; startAt: Date; endAt: Date; excludeId?: Types.ObjectId },
) {
  const overlap = {
    organizationId: orgId,
    status: { $ne: 'CANCELLED' },
    startAt: { $lt: input.endAt },
    endAt: { $gt: input.startAt },
    ...(input.excludeId ? { _id: { $ne: input.excludeId } } : {}),
  };

  const teacherClash = await ClassSession.findOne({ ...overlap, teacherId: input.teacherId }).lean();
  if (teacherClash) {
    throw ApiError.conflict(
      `This teacher already has "${teacherClash.title}" from ${dayjs(teacherClash.startAt).format('DD MMM HH:mm')} to ${dayjs(teacherClash.endAt).format('HH:mm')}.`,
      { teacherId: 'Teacher schedule conflict' },
    );
  }

  if (input.room) {
    const roomClash = await ClassSession.findOne({ ...overlap, room: input.room }).lean();
    if (roomClash) {
      throw ApiError.conflict(
        `Room ${input.room} is occupied by "${roomClash.title}" at that time.`,
        { room: 'Room conflict' },
      );
    }
  }
}

export async function createClass(orgId: Types.ObjectId, auth: AuthContext, input: Record<string, unknown>) {
  await assertBelongsToOrg(Course, input.courseId as string, orgId, 'Course');
  const batch = await Batch.findOne({ _id: input.batchId as string, organizationId: orgId }).lean();
  if (!batch) throw ApiError.notFound('Batch not found in your academy');
  await assertBelongsToOrg(Teacher, input.teacherId as string, orgId, 'Teacher');
  if (input.subjectId) await assertBelongsToOrg(Subject, input.subjectId as string, orgId, 'Subject');

  const startAt = toDateTime(input.date as string, input.startTime as string);
  const endAt = toDateTime(input.date as string, input.endTime as string);
  if (endAt <= startAt) throw ApiError.validation('End time must be after start time', { endTime: 'Must be after start time' });

  await assertNoConflicts(orgId, { teacherId: new Types.ObjectId(input.teacherId as string), room: input.room as string, startAt, endAt });

  const session = await ClassSession.create({
    ...input,
    subjectId: input.subjectId || undefined,
    meetingUrl: input.meetingUrl || undefined,
    date: dayjs(input.date as string).startOf('day').toDate(),
    startAt,
    endAt,
    organizationId: orgId,
    createdBy: auth.userId,
  });
  return session.toObject();
}

export async function updateClass(orgId: Types.ObjectId, id: string, input: Record<string, unknown>) {
  const session = await ClassSession.findOne({ _id: id, organizationId: orgId });
  if (!session) throw ApiError.notFound('Class not found');
  if (input.teacherId) await assertBelongsToOrg(Teacher, input.teacherId as string, orgId, 'Teacher');
  if (input.batchId) await assertBelongsToOrg(Batch, input.batchId as string, orgId, 'Batch');

  const date = (input.date as string) ?? dayjs(session.date).format('YYYY-MM-DD');
  const startTime = (input.startTime as string) ?? session.startTime;
  const endTime = (input.endTime as string) ?? session.endTime;
  const startAt = toDateTime(date, startTime);
  const endAt = toDateTime(date, endTime);
  if (endAt <= startAt) throw ApiError.validation('End time must be after start time', { endTime: 'Must be after start time' });

  const teacherId = input.teacherId ? new Types.ObjectId(input.teacherId as string) : session.teacherId;
  const room = (input.room as string) ?? session.room;
  if (input.status !== 'CANCELLED') {
    await assertNoConflicts(orgId, { teacherId, room, startAt, endAt, excludeId: session._id });
  }

  Object.entries(input).forEach(([k, v]) => {
    if (v === undefined) return;
    if (k === 'date') session.date = dayjs(v as string).startOf('day').toDate();
    else if (k === 'subjectId' && v === '') session.subjectId = undefined;
    else (session as never as Record<string, unknown>)[k] = v;
  });
  session.startAt = startAt;
  session.endAt = endAt;
  await session.save();
  return session.toObject();
}

export async function listClasses(
  orgId: Types.ObjectId,
  params: { page: number; limit: number; sort?: string; order?: 'asc' | 'desc'; search?: string; batchId?: string; teacherId?: string; courseId?: string; status?: string; from?: string; to?: string },
) {
  const filter: FilterQuery<IClassSession> = {};
  if (params.batchId) filter.batchId = new Types.ObjectId(params.batchId);
  if (params.teacherId) filter.teacherId = new Types.ObjectId(params.teacherId);
  if (params.courseId) filter.courseId = new Types.ObjectId(params.courseId);
  if (params.status) filter.status = params.status as never;
  const range = dateRangeFilter(params.from, params.to);
  if (range) filter.date = range as never;

  return listScoped(ClassSession, {
    organizationId: orgId,
    page: params.page, limit: params.limit, sort: params.sort ?? 'startAt',
    order: params.order ?? 'asc', search: params.search,
    searchFields: ['title', 'topic', 'room'],
    filter,
    populate: [
      { path: 'batchId', select: 'name code' },
      { path: 'courseId', select: 'title code' },
      { path: 'teacherId', select: 'name' },
      { path: 'subjectId', select: 'name code' },
    ],
    defaultSort: 'startAt',
  });
}

/** Generates recurring class sessions from the batch weekly schedule. */
export async function generateClassesFromSchedule(
  orgId: Types.ObjectId,
  auth: AuthContext,
  input: { batchId: string; from: string; to: string; topicPrefix?: string },
) {
  const batch = await Batch.findOne({ _id: input.batchId, organizationId: orgId }).populate('courseId', 'title').lean();
  if (!batch) throw ApiError.notFound('Batch not found');
  if (!batch.teacherId) throw ApiError.validation('Assign a teacher to this batch before generating classes', { teacherId: 'Required' });
  if (!batch.schedule?.length) throw ApiError.validation('This batch has no weekly schedule configured', { schedule: 'Required' });

  const dayMap: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const start = dayjs(input.from).startOf('day');
  const end = dayjs(input.to).endOf('day');
  if (end.diff(start, 'day') > 120) throw ApiError.validation('Generate at most 120 days at a time', { to: 'Range too large' });

  const created: string[] = [];
  const skipped: string[] = [];
  let index = 1;

  for (let d = start; d.isBefore(end); d = d.add(1, 'day')) {
    for (const slot of batch.schedule) {
      if (dayMap[slot.day] !== d.day()) continue;
      const startAt = toDateTime(d.format('YYYY-MM-DD'), slot.startTime);
      const endAt = toDateTime(d.format('YYYY-MM-DD'), slot.endTime);

      const dup = await ClassSession.findOne({ organizationId: orgId, batchId: batch._id, startAt }).lean();
      if (dup) { skipped.push(d.format('YYYY-MM-DD')); continue; }
      try {
        await assertNoConflicts(orgId, { teacherId: batch.teacherId, room: batch.room, startAt, endAt });
      } catch {
        skipped.push(`${d.format('YYYY-MM-DD')} (conflict)`);
        continue;
      }
      const session = await ClassSession.create({
        organizationId: orgId,
        title: `${(batch.courseId as unknown as { title: string }).title} — Session ${index}`,
        courseId: batch.courseId,
        batchId: batch._id,
        teacherId: batch.teacherId,
        room: batch.room,
        mode: batch.mode === 'HYBRID' ? 'OFFLINE' : (batch.mode as 'ONLINE' | 'OFFLINE'),
        date: d.startOf('day').toDate(),
        startTime: slot.startTime,
        endTime: slot.endTime,
        startAt,
        endAt,
        topic: input.topicPrefix ? `${input.topicPrefix} ${index}` : undefined,
        createdBy: auth.userId,
      });
      created.push(String(session._id));
      index += 1;
    }
  }

  return { created: created.length, skipped: skipped.length, skippedDetails: skipped.slice(0, 20) };
}

/* -------------------------------- Attendance -------------------------------- */

export async function attendanceSheet(orgId: Types.ObjectId, classSessionId: string) {
  const session = await ClassSession.findOne({ _id: classSessionId, organizationId: orgId })
    .populate('batchId', 'name code')
    .populate('courseId', 'title')
    .lean();
  if (!session) throw ApiError.notFound('Class not found');

  const [enrollments, existing] = await Promise.all([
    BatchEnrollment.find({ organizationId: orgId, batchId: session.batchId, status: 'ACTIVE' })
      .populate('studentId', 'name studentCode photoUrl').lean(),
    Attendance.find({ organizationId: orgId, classSessionId: session._id }).lean(),
  ]);
  const map = new Map(existing.map((a) => [String(a.studentId), a]));

  return {
    classSession: session,
    students: enrollments
      .filter((e) => e.studentId)
      .map((e) => {
        const s = e.studentId as unknown as { _id: Types.ObjectId; name: string; studentCode: string; photoUrl?: string };
        const record = map.get(String(s._id));
        return {
          studentId: String(s._id),
          name: s.name,
          studentCode: s.studentCode,
          photoUrl: s.photoUrl,
          status: record?.status ?? null,
          remarks: record?.remarks ?? '',
        };
      }),
    alreadyMarked: existing.length > 0,
  };
}

export async function markAttendance(
  orgId: Types.ObjectId,
  auth: AuthContext,
  input: { classSessionId: string; records: { studentId: string; status: string; remarks?: string }[] },
) {
  const session = await ClassSession.findOne({ _id: input.classSessionId, organizationId: orgId });
  if (!session) throw ApiError.notFound('Class not found');

  // Teachers may only mark attendance for their own classes.
  if (auth.role === 'TEACHER' && auth.teacherId && String(session.teacherId) !== String(auth.teacherId)) {
    throw ApiError.forbidden('You can only mark attendance for classes you teach');
  }

  const validStudents = await BatchEnrollment.find({
    organizationId: orgId,
    batchId: session.batchId,
    studentId: { $in: input.records.map((r) => r.studentId) },
    status: 'ACTIVE',
  }).select('studentId').lean();
  const validSet = new Set(validStudents.map((v) => String(v.studentId)));

  const ops = input.records
    .filter((r) => validSet.has(r.studentId))
    .map((r) => ({
      updateOne: {
        filter: { organizationId: orgId, classSessionId: session._id, studentId: new Types.ObjectId(r.studentId) },
        update: {
          $set: {
            batchId: session.batchId,
            courseId: session.courseId,
            date: session.date,
            status: r.status,
            remarks: r.remarks,
            markedBy: auth.userId,
            markedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

  if (!ops.length) throw ApiError.validation('None of the supplied students are enrolled in this batch');

  const result = await Attendance.bulkWrite(ops as never[]);
  session.attendanceMarked = true;
  if (session.status === 'SCHEDULED' && dayjs(session.endAt).isBefore(dayjs())) session.status = 'COMPLETED';
  await session.save();

  return {
    marked: (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0),
    skipped: input.records.length - ops.length,
    classSessionId: String(session._id),
  };
}

export async function studentAttendanceSummary(orgId: Types.ObjectId, studentId: Types.ObjectId, months = 6) {
  const since = dayjs().subtract(months, 'month').startOf('month').toDate();
  const [byStatus, monthly, recent] = await Promise.all([
    Attendance.aggregate<{ _id: string; c: number }>([
      { $match: { organizationId: orgId, studentId } },
      { $group: { _id: '$status', c: { $sum: 1 } } },
    ]),
    Attendance.aggregate<{ _id: { y: number; m: number; s: string }; c: number }>([
      { $match: { organizationId: orgId, studentId, date: { $gte: since } } },
      { $group: { _id: { y: { $year: '$date' }, m: { $month: '$date' }, s: '$status' }, c: { $sum: 1 } } },
    ]),
    Attendance.find({ organizationId: orgId, studentId }).sort({ date: -1 }).limit(60)
      .populate('batchId', 'name').populate('classSessionId', 'title startTime endTime').lean(),
  ]);

  const get = (s: string) => byStatus.find((b) => b._id === s)?.c ?? 0;
  const present = get('PRESENT'); const late = get('LATE'); const absent = get('ABSENT'); const leave = get('LEAVE');
  const total = present + late + absent + leave;

  const monthlySeries = Array.from({ length: months }, (_, i) => {
    const d = dayjs().subtract(months - 1 - i, 'month');
    const rows = monthly.filter((r) => r._id.y === d.year() && r._id.m === d.month() + 1);
    const p = rows.find((r) => r._id.s === 'PRESENT')?.c ?? 0;
    const l = rows.find((r) => r._id.s === 'LATE')?.c ?? 0;
    const a = rows.find((r) => r._id.s === 'ABSENT')?.c ?? 0;
    const lv = rows.find((r) => r._id.s === 'LEAVE')?.c ?? 0;
    const t = p + l + a + lv;
    return { month: d.format('MMM YY'), present: p, absent: a, late: l, leave: lv, percentage: t ? Math.round(((p + l) / t) * 100) : 0 };
  });

  return {
    summary: { present, absent, late, leave, total, percentage: total ? Math.round(((present + late) / total) * 1000) / 10 : 0 },
    monthly: monthlySeries,
    recent,
  };
}
