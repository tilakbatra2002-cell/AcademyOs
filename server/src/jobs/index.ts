import dayjs from 'dayjs';
import { logger } from '../utils/logger';
import { refreshOverdueInstallments } from '../services/finance.service';
import { Organization, Subscription, FollowUp, FeeInstallment, Student, ClassSession, Notification } from '../models';
import { notifyMany } from '../services/notification.service';
import { isTest } from '../config/env';

const timers: NodeJS.Timeout[] = [];

/** Marks installments past their due date as OVERDUE, across every tenant. */
async function overdueJob() {
  try {
    const result = await refreshOverdueInstallments();
    if (result.updated) logger.info(`[jobs] marked ${result.updated} installment(s) overdue`);
  } catch (err) {
    logger.warn('[jobs] overdue installment sweep failed', (err as Error).message);
  }
}

/** Expires trials whose end date has passed and suspends non-paying organizations. */
async function trialExpiryJob() {
  try {
    const now = new Date();
    const expiring = await Subscription.find({ status: 'TRIALING', trialEndsAt: { $lt: now } }).lean();
    for (const sub of expiring) {
      await Subscription.updateOne({ _id: sub._id }, { status: 'EXPIRED' });
      const org = await Organization.findById(sub.organizationId);
      if (org && org.status === 'TRIAL') {
        org.status = 'EXPIRED';
        await org.save();
        logger.info(`[jobs] trial expired for organization ${org.name}`);
      }
    }
  } catch (err) {
    logger.warn('[jobs] trial expiry sweep failed', (err as Error).message);
  }
}

/** Sends in-app reminders for fees due tomorrow and follow-ups due today. */
async function reminderJob() {
  try {
    const startOfToday = dayjs().startOf('day').toDate();
    const endOfToday = dayjs().endOf('day').toDate();
    const tomorrowStart = dayjs().add(1, 'day').startOf('day').toDate();
    const tomorrowEnd = dayjs().add(1, 'day').endOf('day').toDate();

    // Fee reminders
    const dueInstallments = await FeeInstallment.find({
      status: { $in: ['PENDING', 'PARTIAL'] },
      dueDate: { $gte: tomorrowStart, $lte: tomorrowEnd },
    }).limit(2000).lean();

    const students = await Student.find({ _id: { $in: dueInstallments.map((i) => i.studentId) } })
      .select('userId organizationId name').lean();
    const studentMap = new Map(students.map((s) => [String(s._id), s]));

    const feeNotifications = dueInstallments
      .map((i) => {
        const student = studentMap.get(String(i.studentId));
        if (!student?.userId) return null;
        return {
          organizationId: i.organizationId,
          userId: student.userId,
          type: 'FEE_DUE' as const,
          title: 'Fee due tomorrow',
          message: `${i.title}: ${Math.round(i.amount - i.paidAmount)} is due on ${dayjs(i.dueDate).format('DD MMM YYYY')}.`,
          link: '/student/fees',
          entity: 'FeeInstallment',
          entityId: String(i._id),
          priority: 'HIGH' as const,
        };
      })
      .filter(Boolean) as Parameters<typeof notifyMany>[0];

    // Skip duplicates already sent today
    const fresh = [];
    for (const n of feeNotifications) {
      const exists = await Notification.exists({
        userId: n.userId, entityId: n.entityId, type: 'FEE_DUE', createdAt: { $gte: startOfToday },
      });
      if (!exists) fresh.push(n);
    }
    await notifyMany(fresh);

    // Follow-up reminders for counselors
    const followUps = await FollowUp.find({
      status: { $in: ['PENDING', 'RESCHEDULED'] },
      scheduledAt: { $gte: startOfToday, $lte: endOfToday },
    }).limit(1000).lean();

    const followUpNotifications = [];
    for (const f of followUps) {
      if (!f.assignedTo) continue;
      const exists = await Notification.exists({
        userId: f.assignedTo, entityId: String(f._id), type: 'FOLLOW_UP', createdAt: { $gte: startOfToday },
      });
      if (exists) continue;
      followUpNotifications.push({
        organizationId: f.organizationId,
        userId: f.assignedTo,
        type: 'FOLLOW_UP' as const,
        title: 'Follow-up due today',
        message: `${f.mode} follow-up scheduled at ${dayjs(f.scheduledAt).format('hh:mm A')}`,
        link: '/admin/follow-ups',
        entity: 'FollowUp',
        entityId: String(f._id),
        priority: 'HIGH' as const,
      });
    }
    await notifyMany(followUpNotifications);

    if (fresh.length || followUpNotifications.length) {
      logger.info(`[jobs] sent ${fresh.length} fee and ${followUpNotifications.length} follow-up reminders`);
    }
  } catch (err) {
    logger.warn('[jobs] reminder sweep failed', (err as Error).message);
  }
}

/** Closes class sessions that have ended but were never marked complete. */
async function closeStaleClassesJob() {
  try {
    const r = await ClassSession.updateMany(
      { status: { $in: ['SCHEDULED', 'ONGOING'] }, endAt: { $lt: dayjs().subtract(2, 'hour').toDate() } },
      { status: 'COMPLETED' },
    );
    if (r.modifiedCount) logger.info(`[jobs] auto-completed ${r.modifiedCount} past class session(s)`);
  } catch (err) {
    logger.warn('[jobs] class close sweep failed', (err as Error).message);
  }
}

const HOUR = 60 * 60 * 1000;

/** Starts the lightweight in-process scheduler. No external cron dependency required. */
export function startJobs(): void {
  if (isTest) return;

  // Run once shortly after boot so a freshly started server has accurate state.
  const boot = setTimeout(() => {
    void overdueJob();
    void trialExpiryJob();
    void closeStaleClassesJob();
  }, 10_000);
  timers.push(boot);

  timers.push(setInterval(() => void overdueJob(), 6 * HOUR));
  timers.push(setInterval(() => void trialExpiryJob(), 12 * HOUR));
  timers.push(setInterval(() => void reminderJob(), 12 * HOUR));
  timers.push(setInterval(() => void closeStaleClassesJob(), HOUR));

  logger.info('Background jobs scheduled (overdue fees, trial expiry, reminders, class close-out)');
}

export function stopJobs(): void {
  timers.forEach((t) => clearTimeout(t as NodeJS.Timeout));
  timers.length = 0;
}

export const __jobsForTesting = { overdueJob, trialExpiryJob, reminderJob, closeStaleClassesJob };
