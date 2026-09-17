import { Types } from 'mongoose';
import { AuthContext } from '../types/express';
import {
  Announcement, Communication, Notification, Student, Parent, Teacher, Lead, User,
  CourseEnrollment, BatchEnrollment,
} from '../models';
import { getMessageProvider } from './messaging';
import { notifyMany } from './notification.service';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import type { CommChannel } from '../models/Communication';

/** Resolves the set of user ids that should receive an announcement. */
export async function resolveAnnouncementAudience(
  organizationId: Types.ObjectId,
  announcement: { audience: string; courseId?: Types.ObjectId; batchId?: Types.ObjectId },
): Promise<Types.ObjectId[]> {
  const { audience, courseId, batchId } = announcement;

  if (audience === 'COURSE' && courseId) {
    const enrollments = await CourseEnrollment.find({ organizationId, courseId, status: { $in: ['ACTIVE', 'COMPLETED'] } })
      .select('studentId').lean();
    const students = await Student.find({ _id: { $in: enrollments.map((e) => e.studentId) }, organizationId })
      .select('userId').lean();
    return students.map((s) => s.userId).filter(Boolean) as Types.ObjectId[];
  }

  if (audience === 'BATCH' && batchId) {
    const enrollments = await BatchEnrollment.find({ organizationId, batchId, status: 'ACTIVE' }).select('studentId').lean();
    const students = await Student.find({ _id: { $in: enrollments.map((e) => e.studentId) }, organizationId })
      .select('userId').lean();
    return students.map((s) => s.userId).filter(Boolean) as Types.ObjectId[];
  }

  const roleMap: Record<string, string[]> = {
    ALL: ['ORGANIZATION_ADMIN', 'COUNSELOR', 'TEACHER', 'ACCOUNTANT', 'STAFF', 'STUDENT', 'PARENT'],
    STUDENTS: ['STUDENT'],
    PARENTS: ['PARENT'],
    TEACHERS: ['TEACHER'],
    STAFF: ['ORGANIZATION_ADMIN', 'COUNSELOR', 'ACCOUNTANT', 'STAFF'],
  };
  const roles = roleMap[audience] ?? roleMap.ALL;
  const users = await User.find({ organizationId, role: { $in: roles }, isActive: true }).select('_id').lean();
  return users.map((u) => u._id);
}

export async function publishAnnouncement(
  organizationId: Types.ObjectId,
  announcement: { _id: Types.ObjectId; title: string; audience: string; courseId?: Types.ObjectId; batchId?: Types.ObjectId; priority: string },
) {
  const userIds = await resolveAnnouncementAudience(organizationId, announcement);
  await notifyMany(
    userIds.map((userId) => ({
      organizationId,
      userId,
      type: 'ANNOUNCEMENT' as const,
      title: announcement.title,
      message: 'A new announcement has been published.',
      // Portal-less on purpose: one announcement reaches admins, teachers,
      // students and parents at once, and each portal mounts its pages under a
      // different prefix. The client resolves this against the signed-in portal
      // (see client/src/lib/notificationPath.ts) and deep-links via entityId.
      link: '/announcements',
      entity: 'Announcement',
      entityId: String(announcement._id),
      priority: announcement.priority === 'URGENT' || announcement.priority === 'HIGH' ? ('HIGH' as const) : ('NORMAL' as const),
    })),
  );
  return { notified: userIds.length };
}

interface Recipient { id: Types.ObjectId; name: string; address?: string }

