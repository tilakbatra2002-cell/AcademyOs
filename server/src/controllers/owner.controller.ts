import { Request, Response } from 'express';
import dayjs from 'dayjs';
import { asyncHandler, ok, created, paginated } from '../utils/http';
import * as ownerService from '../services/owner.service';
import { recordAudit } from '../services/audit.service';
import { requireAuth } from '../middleware/auth';
import { toObjectId } from '../utils/ids';
import { Organization, Subscription, User, AuditLog, Student, Course, Batch, Video } from '../models';
import { PLANS, PlanCode, planLimits } from '../config/plans';
import { ApiError } from '../utils/ApiError';
import { buildSort, searchFilter, dateRangeFilter } from '../utils/query';
import { getUsage } from '../services/subscription.service';
import { hashPassword } from '../services/password.service';
import { generatePassword } from '../utils/ids';
import { STAFF_ROLES } from '../config/rbac';

export const dashboard = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await ownerService.ownerDashboard());
});

export const listOrganizations = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; sort?: string; order: 'asc' | 'desc'; search?: string; status?: string; plan?: string };
  const { items, total } = await ownerService.listOrganizations(q);
  return paginated(res, items, total, q.page, q.limit);
});

export const getOrganization = asyncHandler(async (req: Request, res: Response) => {
  const detail = await ownerService.getOrganizationDetail(toObjectId(req.params.id));
  const usage = await getUsage(toObjectId(req.params.id));
  return ok(res, { ...detail, usage });
});

export const createOrganization = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const result = await ownerService.createOrganization(req.body, auth.userId);
  await recordAudit(req, {
    action: 'ORGANIZATION_CREATED',
    entity: 'Organization',
    entityId: result.organization._id,
    organizationId: result.organization._id,
    metadata: { name: result.organization.name, plan: req.body.plan },
  });
  return created(res, result);
});

export const updateOrganization = asyncHandler(async (req: Request, res: Response) => {
  const id = toObjectId(req.params.id);
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(req.body)) {
    if (v === undefined) continue;
    if (k === 'branding' || k === 'settings' || k === 'address') {
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (sv !== undefined) update[`${k}.${sk}`] = sv;
      }
    } else update[k] = v;
  }
  const org = await Organization.findByIdAndUpdate(id, update, { new: true, runValidators: true }).lean();
  if (!org) throw ApiError.notFound('Academy not found');
  await recordAudit(req, { action: 'ORGANIZATION_UPDATED', entity: 'Organization', entityId: id, organizationId: id, metadata: update });
  return ok(res, org);
});

export const suspendOrganization = asyncHandler(async (req: Request, res: Response) => {
  const id = toObjectId(req.params.id);
  const org = await ownerService.setOrganizationStatus(id, 'SUSPENDED', req.body.reason);
  await recordAudit(req, { action: 'ORGANIZATION_SUSPENDED', entity: 'Organization', entityId: id, organizationId: id, metadata: { reason: req.body.reason } });
  return ok(res, org);
});

export const activateOrganization = asyncHandler(async (req: Request, res: Response) => {
  const id = toObjectId(req.params.id);
  const org = await ownerService.setOrganizationStatus(id, 'ACTIVE');
  await recordAudit(req, { action: 'ORGANIZATION_ACTIVATED', entity: 'Organization', entityId: id, organizationId: id });
  return ok(res, org);
});

export const resetOrganizationStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = toObjectId(req.params.id);
  const org = await ownerService.setOrganizationStatus(id, 'TRIAL');
  await recordAudit(req, { action: 'ORGANIZATION_STATUS_RESET', entity: 'Organization', entityId: id, organizationId: id });
  return ok(res, org);
});

export const organizationUsage = asyncHandler(async (req: Request, res: Response) => {
  const id = toObjectId(req.params.id);
  return ok(res, await getUsage(id));
});

