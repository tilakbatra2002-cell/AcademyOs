import { Types } from 'mongoose';
import dayjs from 'dayjs';
import { Subscription } from '../models/Subscription';
import { Organization } from '../models/Organization';
import { Student } from '../models/Student';
import { User } from '../models/User';
import { Course } from '../models/Course';
import { Batch } from '../models/Batch';
import { Video } from '../models/Video';
import { PLANS, PlanCode, planLimits } from '../config/plans';
import { STAFF_ROLES } from '../config/rbac';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

export type LimitKey = 'students' | 'staff' | 'courses' | 'batches' | 'videos' | 'storageBytes';

export async function createTrialSubscription(organizationId: Types.ObjectId, plan: PlanCode = 'STARTER', trialDays = env.TRIAL_DAYS) {
  const trialEndsAt = dayjs().add(trialDays, 'day').toDate();
  return Subscription.create({
    organizationId,
    plan,
    status: 'TRIALING',
    billingCycle: 'MONTHLY',
    amount: PLANS[plan].monthlyPrice,
    currency: 'INR',
    trialEndsAt,
    currentPeriodStart: new Date(),
    currentPeriodEnd: trialEndsAt,
    limits: planLimits(plan),
    usage: { storageBytes: 0 },
    invoices: [],
  });
}

/** Live usage counts computed with countDocuments — never by loading collections. */
export async function getUsage(organizationId: Types.ObjectId) {
  const [students, staff, courses, batches, videos, sub] = await Promise.all([
    Student.countDocuments({ organizationId, status: { $ne: 'DROPPED' } }),
    User.countDocuments({ organizationId, role: { $in: STAFF_ROLES }, isActive: true }),
    Course.countDocuments({ organizationId, status: { $ne: 'ARCHIVED' } }),
    Batch.countDocuments({ organizationId, status: { $ne: 'CANCELLED' } }),
    Video.countDocuments({ organizationId }),
    Subscription.findOne({ organizationId }).lean(),
  ]);
  const storageAgg = await Video.aggregate<{ total: number }>([
    { $match: { organizationId } },
    { $group: { _id: null, total: { $sum: '$sizeBytes' } } },
  ]);
  const storageBytes = storageAgg[0]?.total ?? 0;
  const limits = sub?.limits ?? planLimits('STARTER');

  return {
    students: { used: students, limit: limits.students },
    staff: { used: staff, limit: limits.staff },
    courses: { used: courses, limit: limits.courses },
    batches: { used: batches, limit: limits.batches },
    videos: { used: videos, limit: limits.videos },
    storageBytes: { used: storageBytes, limit: limits.storageBytes },
  };
}

/** Throws PLAN_LIMIT_EXCEEDED when creating another record would breach the plan. */
export async function assertWithinLimit(organizationId: Types.ObjectId, key: LimitKey, increment = 1): Promise<void> {
  const usage = await getUsage(organizationId);
  const entry = usage[key];
  if (!entry) return;
  if (entry.used + increment > entry.limit) {
    throw ApiError.planLimit(
      `Your plan allows ${entry.limit} ${labelFor(key)} — you are using ${entry.used}. Upgrade your subscription to add more.`,
    );
  }
}

function labelFor(key: LimitKey): string {
  switch (key) {
    case 'students': return 'students';
    case 'staff': return 'staff accounts';
    case 'courses': return 'courses';
    case 'batches': return 'batches';
    case 'videos': return 'videos';
    case 'storageBytes': return 'bytes of storage';
  }
}

export async function getSubscriptionSummary(organizationId: Types.ObjectId) {
  const [sub, org, usage] = await Promise.all([
    Subscription.findOne({ organizationId }).lean(),
    Organization.findById(organizationId).lean(),
    getUsage(organizationId),
  ]);
  if (!sub || !org) throw ApiError.notFound('Subscription not found');

  const now = dayjs();
  const trialEnds = sub.trialEndsAt ? dayjs(sub.trialEndsAt) : null;
  const trialDaysRemaining = trialEnds ? Math.max(0, trialEnds.diff(now, 'day')) : null;
  const isTrial = sub.status === 'TRIALING';
  const trialExpired = Boolean(isTrial && trialEnds && trialEnds.isBefore(now));

  return {
    plan: sub.plan,
    planName: PLANS[sub.plan as PlanCode]?.name ?? sub.plan,
    status: sub.status,
    billingCycle: sub.billingCycle,
    amount: sub.amount,
    currency: sub.currency,
    trialEndsAt: sub.trialEndsAt ?? null,
    trialDaysRemaining,
    trialExpired,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    limits: sub.limits,
    usage,
    invoices: sub.invoices ?? [],
    organizationStatus: org.status,
    features: PLANS[sub.plan as PlanCode]?.features ?? [],
    allPlans: Object.values(PLANS),
  };
}