async function loadRecipients(
  organizationId: Types.ObjectId,
  recipientType: string,
  ids: string[],
  channel: CommChannel,
): Promise<Recipient[]> {
  const objectIds = ids.map((i) => new Types.ObjectId(i));
  const useEmail = channel === 'EMAIL';

  switch (recipientType) {
    case 'STUDENT': {
      const rows = await Student.find({ _id: { $in: objectIds }, organizationId }).select('name email phone').lean();
      return rows.map((r) => ({ id: r._id, name: r.name, address: useEmail ? r.email : r.phone }));
    }
    case 'PARENT': {
      const rows = await Parent.find({ _id: { $in: objectIds }, organizationId }).select('name email phone').lean();
      return rows.map((r) => ({ id: r._id, name: r.name, address: useEmail ? r.email : r.phone }));
    }
    case 'TEACHER': {
      const rows = await Teacher.find({ _id: { $in: objectIds }, organizationId }).select('name email phone').lean();
      return rows.map((r) => ({ id: r._id, name: r.name, address: useEmail ? r.email : r.phone }));
    }
    case 'LEAD': {
      const rows = await Lead.find({ _id: { $in: objectIds }, organizationId }).select('name email phone').lean();
      return rows.map((r) => ({ id: r._id, name: r.name, address: useEmail ? r.email : r.phone }));
    }
    case 'USER': {
      const rows = await User.find({ _id: { $in: objectIds }, organizationId }).select('name email phone').lean();
      return rows.map((r) => ({ id: r._id, name: r.name, address: useEmail ? r.email : r.phone }));
    }
    default:
      throw ApiError.badRequest('Unsupported recipient type');
  }
}

/**
 * Sends a message through the configured provider and records every attempt in the
 * communication history. When no provider is configured the record is stored with
 * status NOT_CONFIGURED — we never claim a delivery that did not happen.
 */
export async function sendMessages(
  organizationId: Types.ObjectId,
  auth: AuthContext,
  input: { channel: CommChannel; subject?: string; body: string; recipientType: string; recipientIds: string[] },
) {
  const recipients = await loadRecipients(organizationId, input.recipientType, input.recipientIds, input.channel);
  if (!recipients.length) throw ApiError.notFound('No matching recipients were found in your academy');

  const provider = getMessageProvider(input.channel);
  const docs: Record<string, unknown>[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    if (!recipient.address) {
      skipped += 1;
      docs.push({
        organizationId, channel: input.channel, direction: 'OUTBOUND', subject: input.subject, body: input.body,
        recipientType: input.recipientType, recipientId: recipient.id, recipientName: recipient.name,
        status: 'FAILED', failureReason: `No ${input.channel === 'EMAIL' ? 'email address' : 'phone number'} on record`,
        providerName: provider.name, sentBy: auth.userId, sentByName: auth.name,
      });
      continue;
    }

    let result;
    try {
      result = await provider.send({ to: recipient.address, subject: input.subject, body: input.body });
    } catch (err) {
      result = { status: 'FAILED' as const, providerName: provider.name, failureReason: (err as Error).message };
      logger.warn('Message send threw', (err as Error).message);
    }

    if (result.status === 'SENT') sent += 1;
    else if (result.status === 'FAILED') failed += 1;

    docs.push({
      organizationId, channel: input.channel, direction: 'OUTBOUND', subject: input.subject, body: input.body,
      recipientType: input.recipientType, recipientId: recipient.id, recipientName: recipient.name,
      recipientAddress: recipient.address,
      status: result.status, providerName: result.providerName, providerMessageId: result.providerMessageId,
      failureReason: result.failureReason,
      sentBy: auth.userId, sentByName: auth.name,
      sentAt: result.status === 'SENT' ? new Date() : undefined,
    });
  }

  const created = await Communication.insertMany(docs);
  const notConfigured = docs.filter((d) => d.status === 'NOT_CONFIGURED').length;

  return {
    total: recipients.length,
    sent,
    failed,
    skipped,
    notConfigured,
    providerConfigured: provider.configured,
    message: provider.configured
      ? `${sent} message(s) sent, ${failed + skipped} failed.`
      : `${provider.channel} provider is not configured — ${docs.length} message(s) were logged to communication history but NOT delivered.`,
    records: created.map((c) => c._id),
  };
}

export async function markNotificationsRead(userId: Types.ObjectId, ids?: string[]) {
  const filter: Record<string, unknown> = { userId, isRead: false };
  if (ids?.length) filter._id = { $in: ids.map((i) => new Types.ObjectId(i)) };
  const r = await Notification.updateMany(filter, { isRead: true, readAt: new Date() });
  return { updated: r.modifiedCount };
}

export async function markAnnouncementRead(organizationId: Types.ObjectId, announcementId: string, userId: Types.ObjectId) {
  const r = await Announcement.updateOne(
    { _id: announcementId, organizationId },
    { $addToSet: { readBy: userId } },
  );
  if (!r.matchedCount) throw ApiError.notFound('Announcement not found');
  return { read: true };
}