export const listSubscriptions = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; status?: string; plan?: string; sort?: string; order: 'asc' | 'desc' };
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.plan) filter.plan = q.plan;

  if (q.search) {
    const orgs = await Organization.find(searchFilter(q.search, ['name', 'code', 'email'])).select('_id').lean();
    filter.organizationId = { $in: orgs.map((o) => o._id) };
  }

  const [subs, total] = await Promise.all([
    Subscription.find(filter).sort(buildSort(q.sort, q.order)).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Subscription.countDocuments(filter),
  ]);
  const orgs = await Organization.find({ _id: { $in: subs.map((s) => s.organizationId) } }).select('name code status email').lean();
  const map = new Map(orgs.map((o) => [String(o._id), o]));
  const items = subs.map((s) => ({
    ...s,
    organization: map.get(String(s.organizationId)) ?? null,
    trialDaysRemaining: s.trialEndsAt ? Math.max(0, dayjs(s.trialEndsAt).diff(dayjs(), 'day')) : null,
  }));
  return paginated(res, items, total, q.page, q.limit);
});

export const updateSubscription = asyncHandler(async (req: Request, res: Response) => {
  const orgId = toObjectId(req.params.id);
  const sub = await Subscription.findOne({ organizationId: orgId });
  if (!sub) throw ApiError.notFound('Subscription not found');

  if (req.body.plan) {
    sub.plan = req.body.plan as PlanCode;
    sub.limits = planLimits(req.body.plan as PlanCode);
    sub.amount = req.body.amount ?? (sub.billingCycle === 'YEARLY' ? PLANS[sub.plan].yearlyPrice : PLANS[sub.plan].monthlyPrice);
  }
  if (req.body.billingCycle) {
    sub.billingCycle = req.body.billingCycle;
    sub.amount = req.body.amount ?? (sub.billingCycle === 'YEARLY' ? PLANS[sub.plan].yearlyPrice : PLANS[sub.plan].monthlyPrice);
  }
  if (req.body.amount !== undefined) sub.amount = req.body.amount;
  if (req.body.status) {
    sub.status = req.body.status;
    if (req.body.status === 'ACTIVE') {
      await Organization.updateOne({ _id: orgId }, { status: 'ACTIVE', $unset: { suspendedAt: 1, suspensionReason: 1 } });
    }
  }
  if (req.body.extendDays) {
    const base = dayjs(sub.currentPeriodEnd).isAfter(dayjs()) ? dayjs(sub.currentPeriodEnd) : dayjs();
    sub.currentPeriodEnd = base.add(req.body.extendDays, 'day').toDate();
    if (sub.status === 'TRIALING') sub.trialEndsAt = sub.currentPeriodEnd;
  }
  await sub.save();
  await recordAudit(req, { action: 'SUBSCRIPTION_UPDATED', entity: 'Subscription', entityId: sub._id, organizationId: orgId, metadata: req.body });
  return ok(res, sub.toObject());
});

export const recordSubscriptionPayment = asyncHandler(async (req: Request, res: Response) => {
  const orgId = toObjectId(req.params.id);
  const sub = await Subscription.findOne({ organizationId: orgId });
  if (!sub) throw ApiError.notFound('Subscription not found');

  const number = `PLTINV-${dayjs().format('YYYYMM')}-${String(sub.invoices.length + 1).padStart(3, '0')}`;
  sub.invoices.push({
    number,
    amount: req.body.amount,
    status: 'PAID',
    issuedAt: new Date(),
    paidAt: new Date(),
    method: req.body.method,
    note: req.body.note,
  });
  sub.status = 'ACTIVE';
  sub.currentPeriodStart = new Date();
  sub.currentPeriodEnd = dayjs().add(sub.billingCycle === 'YEARLY' ? 1 : 1, sub.billingCycle === 'YEARLY' ? 'year' : 'month').toDate();
  await sub.save();
  await Organization.updateOne({ _id: orgId }, { status: 'ACTIVE' });
  await recordAudit(req, { action: 'SUBSCRIPTION_PAYMENT_RECORDED', entity: 'Subscription', entityId: sub._id, organizationId: orgId, metadata: { amount: req.body.amount, number } });
  return created(res, sub.toObject());
});

