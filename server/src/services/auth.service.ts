import { Types } from 'mongoose';
import dayjs from 'dayjs';
import { User, IUser } from '../models/User';
import { Organization } from '../models/Organization';
import { Student } from '../models/Student';
import { Parent } from '../models/Parent';
import { Teacher } from '../models/Teacher';
import { Subscription } from '../models/Subscription';
import { ApiError } from '../utils/ApiError';
import { verifyPassword, hashPassword } from './password.service';
import { signAccessToken, signRefreshToken } from './token.service';
import { PORTAL_ROLES, Role, Permission } from '../config/rbac';
import { effectivePermissions } from '../middleware/auth';
import { randomToken, sha256 } from '../utils/ids';
import { PLANS, PlanCode } from '../config/plans';

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export interface LoginInput {
  email: string;
  password: string;
  portal: keyof typeof PORTAL_ROLES;
  organizationCode?: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  permissions: Permission[];
  avatarUrl?: string;
  mustChangePassword: boolean;
  organizationId: string | null;
  studentId?: string;
  parentId?: string;
  teacherId?: string;
  lastLoginAt?: Date;
}

export async function login(input: LoginInput) {
  const allowedRoles = PORTAL_ROLES[input.portal];
  if (!allowedRoles) throw ApiError.badRequest('Unknown login portal');

  const query: Record<string, unknown> = { email: input.email, role: { $in: allowedRoles } };

  if (input.portal === 'owner') {
    query.organizationId = null;
  } else if (input.organizationCode) {
    const org = await Organization.findOne({
      $or: [{ code: input.organizationCode.toUpperCase() }, { slug: input.organizationCode.toLowerCase() }],
    }).lean();
    if (!org) throw ApiError.invalidCredentials();
    query.organizationId = org._id;
  }

  const candidates = await User.find(query).select('+passwordHash').limit(5);
  if (!candidates.length) throw ApiError.invalidCredentials();
  if (candidates.length > 1 && !input.organizationCode) {
    throw ApiError.badRequest(
      'This email is registered with more than one academy. Please enter your academy code to continue.',
      { organizationCode: 'Academy code required' },
    );
  }

  const user = candidates[0];
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw ApiError.forbidden(`Account temporarily locked after too many failed attempts. Try again after ${dayjs(user.lockedUntil).format('HH:mm')}.`);
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED) {
      user.lockedUntil = dayjs().add(LOCK_MINUTES, 'minute').toDate();
      user.failedLoginAttempts = 0;
    }
    await user.save();
    throw ApiError.invalidCredentials();
  }

  if (!user.isActive) {
    throw ApiError.forbidden('Your account is inactive. Please contact your academy administrator.');
  }

  // Organization gating (non-owner)
  let organization = null;
  if (user.organizationId) {
    organization = await Organization.findById(user.organizationId).lean();
    if (!organization) throw ApiError.forbidden('Your academy is no longer available');
    if (organization.status === 'SUSPENDED' || organization.status === 'CANCELLED') {
      throw ApiError.forbidden('Your academy account has been suspended. Please contact AcademyOS support.');
    }
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  const tokens = issueTokens(user);
  return { user, organization, tokens, sessionUser: toSessionUser(user) };
}

export function issueTokens(user: IUser) {
  const payload = {
    sub: String(user._id),
    org: user.organizationId ? String(user.organizationId) : null,
    role: user.role,
    tv: user.tokenVersion ?? 0,
  };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export function toSessionUser(user: IUser): SessionUser {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    permissions: effectivePermissions(user.role, user.extraPermissions as Permission[], user.deniedPermissions as Permission[]),
    avatarUrl: user.avatarUrl,
    mustChangePassword: user.mustChangePassword,
    organizationId: user.organizationId ? String(user.organizationId) : null,
    studentId: user.studentId ? String(user.studentId) : undefined,
    parentId: user.parentId ? String(user.parentId) : undefined,
    teacherId: user.teacherId ? String(user.teacherId) : undefined,
    lastLoginAt: user.lastLoginAt,
  };
}

