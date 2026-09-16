import { Types, FilterQuery } from 'mongoose';
import dayjs from 'dayjs';
import {
  Organization, IOrganization, Subscription, User, Student, Course, Batch, Payment, AuditLog, Teacher, Lead,
} from '../models';
import { PLANS, PlanCode, planLimits } from '../config/plans';
import { ApiError } from '../utils/ApiError';
import { hashPassword } from './password.service';
import { generatePassword, randomCode, slugify } from '../utils/ids';
import { withTransaction } from '../config/db';
import { buildSort, searchFilter } from '../utils/query';
import { STAFF_ROLES } from '../config/rbac';

export interface CreateOrganizationInput {
  name: string;
  code?: string;
  email: string;
  phone?: string;
  website?: string;
  address?: Record<string, string | undefined>;
  plan: PlanCode;
  trialDays: number;
  branding?: Record<string, string | undefined>;
  settings?: Record<string, string | number | undefined>;
  admin?: { name: string; email: string; phone?: string; password?: string };
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base) || `academy-${randomCode(4).toLowerCase()}`;
  let i = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Organization.exists({ slug })) {
    slug = `${slugify(base)}-${i++}`;
  }
  return slug;
}

async function uniqueCode(preferred?: string, name?: string): Promise<string> {
  let code = (preferred || (name || 'ACAD').replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'ACAD').toUpperCase();
  // eslint-disable-next-line no-await-in-loop
  while (await Organization.exists({ code })) {
    code = `${(preferred || name || 'ACAD').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase()}${randomCode(2)}`;
  }
  return code;
}

export async function createOrganization(input: CreateOrganizationInput, createdBy: Types.ObjectId) {
  const slug = await uniqueSlug(input.name);
  const code = await uniqueCode(input.code, input.name);

  if (input.admin) {
    const exists = await User.findOne({ email: input.admin.email, organizationId: { $ne: null } }).lean();
    if (exists) {
      // allowed across tenants, but warn on duplicates inside same org later
    }
  }

  return withTransaction(async (session) => {
    const trialEndsAt = dayjs().add(input.trialDays, 'day').toDate();
    const [org] = await Organization.create(
      [
        {
          name: input.name,
          slug,
          code,
          email: input.email,
          phone: input.phone,
          website: input.website || undefined,
          address: input.address,
          status: input.trialDays > 0 ? 'TRIAL' : 'ACTIVE',
          branding: {
            primaryColor: input.branding?.primaryColor || '#4f46e5',
            accentColor: input.branding?.accentColor || '#0ea5e9',
            tagline: input.branding?.tagline,
            logoUrl: input.branding?.logoUrl,
          },
          settings: {
            currency: (input.settings?.currency as string) || 'INR',
            currencySymbol: (input.settings?.currencySymbol as string) || '₹',
            timezone: (input.settings?.timezone as string) || 'Asia/Kolkata',
            locale: 'en-IN',
            attendanceThreshold: (input.settings?.attendanceThreshold as number) ?? 75,
            academicYearStartMonth: 4,
            studentIdPrefix: 'STU',
            invoicePrefix: 'INV',
            receiptPrefix: 'RCP',
            restrictOnTrialExpiry: true,
          },
          createdBy,
        },
      ],
      { session, ordered: true },
    );

    await Subscription.create(
      [
        {
          organizationId: org._id,
          plan: input.plan,
          status: input.trialDays > 0 ? 'TRIALING' : 'ACTIVE',
          billingCycle: 'MONTHLY',
          amount: PLANS[input.plan].monthlyPrice,
          currency: 'INR',
          trialEndsAt: input.trialDays > 0 ? trialEndsAt : undefined,
          currentPeriodStart: new Date(),
          currentPeriodEnd: input.trialDays > 0 ? trialEndsAt : dayjs().add(1, 'month').toDate(),
          limits: planLimits(input.plan),
          usage: { storageBytes: 0 },
          invoices: [],
        },
      ],
      { session, ordered: true },
    );

    let adminCredentials: { email: string; password: string } | null = null;
    if (input.admin) {
      const password = input.admin.password || generatePassword();
      await User.create(
        [
          {
            organizationId: org._id,
            name: input.admin.name,
            email: input.admin.email,
            phone: input.admin.phone,
            passwordHash: await hashPassword(password),
            role: 'ORGANIZATION_ADMIN',
            isActive: true,
            mustChangePassword: !input.admin.password,
            createdBy,
          },
        ],
        { session, ordered: true },
      );
      adminCredentials = { email: input.admin.email, password };
    }

    return { organization: org.toObject() as IOrganization, adminCredentials };
  });
}