export const createOrgAdmin = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const orgId = toObjectId(req.params.id);
  const result = await ownerService.createOrganizationAdmin(orgId, req.body, auth.userId);
  await recordAudit(req, { action: 'ORG_ADMIN_CREATED', entity: 'User', entityId: result.user._id, organizationId: orgId, metadata: { email: req.body.email } });
  return created(res, { user: { ...result.user, passwordHash: undefined }, credentials: result.credentials });
});

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; search?: string; organizationId?: string; role?: string; isActive?: string; sort?: string; order: 'asc' | 'desc' };
  const filter: Record<string, unknown> = {};
  if (q.organizationId) filter.organizationId = toObjectId(q.organizationId);
  if (q.role) filter.role = q.role;
  if (q.isActive) filter.isActive = q.isActive === 'true';
  Object.assign(filter, searchFilter(q.search, ['name', 'email']));

  const [users, total] = await Promise.all([
    User.find(filter).sort(buildSort(q.sort, q.order)).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    User.countDocuments(filter),
  ]);
  const orgs = await Organization.find({ _id: { $in: users.map((u) => u.organizationId).filter(Boolean) } }).select('name code').lean();
  const map = new Map(orgs.map((o) => [String(o._id), o]));
  return paginated(
    res,
    users.map((u) => ({ ...u, organization: u.organizationId ? map.get(String(u.organizationId)) ?? null : null })),
    total, q.page, q.limit,
  );
});

export const toggleUserActive = asyncHandler(async (req: Request, res: Response) => {
  const id = toObjectId(req.params.userId);
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'SAAS_OWNER' && String(user._id) === String(requireAuth(req).userId)) {
    throw ApiError.badRequest('You cannot deactivate your own owner account');
  }
  user.isActive = !user.isActive;
  user.tokenVersion += 1;
  await user.save();
  await recordAudit(req, {
    action: user.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    entity: 'User', entityId: user._id, organizationId: user.organizationId ?? null,
  });
  return ok(res, { id: String(user._id), isActive: user.isActive });
});

export const resetUserPassword = asyncHandler(async (req: Request, res: Response) => {
  const id = toObjectId(req.params.userId);
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  const password = generatePassword();
  user.passwordHash = await hashPassword(password);
  user.mustChangePassword = true;
  user.tokenVersion += 1;
  await user.save();
  await recordAudit(req, { action: 'USER_PASSWORD_RESET', entity: 'User', entityId: user._id, organizationId: user.organizationId ?? null });
  return ok(res, { credentials: { email: user.email, password } });
});

export const reports = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await ownerService.platformReports());
});

export const auditLogs = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query as never as { page: number; limit: number; organizationId?: string; action?: string; entity?: string; from?: string; to?: string; search?: string };
  const filter: Record<string, unknown> = {};
  if (q.organizationId) filter.organizationId = toObjectId(q.organizationId);
  if (q.action) filter.action = q.action;
  if (q.entity) filter.entity = q.entity;
  const range = dateRangeFilter(q.from, q.to);
  if (range) filter.createdAt = range;
  Object.assign(filter, searchFilter(q.search, ['userName', 'action', 'entity']));

  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  const orgIds = [...new Set(logs.map((l) => l.organizationId).filter(Boolean))];
  const orgs = await Organization.find({ _id: { $in: orgIds } }).select('name code').lean();
  const map = new Map(orgs.map((o) => [String(o._id), o.name]));
  return paginated(
    res,
    logs.map((l) => ({ ...l, organizationName: l.organizationId ? map.get(String(l.organizationId)) ?? null : 'Platform' })),
    total, q.page, q.limit,
  );
});

