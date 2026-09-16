import { Request, Response } from 'express';
import { Types } from 'mongoose';
import dayjs from 'dayjs';
import { asyncHandler, ok, created, paginated } from '../utils/http';
import { requireAuth, requireOrg } from '../middleware/auth';
import { recordAudit } from '../services/audit.service';
import {
  Announcement, Communication, Notification, CalendarEvent, DocumentFile,
  Course, Batch, ClassSession, Exam, Assignment, FeeInstallment, Student, CourseEnrollment,
  Organization,
} from '../models';
import { listScoped, updateScoped, deleteScoped, assertBelongsToOrg } from '../services/crud.factory';
import { ApiError } from '../utils/ApiError';
import { toObjectId } from '../utils/ids';
import { dateRangeFilter } from '../utils/query';
import * as commService from '../services/communication.service';
import { messagingStatus } from '../services/messaging';
import { getStorage } from '../services/storage';
import { unreadCount } from '../services/notification.service';

/* ------------------------------- Announcements ------------------------------ */

export const listAnnouncements = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; audience?: string; status?: string; priority?: string; sort?: string; order?: 'asc' | 'desc' };
  const auth = requireAuth(req);
  const orgId = requireOrg(req);
  const filter: Record<string, unknown> = {};
  if (q.audience) filter.audience = q.audience;
  if (q.status) filter.status = q.status;
  if (q.priority) filter.priority = q.priority;

  // Portal users only ever see published announcements aimed at them.
  if (['STUDENT', 'PARENT', 'TEACHER'].includes(auth.role)) {
    filter.status = 'PUBLISHED';
    filter.$or = [
      { audience: 'ALL' },
      { audience: auth.role === 'STUDENT' ? 'STUDENTS' : auth.role === 'PARENT' ? 'PARENTS' : 'TEACHERS' },
      ...(auth.role === 'STUDENT' && auth.studentId
        ? [{ audience: 'COURSE', courseId: { $in: (await CourseEnrollment.find({ organizationId: orgId, studentId: auth.studentId }).select('courseId').lean()).map((e) => e.courseId) } }]
        : []),
    ];
    filter.$and = [{ $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: new Date() } }] }];
  }

  const { items, total } = await listScoped(Announcement, {
    organizationId: orgId, page: q.page, limit: q.limit, search: q.search,
    sort: q.sort ?? 'publishedAt', order: q.order ?? 'desc',
    searchFields: ['title', 'body'], filter,
    populate: [{ path: 'courseId', select: 'title' }, { path: 'batchId', select: 'name' }],
    defaultSort: 'publishedAt',
  });

  const withRead = items.map((a) => {
    const row = a as { readBy?: Types.ObjectId[] };
    return { ...a, isRead: (row.readBy ?? []).some((u) => String(u) === String(auth.userId)), readCount: (row.readBy ?? []).length, readBy: undefined };
  });
  // Pinned first
  withRead.sort((a, b) => Number((b as { isPinned?: boolean }).isPinned ?? false) - Number((a as { isPinned?: boolean }).isPinned ?? false));
  return paginated(res, withRead, total, q.page, q.limit);
});

export const createAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  if (req.body.courseId) await assertBelongsToOrg(Course, req.body.courseId, orgId, 'Course');
  if (req.body.batchId) await assertBelongsToOrg(Batch, req.body.batchId, orgId, 'Batch');
  if (req.body.audience === 'COURSE' && !req.body.courseId) throw ApiError.validation('Select a course for a course announcement', { courseId: 'Required' });
  if (req.body.audience === 'BATCH' && !req.body.batchId) throw ApiError.validation('Select a batch for a batch announcement', { batchId: 'Required' });

  const { notify, ...rest } = req.body;
  const announcement = await Announcement.create({
    ...rest,
    courseId: rest.courseId || undefined,
    batchId: rest.batchId || undefined,
    expiresAt: rest.expiresAt ? new Date(rest.expiresAt) : undefined,
    organizationId: orgId,
    createdBy: auth.userId,
    createdByName: auth.name,
    publishedAt: new Date(),
  });

  let notified = 0;
  if (notify !== false && announcement.status === 'PUBLISHED') {
    ({ notified } = await commService.publishAnnouncement(orgId, announcement));
  }
  await recordAudit(req, { action: 'ANNOUNCEMENT_CREATED', entity: 'Announcement', entityId: announcement._id, metadata: { notified } });
  return created(res, { announcement: announcement.toObject(), notified });
});