/** Builds the /auth/me payload including tenant branding + subscription banner data. */
export async function buildSession(userId: Types.ObjectId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthenticated('Account no longer exists');

  const sessionUser = toSessionUser(user);
  let organization = null;
  let subscription = null;
  let profile: Record<string, unknown> | null = null;

  if (user.organizationId) {
    const [org, sub] = await Promise.all([
      Organization.findById(user.organizationId).lean(),
      Subscription.findOne({ organizationId: user.organizationId }).lean(),
    ]);
    if (org) {
      organization = {
        id: String(org._id),
        name: org.name,
        slug: org.slug,
        code: org.code,
        status: org.status,
        branding: org.branding,
        settings: org.settings,
        email: org.email,
        phone: org.phone,
        address: org.address,
      };
    }
    if (sub) {
      const trialEnds = sub.trialEndsAt ? dayjs(sub.trialEndsAt) : null;
      subscription = {
        plan: sub.plan,
        planName: PLANS[sub.plan as PlanCode]?.name ?? sub.plan,
        status: sub.status,
        trialEndsAt: sub.trialEndsAt ?? null,
        trialDaysRemaining: trialEnds ? Math.max(0, trialEnds.diff(dayjs(), 'day')) : null,
        expired:
          (sub.status === 'TRIALING' && !!trialEnds && trialEnds.isBefore(dayjs())) ||
          sub.status === 'EXPIRED' ||
          sub.status === 'CANCELLED',
      };
    }
  }

  if (user.role === 'STUDENT' && user.studentId) {
    const s = await Student.findOne({ _id: user.studentId, organizationId: user.organizationId }).lean();
    if (s) profile = { studentCode: s.studentCode, status: s.status, photoUrl: s.photoUrl, admissionDate: s.admissionDate };
  } else if (user.role === 'PARENT' && user.parentId) {
    const p = await Parent.findOne({ _id: user.parentId, organizationId: user.organizationId }).lean();
    if (p) profile = { relation: p.relation, childrenCount: p.childrenIds.length };
  } else if (user.role === 'TEACHER' && user.teacherId) {
    const t = await Teacher.findOne({ _id: user.teacherId, organizationId: user.organizationId }).lean();
    if (t) profile = { employeeCode: t.employeeCode, specialization: t.specialization, photoUrl: t.photoUrl };
  }

  return { user: sessionUser, organization, subscription, profile };
}

export async function changePassword(userId: Types.ObjectId, currentPassword: string, newPassword: string) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');
  const valid = await verifyPassword(user.passwordHash, currentPassword);
  if (!valid) throw ApiError.validation('Current password is incorrect', { currentPassword: 'Incorrect password' });

  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  user.mustChangePassword = false;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1; // revoke other sessions
  await user.save();
  return user;
}

export async function requestPasswordReset(email: string, organizationCode?: string) {
  const query: Record<string, unknown> = { email };
  if (organizationCode) {
    const org = await Organization.findOne({
      $or: [{ code: organizationCode.toUpperCase() }, { slug: organizationCode.toLowerCase() }],
    }).lean();
    if (org) query.organizationId = org._id;
  }
  const user = await User.findOne(query);
  if (!user) return null; // do not leak account existence

  const token = randomToken(32);
  user.resetTokenHash = sha256(token);
  user.resetTokenExpiresAt = dayjs().add(45, 'minute').toDate();
  await user.save();
  return { user, token };
}

export async function resetPassword(token: string, newPassword: string) {
  const user = await User.findOne({
    resetTokenHash: sha256(token),
    resetTokenExpiresAt: { $gt: new Date() },
  }).select('+passwordHash +resetTokenHash +resetTokenExpiresAt');
  if (!user) throw ApiError.badRequest('This password reset link is invalid or has expired');

  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  user.resetTokenHash = undefined;
  user.resetTokenExpiresAt = undefined;
  user.mustChangePassword = false;
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  return user;
}