export async function listOrganizations(params: {
  page: number; limit: number; sort?: string; order: 'asc' | 'desc';
  search?: string; status?: string; plan?: string;
}) {
  const filter: FilterQuery<IOrganization> = {};
  if (params.status) filter.status = params.status;
  Object.assign(filter, searchFilter<IOrganization>(params.search, ['name', 'code', 'email', 'slug']));

  if (params.plan) {
    const subs = await Subscription.find({ plan: params.plan }).select('organizationId').lean();
    filter._id = { $in: subs.map((s) => s.organizationId) };
  }

  const [orgs, total] = await Promise.all([
    Organization.find(filter)
      .sort(buildSort(params.sort, params.order))
      .skip((params.page - 1) * params.limit)
      .limit(params.limit)
      .lean(),
    Organization.countDocuments(filter),
  ]);

  const ids = orgs.map((o) => o._id);
  const [subs, studentCounts, staffCounts, courseCounts] = await Promise.all([
    Subscription.find({ organizationId: { $in: ids } }).lean(),
    Student.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { organizationId: { $in: ids } } },
      { $group: { _id: '$organizationId', count: { $sum: 1 } } },
    ]),
    User.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { organizationId: { $in: ids }, role: { $in: STAFF_ROLES } } },
      { $group: { _id: '$organizationId', count: { $sum: 1 } } },
    ]),
    Course.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { organizationId: { $in: ids } } },
      { $group: { _id: '$organizationId', count: { $sum: 1 } } },
    ]),
  ]);

  const subMap = new Map(subs.map((s) => [String(s.organizationId), s]));
  const asMap = (rows: { _id: Types.ObjectId; count: number }[]) => new Map(rows.map((r) => [String(r._id), r.count]));
  const sMap = asMap(studentCounts);
  const stMap = asMap(staffCounts);
  const cMap = asMap(courseCounts);

  const items = orgs.map((o) => {
    const sub = subMap.get(String(o._id));
    return {
      ...o,
      subscription: sub
        ? {
            plan: sub.plan,
            status: sub.status,
            trialEndsAt: sub.trialEndsAt ?? null,
            trialDaysRemaining: sub.trialEndsAt ? Math.max(0, dayjs(sub.trialEndsAt).diff(dayjs(), 'day')) : null,
            amount: sub.amount,
          }
        : null,
      stats: {
        students: sMap.get(String(o._id)) ?? 0,
        staff: stMap.get(String(o._id)) ?? 0,
        courses: cMap.get(String(o._id)) ?? 0,
      },
    };
  });

  return { items, total };
}