export const updateAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  const { notify, ...rest } = req.body;
  void notify;
  const a = await updateScoped(Announcement, req.params.id, requireOrg(req), rest, 'Announcement not found');
  await recordAudit(req, { action: 'ANNOUNCEMENT_UPDATED', entity: 'Announcement', entityId: req.params.id });
  return ok(res, a);
});

export const deleteAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  await deleteScoped(Announcement, req.params.id, requireOrg(req), 'Announcement not found');
  await recordAudit(req, { action: 'ANNOUNCEMENT_DELETED', entity: 'Announcement', entityId: req.params.id });
  return ok(res, { id: req.params.id });
});

export const readAnnouncement = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await commService.markAnnouncementRead(requireOrg(req), req.params.id, requireAuth(req).userId));
});

/* ------------------------------- Communication ------------------------------- */

export const listCommunications = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; channel?: string; status?: string; recipientType?: string; from?: string; to?: string; sort?: string; order?: 'asc' | 'desc' };
  const filter: Record<string, unknown> = {};
  if (q.channel) filter.channel = q.channel;
  if (q.status) filter.status = q.status;
  if (q.recipientType) filter.recipientType = q.recipientType;
  const range = dateRangeFilter(q.from, q.to);
  if (range) filter.createdAt = range;

  const { items, total } = await listScoped(Communication, {
    organizationId: requireOrg(req), page: q.page, limit: q.limit, search: q.search, sort: q.sort, order: q.order,
    searchFields: ['subject', 'body', 'recipientName', 'recipientAddress'], filter,
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const result = await commService.sendMessages(requireOrg(req), requireAuth(req), req.body);
  await recordAudit(req, {
    action: 'MESSAGE_SENT', entity: 'Communication',
    metadata: { channel: req.body.channel, total: result.total, sent: result.sent, failed: result.failed, configured: result.providerConfigured },
  });
  return created(res, result);
});

export const providerStatus = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, messagingStatus());
});

/* ------------------------------- Notifications ------------------------------- */

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const q = req.query as never as { page: number; limit: number; isRead?: string; type?: string };
  const filter: Record<string, unknown> = { userId: auth.userId };
  if (q.isRead) filter.isRead = q.isRead === 'true';
  if (q.type) filter.type = q.type;

  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Notification.countDocuments(filter),
    unreadCount(auth.userId),
  ]);
  return paginated(res, items, total, q.page, q.limit, { unread });
});

export const readNotifications = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : undefined;
  return ok(res, await commService.markNotificationsRead(auth.userId, ids));
});

export const deleteNotification = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const r = await Notification.deleteOne({ _id: req.params.id, userId: auth.userId });
  if (!r.deletedCount) throw ApiError.notFound('Notification not found');
  return ok(res, { id: req.params.id });
});

/* ---------------------------------- Calendar --------------------------------- */