export const platformUsage = asyncHandler(async (_req: Request, res: Response) => {
  const orgs = await Organization.find({}).select('name code status').lean();
  const ids = orgs.map((o) => o._id);
  const [subs, students, courses, batches, videos, storage] = await Promise.all([
    Subscription.find({ organizationId: { $in: ids } }).lean(),
    Student.aggregate([{ $match: { organizationId: { $in: ids } } }, { $group: { _id: '$organizationId', c: { $sum: 1 } } }]),
    Course.aggregate([{ $match: { organizationId: { $in: ids } } }, { $group: { _id: '$organizationId', c: { $sum: 1 } } }]),
    Batch.aggregate([{ $match: { organizationId: { $in: ids } } }, { $group: { _id: '$organizationId', c: { $sum: 1 } } }]),
    Video.aggregate([{ $match: { organizationId: { $in: ids } } }, { $group: { _id: '$organizationId', c: { $sum: 1 } } }]),
    Video.aggregate([{ $match: { organizationId: { $in: ids } } }, { $group: { _id: '$organizationId', s: { $sum: '$sizeBytes' } } }]),
  ]);
  const m = (rows: { _id: unknown; c?: number; s?: number }[], key: 'c' | 's') =>
    new Map(rows.map((r) => [String(r._id), (r[key] as number) ?? 0]));
  const sMap = m(students as never, 'c');
  const cMap = m(courses as never, 'c');
  const bMap = m(batches as never, 'c');
  const vMap = m(videos as never, 'c');
  const stMap = m(storage as never, 's');
  const subMap = new Map(subs.map((s) => [String(s.organizationId), s]));

  return ok(res, {
    organizations: orgs.map((o) => {
      const sub = subMap.get(String(o._id));
      const limits = sub?.limits ?? planLimits('STARTER');
      return {
        id: String(o._id),
        name: o.name,
        code: o.code,
        status: o.status,
        plan: sub?.plan ?? 'STARTER',
        usage: {
          students: { used: sMap.get(String(o._id)) ?? 0, limit: limits.students },
          courses: { used: cMap.get(String(o._id)) ?? 0, limit: limits.courses },
          batches: { used: bMap.get(String(o._id)) ?? 0, limit: limits.batches },
          videos: { used: vMap.get(String(o._id)) ?? 0, limit: limits.videos },
          storageBytes: { used: stMap.get(String(o._id)) ?? 0, limit: limits.storageBytes },
        },
      };
    }),
  });
});

export const platformSettings = asyncHandler(async (_req: Request, res: Response) => {
  const [orgCount, userCount, ownerCount] = await Promise.all([
    Organization.countDocuments({}),
    User.countDocuments({}),
    User.countDocuments({ role: 'SAAS_OWNER' }),
  ]);
  return ok(res, {
    plans: Object.values(PLANS),
    platform: {
      organizations: orgCount,
      users: userCount,
      owners: ownerCount,
      trialDays: Number(process.env.TRIAL_DAYS || 14),
      storageDriver: process.env.STORAGE_DRIVER || 'local',
      paymentProvider: process.env.PAYMENT_PROVIDER || 'manual',
      nodeEnv: process.env.NODE_ENV || 'development',
    },
    staffRoles: STAFF_ROLES,
  });
});

export const createOwnerUser = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req);
  const { name, email, phone, password } = req.body;
  const exists = await User.findOne({ email, organizationId: null }).lean();
  if (exists) throw ApiError.conflict('An owner account with this email already exists', { email: 'Already in use' });
  const pwd = password || generatePassword();
  const user = await User.create({
    organizationId: null,
    name, email, phone,
    passwordHash: await hashPassword(pwd),
    role: 'SAAS_OWNER',
    isActive: true,
    mustChangePassword: !password,
    createdBy: auth.userId,
  });
  await recordAudit(req, { action: 'OWNER_USER_CREATED', entity: 'User', entityId: user._id, organizationId: null });
  return created(res, { user: { id: String(user._id), name, email }, credentials: { email, password: pwd } });
});