export async function getOrganizationDetail(id: Types.ObjectId) {
  const org = await Organization.findById(id).lean();
  if (!org) throw ApiError.notFound('Academy not found');

  const [sub, students, activeStudents, staff, teachers, courses, batches, leads, revenueAgg, admins, recentAudit] =
    await Promise.all([
      Subscription.findOne({ organizationId: id }).lean(),
      Student.countDocuments({ organizationId: id }),
      Student.countDocuments({ organizationId: id, status: 'ACTIVE' }),
      User.countDocuments({ organizationId: id, role: { $in: STAFF_ROLES } }),
      Teacher.countDocuments({ organizationId: id }),
      Course.countDocuments({ organizationId: id }),
      Batch.countDocuments({ organizationId: id }),
      Lead.countDocuments({ organizationId: id }),
      Payment.aggregate<{ total: number }>([
        { $match: { organizationId: id, status: 'SUCCESS' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      User.find({ organizationId: id, role: 'ORGANIZATION_ADMIN' })
        .select('name email phone isActive lastLoginAt createdAt')
        .lean(),
      AuditLog.find({ organizationId: id }).sort({ createdAt: -1 }).limit(15).lean(),
    ]);

  return {
    organization: org,
    subscription: sub,
    admins,
    stats: {
      students,
      activeStudents,
      staff,
      teachers,
      courses,
      batches,
      leads,
      revenue: revenueAgg[0]?.total ?? 0,
    },
    recentActivity: recentAudit,
  };
}

export async function ownerDashboard() {
  const monthStart = dayjs().startOf('month').toDate();
  const [
    totalOrgs, activeOrgs, trialOrgs, suspendedOrgs, newOrgs,
    totalStudents, totalStaff, totalCourses, revenueAgg, subscriptions, recentOrgs, recentActivity,
  ] = await Promise.all([
    Organization.countDocuments({}),
    Organization.countDocuments({ status: 'ACTIVE' }),
    Organization.countDocuments({ status: 'TRIAL' }),
    Organization.countDocuments({ status: 'SUSPENDED' }),
    Organization.countDocuments({ createdAt: { $gte: monthStart } }),
    Student.countDocuments({}),
    User.countDocuments({ role: { $in: STAFF_ROLES } }),
    Course.countDocuments({}),
    Subscription.aggregate<{ total: number }>([
      { $unwind: '$invoices' },
      { $match: { 'invoices.status': 'PAID' } },
      { $group: { _id: null, total: { $sum: '$invoices.amount' } } },
    ]),
    Subscription.aggregate<{ _id: string; count: number; mrr: number }>([
      { $group: { _id: '$plan', count: { $sum: 1 }, mrr: { $sum: '$amount' } } },
    ]),
    Organization.find({}).sort({ createdAt: -1 }).limit(8).lean(),
    AuditLog.find({}).sort({ createdAt: -1 }).limit(20).lean(),
  ]);

  // Organizations created per month, last 6 months
  const sixMonthsAgo = dayjs().subtract(5, 'month').startOf('month').toDate();
  const growth = await Organization.aggregate<{ _id: { y: number; m: number }; count: number }>([
    { $match: { createdAt: { $gte: sixMonthsAgo } } },
    { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, count: { $sum: 1 } } },
    { $sort: { '_id.y': 1, '_id.m': 1 } },
  ]);

  const growthSeries = Array.from({ length: 6 }, (_, i) => {
    const d = dayjs().subtract(5 - i, 'month');
    const found = growth.find((g) => g._id.y === d.year() && g._id.m === d.month() + 1);
    return { month: d.format('MMM YY'), organizations: found?.count ?? 0 };
  });

  const mrr = subscriptions.reduce((acc, s) => acc + (s.mrr || 0), 0);

  return {
    cards: {
      totalOrganizations: totalOrgs,
      activeOrganizations: activeOrgs,
      trialOrganizations: trialOrgs,
      suspendedOrganizations: suspendedOrgs,
      newOrganizationsThisMonth: newOrgs,
      totalStudents,
      totalStaff,
      totalCourses,
      platformRevenue: revenueAgg[0]?.total ?? 0,
      mrr,
    },
    planDistribution: subscriptions.map((s) => ({ plan: s._id, count: s.count, mrr: s.mrr })),
    growthSeries,
    recentOrganizations: recentOrgs,
    recentActivity,
  };
}

export async function setOrganizationStatus(
  id: Types.ObjectId,
  status: 'ACTIVE' | 'SUSPENDED' | 'TRIAL',
  reason?: string,
) {
  const org = await Organization.findById(id);
  if (!org) throw ApiError.notFound('Academy not found');

  org.status = status;
  if (status === 'SUSPENDED') {
    org.suspendedAt = new Date();
    org.suspensionReason = reason;
    await Subscription.updateOne({ organizationId: id }, { status: 'SUSPENDED' });
  } else {
    org.suspendedAt = undefined;
    org.suspensionReason = undefined;
    const sub = await Subscription.findOne({ organizationId: id });
    if (sub) {
      const trialActive = sub.trialEndsAt && dayjs(sub.trialEndsAt).isAfter(dayjs());
      sub.status = status === 'TRIAL' || trialActive ? 'TRIALING' : 'ACTIVE';
      await sub.save();
    }
  }
  await org.save();
  return org.toObject();
}

export async function platformReports() {
  const [orgsByStatus, studentsByOrg, revenueByMonth, topOrgs] = await Promise.all([
    Organization.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Student.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $group: { _id: '$organizationId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    Payment.aggregate<{ _id: { y: number; m: number }; total: number }>([
      { $match: { status: 'SUCCESS', paidAt: { $gte: dayjs().subtract(11, 'month').startOf('month').toDate() } } },
      { $group: { _id: { y: { $year: '$paidAt' }, m: { $month: '$paidAt' } }, total: { $sum: '$amount' } } },
      { $sort: { '_id.y': 1, '_id.m': 1 } },
    ]),
    Payment.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: { status: 'SUCCESS' } },
      { $group: { _id: '$organizationId', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const orgIds = [...new Set([...studentsByOrg.map((s) => s._id), ...topOrgs.map((t) => t._id)])];
  const orgs = await Organization.find({ _id: { $in: orgIds } }).select('name code').lean();
  const nameMap = new Map(orgs.map((o) => [String(o._id), o.name]));

  return {
    organizationsByStatus: orgsByStatus.map((o) => ({ status: o._id, count: o.count })),
    topOrganizationsByStudents: studentsByOrg.map((s) => ({
      organizationId: String(s._id),
      name: nameMap.get(String(s._id)) ?? 'Unknown',
      students: s.count,
    })),
    tenantRevenueByMonth: Array.from({ length: 12 }, (_, i) => {
      const d = dayjs().subtract(11 - i, 'month');
      const found = revenueByMonth.find((r) => r._id.y === d.year() && r._id.m === d.month() + 1);
      return { month: d.format('MMM YY'), revenue: found?.total ?? 0 };
    }),
    topOrganizationsByRevenue: topOrgs.map((t) => ({
      organizationId: String(t._id),
      name: nameMap.get(String(t._id)) ?? 'Unknown',
      revenue: t.total,
    })),
  };
}

export async function createOrganizationAdmin(
  organizationId: Types.ObjectId,
  input: { name: string; email: string; phone?: string; password?: string },
  createdBy: Types.ObjectId,
) {
  const org = await Organization.findById(organizationId).lean();
  if (!org) throw ApiError.notFound('Academy not found');

  const existing = await User.findOne({ organizationId, email: input.email }).lean();
  if (existing) throw ApiError.conflict('A user with this email already exists in this academy', { email: 'Already in use' });

  const password = input.password || generatePassword();
  const user = await User.create({
    organizationId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    passwordHash: await hashPassword(password),
    role: 'ORGANIZATION_ADMIN',
    isActive: true,
    mustChangePassword: !input.password,
    createdBy,
  });

  return { user: user.toObject(), credentials: { email: input.email, password } };
}