export const calendar = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const q = req.query as never as { from: string; to: string; type?: string };
  const from = dayjs(q.from).startOf('day').toDate();
  const to = dayjs(q.to).endOf('day').toDate();

  const classFilter: Record<string, unknown> = { organizationId: orgId, startAt: { $gte: from, $lte: to }, status: { $ne: 'CANCELLED' } };
  if (auth.role === 'TEACHER' && auth.teacherId) classFilter.teacherId = auth.teacherId;
  if (auth.role === 'STUDENT' && auth.studentId) {
    const batches = await CourseEnrollment.find({ organizationId: orgId, studentId: auth.studentId }).select('batchId').lean();
    classFilter.batchId = { $in: batches.map((b) => b.batchId).filter(Boolean) };
  }

  const [classes, exams, assignments, events, dues] = await Promise.all([
    ClassSession.find(classFilter).select('title startAt endAt room status batchId').populate('batchId', 'name').limit(500).lean(),
    Exam.find({ organizationId: orgId, date: { $gte: from, $lte: to } }).select('title date startTime endTime type').limit(200).lean(),
    Assignment.find({ organizationId: orgId, dueDate: { $gte: from, $lte: to }, status: 'PUBLISHED' }).select('title dueDate').limit(200).lean(),
    CalendarEvent.find({ organizationId: orgId, startAt: { $gte: from, $lte: to } }).limit(300).lean(),
    ['ORGANIZATION_ADMIN', 'ACCOUNTANT'].includes(auth.role)
      ? FeeInstallment.find({ organizationId: orgId, dueDate: { $gte: from, $lte: to }, status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] } })
          .select('title dueDate amount studentId').populate('studentId', 'name').limit(300).lean()
      : Promise.resolve([]),
  ]);

  const items = [
    ...classes.map((c) => ({
      id: String(c._id), type: 'CLASS', title: c.title, start: c.startAt, end: c.endAt,
      meta: { room: c.room, batch: (c.batchId as unknown as { name?: string })?.name }, color: '#4f46e5',
    })),
    ...exams.map((e) => ({ id: String(e._id), type: 'EXAM', title: e.title, start: e.date, end: e.date, meta: { examType: e.type }, color: '#f97316' })),
    ...assignments.map((a) => ({ id: String(a._id), type: 'ASSIGNMENT', title: `Due: ${a.title}`, start: a.dueDate, end: a.dueDate, meta: {}, color: '#0ea5e9' })),
    ...events.map((e) => ({ id: String(e._id), type: e.type, title: e.title, start: e.startAt, end: e.endAt, meta: { location: e.location, description: e.description }, color: e.color ?? '#22c55e' })),
    ...dues.map((d) => ({
      id: String(d._id), type: 'FEE_DUE', title: `Fee due: ${(d.studentId as unknown as { name?: string })?.name ?? ''}`,
      start: d.dueDate, end: d.dueDate, meta: { amount: d.amount }, color: '#ef4444',
    })),
  ].filter((i) => !q.type || i.type === q.type);

  items.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return ok(res, { items, range: { from, to } });
});

export const createEvent = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  if (dayjs(req.body.endAt).isBefore(req.body.startAt)) {
    throw ApiError.validation('End time must be after the start time', { endAt: 'Must be after start' });
  }
  const event = await CalendarEvent.create({
    ...req.body,
    courseId: req.body.courseId || undefined,
    batchId: req.body.batchId || undefined,
    startAt: new Date(req.body.startAt),
    endAt: new Date(req.body.endAt),
    organizationId: orgId,
    createdBy: auth.userId,
  });
  await recordAudit(req, { action: 'EVENT_CREATED', entity: 'CalendarEvent', entityId: event._id });
  return created(res, event.toObject());
});

export const updateEvent = asyncHandler(async (req: Request, res: Response) => {
  const body = { ...req.body };
  if (body.startAt) body.startAt = new Date(body.startAt);
  if (body.endAt) body.endAt = new Date(body.endAt);
  const e = await updateScoped(CalendarEvent, req.params.id, requireOrg(req), body, 'Event not found');
  return ok(res, e);
});

export const deleteEvent = asyncHandler(async (req: Request, res: Response) => {
  await deleteScoped(CalendarEvent, req.params.id, requireOrg(req), 'Event not found');
  return ok(res, { id: req.params.id });
});

/* --------------------------------- Documents --------------------------------- */

export const listDocuments = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; ownerType?: string; ownerId?: string; category?: string; sort?: string; order?: 'asc' | 'desc' };
  const filter: Record<string, unknown> = {};
  if (q.ownerType) filter.ownerType = q.ownerType;
  if (q.ownerId) filter.ownerId = toObjectId(q.ownerId);
  if (q.category) filter.category = q.category;

  const auth = requireAuth(req);
  // Students and parents can only list their own documents.
  if (auth.role === 'STUDENT') {
    filter.ownerType = 'STUDENT';
    filter.ownerId = auth.studentId;
  }

  const { items, total } = await listScoped(DocumentFile, {
    organizationId: requireOrg(req), page: q.page, limit: q.limit, search: q.search, sort: q.sort, order: q.order,
    searchFields: ['title', 'fileName'], filter,
  });
  return paginated(res, items, total, q.page, q.limit);
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const doc = await DocumentFile.findOne({ _id: req.params.id, organizationId: orgId }).lean();
  if (!doc) throw ApiError.notFound('Document not found');
  await getStorage().delete(doc.storageKey).catch(() => undefined);
  await DocumentFile.deleteOne({ _id: doc._id, organizationId: orgId });
  await recordAudit(req, { action: 'DOCUMENT_DELETED', entity: 'DocumentFile', entityId: req.params.id });
  return ok(res, { id: req.params.id });
});

export const documentDownload = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const doc = await DocumentFile.findOne({ _id: req.params.id, organizationId: orgId }).lean();
  if (!doc) throw ApiError.notFound('Document not found');
  if (auth.role === 'STUDENT' && !(doc.ownerType === 'STUDENT' && String(doc.ownerId) === String(auth.studentId)) && doc.visibility === 'PRIVATE') {
    throw ApiError.forbidden('You cannot access this document');
  }
  return ok(res, { url: await getStorage().getSignedUrl(doc.storageKey, 900), fileName: doc.fileName, mimeType: doc.mimeType });
});

/* -------------------------------- Global search ------------------------------ */

export const globalSearch = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const auth = requireAuth(req);
  const { q, limit } = req.query as never as { q: string; limit: number };
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const can = (p: string) => auth.permissions.includes(p as never);

  const [students, leads, courses, batches, teachers] = await Promise.all([
    can('student:read')
      ? Student.find({ organizationId: orgId, $or: [{ name: rx }, { studentCode: rx }, { email: rx }, { phone: rx }] })
          .select('name studentCode email phone photoUrl').limit(limit).lean()
      : [],
    can('lead:read')
      ? (await import('../models')).Lead.find({ organizationId: orgId, $or: [{ name: rx }, { phone: rx }, { email: rx }] })
          .select('name phone email status').limit(limit).lean()
      : [],
    can('course:read')
      ? Course.find({ organizationId: orgId, $or: [{ title: rx }, { code: rx }] }).select('title code status').limit(limit).lean()
      : [],
    can('batch:read')
      ? Batch.find({ organizationId: orgId, $or: [{ name: rx }, { code: rx }] }).select('name code status').limit(limit).lean()
      : [],
    can('teacher:read')
      ? (await import('../models')).Teacher.find({ organizationId: orgId, $or: [{ name: rx }, { email: rx }, { employeeCode: rx }] })
          .select('name email employeeCode').limit(limit).lean()
      : [],
  ]);

  const results = [
    ...students.map((s) => ({ type: 'student', id: String(s._id), title: s.name, subtitle: s.studentCode, link: `/admin/students/${s._id}` })),
    ...leads.map((l) => ({ type: 'lead', id: String(l._id), title: l.name, subtitle: `${l.phone ?? ''} · ${l.status}`, link: `/admin/leads/${l._id}` })),
    ...courses.map((c) => ({ type: 'course', id: String(c._id), title: c.title, subtitle: c.code, link: `/admin/courses/${c._id}` })),
    ...batches.map((b) => ({ type: 'batch', id: String(b._id), title: b.name, subtitle: b.code, link: `/admin/batches/${b._id}` })),
    ...teachers.map((t) => ({ type: 'teacher', id: String(t._id), title: t.name, subtitle: t.employeeCode ?? t.email, link: `/admin/teachers/${t._id}` })),
  ];

  return ok(res, { query: q, count: results.length, results });
});

/* ------------------------------- Org settings -------------------------------- */

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const org = await Organization.findById(requireOrg(req)).lean();
  if (!org) throw ApiError.notFound('Organization not found');
  return ok(res, org);
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const orgId = requireOrg(req);
  const org = await Organization.findById(orgId);
  if (!org) throw ApiError.notFound('Organization not found');

  const { name, email, phone, website, address, branding, settings } = req.body;
  if (name !== undefined) org.name = name;
  if (email !== undefined) org.email = email;
  if (phone !== undefined) org.phone = phone;
  if (website !== undefined) org.website = website;
  if (address) org.address = { ...org.address, ...address };
  if (branding) org.branding = { ...org.branding, ...branding };
  if (settings) org.settings = { ...org.settings, ...settings };
  await org.save();

  await recordAudit(req, { action: 'ORG_SETTINGS_UPDATED', entity: 'Organization', entityId: org._id });
  return ok(res, org.toObject());
});

/** Public branding lookup used by portal login screens (no auth, no sensitive data). */
export const publicBranding = asyncHandler(async (req: Request, res: Response) => {
  const slug = String(req.params.slug ?? '').toLowerCase();
  const org = await Organization.findOne({ slug }).select('name slug branding status').lean();
  if (!org) throw ApiError.notFound('Academy not found');
  return ok(res, { name: org.name, slug: org.slug, branding: org.branding, active: org.status !== 'SUSPENDED' });
});
